import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { PostgresAppointmentReminderWorkerRepository } from "@/infrastructure/appointments/postgres-appointment-reminder-worker.server";

const pool = new Pool({
  connectionString: "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
});
const ids: string[] = [];
async function message() {
  const id = randomUUID();
  ids.push(id);
  await pool.query(
    "insert into public.outbox_messages(id,event_name,owning_domain,aggregate_type,event_version,aggregate_id,correlation_id,idempotency_key,payload,next_attempt_at) values($1,'appointment.reminder_requested.v1','appointments','appointment',1,$2,$3,$4,$5,'-infinity'::timestamptz)",
    [
      id,
      randomUUID(),
      randomUUID(),
      `appointment-reminder-${id}`,
      JSON.stringify({
        appointmentId: randomUUID(),
        appointmentVersion: "1",
        scheduledFor: "2099-01-01T09:00:00.000Z",
        reminderKind: "standard",
      }),
    ],
  );
  return id;
}
describe("Postgres appointment reminder worker", () => {
  afterEach(async () => {
    await pool.query("set session_replication_role=replica");
    await pool.query(
      "delete from public.outbox_messages where id=any($1::uuid[])",
      [ids],
    );
    await pool.query("set session_replication_role=origin");
    ids.length = 0;
  });
  afterAll(async () => {
    await pool.end();
  });
  it("claims a due reminder once and reclaims an expired lease", async () => {
    const id = await message();
    const first = new PostgresAppointmentReminderWorkerRepository(pool);
    const second = new PostgresAppointmentReminderWorkerRepository(pool);
    const [a, b] = await Promise.all([
      first.claim("one", 1, 60_000),
      second.claim("two", 1, 60_000),
    ]);
    expect([...a, ...b].filter((item) => item.id === id)).toEqual([
      expect.objectContaining({ recoveredStaleLease: false }),
    ]);
    await pool.query(
      "update public.outbox_messages set lease_expires_at=now()-interval '1 second',next_attempt_at='-infinity'::timestamptz where id=$1",
      [id],
    );
    const reclaimed = await second.claim("two", 1, 60_000);
    expect(reclaimed[0]).toMatchObject({
      id,
      attemptCount: 2,
      recoveredStaleLease: true,
    });
  });

  it("rejects a guarded transition after another worker owns the lease", async () => {
    const id = await message();
    const repository = new PostgresAppointmentReminderWorkerRepository(pool);
    expect((await repository.claim("worker-a", 1, 60_000))[0]?.id).toBe(id);

    await expect(repository.markProcessed(id, "worker-b")).rejects.toThrow(
      "WORKER_LEASE_LOST",
    );
    await expect(
      repository.markFailed(
        id,
        "worker-b",
        { code: "TEMP_DOWN", retryable: true },
        10_000,
      ),
    ).rejects.toThrow("WORKER_LEASE_LOST");
    await pool.query(
      "update public.outbox_messages set lease_expires_at=now()-interval '1 second' where id=$1",
      [id],
    );
    await expect(repository.markProcessed(id, "worker-a")).rejects.toThrow(
      "WORKER_LEASE_LOST",
    );

    const state = await pool.query(
      "select status,lease_owner from public.outbox_messages where id=$1",
      [id],
    );
    expect(state.rows[0]).toEqual({
      status: "PROCESSING",
      lease_owner: "worker-a",
    });
  });
});
