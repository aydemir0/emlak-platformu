# Public Property Experience and SEO Foundation

## Implemented Phase 7 boundary

- Public routes render only the server-side public property projection. A property must be `ACTIVE`, not soft-deleted, use a current canonical route, and have at least one `READY`, `PUBLIC`, non-deleted media item with a current, non-purged variant.
- Canonical detail URLs are `/satilik|kiralik/{city}/{district}/{property-type}/{slug}`. Current public routes render; historical property routes resolve directly to the current canonical with HTTP 301; unavailable routes are not found.
- Listing filters are bounded and canonicalized for city, district, property type, minimum/maximum price, room count, and page. Arbitrary filter or paginated states use `noindex,follow` and never enter the sitemap.
- Sitemap entries come only from the public repository. A production absolute site origin is still required before the sitemap can meet the usual absolute-URL deployment expectation.
- `location_visibility === EXACT` may expose `address_line` on the detail page. Coordinates are not emitted in metadata or structured data. Any other visibility value is redacted in the server read model: only city and district are delivered, with no address or coordinates in HTML, metadata, JSON-LD, or client props.
- Media presentation consumes only public-eligible variants through the Phase 6 delivery-path contract and renders responsive AVIF/WebP candidates. Delivery topology remains a separate operational decision.

## Deferred decisions

- Production canonical host and absolute sitemap origin.
- Curated landing-page allowlist and indexability thresholds.
- Pagination indexability limits beyond the Phase 7 conservative noindex default.
- Public map/coordinate rendering criteria for `EXACT` locations.
- CDN delivery topology, cache invalidation SLOs, and final media art direction.
