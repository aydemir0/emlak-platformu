# Property media operations

## Implemented boundary

Phase 6 implements exact-key presigned PUT initialization, bounded finalization, PostgreSQL-backed processing claims, Sharp validation/transformation, immutable versioned object keys, retry classification, ordering/cover commands, ADMIN-only soft delete/restore, safe admin/public read projections, and bounded orphan reconciliation. Production R2 is enabled only when the complete server-only credential group is present; local/test runs use the deterministic adapter.

The browser receives an expiring upload URL plus signed content-type, exact content-length, and write-once (`If-None-Match: *`) requirements, never R2 credentials or database object keys. Upload-session replay and finalization are bound to the initiating staff identity. Application use cases re-authorize current property scope. ADVISOR commands require an active assignment; delete and restore require ADMIN. Finalization commits upload facts, media state, audit, and processing intent together. Worker provider calls happen outside transactions, re-check the finalized source checksum before decoding, and completion checks the still-current attempt/source/lease before committing variants and `READY`.

## Operational states

- `UPLOADED`: finalized and queued, private.
- `PROCESSING`: leased to a worker, private.
- `READY`: technically valid, still private unless a separate approved visibility decision makes it eligible.
- `FAILED`: safe categorized failure; only retryable failures accept an explicit retry.
- `DELETED`: immediately ineligible with durable revocation/purge intent; physical retention remains asynchronous.

Concurrent reorder commands submit the complete active set, dense positions, one cover, and expected property version. PostgreSQL locks property then media rows and rejects the stale writer. Restore returns to private `UPLOADED`; it never restores readiness or public visibility.

## Object keys

- Quarantine: `private/quarantine/properties/{propertyId}/{mediaId}/{sourceVersion}/source`
- Original: `private/originals/properties/{propertyId}/{mediaId}/{sourceVersion}/source`
- Variant: `delivery/properties/{propertyId}/{mediaId}/{sourceVersion}/{recipeVersion}/{width}.{format}`

Every segment is server-controlled or strictly validated. User filename, property slug/address, signed URL, and provider hostname are never persisted as identity.

## Compensation and reconciliation

R2 writes and PostgreSQL transactions are intentionally not presented as atomic. Immutable puts are idempotent by exact key/checksum. A database failure after object creation leaves an unreferenced object; the bounded reconciler lists only approved prefixes, compares all page keys to authoritative records in one query, honors a grace period, and idempotently deletes confirmed orphans. Missing authoritative objects are operational incidents and never become public merely because another object exists.

## Open Decisions

- Malware runtime and policy.
- Production worker scheduler/runtime.
- CDN delivery topology and denial mechanism.
- Hard-removal SLO.
- Configurable retention values and final legal durations.
- Final visual recipe.
