# ADR-004: Public URL and SEO Taxonomy

**Status:** Proposed
**Date:** 2026-08-09

## Context

The public platform needs stable discovery paths for properties, locations, curated search intent, and editorial content. A real-estate filter UI can generate an effectively unbounded URL space; indexing it automatically would create duplicate or thin pages, unstable canonicals, excessive crawl load, and cache/query amplification. Slugs will also change over time while external links and search equity must remain coherent.

## Decision

Use an explicit, allowlisted public URL taxonomy owned by the SEO/content boundary:

- canonical slugs are normalized, lowercase, human-readable kebab-case values backed by immutable internal identifiers;
- slug history is retained and prior valid slugs permanently redirect to the one current canonical, without chains or loops;
- property details, approved location/transaction pages, curated SEO landings, and quality editorial pages are indexable only when their publication, content, inventory, canonical, and internal-link requirements pass;
- a curated landing is an owned record with explicit search intent, approved content, and a bounded normalized query definition, not a materialized arbitrary filter URL;
- arbitrary filters, sorting, view mode, map bounds, tracking parameters, and internal search are not automatically indexable; safely accessible filter states default to `noindex,follow` and canonicalize only to a genuinely equivalent curated parent;
- pagination uses stable bounded URLs when required for discovery and is not universally canonicalized to page one;
- only canonical, indexable, successful URLs enter segmented sitemaps;
- metadata, structured data, internal links, redirects, status codes, and sitemap membership follow the same lifecycle model.

Exact route segments, locale/trailing-slash rules, lifecycle outcomes, and facet thresholds remain open product/SEO decisions documented in [SEO architecture](../architecture/seo-architecture.md).

## Alternatives considered

- **Index every non-empty facet combination:** rejected because database existence does not prove distinct intent or quality, and crawl/cache cardinality is unbounded.
- **Index no landing pages beyond property details:** rejected because it prevents intentional location and transaction-intent discovery.
- **Delegate canonical/indexability to page components or an SEO plugin:** rejected because rules would fragment across presentation code and drift from lifecycle/data ownership.
- **Redirect all removed properties to a category page:** rejected because non-equivalent destinations create misleading behavior and soft-404 risk.
- **Use mutable slugs as entity identity:** rejected because renames would break references and complicate collision/audit handling.

## Consequences

Positive consequences are a bounded crawl space, stable canonical ownership, deliberate content quality, predictable cache keys, and auditable publication. Negative consequences are editorial governance, a landing approval workflow, slug-history maintenance, redirect validation, and explicit dependency tracking for sitemap/internal-link invalidation.

## Security impact

Private, draft, preview, admin, soft-deleted, and unauthorized states are excluded from public routes and sitemaps; robots metadata is not used as access control. Paths, queries, redirects, metadata, rich text, and structured data require server validation and safe output encoding. PII is prohibited from URLs and analytics.

## Performance impact

A curated taxonomy bounds database query patterns, cache cardinality, render work, sitemap size, and crawler load. Server-rendered primary content and responsive media support Core Web Vitals. Segmented sitemaps can be rebuilt incrementally.

## SEO/data/operations impact

SEO gains deterministic canonical, redirect, pagination, sitemap, metadata, structured-data, and lifecycle behavior. Data ownership must include immutable identity, slug history, landing approval/query definition, and indexability state; no schema is selected by this ADR. Operations need checks for redirect loops, sitemap validity, thin/empty landings, stale lifecycle state, and search/index coverage.

## Migration/rollback considerations

Before public launch, validate route normalization and redirect imports against collisions and chains. A later taxonomy change requires a mapping from every affected old canonical to an equivalent new canonical, updated internal links/sitemaps, cache invalidation, and monitoring. Rollback must preserve both old and new slug history and must not remove redirects while either URL has external exposure. Indexability can be reduced safely by removing sitemap membership and applying lifecycle-appropriate directives/statuses; expanding it requires renewed quality checks.

## Assumptions

- **Assumption —** One public canonical hostname is selected for production.
- **Assumption —** Stable immutable identifiers exist independently of public slugs.
- **Assumption —** Curated landing approval is a deterministic human-governed business process; AI is not authoritative.

## Open Decisions

- Exact route hierarchy, route vocabulary, canonical host, locale strategy, trailing-slash rule, and parameter normalization policy.
- Allowlisted facets, supported combinations, and minimum inventory/content/editorial thresholds.
- Lifecycle outcomes for sold, rented, withdrawn, expired, deleted, duplicate, and syndicated properties.
- Pagination indexability and crawl bounds by page family.
- Ownership and approval roles for landing pages, redirects, and SEO-critical edits.
