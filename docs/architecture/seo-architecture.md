# SEO Architecture

**Status:** Proposed

## Purpose

Make search visibility a first-class routing, content, rendering, lifecycle, and measurement concern. The goal is a bounded set of useful, server-renderable pages with deterministic canonical behavior, not automated indexation of every database or filter combination.

## Responsibilities

- Classify every public URL state as indexable, crawlable but non-indexable, or blocked/private.
- Maintain a curated registry of landing pages tied to explicit search intent, verified content, and bounded query definitions.
- Produce canonical URLs, metadata, social metadata, structured data, internal links, and sitemap membership from an authoritative page model.
- Preserve slug history and issue permanent redirects only to genuinely equivalent destinations.
- Coordinate property/content lifecycle with redirects, status codes, cache invalidation, and sitemap removal.
- Measure crawl/index health, Core Web Vitals, landing performance, and conversion without sending PII to analytics.

## Boundaries

The SEO/content domain owns indexability policy, canonical rules, landing-page approval, slug history, redirect intent, metadata policy, and sitemap eligibility. Property, location, advisor, and blog domains own their facts and lifecycle. The delivery layer renders the combined public page model but does not invent SEO rules.

Arbitrary filter state remains a discovery UI concern unless an explicit curated SEO landing record promotes a normalized, useful query into the indexable set. Media SEO consumes only validated variants that are both ready and currently public-eligible, plus factual alt/caption data from the media boundary.

**Assumption —** Public canonical slugs are lowercase, human-readable kebab-case values backed by immutable internal identifiers and retained history.

## Main data/control flow

1. A normalized request is matched to a page family and immutable entity or curated landing identity.
2. The SEO policy classifies indexability and chooses the canonical identity before data rendering.
3. The public read use case loads published facts, approved editorial content, indexability state, slug history, and ready media.
4. The server emits visible content, canonical, robots directive, metadata, structured data, breadcrumbs, and internal links from the same model.
5. Only canonical, indexable, successful URLs enter the segmented sitemap for their content type with truthful last-modified data.
6. Lifecycle changes commit first, then invalidate affected pages, redirects, internal links, and sitemap projections under [Caching strategy](./caching-strategy.md).

Indexability baseline:

| URL/page state | Default | Canonical and discovery behavior |
| --- | --- | --- |
| Published property with complete public facts | Eligible after policy checks | Stable property canonical; sitemap eligible |
| Approved location/transaction/SEO landing | Eligible only when distinct intent, content, inventory quality, and internal links exist | Curated canonical; sitemap eligible |
| Quality editorial/blog content | Eligible after publication checks | Stable content canonical; sitemap eligible |
| Arbitrary filters, sort, map bounds, view mode | `noindex,follow` when safely accessible | Normalize and point to a semantically equivalent curated parent where one exists; never invent equivalence |
| Paginated discovery | Stable crawlable URLs where needed | Distinct pages are not all canonicalized to page one; exact indexability is policy-controlled |
| Draft, preview, admin, internal search, private data | Blocked/inaccessible or `noindex` as defense in depth | Excluded from sitemaps and public links |
| Missing, withdrawn, sold/rented, expired, deleted | Lifecycle-specific | Equivalent redirect, useful archive, 404, or 410 only under an approved rule |

Slug changes resolve the current entity by immutable identity, persist prior normalized slugs, and redirect each valid historical slug to the single current canonical. Redirect chains and loops are prohibited.

Structured data is emitted conservatively: only supported types and properties reflected in visible, verified content. Price, availability, address, images, organization/advisor data, breadcrumbs, and dates must agree with the page.

## Security implications

- Preview and admin routes are authenticated and authorized; `noindex` or robots exclusion is not an access control.
- Canonical, redirect, path, query, metadata, rich text, and structured-data values are server-validated and safely encoded.
- Public pages and sitemaps exclude draft, soft-deleted, private, or unauthorized entities and media.
- Lead/customer PII never appears in URLs, structured data, analytics, logs, or share metadata.
- Redirect destinations are derived from controlled route identities to prevent open redirects.

## Performance implications

Indexable pages follow [Rendering strategy](./rendering-strategy.md): meaningful server HTML, low browser JavaScript, non-blocking consent-aware analytics, and responsive images with stable dimensions. Sitemap generation is segmented and incremental rather than a full-site request-time scan. Curated landings bound database queries, cache cardinality, crawl space, and invalidation fan-out.

## Failure modes

- Unknown or ambiguous canonical identity: emit a safe non-indexable/error response instead of competing canonicals.
- Thin/empty landing: remove from sitemap and indexable allowlist; do not mask it with fabricated copy.
- Stale property lifecycle: invalidate page, landing counts, internal links, redirects, and sitemap; reconcile failed invalidations.
- Slug collision or redirect loop: reject the change before publication and preserve the last valid canonical.
- Metadata/structured-data disagreement: prefer verified visible facts, suppress invalid markup, and alert validation checks.
- Sitemap generation failure: retain the last known valid bounded artifact where safe, alert, and rebuild without blocking public page delivery.

## Scalability considerations

Segment sitemaps by content type and, when evidence requires, by stable partitions. Use curated landing identities rather than materializing the entire facet product. Keep page, redirect, and sitemap projections rebuildable from authoritative records. Introduce a specialized search/indexing service only when measured discovery requirements exceed PostgreSQL/read-model capabilities and after a separate ADR.

## Rejected alternatives

- Automatically index every non-empty filter combination: creates duplicate/thin content and crawl explosion.
- Client-only primary content or metadata: weakens crawl reliability and user performance.
- Canonicalizing every paginated page to page one: can hide distinct inventory from discovery.
- Redirecting every removed property to a category page: often lacks semantic equivalence and creates soft-404 behavior.
- Generating factual SEO copy or alt text through unaudited AI: conflicts with verified-content and deterministic business rules.
- Treating an SEO plugin as the owner of routing and lifecycle: fragments architecture and makes correctness reactive.

## Open questions

- **Open Decision —** What exact route hierarchy, transaction-intent vocabulary, locale policy, trailing-slash rule, and canonical host will be adopted?
- **Open Decision —** Which facets and combinations may become curated landings, and what minimum inventory/content/editorial thresholds apply?
- **Open Decision —** What public lifecycle behavior applies to sold, rented, withdrawn, expired, soft-deleted, and duplicate/syndicated properties?
- **Open Decision —** Which paginated page families are indexable, and what upper crawl bounds apply?
- **Open Decision —** Which structured-data types are appropriate after current search-engine eligibility guidance and visible templates are confirmed?
- **Open Decision —** Who approves landing pages, redirects, generated fallbacks, and SEO-critical content changes?
