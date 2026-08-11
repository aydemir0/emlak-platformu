import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { convertLeadToCustomer } from "@/application/leads/convert-lead-to-customer";
import { PostgresLeadConversionUnitOfWork } from "@/infrastructure/leads/postgres-lead-conversion-unit-of-work.server";

const pool = new Pool({
  connectionString: "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
});
const adminIdentityId = randomUUID();
const advisorIdentityId = randomUUID();
const advisorId = randomUUID();
const createdLeadIds: string[] = [];
const createdCustomerIds: string[] = [];

const admin = () => ({
  actor: {
    identityId: adminIdentityId,
    authUserId: randomUUID(),
    role: "ADMIN" as const,
    aal: "aal2" as const,
  },
  correlationId: randomUUID(),
  requestId: `conversion-${randomUUID()}`,
  idempotencyKey: randomUUID(),
});
const advisor = () => ({
  actor: {
    identityId: advisorIdentityId,
    authUserId: randomUUID(),
    role: "ADVISOR" as const,
    aal: "aal1" as const,
  },
  correlationId: randomUUID(),
  requestId: `conversion-${randomUUID()}`,
  idempotencyKey: randomUUID(),
});

async function insertLead(
  input: Readonly<{
    email: string;
    phone?: string;
    assignedAdvisorId?: string | null;
  }>,
): Promise<string> {
  const id = randomUUID();
  createdLeadIds.push(id);
  await pool.query(
    `insert into public.leads(
      id,submission_id,status,source,name,email,phone,assigned_advisor_id,idempotency_key
    ) values($1,$2,'NEGOTIATION','integration','Conversion fixture',$3,$4,$5,$6)`,
    [
      id,
      randomUUID(),
      input.email,
      input.phone ?? null,
      input.assignedAdvisorId ?? null,
      randomUUID(),
    ],
  );
  return id;
}

async function insertCustomer(
  input: Readonly<{
    email?: string;
    phone?: string;
    advisorId?: string | null;
  }>,
): Promise<string> {
  const id = randomUUID();
  createdCustomerIds.push(id);
  await pool.query(
    "insert into public.customers(id,display_name,assigned_advisor_id) values($1,$2,$3)",
    [id, `Conversion customer ${id.slice(0, 8)}`, input.advisorId ?? null],
  );
  for (const [channel, value] of [
    ...(input.email ? [["EMAIL", input.email.toLowerCase()] as const] : []),
    ...(input.phone ? [["PHONE", input.phone] as const] : []),
  ]) {
    await pool.query(
      `insert into public.customer_contact_points(
        customer_id,channel,display_value,normalized_value,is_primary,
        verification_status,verified_at,normalization_version,source
      ) values($1,$2,$3,$3,true,'VERIFIED',now(),'v1','INTEGRATION')`,
      [id, channel, value],
    );
  }
  return id;
}

