# Property media lifecycle data design

**Status:** Proposed Phase 2 design; documentation only. No bucket, schema, migration, or processor is introduced.

## Purpose and ownership

The Property Media domain owns upload finalization, technical processing state, variants, cover/ordering, visibility, and deletion. PostgreSQL owns metadata/workflow truth; R2 owns bytes only. This document refines [media architecture](../architecture/media-architecture.md), [ADR-003](../decisions/ADR-003-cloudflare-r2-media-storage.md), and [ADR-007](../decisions/ADR-007-event-outbox-strategy.md). V1 serves one organization and has no multi-tenancy under [ADR-009](../decisions/ADR-009-future-multi-tenancy-boundary.md). Expected database peers are the [domain model](domain-model.md), [authorization matrix](authorization-matrix.md), [RLS design](rls-design.md), [index strategy](index-strategy.md), [transaction and concurrency design](transaction-concurrency.md), [outbox design](outbox-design.md), [retention and deletion design](retention-deletion.md), [property lifecycle](property-lifecycle.md), and [customer and lead model](customer-lead-model.md).

## Canonical records and invariants

| Table | Responsibility and important invariants |
| --- | --- |
| `media_upload_sessions` | All pre-finalization state: server-generated unpredictable upload identity/key, property and actor, expected type/size/checksum, expiry, one-time finalization/idempotency key, and conceptual session status `REQUESTED`, `UPLOADING`, `FINALIZED`, `EXPIRED`, or `ABORTED`. These are session states, not persistent media states. |
| `property_media` | Stable media/property identity, persistent state, original key/checksum/detected facts, visibility, cover flag, dense positive `sort_order`, processor/recipe version, `version`, lifecycle timestamps, uploader and provenance. Persistent state is exactly `UPLOADED`, `PROCESSING`, `READY`, `FAILED`, or `DELETED`. |
| `property_media_variants` | Immutable versioned R2 variant metadata keyed to media plus recipe/version/width/format, dimensions, bytes, checksum, and object key. V1 responsive output formats are WebP and AVIF. A uniqueness rule prevents two rows for the same media/version/recipe/width/format. |
| `media_processing_attempts` | Stable attempt identity/input plus a recoverable lease (`lease_owner`, `lease_expires_at`, heartbeat), processor/source/recipe versions, start/end, categorized outcome/error, and correlation/idempotency identifier. Identity/input is immutable; only the narrowly scoped worker may update lease heartbeat and terminal outcome fields. No raw bytes, signed URLs, EXIF, or secrets. |

Original, quarantine, and draft-ready objects remain private. Object keys contain no filenames, addresses, slugs, or PII. A media row cannot exist until upload finalization confirms the intended actor/property, object existence, expected size/checksum, and one-time session use.

## Persistent lifecycle contract

Each transition checks authorization or trusted worker identity, locks the media row, compares expected media version, appends audit evidence, and changes state atomically with variant/attempt metadata and any outbox intent. Old jobs must include the claimed media/version and cannot publish over a newer version. Every persistent transition not listed below, including self-transitions, is invalid.

| Transition | Actor intention and preconditions | Transaction, concurrency, audit, and outbox effect |
| --- | --- | --- |
| `UPLOADED -> PROCESSING` | Trusted worker claims a finalized, complete private object whose upload session is finalized; retry/claim limits pass | Atomic claim/lease, media lock/version check, attempt insert, state/version update, audit. No public effect. |
| `UPLOADED -> DELETED` | `ADMIN` cancels before processing or confirms a security/privacy takedown | Lock/version check; deletion metadata/audit; durable private-object purge after retention. Never public. |
| `PROCESSING -> READY` | Trusted worker completed validation, safe decode, metadata stripping, and the required immutable variants for the same media/version | Lock/version/claim check; insert variants and mark attempt success/state `READY` atomically; audit; outbox read-model invalidation only if committed visibility plus property state makes it public-eligible. |
| `PROCESSING -> FAILED` | Trusted worker reaches deterministic failure or exhausts bounded transient retries | Lock/version/claim check; categorize safe failure, close attempt, set `FAILED`, audit; operational alert/dead-letter intent when required. No delivery. |
| `PROCESSING -> DELETED` | `ADMIN` takedown/cancellation wins over active work | Lock/version check; invalidate the claim/version so late completion cannot win; set deletion metadata/audit; durable revocation/purge intent. |
| `READY -> PROCESSING` | Authorized reprocessing starts for a new controlled media/recipe version | Lock/version check; create new attempt/version and revoke current readiness for the row; retain old immutable variants privately until retention/reference rules permit purge; audit. Public reads immediately stop eligibility until new `READY`. |
| `READY -> DELETED` | `ADMIN` removal, privacy takedown, or parent lifecycle action removes media | Lock/version check; set deletion metadata/audit; durable immediate delivery/cache revocation plus later idempotent object purge. |
| `FAILED -> PROCESSING` | Authorized operator/worker retries after a retryable cause or approved recovery | Lock/version check; enforce bounded attempt policy, create a new claim/attempt, audit. No public effect. |
| `FAILED -> DELETED` | `ADMIN` abandons failed media | Lock/version check; deletion metadata/audit; durable retained-object cleanup. |
| `DELETED -> UPLOADED` | `ADMIN` restores within retention for full revalidation | Original exists and checksum matches; not erased, held against restore, or replaced incompatibly; property exists and actor remains authorized | Lock/version check; clear only approved deletion fields, reset visibility/cover/order eligibility, return to `UPLOADED`, audit, and enqueue processing only after commit. Never restore directly to `READY`. |

