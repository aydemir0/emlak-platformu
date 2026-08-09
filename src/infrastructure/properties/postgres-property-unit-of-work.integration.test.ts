import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { changePropertyPrice } from "@/application/properties/change-property-price";
import { createPropertyDraft } from "@/application/properties/create-property-draft";
import { updateProperty } from "@/application/properties/update-property";
import {
  archiveProperty,
  restoreProperty,
  softDeleteProperty,
} from "@/application/properties/property-lifecycle-use-cases";
import { PostgresPropertyUnitOfWork } from "@/infrastructure/properties/postgres-property-unit-of-work.server";

const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const pool = new Pool({ connectionString: databaseUrl, max: 3 });
const uow = new PostgresPropertyUnitOfWork(pool);

const adminIdentity = "91000000-0000-4000-8000-000000000001";
const advisorOneIdentity = "91000000-0000-4000-8000-000000000002";
const advisorTwoIdentity = "91000000-0000-4000-8000-000000000003";
const advisorOne = "92000000-0000-4000-8000-000000000001";
const advisorTwo = "92000000-0000-4000-8000-000000000002";
const propertyTypeId = "93000000-0000-4000-8000-000000000001";
const locationId = "94000000-0000-4000-8000-000000000001";

function context(
  identityId: string,
  role: "ADMIN" | "ADVISOR",
  aal: "aal1" | "aal2",
) {
  return {
    actor: { authUserId: randomUUID(), identityId, role, aal },
    correlationId: randomUUID(),
    requestId: randomUUID(),
    idempotencyKey: randomUUID(),
  };
}

