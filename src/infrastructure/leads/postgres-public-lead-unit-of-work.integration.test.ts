import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createPublicLead } from "@/application/leads/create-public-lead";
import { PostgresPublicLeadUnitOfWork } from "@/infrastructure/leads/postgres-public-lead-unit-of-work.server";

const pool = new Pool({
  connectionString: "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
});
const propertyId = randomUUID();
const propertyTypeId = randomUUID();
const locationId = randomUUID();
const routeId = randomUUID();
const mediaId = randomUUID();
const suffix = randomUUID().slice(0, 8);
const publicId = `public-lead-${suffix}`;
const publicRoute = `/satilik/lead-${suffix}/lead-${suffix}/daire-${suffix}/ilan-${suffix}`;

function input(
  overrides: Partial<Parameters<typeof createPublicLead>[1]> = {},
) {
  return {
    propertyId: publicId,
    email: "person@example.test",
    consentAccepted: true,
    idempotencyKey: randomUUID(),
    idempotencyFingerprint: "a".repeat(64),
    correlationId: randomUUID(),
    requestId: `request-${suffix}`,
    abuseNetworkSignal: "b".repeat(64),
    ...overrides,
  };
}

describe("Postgres public lead intake", () => {
  beforeAll(async () => {
    const fixtureClient = await pool.connect();
    try {
      await fixtureClient.query("begin");
      await fixtureClient.query("set constraints all deferred");
      const listing = await fixtureClient.query<{ id: string }>(
        "select id from public.listing_types where code='SATILIK'",
      );
      await fixtureClient.query(
        "insert into public.property_types(id,code,label) values($1,$2,'Lead intake type')",
        [propertyTypeId, `LEAD_${suffix.replaceAll("-", "").toUpperCase()}`],
      );
      await fixtureClient.query(
        `insert into public.locations(id,level,name,normalized_name,status)
       values($1,'CITY',$2,$3,'active')`,
        [locationId, `Lead city ${suffix}`, `lead-city-${suffix}`],
      );
      await fixtureClient.query(
        "insert into public.public_route_reservations(id,route_key,route_kind) values($1,$2,'property')",
        [routeId, publicRoute],
      );
      await fixtureClient.query(
        `insert into public.properties(id,public_id,listing_type_id,property_type_id,location_id,
       current_route_reservation_id,current_slug,title,current_state,price_amount_minor,currency_code,published_at)
       values($1,$2,$3,$4,$5,$6,$7,'Lead intake property','ACTIVE',100000,'TRY',now())`,
        [
          propertyId,
          publicId,
          listing.rows[0]!.id,
          propertyTypeId,
          locationId,
          routeId,
          `ilan-${suffix}`,
        ],
      );
      await fixtureClient.query(
        `insert into public.property_media(id,property_id,state,visibility,media_role,source_version,sort_order,is_cover,
       original_object_key,checksum_sha256,detected_mime_type,width_px,height_px,byte_size,ready_at,current_recipe_version,processor_version)
       values($1,$2,'READY','PUBLIC','PHOTO',1,1,true,$3,$4,'image/jpeg',800,600,100,now(),'lead-v1','test')`,
        [mediaId, propertyId, `private/${mediaId}`, "c".repeat(64)],
      );
      await fixtureClient.query(
        `insert into public.property_media_variants(property_media_id,source_version,recipe_version,format,width_px,height_px,byte_size,object_key,checksum_sha256)
       values($1,1,'lead-v1','WEBP',640,480,90,$2,$3)`,
        [
          mediaId,
          `public/properties/${mediaId}/lead-v1/640.webp`,
          "d".repeat(64),
        ],
      );
      await fixtureClient.query("commit");
    } catch (error) {
      await fixtureClient.query("rollback");
      throw error;
    } finally {
      fixtureClient.release();
    }
  });

  afterAll(async () => {
    // The fixture uses immutable media variants. This session-only bypass is limited
    // to the UUIDs created by this test and permits deterministic local cleanup.
    await pool.query("set session_replication_role = replica");
    await pool.query(
      "delete from public.outbox_messages where aggregate_id in (select id from public.leads where property_id=$1)",
      [propertyId],
    );
    await pool.query(
      "delete from public.audit_logs where target_id in (select id from public.leads where property_id=$1)",
      [propertyId],
    );
    await pool.query(
      "delete from public.lead_activities where lead_id in (select id from public.leads where property_id=$1)",
      [propertyId],
    );
    await pool.query(
      "delete from public.lead_contact_intakes where lead_id in (select id from public.leads where property_id=$1)",
      [propertyId],
    );
    await pool.query("delete from public.leads where property_id=$1", [
      propertyId,
    ]);
    await pool.query(
      "delete from public.property_media_variants where property_media_id=$1",
      [mediaId],
    );
    await pool.query("delete from public.property_media where id=$1", [
      mediaId,
    ]);
    await pool.query("delete from public.properties where id=$1", [propertyId]);
    await pool.query(
      "delete from public.public_route_reservations where id=$1",
      [routeId],
    );
    await pool.query("delete from public.locations where id=$1", [locationId]);
    await pool.query("delete from public.property_types where id=$1", [
      propertyTypeId,
    ]);
    await pool.query("set session_replication_role = origin");
    await pool.end();
  });

  it("creates an independent duplicate candidate and exact replay without persisting raw IP or PII outbox payloads", async () => {
    const uow = new PostgresPublicLeadUnitOfWork(pool);
    const first = input();
    await expect(createPublicLead(uow, first)).resolves.toEqual({
      kind: "ACCEPTED",
    });
    await expect(createPublicLead(uow, first)).resolves.toEqual({
      kind: "ACCEPTED",
    });
    await expect(
      createPublicLead(uow, input({ idempotencyKey: randomUUID() })),
    ).resolves.toEqual({ kind: "ACCEPTED" });

    const evidence = await pool.query<{
      lead_count: string;
      duplicate_activities: string;
      raw_ip_count: string;
      outbox_payload: unknown;
    }>(
      `select
         (select count(*)::text from public.leads where property_id=$1) as lead_count,
         (select count(*)::text from public.lead_activities la join public.leads l on l.id=la.lead_id
           where l.property_id=$1 and la.activity_type='DUPLICATE_CANDIDATE_DETECTED') as duplicate_activities,
         (select count(*)::text from information_schema.columns where table_schema='public' and table_name='leads'
           and column_name ilike '%ip%') as raw_ip_count,
         (select payload from public.outbox_messages where aggregate_id in (select id from public.leads where property_id=$1)
           and event_name='lead.analytics_requested' limit 1) as outbox_payload`,
      [propertyId],
    );
    expect(evidence.rows[0]).toMatchObject({
      lead_count: "2",
      duplicate_activities: "1",
      raw_ip_count: "0",
    });
    expect(JSON.stringify(evidence.rows[0]!.outbox_payload)).not.toMatch(
      /person@example\.test/i,
    );
  });

  it("rejects invisible properties and rate-limited network signals", async () => {
    const uow = new PostgresPublicLeadUnitOfWork(pool, {
      maximumAttempts: 1,
      windowMilliseconds: 60_000,
    });
    await expect(
      createPublicLead(uow, input({ propertyId: "not-public" })),
    ).rejects.toMatchObject({ code: "LEAD_NOT_FOUND" });
    const signal = "e".repeat(64);
    await createPublicLead(
      uow,
      input({ abuseNetworkSignal: signal, idempotencyKey: randomUUID() }),
    );
    await expect(
      createPublicLead(
        uow,
        input({ abuseNetworkSignal: signal, idempotencyKey: randomUUID() }),
      ),
    ).rejects.toMatchObject({ code: "LEAD_FORBIDDEN" });
  });
});
