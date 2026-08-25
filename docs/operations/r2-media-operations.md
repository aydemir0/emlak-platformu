# R2 media operations

## Delivery and upload contract

The application route `/delivery/properties/{propertyId}/{mediaId}/{sourceVersion}/property-v1/{width}.{webp|avif}` is the exact same-origin public delivery boundary. It reads only `delivery/properties/`, accepts the deterministic recipe path, serves only WebP/AVIF with `nosniff`, and applies one-year immutable caching. Missing, malformed, original, quarantine, and unsupported objects return non-cacheable 404 responses.

Uploads use the validated virtual-hosted R2 origin derived from `R2_BUCKET_NAME`, `R2_ACCOUNT_ID`, and `.r2.cloudflarestorage.com`. Admin CSP permits that exact origin only when R2 is configured. Browser CORS must allow only the approved application origin, `PUT`, `content-type` and `if-none-match`, and no credential sharing. R2 credentials remain server-only and bucket-scoped. The bucket itself is private; originals and quarantine are never exposed by a public bucket URL or custom domain.

## Environment and reconciliation

Use separate R2 credentials/buckets per environment. Test rejects R2; production requires the complete four-variable group. Validate bucket/account identity, CORS, object lifecycle, and same-origin delivery in staging before production.

Reconciliation allows only `private/quarantine/properties/`, `private/originals/properties/`, or `delivery/properties/`; pages are capped at 250 and respect a grace period. It is dry-run by default. Deletion requires an explicit flag and positive `maximumDelete` no greater than the page limit. Operators record prefix, cursor, before count, expected candidates, grace period, maximum, run ID, result, and approver. Stop on any count mismatch; never broaden a prefix or touch another bucket.

Alert on processing failures/lease age, missing ready variants, orphan candidates, unexpected delivery 404 rate, and credential/CORS failures. During outage keep authoritative DB state and originals private; do not publish unvalidated files or bypass the route.
