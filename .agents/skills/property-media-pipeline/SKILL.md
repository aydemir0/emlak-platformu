---
name: property-media-pipeline
description: Design and review the secure property-media lifecycle using Cloudflare R2 and responsive variants. Use for upload authorization, object keys, image validation, malware or content checks, processing jobs, metadata, responsive formats and sizes, delivery URLs, caching, ordering, alt text, retries, observability, retention, soft deletion, or media-related schema and UI contracts.
---

# Property Media Pipeline

## Treat upload as a state machine

Model at least these conceptual stages:

```text
requested -> uploading -> uploaded -> validating -> processing -> ready
                                      |              |
                                      v              v
                                   rejected        failed
                                                        |
                                                        v
                                                     retrying
ready -> soft-deleted -> retention-expired -> purged
```

Use explicit states and timestamps rather than inferring readiness from object existence. Define allowed transitions, responsible actor/job, retry behavior, and user-visible status. Never expose an original or variant publicly before validation succeeds and the media record is ready.

## Authorize before issuing upload access

- Authenticate the actor and authorize media changes against the property and organization context on the server.
- Issue short-lived, single-purpose signed upload access scoped to one unpredictable object key, expected content type, maximum size, and checksum when supported.
- Never give browser clients general R2 credentials, list permissions, overwrite access, or arbitrary object keys.
- Rate-limit upload initialization and cap active uploads per actor/property.
- Record who initiated the upload, the intended property, expiry, and correlation identifier.
- Make finalization idempotent and reject reuse for a different property or actor.

## Validate untrusted files server-side

Do not trust filename extensions or browser-provided MIME types.

Validate:

- signature/magic bytes and decoded media type;
- byte size before and after transfer where possible;
- image dimensions, pixel count, frame/page count, and animation policy;
- successful decode using a hardened, maintained processor;
- checksum and transfer completeness;
- allowed formats and color/profile metadata;
- malware scanning or an explicitly documented equivalent risk control;
- decompression-bomb and resource-exhaustion limits;
- metadata stripping requirements, especially GPS/EXIF privacy.

Reject SVG, HTML, scripts, executables, polyglots, and unsupported archives unless a separately threat-modeled workflow requires them. Store rejected files in a private quarantine location with short retention; never serve them from the public delivery domain.

## Design R2 object keys

- Generate keys on the server with non-guessable media identifiers.
- Do not use user filenames, addresses, customer data, or mutable slugs as authoritative keys.
- Separate originals, quarantined inputs, and public variants by prefix or bucket policy.
- Include a processing/version segment so variant recipes can evolve without overwriting cached assets.
- Prefer immutable variant keys and long-lived cache headers.
- Keep the R2 object key in the database; do not make a provider URL the system of record.

Example conceptual layout:

```text
private/originals/{media_id}/{version}/source
private/quarantine/{upload_id}/source
public/properties/{media_id}/{recipe_version}/{width}.{format}
```

Do not copy this layout blindly if tenancy or delivery-domain requirements differ; document deviations.

## Process asynchronously and idempotently

- Finalize the database record only after confirming the uploaded object and expected checksum.
- Dispatch processing through a durable mechanism when latency or retry needs justify it.
- Claim work atomically and make repeated delivery safe.
- Limit CPU, memory, decode time, and output dimensions.
- Generate variants from the validated original, never from client-supplied thumbnails.
- Record processor version, recipe version, attempts, last error category, and completion timestamps.
- Use bounded retries with backoff for transient errors; send deterministic validation failures directly to rejected.
- Provide dead-letter/recovery operations and admin-visible failure status.
- Prevent an old job from publishing over a newer media version.

## Produce responsive variants

Define recipe sets from measured layout needs rather than arbitrary device names. Support:

- width-based responsive candidates appropriate to card, gallery, detail, and social contexts;
- modern formats such as AVIF and WebP with a deliberate compatibility fallback;
- aspect-ratio strategies that never silently crop material facts;
- quality settings based on visual tests and byte budgets;
- width/height metadata to prevent layout shift;
- optional low-quality placeholder derived from the validated image;
- a separate social/share recipe when required.

Do not upscale beyond the original dimensions. Preserve a controlled original for future reprocessing, but do not expose it publicly by default.

## Persist authoritative metadata

Keep media records independent from binary objects. Store at least:

- media and property identifiers;
- state, visibility, role/type, and sort position;
- original key, checksum, detected MIME type, dimensions, and byte size;
- variant recipe/version and variant metadata;
- alt text/caption and provenance where applicable;
- uploader, timestamps, processing attempts, and failure category;
- soft-delete, restore, retention, and purge timestamps.

Use database constraints for uniqueness and ordering invariants where practical. Apply `database-conventions` before defining tables or migrations.

## Deliver safely and quickly

- Serve only ready, public variants from a dedicated media domain or controlled delivery route.
- Set immutable cache headers for content-addressed/versioned variants.
- Return correct content type, content length, and security headers.
- Prevent content sniffing and active-content execution.
- Keep signed delivery URLs short-lived for private assets and exclude them from shared caches.
- Use `srcset`, `sizes`, explicit dimensions, and appropriate loading/fetch priority.
- Reserve eager/high-priority loading for the actual LCP candidate.
- Provide a stable placeholder for missing, processing, failed, or removed media.

## Handle ordering and edits

- Make reorder operations transactional and authorization-checked.
- Maintain exactly one primary/cover image when the property requires one.
- Resolve concurrent reorder/update conflicts deterministically.
- Treat replacement as a new media version or record so cached and audited history remains coherent.
- Keep alt text factual and useful; do not stuff keywords or infer sensitive attributes.
- Record the source and reviewer when AI assists alt-text drafting. Never auto-publish unverified factual claims.

## Delete and retain deliberately

- Soft-delete the database record first and immediately remove it from public property responses.
- Invalidate or version delivery references where necessary.
- Allow restore during a documented retention period when business rules permit.
- Purge variants and originals asynchronously after retention, legal-hold, and reference checks.
- Make purge idempotent and record audit evidence without retaining sensitive file contents.
- Reconcile orphan database records and orphan R2 objects on a scheduled, observable process.

## Observe and operate

Measure upload completion, rejection reasons, processing latency, variant bytes, queue age, retry rate, failures, cache hit ratio, missing objects, and orphan counts. Log identifiers and error categories, not image bytes, signed URLs, secrets, or sensitive EXIF.

Create runbooks for stuck processing, provider outage, corrupt originals, recipe rollback, reprocessing, and accidental publication.

## Review checklist

- Is upload access narrowly authorized, short-lived, and rate-limited?
- Are type, size, dimensions, decode safety, checksum, and metadata validated server-side?
- Are originals private and variants immutable/versioned?
- Is processing idempotent, bounded, observable, and safe under retries?
- Are responsive recipes tied to real layouts and performance budgets?
- Can no unvalidated, deleted, or private object become public?
- Are ordering, replacement, deletion, retention, restore, and purge semantics explicit?
- Are database, SEO, privacy, and audit implications covered by their relevant skills?
