# Property Media and Cloudflare R2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement secure property-media upload, processing, ordering, deletion, and public-read foundations with PostgreSQL-authoritative state and an R2 adapter.

**Architecture:** Thin Next.js delivery calls property-media application use cases. Provider-independent domain rules and ports are implemented by PostgreSQL, Cloudflare R2 S3, Sharp, and deterministic test adapters. Database transactions never contain R2 or image-processing calls; durable outbox intent plus idempotent reconciliation handles divergence.

**Tech Stack:** Next.js 16.3, TypeScript 5.9 strict, PostgreSQL/Supabase local CLI 2.113.0, `sharp@0.35.3`, `@aws-sdk/client-s3@3.1106.0`, `@aws-sdk/s3-request-presigner@3.1106.0`, Vitest, pgTAP, Playwright.

## Global Constraints

- The approved design at `docs/superpowers/specs/2026-08-09-property-media-r2-design.md` is the source of truth.
- Use only local Supabase project `emlak-platformu`, ports `55321-55327`; never link or mutate a remote Supabase project.
- Never mutate production R2, bucket CORS, lifecycle, domain, token, or object state in Phase 6.
- Preserve the existing 45-table canonical entity contract; add no table unless the approved design becomes impossible without an explicit decision.
- Keep user filenames, slugs, addresses, secrets, signed URLs, and provider URLs out of object keys and logs.
- Keep Server Actions and Route Handlers thin; React owns no authorization, lifecycle, eligibility, retry, or ordering rule.
- Apply red-green-refactor for every production behavior and record expected RED before implementation.
- Security defaults are versioned/configurable `property-v1` values: JPEG/PNG/WebP, 15 MiB, 12,000 px edge, 50 MP, 5-minute grant, widths 640/1280, WebP 82, AVIF 55, no crop/upscale, orientation normalization, and public metadata stripping.
- Malware runtime, worker scheduler/runtime, CDN topology, hard-removal SLO, retention, and final visual recipe remain Open Decisions.

---

### Task 1: Additive Media Workflow Migration

**Files:**

- Create: `supabase/migrations/20260809204132_property_media_pipeline.sql`
- Create: `supabase/tests/database/property_media_pipeline.test.sql`
- Modify: `supabase/tests/database/schema_contract.test.sql`
- Modify: `src/types/database.generated.ts`
- Modify: `src/types/database.contract.ts`
- Modify: `docs/database/media-lifecycle.md`
- Modify: `docs/database/schema-draft.md`
- Modify: `docs/database/index-strategy.md`

**Interfaces:**

- Produces representable observed upload facts, processing/error category, visibility/deletion provenance, claim/retry fields, and query-driven indexes without adding an entity.
- Preserves existing table/state names and 45-table RLS contract.

- [ ] **Step 1: Create the migration shell with the Supabase CLI**

Run: `npx -y supabase@2.113.0 migration new property_media_pipeline`

Expected: one timestamped empty migration under `supabase/migrations`.

- [ ] **Step 2: Write failing pgTAP tests**

Assert the additive columns/checks/indexes, RLS/force-RLS, no `anon` grants, exact 45-table set, immutable variant uniqueness, one active cover, upload observation consistency, lease/outcome consistency, and retry/source-version predicates.

Run: `npx -y supabase@2.113.0 db reset --local && npx -y supabase@2.113.0 test db`

Expected RED: missing Phase 6 columns/constraints/indexes.

- [ ] **Step 3: Implement the minimal additive SQL**

Add only fields required by the approved workflow, explicit checks/FKs, partial/composite indexes for expiry, claim, active order, and public-eligible reads, and comments describing `READY` versus eligibility. Do not edit merged migrations or seed media vocabulary.

- [ ] **Step 4: Verify GREEN on a clean local database**

Run the reset/test command again.

Expected: every database test passes and the table count stays 45.

- [ ] **Step 5: Regenerate and review types**

Run: `npx -y supabase@2.113.0 gen types typescript --local`

Update the controlled generated file mechanically and verify it matches a fresh normalized generation.

