# ADR-003: Cloudflare R2 for Property Media Storage

Status: Proposed
Date: 2026-08-09

## Context

Property images need secure direct upload, private originals, safe transformation, responsive delivery, deterministic caching, reprocessing, ordering, soft deletion, retention, and auditability. Binary objects should not burden the operational database, while storage state alone cannot represent business readiness or authorization.

## Decision

Use Cloudflare R2 as the binary object store. PostgreSQL remains authoritative for media identity, state, association, checksum, detected properties, variant metadata, ordering, provenance, failure, deletion, and retention. Store provider object keys rather than provider URLs as integration metadata.

Use server-generated, environment-separated, non-PII keys with distinct private quarantine/original and delivery-variant namespaces. Variants are immutable and include media/version, recipe version, dimensions, and format in a deterministic key. Originals remain private. Technical `ready` state does not grant public access: public read models and the dedicated delivery boundary require both ready processing state and current property/media publication eligibility from PostgreSQL. The R2 origin is not directly public or enumerable.

Uploads receive narrow, expiring, single-object authority and undergo actual decode validation, signature/type/size/dimension/resource checks, approved malware controls, EXIF/GPS removal, orientation normalization, and bounded AVIF/WebP plus compatibility-variant generation. Unpublish, visibility removal, soft deletion, accidental publication, and privacy takedown revoke delivery eligibility, durably request CDN/media purge, and deny origin delivery under a documented hard removal bound. Physical purge of retained private objects follows explicit retention, privacy-erasure, hold, and reference checks.

## Alternatives considered

- Store images in PostgreSQL: increases database size, backup cost, and delivery coupling.
- Supabase Storage: viable, but R2 is the selected media-storage boundary for the planned stack.
- Expose originals and transform on every request: expands attack surface and creates unpredictable latency/cost.
- Mutable filename/slug keys: leak data and make CDN consistency unreliable.
- R2 object listing as the source of truth: cannot enforce property association, readiness, ordering, or lifecycle invariants.

## Consequences

The design supports immutable CDN delivery, responsive formats, safe reprocessing, and storage-provider isolation. It introduces database/object reconciliation, processing/retry operations, orphan cleanup, and a deliberate two-system purge workflow.

**Assumption:** Validated originals are retained privately to support later recipe changes unless privacy/retention policy requires earlier purge.
**Open Decision:** Approve bucket/account topology, controlled delivery/revocation mechanism and hard removal SLO, processing runtime, input limits, variant recipes/fallback, malware control, lifecycle periods, and legal-hold behavior.

## Security impact

No browser receives general R2 credentials or arbitrary overwrite/list authority. Quarantine, originals, draft-ready variants, and the R2 origin are not publicly readable. Files are untrusted until decoded and validated; active content, polyglots, decompression bombs, unsafe metadata, and resource amplification are controlled. Logs and keys exclude PII, signed URLs, secrets, and raw metadata.

## Performance impact

Responsive width/format recipes and explicit dimensions reduce transfer and layout shift. Versioned variants can use long-lived immutable CDN caching, and recipe changes create new keys instead of global overwrites. Processing is off public rendering paths and concurrency-bounded.

## SEO/data/operations impact

Public pages, metadata, structured data, and sitemaps reference only stable variants that are both ready and currently public-eligible, with factual alt-text provenance. Missing, failed, deleted, processing, and visibility-revoked states have stable placeholders. Operations need dashboards and runbooks for backlog, rejection, retry, corrupt originals, missing objects, delivery revocation, cache behavior, recipe rollback, reprocessing, and orphan reconciliation.

## Migration/rollback considerations

No bucket or runtime configuration is created by this ADR. A provider migration copies private originals and delivery variants, verifies checksum/metadata, switches adapter/delivery configuration, and preserves database media identifiers and old-key reconciliation until completion. A defective recipe rolls forward to a new version; existing immutable variants remain retained only under their visibility, reference, and retention rules.
