import "server-only";
import type { Pool, PoolClient } from "pg";
import type { StaffPrincipal } from "@/application/auth/staff-principal";
import type {
  AppointmentTransaction,
  AppointmentUnitOfWork,
} from "@/application/appointments/appointment-use-cases";
import { getLocalDatabasePool } from "@/infrastructure/postgres/pool.server";

export type AppointmentListItem = Readonly<{
  id: string;
  lead_name: string | null;
  lead_email: string | null;
  property_title: string | null;
  advisor_name: string | null;
  status: string;
  starts_at: Date;
  ends_at: Date;
  scheduled_timezone: string | null;
  version: bigint;
}>;
export type AppointmentDetail = AppointmentListItem &
  Readonly<{
    lead_id: string | null;
    property_id: string | null;
    advisor_id: string | null;
    lead_phone: string | null;
    events: ReadonlyArray<{ event_type: string; occurred_at: Date }>;
  }>;

class Tx implements AppointmentTransaction {
  constructor(private readonly c: PoolClient) {}
  async getAppointment(id: string, lock: boolean) {
    const r = await this.c.query(
      `select id,lead_id,advisor_id,status,version::text,deleted_at from public.appointments where id=$1 ${lock ? "for update" : ""}`,
      [id],
    );
    const x = r.rows[0];
    return x
      ? {
          id: x.id,
          leadId: x.lead_id,
          advisorId: x.advisor_id,
          status: x.status,
          version: BigInt(x.version),
          deletedAt: x.deleted_at,
        }
      : null;
  }
  async currentAdvisorId(identityId: string) {
    const r = await this.c.query(
      "select id from public.advisors where user_identity_id=$1 and status='active' and deleted_at is null",
      [identityId],
    );
    return r.rows[0]?.id ?? null;
  }
  async canManageLead(leadId: string, advisorId: string) {
    return (
      (
        await this.c.query(
          "select 1 from public.leads where id=$1 and assigned_advisor_id=$2 and deleted_at is null",
          [leadId, advisorId],
        )
      ).rowCount === 1
    );
  }
  async advisorExists(id: string) {
    return (
      (
        await this.c.query(
          "select 1 from public.advisors where id=$1 and status='active' and deleted_at is null",
          [id],
        )
      ).rowCount === 1
    );
  }
  async create(v: Record<string, unknown>) {
    try {
      const r = await this.c.query(
        "insert into public.appointments(lead_id,advisor_id,property_id,starts_at,ends_at,scheduled_timezone,status,created_by_user_identity_id,updated_by_user_identity_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id,lead_id,advisor_id,status,version::text,deleted_at",
        [
          v.leadId,
          v.advisorId,
          v.propertyId,
          v.startsAt,
          v.endsAt,
          v.scheduledTimezone,
          v.status,
          v.createdByUserIdentityId,
          v.updatedByUserIdentityId,
        ],
      );
      const x = r.rows[0];
      return {
        id: x.id,
        leadId: x.lead_id,
        advisorId: x.advisor_id,
        status: x.status,
        version: BigInt(x.version),
        deletedAt: x.deleted_at,
      };
    } catch (e) {
      throw e;
    }
  }
  async mutate(id: string, v: bigint, x: Record<string, unknown>) {
    const r = await this.c.query(
      "update public.appointments set status=coalesce($3,status),starts_at=coalesce($4,starts_at),ends_at=coalesce($5,ends_at),scheduled_timezone=coalesce($6,scheduled_timezone),advisor_id=coalesce($7,advisor_id),updated_by_user_identity_id=$8,version=version+1,updated_at=now() where id=$1 and version=$2 and deleted_at is null",
      [
        id,
        v.toString(),
        x.status ?? null,
        x.startsAt ?? null,
        x.endsAt ?? null,
        x.scheduledTimezone ?? null,
        x.advisorId ?? null,
        x.updatedByUserIdentityId,
      ],
    );
    return r.rowCount === 1;
  }
  async insertEvent(v: Record<string, unknown>) {
    await this.c.query(
      "insert into public.appointment_events(appointment_id,event_type,actor_user_identity_id,correlation_id,source_idempotency_key,event_data) values($1,$2,$3,$4,$5,$6)",
      [
        v.appointmentId,
        v.eventType,
        v.actorUserIdentityId,
        v.correlationId,
        v.sourceIdempotencyKey,
        JSON.stringify(v.eventData),
      ],
    );
  }
  async insertAudit(v: Record<string, unknown>) {
    await this.c.query(
      "insert into public.audit_logs(actor_user_identity_id,action,target_type,target_id,outcome,correlation_id,request_id,change_summary) values($1,$2,'appointment',$3,'succeeded',$4,$5,$6)",
      [
        v.actorUserIdentityId,
        v.action,
        v.targetId,
        v.correlationId,
        v.requestId,
        JSON.stringify(v.changeSummary),
      ],
    );
  }
}
export class PostgresAppointmentUnitOfWork implements AppointmentUnitOfWork {
  constructor(private readonly p: Pool = getLocalDatabasePool()) {}
  async transaction<T>(w: (tx: AppointmentTransaction) => Promise<T>) {
    const c = await this.p.connect();
    try {
      await c.query("begin");
      const x = await w(new Tx(c));
      await c.query("commit");
      return x;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }
  async recordAuthorizationDenial(
    v: Parameters<AppointmentUnitOfWork["recordAuthorizationDenial"]>[0],
  ) {
    await this.p.query(
      "insert into public.audit_logs(actor_user_identity_id,action,target_type,target_id,outcome,correlation_id,request_id,change_summary,reason_code) values($1,$2,'appointment',$3,'denied',$4,$5,'{}',$6)",
      [
        v.actorUserIdentityId,
        v.action,
        v.targetId,
        v.correlationId,
        v.requestId,
        "APPOINTMENT_FORBIDDEN",
      ],
    );
  }
}
export class PostgresAppointmentReadRepository {
  constructor(
    private readonly p: Pick<Pool, "query"> = getLocalDatabasePool(),
  ) {}
  async list(actor: StaffPrincipal, q: Record<string, unknown>) {
    const r = await this.p.query(
      "select a.id,a.lead_id,a.property_id,a.advisor_id,a.status,a.starts_at,a.ends_at,a.scheduled_timezone,a.version::text,l.name lead_name,l.email lead_email,p.title property_title,ad.display_name advisor_name,count(*) over()::text total_count from public.appointments a join public.leads l on l.id=a.lead_id and l.deleted_at is null join public.advisors ad on ad.id=a.advisor_id left join public.properties p on p.id=a.property_id and p.deleted_at is null left join public.advisors mine on mine.user_identity_id=$1 and mine.status='active' and mine.deleted_at is null where a.lead_id is not null and a.deleted_at is null and ($2='ADMIN' or (a.advisor_id=mine.id and l.assigned_advisor_id=mine.id)) and ($3::text is null or a.status=$3) and ($4::uuid is null or a.advisor_id=$4) and ($5::uuid is null or a.property_id=$5) and ($6::uuid is null or a.lead_id=$6) and ($7::timestamptz is null or a.starts_at >= $7) and ($8::timestamptz is null or a.starts_at < $8) and ($9::text is null or ($9='upcoming' and a.starts_at >= now()) or ($9='past' and a.starts_at < now())) order by a.starts_at asc,a.id asc limit $10 offset $11",
      [
        actor.identityId,
        actor.role,
        q.status ?? null,
        q.advisorId ?? null,
        q.propertyId ?? null,
        q.leadId ?? null,
        q.from ?? null,
        q.to ?? null,
        q.period ?? null,
        q.limit ?? 25,
        q.offset ?? 0,
      ],
    );
    return {
      items: r.rows.map((x): AppointmentListItem => ({
        ...x,
        version: BigInt(x.version),
      })),
      total: Number(r.rows[0]?.total_count ?? 0),
    };
  }
  async get(actor: StaffPrincipal, id: string) {
    const result = await this.p.query(
      "select a.id,a.lead_id,a.property_id,a.advisor_id,a.status,a.starts_at,a.ends_at,a.scheduled_timezone,a.version::text,a.created_at,a.updated_at,l.name lead_name,l.email lead_email,l.phone lead_phone,p.title property_title,ad.display_name advisor_name from public.appointments a left join public.leads l on l.id=a.lead_id and l.deleted_at is null left join public.properties p on p.id=a.property_id and p.deleted_at is null left join public.advisors ad on ad.id=a.advisor_id left join public.advisors mine on mine.user_identity_id=$1 and mine.status='active' and mine.deleted_at is null where a.id=$2 and a.deleted_at is null and (($3='ADMIN') or (a.advisor_id=mine.id and a.lead_id is not null and l.assigned_advisor_id=mine.id) or (a.lead_id is null and a.advisor_id=mine.id))",
      [actor.identityId, id, actor.role],
    );
    const appointment = result.rows[0];
    if (!appointment) return null;
    const events = await this.p.query(
      "select event_type,event_data,occurred_at from public.appointment_events where appointment_id=$1 order by occurred_at desc,id desc limit 100",
      [id],
    );
    return {
      ...appointment,
      version: BigInt(appointment.version),
      events: events.rows,
    } as AppointmentDetail;
  }
}