### Task 2: Media Domain Rules and Deterministic Keys

**Files:**

- Create: `src/domain/property-media/media.ts`
- Create: `src/domain/property-media/media-lifecycle.ts`
- Create: `src/domain/property-media/media-policy.ts`
- Create: `src/domain/property-media/object-key.ts`
- Create: `src/domain/property-media/*.unit.test.ts`
- Modify: `src/application/errors/application-error.ts`

**Interfaces:**

- `buildQuarantineKey(propertyId, mediaId, sourceVersion): string`
- `buildOriginalKey(propertyId, mediaId, sourceVersion): string`
- `buildVariantKey(input: VariantKeyInput): string`
- `assertMediaTransition(from, to): void`
- `isPublicEligible(facts: PublicEligibilityFacts): boolean`
- `PROPERTY_V1_RECIPE: MediaRecipe`

- [ ] **Step 1: Write failing unit tests**

Cover UUID-only deterministic keys, traversal/filename rejection, exact lifecycle graph, `READY` not implying eligibility, failed/deleted media never eligible, exact recipe constants, no-upscale candidate selection, dense ordering, full-set equality, and one-cover validation.

Run: `npm run test:unit -- src/domain/property-media`

Expected RED: modules are missing.

- [ ] **Step 2: Implement minimal pure rules**

Use controlled literal segments plus validated UUIDs; never sanitize arbitrary caller paths into keys. Model stable media/application errors including `MEDIA_FORBIDDEN`, `MEDIA_NOT_FOUND`, `MEDIA_VALIDATION_FAILED`, `MEDIA_CONFLICT`, `MEDIA_UPLOAD_EXPIRED`, `MEDIA_PROCESSING_FAILED`, and `MEDIA_STORAGE_UNAVAILABLE`.

- [ ] **Step 3: Verify GREEN and refactor**

Run the focused unit suite, remove duplication, and keep domain imports free of React, Next.js, PostgreSQL, AWS, and Sharp.

### Task 3: Storage Port, Deterministic Fake, and R2 Adapter

**Files:**

- Create: `src/application/property-media/media-storage.ts`
- Create: `src/infrastructure/property-media/deterministic-media-storage.ts`
- Create: `src/infrastructure/property-media/r2-media-storage.server.ts`
- Create: `src/infrastructure/property-media/media-storage.contract.test.ts`
- Create: `src/infrastructure/property-media/r2-media-storage.unit.test.ts`
- Modify: `src/config/env.server.ts`
- Modify: `src/config/env.server.runtime.ts`
- Modify: `src/config/env.unit.test.ts`
- Modify: `.env.example`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**

- `MediaStorage.presignPut(input): Promise<UploadGrant>`
- `MediaStorage.head(key): Promise<StoredObjectMetadata | null>`
- `MediaStorage.get(key, maximumBytes): Promise<Uint8Array | null>`
- `MediaStorage.put(input): Promise<StoredObjectMetadata>`
- `MediaStorage.delete(keys): Promise<void>`
- `MediaStorage.list(prefix, cursor?): Promise<StoredObjectPage>`

- [ ] **Step 1: Write a failing shared adapter contract**

Test exact-key grants, 300-second expiry, bounded reads, byte/checksum metadata, immutable `ifAbsent` writes, idempotent delete, prefix pagination, and refusal of uncontrolled keys. Run against the deterministic fake; unit-test R2 command construction with an injected S3 client and signer without network calls.

Run: `npm run test:unit -- src/infrastructure/property-media`

Expected RED: storage port/adapters do not exist.

- [ ] **Step 2: Install pinned dependencies**

Run: `npm install --save-exact @aws-sdk/client-s3@3.1106.0 @aws-sdk/s3-request-presigner@3.1106.0 sharp@0.35.3`

- [ ] **Step 3: Implement the deterministic fake**

Keep objects in a test-owned map, return deterministic metadata, enforce maximum reads and immutable writes, and expose no test-only backdoor through the production interface.

- [ ] **Step 4: Implement the server-only R2 S3 adapter**

