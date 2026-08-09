# Property Media and Cloudflare R2 Design

**Status:** Approved for Phase 6 implementation

**Date:** 2026-08-09
**Branch:** `agent/property-media-r2`

## Outcome

Phase 6 adds a production-oriented property-image workflow around the existing media tables. Authenticated staff can initialize and finalize narrow uploads, observe processing, retry eligible failures, manage cover/order, and soft-delete or restore media according to the existing authorization matrix. PostgreSQL remains authoritative for workflow and public eligibility; Cloudflare R2 remains authoritative only for bytes.

No remote Supabase project or production R2 resource may be linked, mutated, configured, or used during this phase. Local validation uses only the `emlak-platformu` Supabase project on ports `55321-55327` plus deterministic storage test doubles.

## Confirmed security defaults

The following values are versioned, configurable Phase 6 security defaults rather than permanent product decisions:

| Setting                 | `property-v1` default                           |
| ----------------------- | ----------------------------------------------- |
| Accepted source formats | Static JPEG, PNG, WebP                          |
| Maximum source bytes    | 15 MiB                                          |
| Maximum decoded edge    | 12,000 pixels                                   |
| Maximum decoded pixels  | 50 megapixels                                   |
| Presigned PUT lifetime  | 5 minutes                                       |
| Candidate widths        | 640 and 1280 pixels                             |
| WebP quality            | 82                                              |
| AVIF quality            | 55                                              |
| Crop/upscale            | Neither permitted                               |
| Orientation             | Normalize from decoded orientation              |
| Public metadata         | Strip EXIF, GPS, ICC, and other source metadata |
| Recipe version          | `property-v1`                                   |

Changing any value creates a new recipe version and immutable variant keys. The processor must not infer settings from mutable framework or library defaults.

## Actors, assets, and trust boundaries

Actors are `ADMIN`, assigned `ADVISOR`, a narrowly trusted processor/reconciliation identity, and anonymous public readers. There is no public/customer account in V1.

Protected assets include private upload capabilities, quarantine/original bytes, R2 credentials, decoded image resources, operational error evidence, immutable public variants, ordering/cover state, and publication eligibility.

Trust boundaries are:

- Browser to application delivery: session, property/media identifiers, MIME, size, checksum, ordering, versions, and filenames are untrusted.
- Application to PostgreSQL: use cases authorize action plus object and database constraints provide the final invariant guard.
- Browser to R2: the browser receives one short-lived `PUT` capability for one server-generated quarantine key, not credentials, list access, or arbitrary keys.
- Application/worker to R2: provider calls occur outside open database transactions through a server-only adapter.
- Worker to image processor: bytes remain untrusted until signature detection and bounded successful decode.
- Public read/delivery: only exact immutable variants from a current ready-and-eligible projection may cross the boundary.

Primary abuse cases are forged MIME/extension, SVG or active content, path traversal, oversized or decompression-bomb input, extreme dimensions, EXIF/GPS disclosure, stolen/replayed presigned URLs, finalization for another property or actor, cross-property IDOR, duplicate completion, stale worker promotion, concurrent reorder, public serving of failed/deleted media, storage/database divergence, and cost amplification.

## Architecture and dependency direction

The feature follows:

```text
admin UI / Route Handlers / Server Actions
                  |
                  v
property-media application use cases
                  |
                  v
provider-independent media rules and contracts

PostgreSQL, R2, image processor, and deterministic fakes
implement application/domain ports and depend inward.
```

React components own interaction state only. Delivery adapters authenticate, parse strict schemas, invoke one use case, and map stable errors. They do not decide authorization, eligibility, lifecycle, cover replacement, retryability, or ordering.

Provider SDK types, signed URLs, SQL rows, Sharp metadata, and R2 errors do not enter domain contracts. R2 credentials and privileged database connections remain in `server-only` modules.

## Authoritative records

Phase 6 uses the existing records:

- `media_upload_sessions`: one narrow, expiring upload intent and finalization identity.
- `property_media`: media lifecycle, original facts, visibility, cover/order, source version, soft deletion, and concurrency version.
- `property_media_variants`: immutable WebP/AVIF variant metadata.
- `media_processing_attempts`: claim lease, recipe/processor identity, bounded outcome, and retry evidence.
- `audit_logs`: sensitive successes and meaningful authorization denials.
- `outbox_messages`: durable processing, invalidation, revocation, reconciliation, and purge intent.