Upload-session finalization is idempotent for the same session, actor, property, checksum, and idempotency key. A conflicting reuse is rejected and audited. Expired/aborted sessions cannot finalize; orphan quarantine objects are reconciled and purged after bounded retention.

## Readiness versus public eligibility

`READY` means technical processing completed. It never means public. Public eligibility is derived at read/delivery time from committed facts: media state is `READY`; `deleted_at` is null; media visibility is approved; its property is currently public under [property lifecycle](property-lifecycle.md); the property is not deleted; and no security, legal, privacy, or takedown denial applies. The delivery boundary serves only exact immutable variant keys from that eligible projection. A stale event or possession of an R2 key cannot grant eligibility.

## Cover and ordering concurrency

For each property with at least one active (non-deleted) media row, exactly one active cover is required. A partial unique invariant on `property_media(property_id)` where `is_cover = true and deleted_at is null` enforces at most one; the reorder/cover transaction enforces that a non-empty active set has at least one. Deleting the cover must select a replacement in the same transaction, or delete the final active media row, or reject.

Every reorder/cover command supplies the expected `properties.version` and expected version for every affected `property_media` row. The transaction locks the property first, then all active media rows in ascending immutable media ID order. It verifies the submitted set exactly matches the current authorized active set, checks versions, assigns dense positive `sort_order` values `1..n`, selects exactly one cover, increments affected media and property versions, and records audit/outbox evidence. Any set/version conflict returns a conflict and current safe ordering; there is no last-write-wins merge. The unique-cover guard remains the final race defense.

Indexes support active media by `(property_id, sort_order)`, the partial cover lookup, ready-public projection joins, variants by media/version/recipe, upload expiry cleanup, and claimable attempts. They are query-driven; variant and attempt history indexes are bounded by actual operational reads.

## Soft delete, restore, retention, and privacy

`DELETED` is the media lifecycle state and `deleted_at` records the soft-delete instant. Deletion immediately removes public eligibility and durably requests page/media cache revocation; physical object purge is asynchronous, idempotent, and conditioned on configurable retention expiry, legal hold, privacy erasure, and reference checks. Restore returns to `UPLOADED` for full validation, never silently republishes, and does not revive former cover/visibility/order status. Privacy erasure may shorten retention and requires purging quarantine, originals, variants, provider caches, exports, and backups under the approved policy while retaining only minimum non-sensitive audit evidence. Reconciliation detects missing database objects and orphan R2 objects without treating storage presence as workflow truth. Exact legal retention periods remain an Open Decision rather than hard-coded constants.

## Authorization and RLS boundary

Upload initialization, finalization, visibility, cover, reorder, and reprocess are server-authorized against current property scope. Media soft-delete and restore require `ADMIN`; hard purge remains a separate narrowly privileged retention/privacy operation. Browsers receive only short-lived single-object upload authority and never list/overwrite/general R2 credentials. RLS is deny-by-default and operation-specific on exposed metadata; anonymous access is limited to the ready-and-currently-eligible projection, not raw tables or keys. Trusted processors/service roles are narrowly scoped, server-only, version-aware, and audited. Rate/size/dimension/frame/decode/concurrency limits protect upload and processing cost.

## Assumptions and Open Decisions

- **Assumption:** Reprocessing may temporarily remove public eligibility; whether dual-version seamless promotion is needed is an Open Decision.
- **Assumption:** Immutable validated originals are retained privately for controlled reprocessing until lifecycle policy requires purge.
- **Open Decision:** Approved input formats, animation, byte/dimension/pixel/frame limits, malware control, processor runtime, retry/dead-letter policy, and orphan cadence.
- **Open Decision:** Responsive widths/recipes, compatibility fallback beyond the locked WebP/AVIF outputs, crop policy, byte budgets, and seamless reprocessing/version promotion.
- **Open Decision:** Product behavior when the last active media is deleted and whether publication must additionally require a minimum media count/type.
- **Open Decision:** R2 bucket/domain topology, delivery/revocation mechanism and hard-removal SLO, configurable restore windows, and exact legal-hold/privacy-erasure/retention periods.