Use `region: "auto"`, the account S3 endpoint, exact bucket/key, `PutObject`, `HeadObject`, `GetObject`, `DeleteObjects`, and paginated `ListObjectsV2`. Treat presigned URLs as sensitive return values and never log them. Validate optional R2 environment configuration as an all-or-none server-only group; local tests may omit it.

- [ ] **Step 5: Verify GREEN, leakage, and dependency health**

Run focused unit tests, existing server-only leakage tests, `npm audit --audit-level=high`, and typecheck.

### Task 4: Hardened Image Processor

**Files:**

- Create: `src/application/property-media/image-processor.ts`
- Create: `src/infrastructure/property-media/sharp-image-processor.server.ts`
- Create: `src/infrastructure/property-media/sharp-image-processor.unit.test.ts`
- Create: `tests/fixtures/media/README.md`
- Create: small deterministic binary fixtures under `tests/fixtures/media/`

**Interfaces:**

- `ImageProcessor.process(source, declaredMime, recipe): Promise<ProcessedImage>`
- `ProcessedImage` contains detected MIME, normalized dimensions, source checksum/bytes, processor version, and verified WebP/AVIF variants.

- [ ] **Step 1: Create minimal deterministic fixtures**

Generate test-only JPEG/PNG/WebP fixtures plus oriented/EXIF-bearing JPEG, forged MIME, corrupt bytes, oversized-byte metadata, and extreme-dimension image headers. Fixtures contain no real user data.

- [ ] **Step 2: Write failing processor tests**

Assert declared/detected MIME agreement, successful real decode, allowed static formats only, 15 MiB bound, 12,000-edge and 50 MP rejection, animation rejection, corrupt/polyglot rejection where detectable, auto-orientation, no crop/upscale, exact widths, WebP/AVIF formats/qualities, and absence of EXIF/GPS/ICC in outputs.

Run: `npm run test:unit -- sharp-image-processor.unit.test.ts`

Expected RED: processor is missing.

- [ ] **Step 3: Implement minimal Sharp processing**

Use sequential bounded decoding, `limitInputPixels`, fail-on-error, metadata inspection before transformation, `rotate()` normalization, and fresh WebP/AVIF outputs without metadata-preservation calls. Decode every output again to verify format/dimensions and reject unexpected output.

- [ ] **Step 4: Verify GREEN and resource behavior**

Run the focused suite with timeout and memory-conscious fixtures; refactor only after all rejection tests pass.

### Task 5: Upload Initialization and Finalization Use Cases

**Files:**

- Create: `src/application/property-media/media-contracts.ts`
- Create: `src/application/property-media/media-ports.ts`
- Create: `src/application/property-media/authorize-media-command.ts`
- Create: `src/application/property-media/initialize-media-upload.ts`
- Create: `src/application/property-media/finalize-media-upload.ts`
- Create: `src/application/property-media/*.unit.test.ts`
- Create: `src/infrastructure/property-media/postgres-media-unit-of-work.server.ts`
- Create: `src/infrastructure/property-media/postgres-media-unit-of-work.integration.test.ts`

**Interfaces:**

- `initializeMediaUpload(uow, storage, context, input): Promise<UploadGrantResult>`
- `finalizeMediaUpload(uow, storage, context, input): Promise<MediaCommandResult>`
- `MediaUnitOfWork.transaction(work)` plus `recordDeniedCommand(...)`

- [ ] **Step 1: Write failing application tests**

Cover assigned advisor and AAL2 admin success, cross-property denial, inactive/deleted property denial, forbidden MIME/size, server-generated keys, duplicate same-idempotency replay, conflicting replay, expiry, missing object, observed-size/checksum mismatch, first-media cover assignment, and durable processing intent.

- [ ] **Step 2: Verify RED**

Run focused tests and confirm failures are missing behavior rather than fixture errors.

- [ ] **Step 3: Implement minimal use cases and PostgreSQL adapter**

Keep provider calls outside transactions. Finalization locks property, session, and active media in deterministic order; exact replay returns the existing media. Commit session/media/audit/outbox together. Denials write safe audit evidence after rollback.

