# Caching Strategy

**Status:** Proposed

## Purpose

Define predictable cache boundaries and consistency behavior for public read models without weakening authorization, publication safety, or SEO correctness. Framework-specific cache calls and numeric lifetimes remain implementation decisions.

## Responsibilities

- Cache only public, reusable read models and rendered output whose audience and freshness contract are explicit.
- Use deterministic domain keys/tags to connect authoritative changes to affected property, location, SEO landing, sitemap, and aggregate views.
- Invalidate only after the authoritative database transaction commits successfully.
- Record a durable invalidation intent in the authoritative transaction for unpublish, access restriction, privacy takedown, and other revocation-sensitive changes; a direct post-commit purge may accelerate but must not replace that recovery path.
- Bound staleness and provide reconciliation when invalidation delivery fails.
- Keep immutable, versioned media variants on a separate long-lived CDN policy from mutable HTML/data.

## Boundaries

PostgreSQL is authoritative. A cache is a disposable projection, never a place to accept commands or decide permissions. Public discovery reads must not share query contracts with privileged admin commands. Admin, preview, permission-sensitive, user-specific, lead/customer, and signed private-media data are never placed in a shared cache.

Conceptual layers are browser/CDN output, server page/read-model cache, and R2 media delivery cache. Each cacheable item must have one documented owner, key shape, invalidation source, maximum stale behavior, and fallback; implicit overlapping caches are prohibited.

**Assumption —** Initial invalidation is handled inside the modular monolith through a post-commit application boundary, with a durable outbox/reconciliation path when reliable handoff is required. No queue or event bus is introduced by this decision.

## Main data/control flow

Read path:

1. Normalize the canonical public request and resolve a stable read-model identity.
2. Attempt the eligible cache using a deterministic key and domain tags.
3. On a miss or forced bypass, load a publication-filtered read model from the authoritative database.
4. Cache only a successful public result under its explicit stale/revalidation policy.
5. Render media URLs that point to immutable versioned variants; mutable property state is not inferred from object existence.

Write path:

1. A privileged application use case authorizes and validates the command.
2. It commits the authoritative state change and its durable follow-up intent in the transaction. Durable intent is mandatory for revocation-sensitive changes and for any other effect whose loss would violate its consistency contract.
3. Only after commit, it invalidates the exact entity tags plus known dependent collection, landing-page, navigation, and sitemap tags.
4. Failed invalidation is retried/reconciled idempotently and observed; it never rolls back a committed business transaction.

Conceptual deterministic tags include `property:{immutable_id}`, `location:{immutable_id}`, `seo-page:{immutable_id}`, `property-list:{curated_query_id}`, and `sitemap:{content_type}`. They describe ownership, not a framework API.

Consistency expectations:

| Change | Required invalidation scope | Consistency expectation |
| --- | --- | --- |
| Publish | Property, affected curated lists/locations, internal links, sitemap | Never expose before commit and publication validation; become public within a defined propagation SLO |
| Unpublish/access restriction/privacy takedown | Property, all lists/locations, sitemap, related public navigation and delivery eligibility | Revocation-sensitive removal: deny newly generated public reads after commit, durably request purge, and enforce a documented hard removal bound through finite expiry and, where the bound is stricter than purge propagation, an authoritative tombstone/bypass gate |
| Price change | Property, price-bearing lists/landings, structured data | Visible HTML, metadata/structured data, and list cards converge together within the price freshness SLO |
| Media reorder/cover change | Property, image-bearing lists/landings, social preview if affected | New ordering appears atomically from committed metadata; immutable old binaries may remain cached but must no longer be referenced |
| SEO metadata/slug change | Page, canonical/redirect history, internal links, relevant sitemap | Canonical, visible content, structured data, redirect, and sitemap must not intentionally publish contradictory versions |

## Security implications

- Cache eligibility is deny-by-default; unknown audience, authorization, cookie variance, or publication state means bypass.
- Cache keys are server-derived from normalized inputs and immutable identifiers, never raw attacker-controlled strings or PII.
- Unpublish and access-restriction changes require urgent invalidation plus authoritative publication filtering on cache refill.
- Private signed URLs, session material, admin responses, and error details must not enter shared entries or observability payloads.
- Cache-control behavior must prevent a public intermediary from retaining authenticated or personalized responses.

## Performance implications

Curated public reads reduce database load and improve TTFB when their keys and dependencies are bounded. Tag fan-out, regeneration cost, cold starts, and invalidation storms must be measured. Immutable media keys allow long-lived CDN caching without coupling binary eviction to page freshness. Avoid caching arbitrary high-cardinality filter combinations or negative results for long periods.

## Failure modes

- Post-commit invalidation failure: retain the durable intent, reclaim abandoned work, retry with idempotency, alert on age, and provide an operational purge/rebuild path. Revocation-sensitive content must also be bounded by the documented hard expiry or authoritative tombstone/bypass gate.
- Cache provider outage: bypass to bounded authoritative reads; apply load shedding before allowing uncontrolled database amplification.
- Stampede after broad invalidation: coalesce regeneration where supported and limit concurrency.
- Key/tag omission: detect through change-to-dependency contract tests and reconciliation; repair by broader safe invalidation.
- Stale unpublish: treat as a security/operations incident, purge affected scopes, and verify sitemap and media references.
- Cache poisoning: normalize inputs, restrict key construction, validate cached shapes, and never vary protected output on unkeyed request state.

## Scalability considerations

Begin with domain-scoped tags and curated query identities inside the modular monolith. Add hierarchical tags or precomputed read projections only when measured invalidation fan-out or query cost warrants them. A distributed cache, queue, or separate read service requires its own ADR because it adds consistency, replay, cost, and operational failure modes.

## Rejected alternatives

- Framework-default caching with no recorded stale policy: SEO and publication behavior would be implicit.
- Global cache flush for every edit: safe but unnecessarily expensive and prone to regeneration spikes.
- Shared caching of admin or user-specific responses: unacceptable disclosure risk.
- Invalidating before commit: can publish a projection that precedes or outlives a failed transaction.
- Mutable media object keys: makes CDN freshness and rollback unpredictable.
- Caching every filter URL: creates unbounded cardinality and reinforces an unwanted crawl space.

## Open questions

- **Open Decision —** What maximum propagation and staleness SLO applies separately to publish, unpublish, price, media-order, and SEO changes?
- **Open Decision —** Which cache layer supplies the revocation tombstone/bypass check when the required removal SLO is shorter than reliable purge propagation?
- **Open Decision —** Which curated collections depend on each property attribute, and how will that dependency map be verified?
- **Open Decision —** Which cache provider/layer owns page output versus application read models, after the chosen Next.js/Vercel version is confirmed?
- **Open Decision —** What bounded fallback and load-shedding behavior protects PostgreSQL during a cache outage?
- **Open Decision —** Are archived public properties cacheable, and under which lifecycle/indexability policy?
