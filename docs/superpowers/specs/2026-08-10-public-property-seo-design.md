# Public Property Experience and SEO Foundation Design

## Goal

Deliver server-rendered public property discovery and detail pages that expose only active, non-deleted, public-eligible property and media facts; keep the crawl space bounded; and preserve the established property URL/redirect contract.

## Confirmed decisions

- The V1 canonical property route is `/satilik|kiralik/{city}/{district}/{property-type}/{slug}`.
- Only `ACTIVE`, non-deleted properties with an owned current property route are eligible for public read models.
- Public media requires `READY`, `PUBLIC`, non-deleted media and non-purged variants matching the current recipe. `READY` alone is never public eligibility.
- Public read models are server-rendered and query PostgreSQL directly through a server-only infrastructure adapter. They do not use browser Supabase access or privileged admin projections.
- Filter state is bounded and normalized. Arbitrary valid filter combinations render for users but default to `noindex,follow`; they do not enter the sitemap.
- Historical property routes redirect directly to the current canonical route with HTTP 301 only when the target is still publicly eligible. Otherwise the route is not disclosed.
- `location_visibility = EXACT` may expose `address_line` on the visible detail page. Coordinates are included only if a page actually needs them. Neither exact address nor coordinates enter canonical URLs, sitemaps, metadata, or structured data.
- Any non-`EXACT` location value exposes only city and district. Address and coordinates are removed in the public read model before delivery, metadata, structured data, or serialized client props.
- Location-visibility vocabulary remains a product Open Decision. Phase 7 treats only `EXACT` specially.

## Architecture

The public delivery layer parses route/query input, calls a dedicated application read contract, and renders a serializable public projection with Server Components. The projection contains only presentation-safe facts, calculated canonical/robots decisions, and responsive public media variant descriptors. The persistence adapter owns the single bounded SQL query shape and public lifecycle predicates; React components do not decide publication, media visibility, or location redaction.

The initial filter foundation is intentionally not an SEO landing engine. It supports listing type, city, district, property type, price, bedroom/room count, stable page pagination, and a deterministic canonical query form. Curated SEO pages remain a separate domain and are not inferred from arbitrary URLs.

## Routes

- `/satilik/[city]/[district]/[propertyType]/[slug]` and `/kiralik/[city]/[district]/[propertyType]/[slug]`: canonical property detail.
- `/satilik` and `/kiralik`: server-rendered public discovery entry points with bounded query parameters.
- `/sitemap.xml`: dynamic sitemap containing only current, public-eligible canonical property URLs.

The listing route uses query parameters for filters and `page`. Canonical query serialization orders known parameters, removes defaults and tracking parameters, removes duplicates, and rejects unsupported values. The canonical is the normalized listing path plus retained supported filters only where the URL is genuinely equivalent; arbitrary filter combinations are `noindex,follow`.

## Search, pagination, and query model

The read model loads property, listing type, property type, city/district hierarchy, selected public media variants, and total count without per-row queries. It uses a bounded page size, stable publication/id ordering, and an explicit maximum page. The initial database shape supports offset pagination because the requested contract is page-oriented; cursor pagination remains an Open Decision if inventory scale proves offset costs material.

The read model redacts sensitive fields in SQL projection and maps the result to public contracts. It never returns raw `properties.*`, staff assignments, audit data, media originals, private object keys, address/coordinates for non-`EXACT`, or route reservation internals.

## SEO output

Detail pages render a canonical link, unique factual title/description, Open Graph fields sourced from the same public model, JSON-LD `BreadcrumbList`, and responsive public image markup. No Product schema is emitted. Filters that are not explicitly curated emit `noindex,follow`; page two and later also remain non-indexable in this first foundation while retaining self-canonicalized bounded pagination URLs. Sitemaps include only canonical detail pages with `lastModified` from public record changes.

## Redirects and unavailable content

The route resolver checks the current route first, then property slug history joined to the current public record. A public historical route emits a direct 301 to the current canonical. Draft, passive, deleted, inaccessible, or malformed routes return a privacy-safe not-found response and are absent from sitemap output.

## Testing and verification

Tests cover public lifecycle/media predicates, location redaction across visible HTML/metadata/JSON-LD/serialized props, old-route 301, canonical normalization, noindex filters, pagination, query count, responsive media markup, sitemap membership, and browser navigation. Tests use only the local `emlak-platformu` database and deterministic media descriptors. No remote Supabase or R2 mutation is authorized.

## Open decisions

- The exact non-`EXACT` location-visibility vocabulary and any future map behavior.
- Whether page two and later should become indexable after measured crawl/inventory criteria are approved.
- Public cache freshness SLOs and invalidation wiring after property/media publication changes.
- Final SEO landing-page approval/query model and its inventory thresholds.
- Public CDN host/delivery implementation for R2 variants.