- [ ] **Step 4: Write failing integration tests before SQL behavior**

On local PostgreSQL, test atomic rollback, duplicate race guard, cross-advisor IDOR, first/second-media cover/order, and storage-failure divergence.

- [ ] **Step 5: Implement SQL and verify GREEN**

Use parameterized queries, bounded counts, version predicates, and no N+1 query loops.

### Task 6: Processing Claim, Completion, Retry, and Orphan Reconciliation

**Files:**

- Create: `src/application/property-media/process-next-media.ts`
- Create: `src/application/property-media/retry-media-processing.ts`
- Create: `src/application/property-media/reconcile-media-storage.ts`
- Create: corresponding unit tests
- Extend: `src/infrastructure/property-media/postgres-media-unit-of-work.server.ts`
- Extend: its integration test

**Interfaces:**

- `processNextMedia(uow, storage, processor, workerContext): Promise<ProcessResult>`
- `retryMediaProcessing(uow, commandContext, input): Promise<MediaCommandResult>`
- `reconcileMediaStorage(repository, storage, context, input): Promise<ReconciliationResult>`

- [ ] **Step 1: Write failing claim/processing tests**

Cover atomic claim, expired-lease reclaim, no transaction during external calls, happy path, invalid/forged/oversized/extreme inputs, failed processing never eligible, transient versus deterministic failure, bounded retry, exact duplicate completion, stale source/claim rejection, and variant write followed by DB failure.

- [ ] **Step 2: Implement claim and processor orchestration**

Claim with short `FOR UPDATE SKIP LOCKED` transaction. Read/process/write outside the transaction. Complete only when current media/source/attempt/lease still match. Insert full variant set, attempt result, `READY`, audit, and outbox in one transaction.

- [ ] **Step 3: Write failing reconciliation tests**

Cover paginated prefix listing, upload grace/session checks, orphan variant cleanup, missing authoritative object report, idempotent delete, bounded batch, and refusing arbitrary prefixes.

- [ ] **Step 4: Implement minimal reconciliation and verify GREEN**

Delete only exact controlled orphan keys selected by authoritative comparison. Report safe identifiers/categories, never bytes or signed URLs.

### Task 7: Ordering, Cover, Soft Delete, and Restore

**Files:**

- Create: `src/application/property-media/reorder-property-media.ts`
- Create: `src/application/property-media/delete-property-media.ts`
- Create: `src/application/property-media/restore-property-media.ts`
- Create: corresponding unit tests
- Extend PostgreSQL media adapter and integration tests

**Interfaces:**

- `reorderPropertyMedia(uow, context, input): Promise<MediaOrderResult>`
- `softDeletePropertyMedia(uow, context, input): Promise<MediaCommandResult>`
- `restorePropertyMedia(uow, context, input): Promise<MediaCommandResult>`

- [ ] **Step 1: Write failing unit and integration tests**

Cover exact-set validation, dense positions, exactly one cover, stale property/media versions, concurrent reorder conflict, consistent property-then-media lock order, cross-property IDOR, ADVISOR delete/restore denial, cover replacement, final-media deletion, restore to `UPLOADED`, and atomic audit/outbox/property-version updates.

- [ ] **Step 2: Implement two-phase reorder**

Move active rows to collision-free temporary positive positions, clear cover, then write final dense positions and one cover before commit. Do not weaken existing unique/deferred invariants.

- [ ] **Step 3: Implement delete/restore and verify GREEN**

Deletion immediately emits revocation/purge intent. Restore never restores `READY`, `PUBLIC`, or previous cover automatically and fails on retention/purge/current-property conflicts.

### Task 8: Admin and Public Read Contracts

**Files:**

- Create: `src/application/property-media/media-read-ports.ts`
- Create: `src/infrastructure/property-media/postgres-media-read-repository.server.ts`
- Create: its unit/integration tests
- Modify: `src/infrastructure/properties/postgres-property-unit-of-work.server.ts`

