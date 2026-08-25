import { createHash, randomUUID } from "node:crypto";

import { Pool } from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { finalizeMediaUpload } from "@/application/property-media/finalize-media-upload";
import { initializeMediaUpload } from "@/application/property-media/initialize-media-upload";
import { processNextMedia } from "@/application/property-media/process-next-media";
import { reorderPropertyMedia } from "@/application/property-media/reorder-property-media";
import { softDeletePropertyMedia } from "@/application/property-media/delete-property-media";
import { restorePropertyMedia } from "@/application/property-media/restore-property-media";
import { createPropertyDraft } from "@/application/properties/create-property-draft";
import { DeterministicMediaStorage } from "@/infrastructure/property-media/deterministic-media-storage";
import { PostgresMediaReadRepository } from "@/infrastructure/property-media/postgres-media-read-repository.server";
import {
  PostgresMediaUnitOfWork,
  PostgresMediaWorkerRepository,
} from "@/infrastructure/property-media/postgres-media-unit-of-work.server";
import { SharpImageProcessor } from "@/infrastructure/property-media/sharp-image-processor.server";
import { PostgresPropertyUnitOfWork } from "@/infrastructure/properties/postgres-property-unit-of-work.server";

const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const pool = new Pool({ connectionString: databaseUrl, max: 4 });
const mediaUow = new PostgresMediaUnitOfWork(pool);
const propertyUow = new PostgresPropertyUnitOfWork(pool);
const workerRepository = new PostgresMediaWorkerRepository(pool);
const readRepository = new PostgresMediaReadRepository(pool);
const storage = new DeterministicMediaStorage();
const adminIdentity = "a1000000-0000-4000-8000-000000000001";
const advisorIdentity = "a1000000-0000-4000-8000-000000000002";
const advisorId = "a2000000-0000-4000-8000-000000000001";
const propertyTypeId = "a3000000-0000-4000-8000-000000000001";
const locationId = "a4000000-0000-4000-8000-000000000001";

async function retirePriorMediaFixtures() {
  await pool.query(
    `update public.media_processing_attempts a set status='REJECTED',lease_owner=null,
    lease_expires_at=null,finished_at=now(),error_code='TEST_FIXTURE_RETIRED'
    from public.property_media pm join public.properties p on p.id=pm.property_id
    where a.property_media_id=pm.id and p.title like 'Media integration %'
      and a.status in('CLAIMED','PENDING')`,
  );
  await pool.query(
    `update public.property_media pm set state='DELETED',visibility='PRIVATE',is_cover=false,
    current_recipe_version=null,failure_code=null,failure_retryable=null,ready_at=null,
    deleted_at=coalesce(pm.deleted_at,now()),deleted_by_user_identity_id=$1,
    deletion_reason_code='TEST_FIXTURE_RETIRED',updated_at=now()
    from public.properties p where pm.property_id=p.id and p.title like 'Media integration %'
      and pm.state<>'DELETED'`,
    [adminIdentity],
  );
}

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

async function property() {
  return createPropertyDraft(
    propertyUow,
    context(adminIdentity, "ADMIN", "aal2"),
    {
      listingTypeId: "30000000-0000-4000-8000-000000000001",
      propertyTypeId,
      locationId,
      title: `Media integration ${randomUUID()}`,
    },
  );
}

async function upload(
  propertyId: string,
  storage: DeterministicMediaStorage,
  bytes: Uint8Array,
) {
  const command = context(adminIdentity, "ADMIN", "aal2");
  const initialized = await initializeMediaUpload(mediaUow, storage, command, {
    propertyId,
    declaredMimeType: "image/jpeg",
    byteSize: bytes.byteLength,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
  });
  await storage.put({
    key: initialized.session.objectKey,
    bytes,
    contentType: "image/jpeg",
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    ifAbsent: true,
  });
  return finalizeMediaUpload(mediaUow, storage, command, {
    propertyId,
    sessionId: initialized.session.id,
  });
}