describe("Postgres property unit of work", () => {
  beforeAll(async () => {
    await pool.query(
      `insert into public.user_identities (id,auth_provider,provider_subject,status) values
      ($1::uuid,'supabase',$1::text,'active'),($2::uuid,'supabase',$2::text,'active'),($3::uuid,'supabase',$3::text,'active')
      on conflict do nothing`,
      [adminIdentity, advisorOneIdentity, advisorTwoIdentity],
    );
    await pool.query(
      `insert into public.advisors (id,user_identity_id,display_name,status) values
      ($1,$2,'Advisor One','active'),($3,$4,'Advisor Two','active') on conflict do nothing`,
      [advisorOne, advisorOneIdentity, advisorTwo, advisorTwoIdentity],
    );
    await pool.query(
      `insert into public.user_role_assignments (user_identity_id,role_id,status) values
      ($1,'10000000-0000-4000-8000-000000000001','ACTIVE'),
      ($2,'10000000-0000-4000-8000-000000000002','ACTIVE'),
      ($3,'10000000-0000-4000-8000-000000000002','ACTIVE') on conflict do nothing`,
      [adminIdentity, advisorOneIdentity, advisorTwoIdentity],
    );
    await pool.query(
      `insert into public.property_types (id,code,label) values ($1,'INTEGRATION','Integration') on conflict do nothing`,
      [propertyTypeId],
    );
    await pool.query(
      `insert into public.locations (id,level,name,normalized_name,status) values ($1,'CITY','Integration','integration','active') on conflict do nothing`,
      [locationId],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it("commits price history, audit, and outbox with the property version", async () => {
    const created = await createPropertyDraft(
      uow,
      context(adminIdentity, "ADMIN", "aal2"),
      {
        listingTypeId: "30000000-0000-4000-8000-000000000001",
        propertyTypeId,
        locationId,
        title: "Atomic integration property",
        priceAmountMinor: 1_000_000n,
        currencyCode: "TRY",
      },
    );
    const command = context(adminIdentity, "ADMIN", "aal2");
    await changePropertyPrice(uow, command, {
      propertyId: created.id,
      expectedVersion: 1n,
      amountMinor: 1_100_000n,
      currencyCode: "TRY",
      effectiveAt: new Date("2026-08-09T12:00:00Z"),
      source: "ADMIN",
      reasonCode: null,
    });
    const result = await pool.query(
      `select p.version,
      (select count(*) from public.property_price_history h where h.property_id=p.id) as prices,
      (select count(*) from public.audit_logs a where a.target_id=p.id and a.action='property.price_changed') as audits,
      (select count(*) from public.outbox_messages o where o.aggregate_id=p.id and o.event_name='property.price_changed') as events
      from public.properties p where p.id=$1`,
      [created.id],
    );
    expect(result.rows[0]).toMatchObject({
      version: "2",
      prices: "1",
      audits: "1",
      events: "1",
    });
  });

  it("rejects stale updates without changing the row", async () => {
    const created = await createPropertyDraft(
      uow,
      context(adminIdentity, "ADMIN", "aal2"),
      {
        listingTypeId: "30000000-0000-4000-8000-000000000001",
        propertyTypeId,
        locationId,
        title: "Conflict property",
      },
    );
    await expect(
      updateProperty(uow, context(adminIdentity, "ADMIN", "aal2"), {
        propertyId: created.id,
        expectedVersion: 99n,
        title: "Must not persist",
      }),
    ).rejects.toMatchObject({ code: "PROPERTY_CONFLICT" });
    const result = await pool.query(
      "select title,version from public.properties where id=$1",
      [created.id],
    );
    expect(result.rows[0]).toMatchObject({
      title: "Conflict property",
      version: "1",
    });
  });

  it("denies a different advisor without disclosing or mutating the property", async () => {
    const created = await createPropertyDraft(
      uow,
      context(adminIdentity, "ADMIN", "aal2"),
      {
        listingTypeId: "30000000-0000-4000-8000-000000000001",
        propertyTypeId,
        locationId,
        title: "Assigned property",
      },
    );
    await pool.query(
      `insert into public.property_advisor_assignments
      (property_id,advisor_id,assignment_role,is_primary,assigned_by_user_identity_id)
      values ($1,$2,'OWNER',true,$3)`,
      [created.id, advisorOne, adminIdentity],
    );
    await expect(
      updateProperty(uow, context(advisorTwoIdentity, "ADVISOR", "aal1"), {
        propertyId: created.id,
        expectedVersion: 1n,
        title: "IDOR mutation",
      }),
    ).rejects.toMatchObject({
      code: "PROPERTY_FORBIDDEN",
      message: "PROPERTY_FORBIDDEN",
    });
    const result = await pool.query(
      "select title,version from public.properties where id=$1",
      [created.id],
    );
    expect(result.rows[0]).toMatchObject({
      title: "Assigned property",
      version: "1",
    });
    const denial = await pool.query(
      "select count(*)::text as count from public.audit_logs where target_id=$1 and outcome='denied' and reason_code='PROPERTY_FORBIDDEN'",
      [created.id],
    );
    expect(denial.rows[0]).toEqual({ count: "1" });
  });

  it("soft deletes and restores only through explicit ADMIN commands", async () => {
    const created = await createPropertyDraft(
      uow,
      context(adminIdentity, "ADMIN", "aal2"),
      {
        listingTypeId: "30000000-0000-4000-8000-000000000001",
        propertyTypeId,
        locationId,
        title: "Recovery property",
      },
    );
    await archiveProperty(uow, context(adminIdentity, "ADMIN", "aal2"), {
      propertyId: created.id,
      expectedVersion: 1n,
      reasonCode: "ADMIN_ARCHIVE",
    });
    await softDeleteProperty(uow, context(adminIdentity, "ADMIN", "aal2"), {
      propertyId: created.id,
      expectedVersion: 2n,
      reasonCode: "ADMIN_DELETE",
    });
    const deleted = await pool.query(
      "select current_state,version,deleted_at is not null as deleted from public.properties where id=$1",
      [created.id],
    );
    expect(deleted.rows[0]).toMatchObject({
      current_state: "ARCHIVED",
      version: "3",
      deleted: true,
    });
    await restoreProperty(uow, context(adminIdentity, "ADMIN", "aal2"), {
      propertyId: created.id,
      expectedVersion: 3n,
      reasonCode: "ADMIN_RESTORE",
    });
    const restored = await pool.query(
      "select current_state,version,deleted_at from public.properties where id=$1",
      [created.id],
    );
    expect(restored.rows[0]).toMatchObject({
      current_state: "DRAFT",
      version: "4",
      deleted_at: null,
    });
  });
});
