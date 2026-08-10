import "server-only";
import type { Pool, PoolClient } from "pg";
import type { StaffPrincipal } from "@/application/auth/staff-principal";
import type {
  LeadCrmTransaction,
  LeadCrmUnitOfWork,
  LeadRecord,
} from "@/application/leads/lead-crm-use-cases";
import { getLocalDatabasePool } from "@/infrastructure/postgres/pool.server";

class Tx implements LeadCrmTransaction {
  constructor(private readonly c: PoolClient) {}
  async getLead(
    id: string,
    options: { lock: boolean },
  ): Promise<LeadRecord | null> {
    const r = await this.c.query(
      `select id,status,version::text,assigned_advisor_id,deleted_at from public.leads where id=$1 ${options.lock ? "for update" : ""}`,
      [id],
    );
    const x = r.rows[0];
    return x
      ? {
          id: x.id,
          status: x.status,
          version: BigInt(x.version),
          assignedAdvisorId: x.assigned_advisor_id,
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
  async updateStatus(id: string, v: bigint, status: string) {
    return (
      (
        await this.c.query(
          "update public.leads set status=$3,version=version+1,updated_at=now() where id=$1 and version=$2 and deleted_at is null",
          [id, v.toString(), status],
        )
      ).rowCount === 1
    );
  }
  async updateAssignment(id: string, v: bigint, advisorId: string | null) {
    return (
      (
        await this.c.query(
          "update public.leads set assigned_advisor_id=$3,version=version+1,updated_at=now() where id=$1 and version=$2 and deleted_at is null",
          [id, v.toString(), advisorId],
        )
      ).rowCount === 1
    );
  }
  async insertActivity(v: Record<string, unknown>) {
    await this.c.query(
      "insert into public.lead_activities(lead_id,activity_type,summary,occurred_at,correlation_id,source_idempotency_key,details) values($1,$2,$3,$4,$5,$6,$7)",
      [
        v.leadId,
        v.activityType,
        v.summary ?? null,
        v.occurredAt,
        v.correlationId,
        v.sourceIdempotencyKey,
        JSON.stringify(v.details ?? {}),
      ],
    );
  }
  async insertAssignmentHistory(v: Record<string, unknown>) {
    await this.c.query(
      "insert into public.lead_assignment_history(lead_id,from_advisor_id,to_advisor_id,assigned_by_user_identity_id,correlation_id,source_idempotency_key,occurred_at) values($1,$2,$3,$4,$5,$6,$7)",
      [
        v.leadId,
        v.fromAdvisorId ?? null,
        v.toAdvisorId ?? null,
        v.assignedByUserIdentityId,
        v.correlationId,
        v.sourceIdempotencyKey,
        v.occurredAt,
      ],
    );
  }
  async insertAudit(v: Record<string, unknown>) {
    await this.c.query(
      "insert into public.audit_logs(actor_user_identity_id,action,target_type,target_id,outcome,correlation_id,request_id,change_summary,reason_code) values($1,$2,'lead',$3,$4,$5,$6,$7,$8)",
      [
        v.actorUserIdentityId ?? null,
        v.action,
        v.targetId,
        v.outcome ?? "succeeded",
        v.correlationId,
        v.requestId,
        JSON.stringify(v.changeSummary ?? {}),
        v.reasonCode ?? null,
      ],
    );
  }
}
export class PostgresLeadCrmUnitOfWork implements LeadCrmUnitOfWork {
  constructor(private readonly pool: Pool = getLocalDatabasePool()) {}
  async transaction<T>(work: (tx: LeadCrmTransaction) => Promise<T>) {
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      const out = await work(new Tx(c));
      await c.query("commit");
      return out;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }
  async recordAuthorizationDenial(
    values: Parameters<LeadCrmUnitOfWork["recordAuthorizationDenial"]>[0],
  ) {
    await this.pool.query(
      "insert into public.audit_logs(actor_user_identity_id,action,target_type,target_id,outcome,correlation_id,request_id,change_summary,reason_code) values($1,$2,'lead',$3,'denied',$4,$5,'{}'::jsonb,$6)",
      [
        values.actorUserIdentityId,
        values.action,
        values.targetId,
        values.correlationId,
        values.requestId,
        values.reasonCode,
      ],
    );
  }
}
export type LeadListQuery = Readonly<{
  status?: string;
  advisorId?: string;
  propertyId?: string;
  search?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}>;
export class PostgresLeadCrmReadRepository {
  constructor(
    private readonly pool: Pick<Pool, "query"> = getLocalDatabasePool(),
  ) {}
  async list(actor: StaffPrincipal, q: LeadListQuery) {
    const r = await this.pool.query(
      `select l.id,l.status,l.version::text,l.name,l.email,l.phone,l.created_at,l.updated_at,p.title as property_title,p.public_id,a.display_name as advisor_name,count(*) over()::text total_count from public.leads l left join public.properties p on p.id=l.property_id and p.deleted_at is null left join public.advisors a on a.id=l.assigned_advisor_id left join public.advisors mine on mine.user_identity_id=$1 and mine.status='active' and mine.deleted_at is null where l.deleted_at is null and ($2='ADMIN' or l.assigned_advisor_id=mine.id) and ($3::text is null or l.status=$3) and ($4::uuid is null or l.assigned_advisor_id=$4) and ($5::uuid is null or l.property_id=$5) and ($6::timestamptz is null or l.created_at>=$6) and ($7::timestamptz is null or l.created_at<$7) and ($8::text is null or l.name ilike '%'||$8||'%' or l.email ilike '%'||$8||'%' or l.phone ilike '%'||$8||'%') order by l.updated_at desc,l.id desc limit $9 offset $10`,
      [
        actor.identityId,
        actor.role,
        q.status ?? null,
        q.advisorId ?? null,
        q.propertyId ?? null,
        q.from ?? null,
        q.to ?? null,
        q.search ?? null,
        q.limit,
        q.offset,
      ],
    );
    return {
      items: r.rows.map((x) => ({ ...x, version: BigInt(x.version) })),
      total: Number(r.rows[0]?.total_count ?? 0),
    };
  }
  async get(actor: StaffPrincipal, id: string) {
    const r = await this.pool.query(
      `select l.*,p.title property_title,p.public_id,a.display_name advisor_name from public.leads l left join public.properties p on p.id=l.property_id and p.deleted_at is null left join public.advisors a on a.id=l.assigned_advisor_id left join public.advisors mine on mine.user_identity_id=$1 and mine.status='active' and mine.deleted_at is null where l.id=$2 and l.deleted_at is null and ($3='ADMIN' or l.assigned_advisor_id=mine.id)`,
      [actor.identityId, id, actor.role],
    );
    if (!r.rows[0]) return null;
    const activities = await this.pool.query(
      "select activity_type,summary,occurred_at,details from public.lead_activities where lead_id=$1 order by occurred_at desc,id desc limit 100",
      [id],
    );
    return {
      ...r.rows[0],
      version: BigInt(r.rows[0].version),
      activities: activities.rows,
    };
  }
  async advisors() {
    const r = await this.pool.query(
      "select id,display_name from public.advisors where status='active' and deleted_at is null order by display_name,id",
    );
    return r.rows;
  }
}
