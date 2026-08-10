import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createAppointment,
  mutateAppointment,
} from "@/application/appointments/appointment-use-cases";
import {
  PostgresAppointmentReadRepository,
  PostgresAppointmentUnitOfWork,
} from "@/infrastructure/appointments/postgres-appointments.server";

const pool = new Pool({
  connectionString: "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
});
const adminIdentity = randomUUID();
const advisorOneIdentity = randomUUID();
const advisorTwoIdentity = randomUUID();
const advisorOne = randomUUID();
const advisorTwo = randomUUID();
const leadOne = randomUUID();
const leadTwo = randomUUID();
const legacyCustomer = randomUUID();
const ids: string[] = [];
const admin = (key = randomUUID()) => ({
  actor: {
    identityId: adminIdentity,
    authUserId: randomUUID(),
    role: "ADMIN" as const,
    aal: "aal2" as const,
  },
  correlationId: randomUUID(),
  requestId: "appointment-integration",
  idempotencyKey: key,
});
const advisor = (identityId: string, key = randomUUID()) => ({
  actor: {
    identityId,
    authUserId: randomUUID(),
    role: "ADVISOR" as const,
    aal: "aal1" as const,
  },
  correlationId: randomUUID(),
  requestId: "appointment-integration",
  idempotencyKey: key,
});
const interval = (day: number) => ({
  startsAt: new Date(
    `2026-09-${day.toString().padStart(2, "0")}T10:00:00.000Z`,
  ),
  endsAt: new Date(`2026-09-${day.toString().padStart(2, "0")}T11:00:00.000Z`),
  scheduledTimezone: "Europe/Istanbul",
});
const uow = () => new PostgresAppointmentUnitOfWork(pool);

async function create(
  leadId = leadOne,
  advisorId = advisorOne,
  day = 1,
  context = admin(),
) {
  const appointment = await createAppointment(uow(), context, {
    leadId,
    advisorId,
    ...interval(day),
  });
  ids.push(appointment.id);
  return { appointment, context };
}