describe("Postgres transactional lead conversion", () => {
  beforeAll(async () => {
    await pool.query(
      "insert into public.user_identities(id,auth_provider,provider_subject,status) values($1,'integration',$2,'active'),($3,'integration',$4,'active')",
      [
        adminIdentityId,
        `conversion-admin-${adminIdentityId}`,
        advisorIdentityId,
        `conversion-advisor-${advisorIdentityId}`,
      ],
    );
    await pool.query(
      "insert into public.advisors(id,user_identity_id,display_name,status) values($1,$2,'Conversion advisor','active')",
      [advisorId, advisorIdentityId],
    );
  });

  afterAll(async () => {
    await pool.query("set session_replication_role = replica");
    if (createdLeadIds.length) {
      await pool.query(
        "delete from public.audit_logs where target_id = any($1::uuid[])",
        [createdLeadIds],
      );
      await pool.query(
        "delete from public.lead_activities where lead_id = any($1::uuid[])",
        [createdLeadIds],
      );
      await pool.query(
        "delete from public.lead_conversions where lead_id = any($1::uuid[])",
        [createdLeadIds],
      );
      await pool.query("delete from public.leads where id = any($1::uuid[])", [
        createdLeadIds,
      ]);
    }
    if (createdCustomerIds.length) {
      await pool.query(
        "delete from public.customer_contact_points where customer_id = any($1::uuid[])",
        [createdCustomerIds],
      );
      await pool.query(
        "delete from public.customer_requests where customer_id = any($1::uuid[])",
        [createdCustomerIds],
      );
      await pool.query(
        "delete from public.customers where id = any($1::uuid[])",
        [createdCustomerIds],
      );
    }
    await pool.query("delete from public.advisors where id=$1", [advisorId]);
    await pool.query("delete from public.user_identities where id in ($1,$2)", [
      adminIdentityId,
      advisorIdentityId,
    ]);
    await pool.query("set session_replication_role = origin");
    await pool.end();
  });

  it("creates a customer, unverified normalized contacts, one all-MISSING request, conversion, activity and audit", async () => {
    const leadId = await insertLead({
      email: "new-conversion@example.test",
      phone: "+905551234567",
    });
    const result = await convertLeadToCustomer(
      new PostgresLeadConversionUnitOfWork(pool),
      admin(),
      { leadId, createInitialRequest: true },
    );
    createdCustomerIds.push(result.customerId);
    const row = await pool.query(
      `select l.status,lc.customer_request_id,lc.resolution_kind,lc.resolution_evidence_code,
        (select count(*)::int from public.customer_contact_points cp where cp.customer_id=lc.customer_id) contacts,
        (select count(*)::int from public.lead_activities la where la.lead_id=lc.lead_id and la.activity_type='CONVERSION_RECORDED') activities,
        (select matching_location_state||matching_budget_state||matching_property_type_state||matching_rooms_state||matching_net_area_state||matching_features_state from public.customer_requests where id=lc.customer_request_id) request_states
       from public.leads l join public.lead_conversions lc on lc.lead_id=l.id where l.id=$1`,
      [leadId],
    );
    expect(row.rows[0]).toMatchObject({
      status: "WON",
      resolution_kind: "CREATED_NEW_CUSTOMER",
      resolution_evidence_code: "EXACT_EMAIL_AND_PHONE",
      contacts: 2,
      activities: 1,
      request_states: "MISSINGMISSINGMISSINGMISSINGMISSINGMISSING",
    });
    const retry = await convertLeadToCustomer(
      new PostgresLeadConversionUnitOfWork(pool),
      admin(),
      { leadId, createInitialRequest: true },
    );
    expect(retry).toMatchObject({
      customerId: result.customerId,
      customerRequestId: result.customerRequestId,
    });
  });

  it("links an explicit customer only when it is in the advisor CRM scope", async () => {
    const customerId = await insertCustomer({ advisorId });
    const leadId = await insertLead({
      email: "scoped-conversion@example.test",
      assignedAdvisorId: advisorId,
    });
    const result = await convertLeadToCustomer(
      new PostgresLeadConversionUnitOfWork(pool),
      advisor(),
      { leadId, explicitCustomerId: customerId, createInitialRequest: false },
    );
    expect(result).toMatchObject({
      customerId,
      resolutionKind: "LINKED_EXPLICIT_CUSTOMER",
      customerRequestId: null,
    });
  });

  it("fails closed on ambiguous exact identities without persisting a conversion", async () => {
    const first = await insertCustomer({ email: "ambiguous@example.test" });
    const second = await insertCustomer({ phone: "+905551111111" });
    expect(first).not.toBe(second);
    const leadId = await insertLead({
      email: "ambiguous@example.test",
      phone: "+905551111111",
    });
    await expect(
      convertLeadToCustomer(
        new PostgresLeadConversionUnitOfWork(pool),
        admin(),
        {
          leadId,
          createInitialRequest: false,
        },
      ),
    ).rejects.toMatchObject({ code: "CUSTOMER_IDENTITY_CONFLICT" });
    expect(
      await pool.query(
        "select count(*)::int count from public.lead_conversions where lead_id=$1",
        [leadId],
      ),
    ).toHaveProperty("rows.0.count", 0);
  });

  it("rolls back a newly created customer when conversion provenance cannot be inserted", async () => {
    const collisionKey = randomUUID();
    const existingCustomerId = await insertCustomer({});
    const existingLeadId = await insertLead({
      email: "idempotency-owner@example.test",
    });
    await pool.query(
      `insert into public.lead_conversions(
        lead_id,customer_id,converted_by_user_identity_id,outcome,resolution_code,
        resolution_kind,resolution_evidence_code,idempotency_key,correlation_id
      ) values($1,$2,$3,'WON','LINKED_EXPLICIT_CUSTOMER','LINKED_EXPLICIT_CUSTOMER',
        'EXPLICIT_CUSTOMER_SELECTION',$4,$5)`,
      [
        existingLeadId,
        existingCustomerId,
        adminIdentityId,
        collisionKey,
        randomUUID(),
      ],
    );
    const targetLeadId = await insertLead({
      email: "rollback-target@example.test",
    });
    const before = await pool.query(
      "select count(*)::int count from public.customers",
    );
    await expect(
      convertLeadToCustomer(
        new PostgresLeadConversionUnitOfWork(pool),
        { ...admin(), idempotencyKey: collisionKey },
        { leadId: targetLeadId, createInitialRequest: true },
      ),
    ).rejects.toMatchObject({ code: "LEAD_CONVERSION_FAILED" });
    const after = await pool.query(
      `select
        (select count(*)::int from public.customers) customers,
        (select status from public.leads where id=$1) lead_status,
        (select count(*)::int from public.lead_conversions where lead_id=$1) conversions,
        (select count(*)::int from public.lead_activities where lead_id=$1) activities`,
      [targetLeadId],
    );
    expect(after.rows[0]).toEqual({
      customers: before.rows[0]!.count,
      lead_status: "NEGOTIATION",
      conversions: 0,
      activities: 0,
    });
  });

  it("serializes genuinely concurrent conversion commands for the same lead", async () => {
    const leadId = await insertLead({
      email: "concurrent-conversion@example.test",
    });
    const unitOfWork = new PostgresLeadConversionUnitOfWork(pool);
    const first = admin();
    const second = { ...admin(), idempotencyKey: first.idempotencyKey };
    const outcomes = await Promise.all([
      convertLeadToCustomer(unitOfWork, first, {
        leadId,
        createInitialRequest: true,
      }),
      convertLeadToCustomer(unitOfWork, second, {
        leadId,
        createInitialRequest: true,
      }),
    ]);
    expect(outcomes[0].customerId).toBe(outcomes[1].customerId);
    createdCustomerIds.push(outcomes[0].customerId);
    const counts = await pool.query(
      `select
        (select count(*)::int from public.lead_conversions where lead_id=$1) conversions,
        (select count(*)::int from public.customer_requests where id=$2) requests,
        (select count(*)::int from public.lead_activities where lead_id=$1 and activity_type='CONVERSION_RECORDED') activities`,
      [leadId, outcomes[0].customerRequestId],
    );
    expect(counts.rows[0]).toEqual({
      conversions: 1,
      requests: 1,
      activities: 1,
    });
  });
});
