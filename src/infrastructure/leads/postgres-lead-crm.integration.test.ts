import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { changeLeadStatus } from "@/application/leads/lead-crm-use-cases";
import { PostgresLeadCrmUnitOfWork } from "@/infrastructure/leads/postgres-lead-crm.server";
const pool = new Pool({
  connectionString: "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
});
const leadId = randomUUID();
const ctx = {
  actor: {
    identityId: randomUUID(),
    authUserId: randomUUID(),
    role: "ADMIN" as const,
    aal: "aal2" as const,
  },
  correlationId: randomUUID(),
  requestId: "crm-integration",
  idempotencyKey: randomUUID(),
};
describe("Postgres lead CRM commands", () => {
  beforeAll(async () => {
    await pool.query(
      "insert into public.leads(id,submission_id,status,source,email,consent_kind,consented_at,idempotency_key) values($1,$2,'NEW','test','crm@example.test','CONTACT',now(),$3)",
      [leadId, randomUUID(), randomUUID()],
    );
  });
  afterAll(async () => {
    await pool.query("set session_replication_role = replica");
    await pool.query("delete from public.audit_logs where target_id=$1", [
      leadId,
    ]);
    await pool.query("delete from public.lead_activities where lead_id=$1", [
      leadId,
    ]);
    await pool.query("delete from public.leads where id=$1", [leadId]);
    await pool.query("set session_replication_role = origin");
    await pool.end();
  });
  it("updates status with activity and audit in one local transaction", async () => {
    await changeLeadStatus(new PostgresLeadCrmUnitOfWork(pool), ctx, {
      leadId,
      expectedVersion: 1n,
      status: "CONTACTED",
    });
    const r = await pool.query(
      "select (select status from public.leads where id=$1) status,(select count(*)::int from public.lead_activities where lead_id=$1 and activity_type='STATUS_CHANGED') activities,(select count(*)::int from public.audit_logs where target_id=$1 and action='lead.status_changed') audits",
      [leadId],
    );
    expect(r.rows[0]).toEqual({
      status: "CONTACTED",
      activities: 1,
      audits: 1,
    });
  });
});