A small additive migration may add only fields/constraints/indexes needed to make the approved workflow representable. Existing applied migrations are not edited. Canonical entity count remains unchanged.

## Object-key strategy

Keys are generated from validated UUIDs and controlled literals. User filenames, slugs, addresses, MIME strings, captions, and other caller text never participate.

```text
private/quarantine/properties/{propertyId}/{mediaId}/{sourceVersion}/source
private/originals/properties/{propertyId}/{mediaId}/{sourceVersion}/source
delivery/properties/{propertyId}/{mediaId}/{sourceVersion}/{recipeVersion}/{width}.{format}
```

Keys are environment-separated through bucket/account configuration rather than by trusting browser input. A replacement or recipe change creates a new source/recipe version; no public object is overwritten. Database records store keys, not provider URLs.

## Upload and finalization flow

1. Delivery authenticates staff and parses property ID, declared MIME, byte count, checksum, and idempotency key.
2. The use case loads current trusted role/permissions and current property assignment. Cross-property access fails without revealing object details and writes a safe denied audit record.
3. Inside one short transaction it locks the property, enforces active-session/media-count limits, creates server-generated session/media identities and a unique quarantine key, and appends audit/outbox evidence where required.
4. After commit, the R2 adapter creates a five-minute presigned `PUT` for exactly that key and content type. The returned URL is treated as a bearer capability and is never logged or persisted.
5. The browser uploads directly with progress reporting. Reusing the URL may replace only the same quarantine key until expiry; it cannot change authoritative workflow state.
6. Finalization re-authenticates and re-authorizes the original property/session relationship. It checks expiry, actor, idempotency, object existence, observed byte count, and expected checksum where present.
7. Finalization locks the property, session, and active media set; assigns a dense final order and cover when this is the first active item; creates the `UPLOADED` media row; marks the session `FINALIZED`; and commits audit plus durable processing intent atomically.
8. Conflicting reuse is rejected. Exact repeated finalization returns the existing media result.

The official Cloudflare contract for browser presigned upload requires the S3 API endpoint, `region: auto`, a single-object `PutObject`, short expiry, and separately configured CORS. No bucket/CORS mutation is part of Phase 6.

## Processing flow

1. A worker use case atomically claims eligible `UPLOADED` or retryable `FAILED` media with a recoverable lease. It records attempt, source version, processor version, recipe version, correlation, and idempotency.
2. The database transaction commits before any R2 read or image processing begins.
3. The adapter reads the exact private quarantine/original key with a hard byte bound.
4. The processor verifies signature and actual decode. Browser MIME and filename are not authority. SVG, animation, unsupported type, corrupt decode, excessive bytes, edge, or pixel count fail deterministically.
5. Processing auto-orients, removes source metadata, and generates no-crop/no-upscale 640/1280 WebP and AVIF candidates. Widths exceeding the normalized source are omitted. Output metadata is decoded again to verify dimensions, type, and absence of carried source metadata before upload.
6. Variants are uploaded to immutable deterministic keys with exact content type and `public, max-age=31536000, immutable` metadata. “Public” describes cacheability after the controlled delivery boundary; the R2 origin itself remains private.
7. A completion transaction locks the current media and attempt, verifies claim ownership and source/recipe versions, inserts the complete immutable variant set, records original facts, closes the attempt, and transitions to `READY` with audit/outbox evidence.
8. A stale or superseded worker cannot promote its output. Its already-written objects are orphan candidates and reconciliation removes them idempotently.
9. Deterministic validation failures become `FAILED` without retry. Transient storage/processor failures use bounded attempts; exact schedule and worker trigger remain Open Decisions.

No database transaction spans R2 or image-processor calls.

## Readiness and public eligibility

`READY` is technical processing readiness only. Public eligibility is derived from current committed facts:

- media state is `READY`;
- media `deleted_at` is null;
- visibility is `PUBLIC`;
- parent property is active/public and not deleted;
- requested variant belongs to the media’s current source/recipe version;
- no current delivery denial applies under the available V1 model.

The public media read contract returns stable provider-neutral delivery descriptors with media ID, role, cover/order, alt text, format, width/height, and a controlled delivery path. It never returns private keys, originals, signed URLs, attempt errors, or provider metadata. Final CDN topology and hard-removal SLO remain Open Decisions, so Phase 6 does not make the R2 bucket public.

## Cover, ordering, deletion, and restore

