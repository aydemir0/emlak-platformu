---
name: real-estate-seo
description: Design and review SEO for the public real-estate experience. Use for property and location URLs, SEO landing pages, metadata, canonicals, robots directives, XML sitemaps, filter and pagination indexability, structured data, internal linking, content quality, redirects, rendering strategy, Core Web Vitals, or search/conversion measurement.
---

# Real Estate SEO

## Start with search intent

For each proposed public page:

1. Name the audience, search intent, and conversion action.
2. Identify the authoritative data source and content owner.
3. Decide whether the page deserves to be indexed.
4. Define its canonical URL, title/H1 purpose, internal-link sources, structured data, and lifecycle.
5. Apply `project-architecture` for routing/rendering and `security-rules` for public inputs and lead capture.

Do not create indexable pages only because a database combination exists. Require distinct intent, useful inventory or content, stable semantics, and a place in the internal-link graph.

## Define URL taxonomy before implementation

- Use lowercase, human-readable, stable, kebab-case slugs.
- Encode meaningful hierarchy such as location and transaction intent only when it improves comprehension and remains stable.
- Keep immutable identifiers available internally so slug changes can redirect reliably.
- Choose one canonical form for trailing slash, casing, locale, and parameter ordering.
- Avoid dates, transient campaign fields, UI state, and presentation options in canonical paths.
- Define collision handling, slug history, and permanent redirects for renamed properties, locations, and content.
- Return a real 404 or 410 for permanently unavailable content according to the documented lifecycle; do not redirect every missing property to a category page.

## Control indexability explicitly

Classify URL states:

- **Indexable:** curated property detail, location, transaction-type, approved SEO landing, and quality editorial pages.
- **Crawlable but non-indexable:** useful user states that search engines may need to follow but should not index.
- **Blocked or inaccessible:** infinite spaces, internal results, private previews, admin routes, and unsafe parameter combinations.

Use an allowlist for indexable facets. Default arbitrary filter combinations to a canonical parent and `noindex,follow` when accessible. Consider crawl blocking only after confirming it will not prevent discovery of required canonical or robots signals.

Never index:

- sort order, view mode, map bounds, tracking parameters, or session state;
- empty, near-empty, duplicate, or unstable combinations;
- internal search results;
- private, draft, expired-preview, or unauthorized content.

Document the filter policy with accepted facets, combination limits, minimum content/inventory thresholds, canonical behavior, sitemap eligibility, and removal behavior.

## Render complete, fast pages

- Render primary content, headings, canonical, metadata, and structured data on the server.
- Do not require client JavaScript to discover critical property facts or internal links.
- Use cached or statically generated output only with a clear freshness and invalidation policy.
- Keep third-party scripts non-blocking and consent-aware.
- Set performance budgets for LCP media, JavaScript, fonts, layout stability, and server response time.
- Use the media skill for responsive dimensions, formats, placeholders, fetch priority, and stable aspect ratios.

## Create useful page content

- Make title, H1, introduction, inventory, supporting facts, FAQs, and calls to action consistent with the same intent.
- Derive text from verified property/location data; do not mass-produce thin or misleading copy.
- Keep critical content editorially controllable.
- Do not publish AI-generated factual claims without deterministic source data and review.
- Show availability and freshness honestly. Avoid stale counts and claims.
- Ensure duplicate properties or syndicated content have a deliberate canonical/publication policy.

## Manage property lifecycle

- Draft and preview properties must be inaccessible to indexing and protected from guessing.
- Published properties may enter sitemaps only after canonical content is available.
- Sold, rented, withdrawn, expired, and deleted properties need documented behavior based on business and search value.
- Preserve valuable URLs when a meaningful archived page remains; otherwise use 404/410 and remove them from sitemaps.
- Use redirects only when there is a genuinely equivalent destination.
- Update internal links and sitemap membership promptly after lifecycle changes.

## Generate metadata and social previews

- Produce unique, truthful titles and descriptions with deterministic fallbacks.
- Keep one canonical URL per indexable page.
- Emit consistent Open Graph and social metadata from the same authoritative page model.
- Provide a valid share image with safe fallback; never expose private media.
- Add language/alternate signals only when localized pages are complete equivalents.
- Avoid keyword stuffing, boilerplate-only descriptions, and unstable inventory counts in titles.

## Use structured data conservatively

- Emit only schema types supported by visible page content and current search-engine guidance.
- Keep names, prices, availability, addresses, images, breadcrumbs, organization/advisor data, and dates consistent with what users see.
- Use stable entity identifiers where possible.
- Do not mark hidden, fabricated, or user-inaccessible content.
- Validate syntax and semantic eligibility, and test rendered output.
- Treat rich-result eligibility as an enhancement, never a guaranteed result.

## Build discoverability

- Link through a deliberate hierarchy: primary navigation, location hubs, curated landing pages, breadcrumbs, related locations/properties, and editorial content.
- Keep important pages within a reasonable click depth.
- Use descriptive anchor text without repetitive keyword manipulation.
- Generate segmented XML sitemaps by content type and respect provider limits.
- Include only canonical, indexable, successful URLs with accurate last-modified values.
- Exclude redirected, noindex, missing, draft, and private URLs.

## Handle pagination and filters

- Give paginated pages stable, crawlable URLs when pagination is needed for discovery.
- Do not canonicalize all pages to page one when later pages contain distinct listings that must be discovered.
- Prevent infinite crawl paths from arbitrary ranges, repeated parameters, or combinatorial facets.
- Normalize equivalent parameters and strip tracking parameters from canonical URLs.
- Keep user-facing filters functional even when their result URLs are non-indexable.

## Measure without corrupting SEO

Track search landing, property view, filter use, advisor contact, form start, qualified lead, and appointment outcomes with a documented event dictionary. Avoid placing PII in GA4, URLs, or client analytics.

Use Search Console, crawl diagnostics, index coverage, Core Web Vitals, sitemap health, landing-page conversion, and internal analytics together. Separate ranking/indexing problems from inventory, content, UX, and conversion problems.

## Review checklist

- Does the page satisfy a distinct search intent with useful, verified content?
- Is indexability allowlisted and canonical behavior deterministic?
- Can crawlers access primary content and links without client execution?
- Are thin, duplicate, private, filtered, and stale states controlled?
- Are lifecycle, redirects, sitemap membership, and slug history defined?
- Are metadata and structured data consistent with visible facts?
- Are internal links, performance budgets, and conversion actions present?
- Is analytics free of PII and third-party code kept off the critical path?
