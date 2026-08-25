import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PostgresMatchingUnitOfWork } from "@/infrastructure/matching/postgres-matching.server";

const pool = new Pool({
  connectionString: "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
});
const customerId = randomUUID();
const requestId = randomUUID();
const propertyTypeId = randomUUID();
const locationId = randomUUID();
const propertyIds = [randomUUID(), randomUUID()];

describe("Postgres matching generation persistence", () => {
  afterAll(async () => {
    await pool.query("set session_replication_role=replica");
    await pool.query(
      "delete from public.property_customer_match_reasons where property_customer_match_id in (select id from public.property_customer_matches where customer_request_id=$1)",
      [requestId],
    );
    await pool.query(
      "delete from public.property_customer_matches where customer_request_id=$1",
      [requestId],
    );
    await pool.query("delete from public.properties where id=any($1::uuid[])", [
      propertyIds,
    ]);
    await pool.query("delete from public.customer_requests where id=$1", [
      requestId,
    ]);
    await pool.query("delete from public.customers where id=$1", [customerId]);
    await pool.query("delete from public.locations where id=$1", [locationId]);
    await pool.query("delete from public.property_types where id=$1", [
      propertyTypeId,
    ]);
    await pool.query("set session_replication_role=origin");
    await pool.end();
  });

  it("persists multiple matches and reasons atomically in one generation", async () => {
    const listingType = await pool.query<{ id: string }>(
      "select id from public.listing_types where code='SATILIK'",
    );
    const listingTypeId = listingType.rows[0]!.id;
    await pool.query(
      "insert into public.property_types(id,code,label) values($1,$2,'Package D type')",
      [
        propertyTypeId,
        `PACKAGE_D_${propertyTypeId.replaceAll("-", "").toUpperCase()}`,
      ],
    );
    await pool.query(
      "insert into public.locations(id,level,name,normalized_name) values($1,'CITY','Package D city',$2)",
      [locationId, `package-d-${locationId}`],
    );
    await pool.query(
      "insert into public.customers(id,display_name) values($1,'Package D customer')",
      [customerId],
    );
    await pool.query(
      "insert into public.customer_requests(id,customer_id,status,listing_type_id) values($1,$2,'ACTIVE',$3)",
      [requestId, customerId, listingTypeId],
    );
    for (const [index, propertyId] of propertyIds.entries()) {
      await pool.query(
        `insert into public.properties(
          id,public_id,listing_type_id,property_type_id,location_id,title,current_state
        ) values($1,$2,$3,$4,$5,$6,'ACTIVE')`,
        [
          propertyId,
          `PACKAGE-D-${propertyId}`,
          listingTypeId,
          propertyTypeId,
          locationId,
          `Package D property ${index}`,
        ],
      );
    }

    await new PostgresMatchingUnitOfWork(pool).transaction((transaction) =>
      transaction.persistGeneration({
        profile: {
          requestId,
          customerId,
          version: 1n,
          profile: {
            listingTypeId,
            location: { mode: "MISSING" },
            budget: { mode: "MISSING" },
            propertyTypes: { mode: "MISSING" },
            rooms: { mode: "MISSING" },
            netAreaDeciSqm: { mode: "MISSING" },
            features: { mode: "MISSING" },
          },
        },
        matches: propertyIds.map((propertyId, index) => ({
          status: "MATCHED" as const,
          ruleVersion: "matching-v2" as const,
          propertyId,
          propertyVersion: 1n,
          fingerprint: String(index + 1).repeat(64),
          totalScore: 80,
          components: {
            location: 30,
            budget: 25,
            propertyType: 15,
            rooms: 10,
            netArea: 0,
            features: 0,
          },
          reasons: [
            {
              component: "location" as const,
              code: "LOCATION_EXACT" as const,
              points: 30,
            },
            {
              component: "budget" as const,
              code: "BUDGET_IN_RANGE" as const,
              points: 25,
            },
          ],
        })),
        correlationId: randomUUID(),
        requestId: randomUUID(),
      }),
    );

    const counts = await pool.query<{ matches: number; reasons: number }>(
      `select count(distinct match.id)::int as matches,count(reason.reason_code)::int as reasons
       from public.property_customer_matches match
       left join public.property_customer_match_reasons reason on reason.property_customer_match_id=match.id
       where match.customer_request_id=$1`,
      [requestId],
    );
    expect(counts.rows[0]).toEqual({ matches: 2, reasons: 4 });
  });
});