describe("Postgres media pipeline", () => {
  beforeAll(async () => {
    await retirePriorMediaFixtures();
    await pool.query(
      `insert into public.user_identities(id,auth_provider,provider_subject,status) values
      ($1::uuid,'supabase',$1::text,'active'),($2::uuid,'supabase',$2::text,'active') on conflict do nothing`,
      [adminIdentity, advisorIdentity],
    );
    await pool.query(
      `insert into public.advisors(id,user_identity_id,display_name,status)
      values($1,$2,'Unassigned media advisor','active') on conflict do nothing`,
      [advisorId, advisorIdentity],
    );
    await pool.query(
      `insert into public.user_role_assignments(user_identity_id,role_id,status) values
      ($1,'10000000-0000-4000-8000-000000000001','ACTIVE'),
      ($2,'10000000-0000-4000-8000-000000000002','ACTIVE') on conflict do nothing`,
      [adminIdentity, advisorIdentity],
    );
    await pool.query(
      `insert into public.property_types(id,code,label) values($1,'MEDIA_INTEGRATION','Media integration')
      on conflict do nothing`,
      [propertyTypeId],
    );
    await pool.query(
      `insert into public.locations(id,level,name,normalized_name,status)
      values($1,'CITY','Media Integration','media-integration','active') on conflict do nothing`,
      [locationId],
    );
  });
  afterAll(async () => {
    await retirePriorMediaFixtures();
    await pool.end();
  });

  it("atomically finalizes uploads with dense ordering, one cover, audit, and outbox", async () => {
    const listing = await property();
    const bytes = await sharp({
      create: { width: 20, height: 10, channels: 3, background: "blue" },
    })
      .jpeg()
      .toBuffer();
    const first = await upload(listing.id, storage, bytes);
    const second = await upload(listing.id, storage, bytes);
    expect([
      first.sortOrder,
      first.isCover,
      second.sortOrder,
      second.isCover,
    ]).toEqual([1, true, 2, false]);
    const evidence = await pool.query(
      `select
      (select count(*) from public.audit_logs where target_id in($1,$2)
        and action='property_media.upload_finalized')::int as audits,
      (select count(*) from public.outbox_messages where aggregate_id in($1,$2)
        and event_name='property_media.processing_requested')::int as events`,
      [first.id, second.id],
    );
    expect(evidence.rows[0]).toEqual({ audits: 2, events: 2 });
    await pool.query(
      `update public.property_media set state='DELETED',visibility='PRIVATE',is_cover=false,
      current_recipe_version=null,failure_code=null,failure_retryable=null,ready_at=null,
      deleted_at=now(),deleted_by_user_identity_id=$2,deletion_reason_code='TEST_FIXTURE_RETIRED'
      where id=any($1::uuid[])`,
      [[first.id, second.id], adminIdentity],
    );
  });

  it("denies cross-advisor upload initialization without creating a session", async () => {
    const listing = await property();
    const before = await pool.query(
      "select count(*)::int as count from public.media_upload_sessions where property_id=$1",
      [listing.id],
    );
    await expect(
      initializeMediaUpload(
        mediaUow,
        new DeterministicMediaStorage(),
        context(advisorIdentity, "ADVISOR", "aal1"),
        {
          propertyId: listing.id,
          declaredMimeType: "image/jpeg",
          byteSize: 10,
        },
      ),
    ).rejects.toMatchObject({ code: "MEDIA_FORBIDDEN" });
    const after = await pool.query(
      "select count(*)::int as count from public.media_upload_sessions where property_id=$1",
      [listing.id],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
    const denial = await pool.query(
      `select count(*)::int as count from public.audit_logs
      where target_id=$1 and outcome='denied' and reason_code='MEDIA_FORBIDDEN'`,
      [listing.id],
    );
    expect(denial.rows[0].count).toBe(1);
  });

  it("claims, processes, and completes READY privately with immutable variants", async () => {
    const listing = await property();
    const bytes = await sharp({
      create: { width: 1400, height: 900, channels: 3, background: "green" },
    })
      .jpeg()
      .toBuffer();
    const media = await upload(listing.id, storage, bytes);
    // The worker is intentionally global. Make only this test-owned row the
    // oldest candidate so a shared local database is never used to process
    // unrelated developer data.
    await pool.query(
      "update public.property_media set updated_at='2000-01-01T00:00:00Z' where id=$1",
      [media.id],
    );
    const result = await processNextMedia(
      workerRepository,
      storage,
      new SharpImageProcessor(),
      {
        workerId: "integration-worker",
        processorVersion: "sharp-integration",
      },
    );
    expect(result).toEqual({ outcome: "READY", mediaId: media.id });
    const completed = await pool.query(
      `select state,visibility,current_recipe_version,ready_at is not null as ready,
      (select count(*)::int from public.property_media_variants where property_media_id=pm.id) as variants
      from public.property_media pm where id=$1`,
      [media.id],
    );
    expect(completed.rows[0]).toEqual({
      state: "READY",
      visibility: "PRIVATE",
      current_recipe_version: "property-v1",
      ready: true,
      variants: 4,
    });
    await expect(
      readRepository.listPublicPropertyMedia(listing.id),
    ).resolves.toEqual([]);
  });

  it("creates a new numbered attempt for each expired lease and terminalizes above the ceiling before storage", async () => {
    const listing = await property();
    const isolatedStorage = new DeterministicMediaStorage();
    const bytes = await sharp({
      create: { width: 20, height: 10, channels: 3, background: "yellow" },
    })
      .jpeg()
      .toBuffer();
    const media = await upload(listing.id, isolatedStorage, bytes);
    await pool.query(
      "update public.property_media set updated_at='1900-01-01T00:00:00Z' where id=$1",
      [media.id],
    );
    const firstNow = new Date("2026-08-09T12:00:00Z");
    const claimInput = {
      workerId: "expired-worker-1",
      leaseSeconds: 1,
      recipeVersion: "property-v1",
      processorVersion: "sharp-integration",
      now: firstNow,
    };

    const first = await workerRepository.claimNext(claimInput);
    const second = await workerRepository.claimNext({
      ...claimInput,
      workerId: "expired-worker-2",
      now: new Date("2026-08-09T12:00:02Z"),
    });
    const third = await workerRepository.claimNext({
      ...claimInput,
      workerId: "expired-worker-3",
      now: new Date("2026-08-09T12:00:04Z"),
    });

    expect([first, second, third]).toEqual([
      expect.objectContaining({
        mediaId: media.id,
        attemptNumber: 1,
        recoveredStaleLease: false,
      }),
      expect.objectContaining({
        mediaId: media.id,
        attemptNumber: 2,
        recoveredStaleLease: true,
      }),
      expect.objectContaining({
        mediaId: media.id,
        attemptNumber: 3,
        recoveredStaleLease: true,
      }),
    ]);

    const storageGet = vi.spyOn(isolatedStorage, "get");
    const processor = { process: vi.fn() };
    await expect(
      processNextMedia(workerRepository, isolatedStorage, processor, {
        workerId: "expired-worker-4",
        processorVersion: "sharp-integration",
        maxAttempts: 3,
        now: () => new Date("2026-08-09T12:00:06Z"),
        correlationId: () => "40000000-0000-4000-8000-000000000004",
      }),
    ).resolves.toEqual({ outcome: "FAILED", mediaId: media.id });

    expect(storageGet).not.toHaveBeenCalled();
    expect(processor.process).not.toHaveBeenCalled();
    const attempts = await pool.query(
      `select attempt_number,status,error_code from public.media_processing_attempts
       where property_media_id=$1 order by attempt_number`,
      [media.id],
    );
    expect(attempts.rows).toEqual([
      {
        attempt_number: 1,
        status: "FAILED",
        error_code: "MEDIA_LEASE_EXPIRED",
      },
      {
        attempt_number: 2,
        status: "FAILED",
        error_code: "MEDIA_LEASE_EXPIRED",
      },
      {
        attempt_number: 3,
        status: "FAILED",
        error_code: "MEDIA_LEASE_EXPIRED",
      },
      {
        attempt_number: 4,
        status: "REJECTED",
        error_code: "MEDIA_MAX_ATTEMPTS_EXCEEDED",
      },
    ]);
  });

  it("serializes concurrent reorder commands and rejects the stale writer", async () => {
    const listing = await property();
    const bytes = await sharp({
      create: { width: 20, height: 10, channels: 3, background: "red" },
    })
      .jpeg()
      .toBuffer();
    const one = await upload(listing.id, storage, bytes);
    const two = await upload(listing.id, storage, bytes);
    const firstCommand = reorderPropertyMedia(
      mediaUow,
      context(adminIdentity, "ADMIN", "aal2"),
      {
        propertyId: listing.id,
        expectedPropertyVersion: listing.version,
        items: [
          { mediaId: two.id, sortOrder: 1, isCover: true },
          { mediaId: one.id, sortOrder: 2, isCover: false },
        ],
      },
    );
    const secondCommand = reorderPropertyMedia(
      mediaUow,
      context(adminIdentity, "ADMIN", "aal2"),
      {
        propertyId: listing.id,
        expectedPropertyVersion: listing.version,
        items: [
          { mediaId: one.id, sortOrder: 1, isCover: true },
          { mediaId: two.id, sortOrder: 2, isCover: false },
        ],
      },
    );
    const results = await Promise.allSettled([firstCommand, secondCommand]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
  });

  it("soft deletes and restores to private UPLOADED with atomic lifecycle evidence", async () => {
    const listing = await property();
    const bytes = await sharp({
      create: { width: 20, height: 10, channels: 3, background: "white" },
    })
      .jpeg()
      .toBuffer();
    const media = await upload(listing.id, storage, bytes);
    const deleteContext = context(adminIdentity, "ADMIN", "aal2");
    await softDeletePropertyMedia(mediaUow, deleteContext, {
      propertyId: listing.id,
      mediaId: media.id,
      expectedMediaVersion: media.version,
      expectedPropertyVersion: listing.version,
      reasonCode: "INTEGRATION_DELETE",
    });
    const deleted = await pool.query(
      "select state,visibility,is_cover,version from public.property_media where id=$1",
      [media.id],
    );
    expect(deleted.rows[0]).toMatchObject({
      state: "DELETED",
      visibility: "PRIVATE",
      is_cover: false,
    });
    await restorePropertyMedia(
      mediaUow,
      context(adminIdentity, "ADMIN", "aal2"),
      {
        propertyId: listing.id,
        mediaId: media.id,
        expectedMediaVersion: BigInt(deleted.rows[0].version),
        expectedPropertyVersion: listing.version + 1n,
      },
    );
    const restored = await pool.query(
      `select state,visibility,ready_at,is_cover,
      (select count(*)::int from public.audit_logs where target_id=pm.id and action in
        ('property_media.deleted','property_media.restored')) as audits from public.property_media pm where id=$1`,
      [media.id],
    );
    expect(restored.rows[0]).toMatchObject({
      state: "UPLOADED",
      visibility: "PRIVATE",
      ready_at: null,
      audits: 2,
    });
  });
});