**Interfaces:**

- `listAdminPropertyMedia(actor, propertyId): Promise<AdminMediaList>`
- `listPublicPropertyMedia(propertyId): Promise<PublicMediaDescriptor[]>`

- [ ] **Step 1: Write failing read tests**

Assert one bounded admin query, scoped advisor access, safe failure fields, no private keys/signed URLs, deterministic order, and public projection requiring property active + media ready/public/non-deleted + current variant version.

- [ ] **Step 2: Implement purpose-built queries**

Use aggregate JSON/lateral joins only where query plans stay bounded; never query variants per media. Return controlled delivery paths, not provider URLs.

- [ ] **Step 3: Close Phase 5 publication readiness safely**

Set `mediaReady` from the locked approved invariant only if the property has one current eligible cover; otherwise retain fail-closed behavior. Add regression tests before changing it.

### Task 9: Thin Delivery and Admin Media Manager

**Files:**

- Create: `src/app/api/admin/properties/[propertyId]/media/uploads/route.ts`
- Create: `src/app/api/admin/properties/[propertyId]/media/uploads/[sessionId]/finalize/route.ts`
- Create: scoped status/command routes or thin Server Actions under `src/features/property-media/`
- Create: `src/features/property-media/components/property-media-manager.tsx`
- Create: supporting client-only upload/reorder components and unit tests
- Modify: `src/app/admin/properties/[id]/page.tsx`
- Modify: `tests/e2e/foundation.spec.ts`

**Interfaces:**

- Strict JSON request/response schemas with stable public errors and correlation IDs.
- Browser performs XHR `PUT` to the returned capability for per-file progress, then finalizes and polls scoped status.

- [ ] **Step 1: Write failing delivery/component tests**

Cover unauthenticated denial, malformed UUID/body, unknown fields, secret/server-only leakage, multi-file independent progress, retry state, drag/drop intent, cover selection, conflict refresh, loading/error/empty/deleted states, and no fake data.

- [ ] **Step 2: Implement thin routes/actions**

Authenticate, parse, create request context, invoke exactly one use case, and translate stable errors. Never log/serialize R2 credentials or return private keys.

- [ ] **Step 3: Implement the media manager**

Keep business rules in use cases. The client sends complete expected-version commands and renders server results. Use native drag/drop unless a dependency is demonstrably needed.

- [ ] **Step 4: Verify browser boundaries**

Run unit/integration tests plus Playwright unauthenticated and deterministic authenticated smoke where fixtures safely support it.

### Task 10: CI, Documentation, and Full Verification

**Files:**

- Modify: `.github/workflows/quality.yml`
- Modify: `.env.example`
- Modify: `docs/architecture/media-architecture.md`
- Modify: `docs/database/media-lifecycle.md`
- Create: `docs/requirements/property-media-operations.md`

**Interfaces:** CI uses local Supabase only and no R2 credentials; all provider tests are deterministic.

- [ ] **Step 1: Add quality-gate coverage**

Ensure CI starts local Supabase, resets migrations, runs pgTAP, unit/integration/build/Playwright, generated-type drift, secret scan, and dependency audit without any remote link or R2 mutation.

- [ ] **Step 2: Update architecture/operations documentation**

Record implemented boundaries, compensation paths, safe error categories, configurable defaults, runbook entry points, and the six approved Open Decisions without claiming the worker/CDN topology is solved.

- [ ] **Step 3: Run fresh full validation**

Run formatting, lint, strict typecheck, unit, integration, clean local reset + pgTAP, generated-type comparison, production build, Playwright, npm audit, secret/remote-reference scans, and `git diff --check`.

- [ ] **Step 4: Perform security and requirements self-review**

Trace every requested abuse case and use case to a test, inspect client bundles for AWS/Sharp/secret leakage, verify no remote project reference or production credential, and review the complete staged diff.

- [ ] **Step 5: Commit, push, and open Draft PR**

Commit cohesive implementation changes, push `agent/property-media-r2`, open a Draft PR against `main`, verify it remains Draft, and do not merge.
