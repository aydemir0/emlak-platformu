import { randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pool = new Pool({
  connectionString: "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
});

describe("lead schema foundation", () => {
  let client: PoolClient;
  let propertyId: string;
  let propertyTypeId: string;
  let locationId: string;
  let listingTypeId: string;

  beforeAll(async () => {
    client = await pool.connect();
    await client.query("begin");
    propertyId = randomUUID();
    propertyTypeId = randomUUID();
    locationId = randomUUID();
    const listingType = await client.query<{ id: string }>(
      "select id from public.listing_types where code='SATILIK' limit 1",
    );
    listingTypeId = listingType.rows[0]!.id;
    await client.query(
      "insert into public.property_types(id,code,label) values($1,$2,$3)",
      [
        propertyTypeId,
        `LEAD${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
        "Lead fixture",
      ],
    );
    const locationName = `Lead fixture ${randomUUID().slice(0, 8)}`;
    await client.query(
      `insert into public.locations(id,level,name,normalized_name,status)
       values($1,'CITY',$2,$3,'active')`,
      [
        locationId,
        locationName,
        locationName.toLowerCase().replaceAll(" ", "-"),
      ],
    );
    await client.query(
      `insert into public.properties(
        id,public_id,listing_type_id,property_type_id,location_id,title,current_state)
       values($1,$2,$3,$4,$5,'Lead schema fixture','DRAFT')`,
      [
        propertyId,
        `LEAD-${randomUUID()}`,
        listingTypeId,
        propertyTypeId,
        locationId,
      ],
    );
  });

  afterAll(async () => {
    await client.query("rollback");
    client.release();
    await pool.end();
  });

  it("persists normalized intake and an append-only activity for a new lead", async () => {
    const leadId = randomUUID();
    await client.query(
      `insert into public.leads(
        id,submission_id,property_id,status,source,email,consent_kind,consented_at,
        idempotency_key,idempotency_fingerprint,abuse_network_signal)
       values($1,$2,$3,'NEW','property_detail','person@example.test','CONTACT',now(),$4,$5,$6)`,
      [
        leadId,
        randomUUID(),
        propertyId,
        randomUUID(),
        "a".repeat(64),
        "b".repeat(64),
      ],
    );
    await client.query(
      `insert into public.lead_contact_intakes(
        lead_id,channel,raw_value,normalized_value,normalization_algorithm,
        normalization_version,source)
       values($1,'EMAIL','Person@example.test','person@example.test','email-basic','v1','PUBLIC_FORM')`,
      [leadId],
    );
    await client.query(
      `insert into public.lead_activities(
        lead_id,activity_type,occurred_at,correlation_id,source_idempotency_key)
       values($1,'CREATED',now(),$2,$3)`,
      [leadId, randomUUID(), `activity-${randomUUID()}`],
    );

    await client.query("savepoint append_only_check");
    await expect(
      client.query(
        "update public.lead_activities set summary='mutated' where lead_id=$1",
        [leadId],
      ),
    ).rejects.toMatchObject({ code: "55000" });
    await client.query("rollback to savepoint append_only_check");
  });

  it("rejects terminal lead transitions at the database constraint boundary", async () => {
    await client.query("savepoint invalid_status_check");
    await expect(
      client.query(
        `insert into public.leads(submission_id,property_id,status,source,email,consent_kind,consented_at,idempotency_key)
         values($1,$2,'TRIAGED','property_detail','person@example.test','CONTACT',now(),$3)`,
        [randomUUID(), propertyId, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await client.query("rollback to savepoint invalid_status_check");

    const wonLeadId = randomUUID();
    await client.query(
      `insert into public.leads(id,submission_id,property_id,status,source,email,consent_kind,consented_at,idempotency_key)
       values($1,$2,$3,'WON','property_detail','won@example.test','CONTACT',now(),$4)`,
      [wonLeadId, randomUUID(), propertyId, randomUUID()],
    );
    await client.query("savepoint terminal_transition_check");
    await expect(
      client.query("update public.leads set status='LOST' where id=$1", [
        wonLeadId,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await client.query("rollback to savepoint terminal_transition_check");
  });
});