- A property with active media has exactly one cover.
- Reorder requests contain the full active media set, expected property version, expected version per media, dense desired order, and one cover ID.
- The transaction locks the property first, then all active media rows in UUID order; a stale version or mismatched set returns a conflict rather than merging.
- A two-phase temporary order update avoids collisions with existing non-deferrable uniqueness before writing final `1..n` positions.
- Reorder increments affected media versions and the property version and writes audit/outbox evidence atomically.
- Soft delete/restore is `ADMIN` only. Deleting a cover selects a valid replacement in the same command, deletes the final active item, or rejects.
- Deletion immediately removes eligibility and emits durable delivery-revocation plus later purge intent. Restore returns to `UPLOADED`, never `READY`, clears public/cover status, and requires full revalidation.
- Physical purge and orphan cleanup are privileged, bounded, idempotent adapter operations; retention and legal-hold durations remain Open Decisions and are not hard-coded.

## Storage divergence and reconciliation

Because PostgreSQL and R2 cannot commit atomically:

- DB intent without object: finalization/processing remains non-public and retryable or fails safely.
- Object without DB intent: prefix-bounded reconciliation identifies it as an orphan only after upload/session grace checks and deletes it idempotently.
- Variants written by a stale/failed attempt: never enter the authoritative variant set and are orphan candidates.
- DB variant without object: controlled reads omit/fail safely, emit a missing-object signal, and request reprocessing/reconciliation.
- Delete failure: delivery remains denied by DB state while purge work stays retryable.

Reconciliation lists only controlled prefixes, handles pagination, compares exact keys, uses bounded batches, and never infers readiness from object presence.

## Admin experience

The property edit page gains a media manager that:

- initializes multiple files independently;
- reports per-file upload/finalization/processing progress and stable failures;
- polls a scoped status projection without N+1 queries;
- offers retry only for a retryable current failure;
- supports drag/drop ordering and explicit cover selection with expected versions;
- offers delete/restore only when the authenticated actor has the command capability;
- renders loading, empty, processing, failed, conflict, and removed states without fake records.

The UI never constructs object keys, decides eligibility, trusts MIME, or mutates ownership/state fields directly.

## Error and observability contract

Stable errors distinguish validation rejection, forbidden/not found, expiry, conflict, duplicate mismatch, processing failure, unavailable storage, and internal failure without returning provider details. Logs and audit payloads may contain correlation ID, property/media/session IDs, state, duration, byte/dimension buckets, and safe error category. They must not contain signed URLs, credentials, bytes, raw EXIF, user filenames, provider payloads, address, or free text.

Operational signals include upload completion/rejection, processing duration/failure category, claim age, retry exhaustion, variant bytes, missing/orphan objects, reorder conflicts, and revocation/purge backlog.

## Test strategy

- Domain/unit: key construction, lifecycle graph, eligibility, strict type/signature/decode/size/edge/pixel rejection, orientation, metadata stripping, recipe output, no upscale/crop, stable errors.
- Application/unit: upload authorization, duplicate/finalization idempotency, cross-property denial, retry policy, stale worker completion, cover/order validation, delete/restore policy, reconciliation decisions.
- Adapter contract: deterministic fake and R2 S3 adapter share head/get/put/delete/list/presign behavior; keys and secrets never escape.
- PostgreSQL integration/pgTAP: migration constraints/RLS/indexes, cover uniqueness, exact-set reorder conflict, lease reclaim, audit/outbox rollback, soft delete/restore, public eligibility projection.
- Image fixtures: forged MIME, oversized metadata, extreme dimensions, orientation and GPS/EXIF-bearing JPEG, corrupt content, and valid happy path.
- Browser: unauthenticated denial plus authenticated media-manager behavior against deterministic fixtures where a safe staff fixture is available.

Every behavior is implemented through red-green-refactor. Tests must observe the expected failure before production code is added.

## Open Decisions

- Malware scanning/runtime and accepted residual risk beyond private quarantine, strict decode, and full re-encoding.
- Worker scheduler/runtime, polling cadence, lease duration, heartbeat, concurrency, retry schedule, and dead-letter operations.
- CDN delivery topology and eligibility-enforcing delivery implementation.
- Hard-removal and cache-revocation SLO.
- Restore, quarantine, original, variant, attempt, and audit retention/legal-hold periods.
- Final visual recipe, compatibility fallback, widths, quality/byte budgets, crop policy, and seamless reprocessing promotion after measured layout tests.

These decisions may not be silently encoded as permanent product semantics in Phase 6.
