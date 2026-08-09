# Media Architecture

Status: Proposed

## Purpose

Define a secure, recoverable, SEO-aware property-image lifecycle using Cloudflare R2 for binaries and PostgreSQL for authoritative metadata and workflow state.

## Assumptions and open decisions

- **Assumption:** Original uploads remain private. Technical readiness and public eligibility are separate gates; a ready variant remains private until the associated property/media visibility policy permits delivery.
- **Assumption:** Variants are immutable and versioned so they can use long-lived CDN caching without overwrites.
- **Open Decision:** Final format fallback, width/quality recipes, maximum input limits, malware-control approach, and processing runtime require layout tests, threat modeling, and cost measurements.
- **Open Decision:** Retention, restore, legal-hold, and irreversible purge periods require product, privacy, and legal decisions.

## Responsibilities

- The property-media domain owns state transitions, property association, role/cover designation, ordering, visibility, deletion/restoration, and metadata invariants.
- PostgreSQL owns media state, R2 keys, checksum, detected MIME type, dimensions, byte size, recipe/processor versions, variants, ordering, alt-text provenance, attempts, audit references, and lifecycle timestamps.
- R2 owns quarantine objects, controlled originals, and generated delivery variants; it is not the source of workflow truth or public eligibility.
- The media-processing adapter owns safe decode, EXIF/GPS removal, orientation normalization, resource limits, and AVIF/WebP plus compatibility-variant generation.

## Boundaries

Conceptual states are:

```text
requested -> uploading -> uploaded -> validating -> processing -> ready
                                      |              |
                                      v              v
                                   rejected        failed -> retrying
ready -> soft-deleted -> retention-expired -> purged
```

Every transition is authorized, state-checked, idempotent where repeated delivery is possible, and auditable. Readiness describes technical processing only; public eligibility is independently derived from current property publication, media visibility, deletion, and hold/takedown state. Browser clients receive only narrow, expiring upload authority for one server-generated object key. User filenames, addresses, slugs, PII, and provider URLs are not identifiers. Media processing is behind an application-owned port; no R2 or image-library types enter the domain.

The R2 origin is not directly enumerable or publicly readable. A dedicated media delivery boundary exposes only eligible immutable variants; possession of a draft/private object key never grants access. Retention of private originals or internal variants does not imply continued public delivery.

## Main data/control flow

1. An authenticated actor requests an upload; the application authorizes the property and creates a media/upload record with a stable media identifier and an unpredictable upload capability.
2. The server issues short-lived, single-purpose access limited by key, expected type, size, and checksum where supported; the browser uploads only to quarantine.
3. Finalization confirms object existence, size, checksum, actor, property, and one-time intent, then moves the record to validation.
4. A claimed work item verifies magic bytes and actual decode, dimensions/pixel/frame limits, completeness, active-content/polyglot risk, and the approved malware control.
5. Processing strips EXIF/GPS, normalizes orientation and profiles, then generates bounded AVIF/WebP responsive variants and an approved compatibility fallback from the validated original.
6. One transaction records immutable variant metadata and moves the media to `ready`; this does not publish it. Public reads and the delivery boundary may expose only variants that are both ready and currently eligible under the committed property/media visibility state. Cache/read-model invalidation follows commit.
7. Unpublish, media-visibility removal, soft deletion, accidental publication, or privacy takedown immediately revokes delivery eligibility, durably requests page/media cache purge, and stops origin delivery under a documented hard removal bound. A later idempotent purge removes retained private variants/originals only after retention, reference, privacy-erasure, and legal-hold checks.

See [ADR-003](../decisions/ADR-003-cloudflare-r2-media-storage.md), [ADR-007](../decisions/ADR-007-event-outbox-strategy.md), and [SEO architecture](seo-architecture.md).

## Security implications

- Do not trust extension, browser MIME, object metadata, or successful R2 upload. Validate actual content and decoded structure server-side with maintained, sandboxed/bounded processing.
- Reject active formats and unsupported archives; prevent decompression bombs, oversized dimensions, excessive frames, and CPU/memory/time amplification.
- Keep originals/quarantine private and separated from public delivery. Public responses expose only exact ready-and-eligible delivery URLs with correct content type, anti-sniffing, and isolated media-domain policy.
- Strip GPS and unnecessary EXIF before public output; never log bytes, signed URLs, secrets, addresses embedded in keys, or sensitive metadata.
- Re-authorize reorder, replacement, deletion, restore, and reprocessing; prevent an older attempt from publishing over a newer version.

## Performance implications

- Recipe sets follow measured card, gallery, detail, and social layouts; explicit dimensions and stable aspect ratios prevent layout shift.
- Use `srcset`/`sizes`, reserve eager/high priority for the actual LCP image, and do not upscale.
- Content/version-addressed eligible variants use long-lived immutable CDN caching. A changed image or recipe creates a new key rather than purging an overwritten object; revocation still requires a durable purge plus a bounded delivery-denial mechanism.
- Processing is off the interactive rendering path, concurrency-bounded, and observable; public pages have stable placeholders for non-ready states.

## Failure modes

- Interrupted or forged upload: expiry/finalization checks fail; quarantine cleanup later removes the orphan.
- Decode or policy rejection: record a safe reason, keep the object private for bounded retention, and never generate delivery variants.
- Transient processing/R2 failure: retry with bounded backoff and atomic claims; permanent failure becomes admin-visible and recoverable.
- Database/R2 divergence: scheduled reconciliation detects missing objects and orphans without inferring public readiness from storage.
- Delivery revocation failure: deny origin delivery, retain durable purge intent, enforce the hard removal bound, alert, and verify the formerly public URL.
- Retained-object purge failure: public delivery remains denied while private purge stays retryable and audited.
- Recipe defect: roll forward with a new recipe version and reprocess without overwriting known-good variants.

## Scalability considerations

Start with a durable database-backed work boundary and bounded workers within the modular architecture; do not introduce a managed queue before throughput evidence. Partition processing concurrency by resource class, keep object keys environment-separated, and measure backlog age, decode cost, output bytes, cache hit ratio, missing objects, and orphan counts before scaling.

## Rejected alternatives

- Public direct uploads or general browser R2 credentials: excessive authority and no trustworthy validation gate.
- Serving originals or client thumbnails: privacy, security, performance, and cache-control risk.
- Mutable slug/address-based keys or overwriting cached objects: leaks data and makes invalidation unreliable.
- R2 object presence as authoritative state: cannot express authorization, readiness, ordering, audit, or retention.
- A managed queue or media microservice at inception: premature operational complexity; the contracts preserve a future extraction path.

## Open questions

- Which input formats, animation behavior, maximum dimensions/bytes, and malware controls are required?
- Which responsive recipes and compatibility fallback meet actual layouts and browser support targets?
- Where will bounded decoding and transformation execute, and what retry/dead-letter operation will administrators use?
- What cover-image invariant, ordering-conflict policy, and editorial workflow apply?
- What media-delivery topology and revocation mechanism meet the required hard removal SLO without making draft/private variants public?
- Which retention, legal-hold, restore, and privacy-erasure rules govern originals and variants?
