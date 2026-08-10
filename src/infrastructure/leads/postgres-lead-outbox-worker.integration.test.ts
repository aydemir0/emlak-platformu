import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PostgresLeadOutboxWorkerRepository } from "@/infrastructure/leads/postgres-lead-outbox-worker.server";

const pool = new Pool({
  connectionString: "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
});
const ids: string[] = [];

async function message(order: string) {
  const id = randomUUID();
  ids.push(id);
  await pool.query(
    `insert into public.outbox_messages(id,event_name,owning_domain,aggregate_type,event_version,aggregate_id,correlation_id,idempotency_key,payload,next_attempt_at)
     values($1,'lead.analytics_requested','leads','lead',1,$2,$3,$4,$5,$6::timestamptz)`,
    [
      id,
      randomUUID(),
      randomUUID(),
      `outbox-test-${id}`,
      JSON.stringify({ source: "test" }),
      order,
    ],
  );
  return id;
}

describe("Postgres lead outbox worker", () => {
  afterEach(async () => {
    await pool.query("set session_replication_role = replica");
    await pool.query(
      "delete from public.outbox_messages where id=any($1::uuid[])",
      [ids],
    );
    await pool.query("set session_replication_role = origin");
    ids.length = 0;
  });
  afterAll(async () => {
    await pool.end();
  });

  it("atomically claims a message only once across concurrent workers", async () => {
    const id = await message("1900-01-01T00:00:00Z");
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query("begin");
      await second.query("begin");
      const [a, b] = await Promise.all([
        new PostgresLeadOutboxWorkerRepository(first).claim(
          "worker-a",
          1,
          60_000,
        ),
        new PostgresLeadOutboxWorkerRepository(second).claim(
          "worker-b",
          1,
          60_000,
        ),
      ]);
      expect([...a, ...b].filter((claimed) => claimed.id === id)).toHaveLength(
        1,
      );
    } finally {
      await first.query("rollback");
      await second.query("rollback");
      first.release();
      second.release();
    }
  });

  it("reclaims an expired lease and preserves attempt count", async () => {
    const id = await message("1900-01-01T00:00:00Z");
    const repository = new PostgresLeadOutboxWorkerRepository(pool);
    const original = await repository.claim("worker-a", 1, 60_000);
    expect(original[0]?.id).toBe(id);
    await pool.query(
      "update public.outbox_messages set lease_expires_at=now()-interval '1 second' where id=$1",
      [id],
    );
    const reclaimed = await repository.claim("worker-b", 1, 60_000);
    expect(reclaimed[0]).toMatchObject({ id, attemptCount: 2 });
  });

  it("persists retryable and non-retryable outcomes", async () => {
    const retryId = await message("1900-01-01T00:00:00Z");
    const deadId = await message("1900-01-02T00:00:00Z");
    const repository = new PostgresLeadOutboxWorkerRepository(pool);
    expect((await repository.claim("worker-a", 1, 60_000))[0]?.id).toBe(
      retryId,
    );
    await repository.markFailed(
      retryId,
      "worker-a",
      { code: "TEMP_DOWN", retryable: true },
      10_000,
    );
    expect((await repository.claim("worker-b", 1, 60_000))[0]?.id).toBe(deadId);
    await repository.markFailed(
      deadId,
      "worker-b",
      { code: "INVALID_CONTRACT", retryable: false },
      10_000,
    );
    const states = await pool.query(
      "select id,status,last_error_code from public.outbox_messages where id=any($1::uuid[])",
      [[retryId, deadId]],
    );
    expect(states.rows).toEqual(
      expect.arrayContaining([
        { id: retryId, status: "PENDING", last_error_code: "TEMP_DOWN" },
        {
          id: deadId,
          status: "DEAD_LETTER",
          last_error_code: "INVALID_CONTRACT",
        },
      ]),
    );
  });
});
