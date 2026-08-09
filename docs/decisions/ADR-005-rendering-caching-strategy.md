# ADR-005: Rendering and Caching Strategy

**Status:** Proposed
**Date:** 2026-08-09

## Context

Public pages need crawlable server content, strong Core Web Vitals, conversion resilience, and predictable freshness. Admin pages need current permission-aware operational data. Property publication, unpublication, price, media ordering, and SEO changes affect multiple public projections, while cache behavior that relies on implicit framework defaults can expose stale or contradictory output.

## Decision

Adopt a hybrid server-rendering strategy with explicit cache contracts:

- indexable pages deliver their primary content, links, canonical, metadata, and structured data in server-rendered HTML;
- public discovery reads use dedicated publication-filtered page/read models and may be precomputed or cached only under a documented stale/revalidation policy;
- admin and preview experiences are dynamic, authenticated, object-authorized, non-indexable, and prohibited from shared caching;
- browser JavaScript is limited to interactive enhancement and is not required to discover critical content or complete the basic discovery/lead journey;
- cache identities and tags are deterministic and domain-scoped, using immutable entity and curated-query identities rather than raw URLs or user input;
- invalidation occurs only after the authoritative transaction commits and covers exact entity plus known dependent landing, list, link, and sitemap projections;
- failed invalidation is observable and reconciled through a durable post-commit intent when required, without adding a queue or event bus at this stage; that durable intent is mandatory for unpublish, access restriction, privacy takedown, and other revocation-sensitive changes;
- revocation-sensitive output has a documented hard removal bound using finite expiry and, when purge propagation cannot meet that bound, an authoritative tombstone/bypass gate outside the stale shared entry;
- shared caches never contain permission-sensitive, user-specific, lead/customer, draft, private-media, or signed-URL data;
- immutable versioned R2 variants may use long-lived CDN caching independently of mutable page/read-model freshness.

Detailed change consistency expectations are maintained in [Caching strategy](../architecture/caching-strategy.md), and page classification is maintained in [Rendering strategy](../architecture/rendering-strategy.md).

## Alternatives considered

- **Client-only rendering:** rejected for crawlability, initial performance, resilience, and high JavaScript cost.
- **Fully dynamic rendering for all public pages:** simple freshness but rejects useful cacheability and increases database/runtime load.
- **Static generation with no targeted invalidation:** rejected because publication and SEO lifecycle changes would have unpredictable propagation.
- **One shared cache model for public and admin:** rejected due to authorization leakage and incompatible freshness goals.
- **Global invalidation for every write:** rejected because regeneration cost and failure blast radius are unnecessarily large.
- **Microservice read platform, queue, or event bus at launch:** rejected as premature operational and consistency complexity.

## Consequences

Positive consequences are complete crawler-visible HTML, lower public read cost, bounded client JavaScript, explicit freshness ownership, and strict public/admin isolation. Negative consequences are dependency-map maintenance, invalidation/reconciliation logic, more deliberate route classification, cold-cache capacity planning, and verification of both warm and cold paths.

## Security impact

Cache eligibility is deny-by-default. Protected renders validate the server session and object/action authorization on every request. Unpublish or access-restriction changes receive highest-priority durable post-commit invalidation, and refills always reapply authoritative publication rules. Their hard removal bound cannot depend on a best-effort callback alone. Cache keys exclude PII and are normalized against poisoning; private responses and signed assets must emit controls that prevent intermediary storage.

## Performance impact

Public cacheable read models improve TTFB and reduce PostgreSQL load, while server-rendered HTML and minimal hydration support Core Web Vitals. Domain-scoped invalidation avoids routine global flushes. Costs include regeneration spikes, dependency fan-out, and cache-miss load, which require coalescing/load-shedding decisions and measured budgets before launch.

## SEO/data/operations impact

SEO-critical visible content, canonical, metadata, structured data, internal links, and sitemap projections share an explicit freshness contract. PostgreSQL remains authoritative and cache entries remain disposable. Operations require metrics and alerts for hit ratio, regeneration latency, invalidation failure/age, stale unpublish incidents, and provider outage, plus safe purge/rebuild procedures.

## Migration/rollback considerations

Implementation should begin with bypassable cache boundaries so each page family can fall back to bounded authoritative reads. Cache schema/key changes use a new namespace or version and allow old entries to expire rather than being reinterpreted. A rendering-policy rollback must preserve canonical URLs and avoid removing server-rendered critical content. If targeted invalidation proves unsafe, temporarily bypass affected caches or perform a controlled broader purge while repairing the dependency map. Database state is never rolled back merely to repair cache state.

## Assumptions

- **Assumption —** The modular monolith owns initial public rendering, read models, and post-commit invalidation coordination.
- **Assumption —** Provider-specific cache APIs are selected only after the supported Next.js/Vercel versions and semantics are verified.
- **Assumption —** Public-eligible R2 delivery variants use immutable versioned object keys; originals, draft-ready variants, and private assets are outside shared public delivery.

## Open Decisions

- Per-page rendering class and freshness SLO after traffic, editorial, and legal/removal needs are quantified.
- Maximum propagation windows for publish, unpublish, price, media order, and SEO metadata changes.
- Revocation tombstone/bypass ownership when the required removal window is shorter than cache purge propagation.
- Exact cache layers/provider ownership, tag limits, key versioning, regeneration coalescing, and outage load shedding.
- JavaScript, server-response, LCP-media, font, and third-party budgets by public template.
- Dependency-map ownership and automated contract tests for invalidation coverage.