describe("Postgres appointment CRM transactions", () => {
  beforeAll(async () => {
    for (const identity of [
      adminIdentity,
      advisorOneIdentity,
      advisorTwoIdentity,
    ]) {
      await pool.query(
        "insert into public.user_identities(id,auth_provider,provider_subject,status) values($1,'integration',$2,'active')",
        [identity, `appointment-${identity}`],
      );
    }
    await pool.query(
      "insert into public.advisors(id,user_identity_id,display_name,status) values($1,$2,'Advisor one','active'),($3,$4,'Advisor two','active')",
      [advisorOne, advisorOneIdentity, advisorTwo, advisorTwoIdentity],
    );
    await pool.query(
      "insert into public.leads(id,submission_id,status,source,phone,consent_kind,consented_at,idempotency_key,assigned_advisor_id) values($1,$2,'NEW','test','+905550000001','CONTACT',now(),$3,$4),($5,$6,'NEW','test','+905550000002','CONTACT',now(),$7,$8)",
      [
        leadOne,
        randomUUID(),
        randomUUID(),
        advisorOne,
        leadTwo,
        randomUUID(),
        randomUUID(),
        advisorTwo,
      ],
    );
    await pool.query(
      "insert into public.customers(id,display_name,status,assigned_advisor_id) values($1,'Legacy appointment customer','ACTIVE',$2)",
      [legacyCustomer, advisorOne],
    );
  });
  afterAll(async () => {
    await pool.query("set session_replication_role = replica");
    if (ids.length) {
      await pool.query(
        "delete from public.audit_logs where target_type='appointment' and target_id = any($1::uuid[])",
        [ids],
      );
      await pool.query(
        "delete from public.appointment_events where appointment_id = any($1::uuid[])",
        [ids],
      );
      await pool.query(
        "delete from public.appointments where id = any($1::uuid[])",
        [ids],
      );
    }
    await pool.query("delete from public.leads where id in ($1,$2)", [
      leadOne,
      leadTwo,
    ]);
    await pool.query("delete from public.customers where id=$1", [
      legacyCustomer,
    ]);
    await pool.query("delete from public.advisors where id in ($1,$2)", [
      advisorOne,
      advisorTwo,
    ]);
    await pool.query(
      "delete from public.user_identities where id in ($1,$2,$3)",
      [adminIdentity, advisorOneIdentity, advisorTwoIdentity],
    );
    await pool.query("set session_replication_role = origin");
    await pool.end();
  });

  it("creates appointment, event and audit atomically", async () => {
    const { appointment } = await create();
    const row = await pool.query(
      "select status,version from public.appointments where id=$1",
      [appointment.id],
    );
    const records = await pool.query(
      "select (select count(*)::int from public.appointment_events where appointment_id=$1 and event_type='CREATED') events,(select count(*)::int from public.audit_logs where target_id=$1 and action='appointment.created') audits",
      [appointment.id],
    );
    expect(row.rows[0]).toEqual({ status: "REQUESTED", version: "1" });
    expect(records.rows[0]).toEqual({ events: 1, audits: 1 });
  });

  it("rolls back a second create when the post-insert event idempotency key conflicts", async () => {
    const key = randomUUID();
    await create(leadOne, advisorOne, 2, admin(key));
    const before = await pool.query(
      "select count(*)::int count from public.appointments where lead_id=$1 and starts_at=$2",
      [leadOne, interval(3).startsAt],
    );
    await expect(
      createAppointment(uow(), admin(key), {
        leadId: leadOne,
        advisorId: advisorOne,
        ...interval(3),
      }),
    ).rejects.toBeDefined();
    const after = await pool.query(
      "select count(*)::int count from public.appointments where lead_id=$1 and starts_at=$2",
      [leadOne, interval(3).startsAt],
    );
    expect(before.rows[0].count).toBe(after.rows[0].count);
  });

  it("enforces optimistic version, lifecycle and reschedule mutation history", async () => {
    const { appointment } = await create(leadOne, advisorOne, 4);
    await mutateAppointment(uow(), admin(), {
      appointmentId: appointment.id,
      expectedVersion: 1n,
      eventType: "CONFIRMED",
      status: "CONFIRMED",
    });
    await expect(
      mutateAppointment(uow(), admin(), {
        appointmentId: appointment.id,
        expectedVersion: 1n,
        eventType: "CANCELLED",
        status: "CANCELLED",
      }),
    ).rejects.toMatchObject({ code: "APPOINTMENT_CONFLICT" });
    await mutateAppointment(uow(), admin(), {
      appointmentId: appointment.id,
      expectedVersion: 2n,
      eventType: "RESCHEDULED",
      ...interval(5),
    });
    const row = await pool.query(
      "select status,version,starts_at from public.appointments where id=$1",
      [appointment.id],
    );
    const events = await pool.query(
      "select event_type from public.appointment_events where appointment_id=$1 order by occurred_at,id",
      [appointment.id],
    );
    expect(row.rows[0].status).toBe("CONFIRMED");
    expect(row.rows[0].version).toBe("3");
    expect(events.rows.map((x) => x.event_type)).toEqual([
      "CREATED",
      "CONFIRMED",
      "RESCHEDULED",
    ]);
  });

  it("accepts only terminal lifecycle outcomes and terminal slots no longer block", async () => {
    const { appointment } = await create(leadOne, advisorOne, 8);
    await mutateAppointment(uow(), admin(), {
      appointmentId: appointment.id,
      expectedVersion: 1n,
      eventType: "CONFIRMED",
      status: "CONFIRMED",
    });
    await mutateAppointment(uow(), admin(), {
      appointmentId: appointment.id,
      expectedVersion: 2n,
      eventType: "NO_SHOW",
      status: "NO_SHOW",
    });
    await expect(
      mutateAppointment(uow(), admin(), {
        appointmentId: appointment.id,
        expectedVersion: 3n,
        eventType: "CONFIRMED",
        status: "CONFIRMED",
      }),
    ).rejects.toMatchObject({ code: "APPOINTMENT_INVALID_TRANSITION" });
    const replacement = await createAppointment(uow(), admin(), {
      leadId: leadOne,
      advisorId: advisorOne,
      ...interval(8),
    });
    ids.push(replacement.id);
  });

  it("maps GiST conflicts and releases terminal slots", async () => {
    const { appointment } = await create(leadOne, advisorOne, 6);
    await expect(
      createAppointment(uow(), admin(), {
        leadId: leadOne,
        advisorId: advisorOne,
        startsAt: new Date("2026-09-06T10:30:00Z"),
        endsAt: new Date("2026-09-06T11:30:00Z"),
        scheduledTimezone: "Europe/Istanbul",
      }),
    ).rejects.toMatchObject({ code: "APPOINTMENT_TIME_CONFLICT" });
    await mutateAppointment(uow(), admin(), {
      appointmentId: appointment.id,
      expectedVersion: 1n,
      eventType: "CANCELLED",
      status: "CANCELLED",
    });
    const replacement = await create(leadOne, advisorOne, 6);
    expect(replacement.appointment.status).toBe("REQUESTED");
  });

  it("enforces scoped read and assignment authorization without direct-ID disclosure", async () => {
    const { appointment } = await create(leadOne, advisorOne, 7);
    const repo = new PostgresAppointmentReadRepository(pool);
    expect(await repo.get(admin().actor, appointment.id)).not.toBeNull();
    expect(
      await repo.get(advisor(advisorOneIdentity).actor, appointment.id),
    ).not.toBeNull();
    expect(
      await repo.get(advisor(advisorTwoIdentity).actor, appointment.id),
    ).toBeNull();
    await expect(
      mutateAppointment(uow(), advisor(advisorTwoIdentity), {
        appointmentId: appointment.id,
        expectedVersion: 1n,
        eventType: "CONFIRMED",
        status: "CONFIRMED",
      }),
    ).rejects.toMatchObject({ code: "APPOINTMENT_FORBIDDEN" });
    await expect(
      mutateAppointment(uow(), advisor(advisorOneIdentity), {
        appointmentId: appointment.id,
        expectedVersion: 1n,
        eventType: "REASSIGNED",
        advisorId: advisorTwo,
      }),
    ).rejects.toMatchObject({ code: "APPOINTMENT_FORBIDDEN" });
    await mutateAppointment(uow(), admin(), {
      appointmentId: appointment.id,
      expectedVersion: 1n,
      eventType: "REASSIGNED",
      advisorId: advisorTwo,
    });
    const history = await pool.query(
      "select event_type from public.appointment_events where appointment_id=$1 and event_type='REASSIGNED'",
      [appointment.id],
    );
    expect(history.rowCount).toBe(1);
    const detail = await repo.get(admin().actor, appointment.id);
    expect(detail?.events.map((event) => event.event_type)).toContain(
      "REASSIGNED",
    );
    const page = await repo.list(admin().actor, {
      advisorId: advisorTwo,
      status: "REQUESTED",
      limit: 1,
      offset: 0,
    });
    expect(page.items).toHaveLength(1);
    expect(new Set(page.items.map((item) => item.id)).size).toBe(1);
  });

  it("keeps a legacy customer appointment readable without inventing lead context", async () => {
    const id = randomUUID();
    ids.push(id);
    await pool.query(
      "insert into public.appointments(id,customer_id,advisor_id,starts_at,ends_at,status,appointment_type) values($1,$2,$3,$4,$5,'REQUESTED','VIEWING')",
      [
        id,
        legacyCustomer,
        advisorOne,
        interval(9).startsAt,
        interval(9).endsAt,
      ],
    );
    const detail = await new PostgresAppointmentReadRepository(pool).get(
      advisor(advisorOneIdentity).actor,
      id,
    );
    expect(detail).toMatchObject({ id, lead_id: null, lead_name: null });
  });
});
