# System context

## Purpose

Define the platform's actors, trust boundaries, authoritative systems, and highest-level flows without committing to runtime structure. This view is the common frame for the more detailed architecture documents and [ADR-001](../decisions/ADR-001-application-architecture.md).

## Assumptions and decisions

- **Assumption:** The first production release serves one operating real-estate business while preserving a documented boundary for possible future multi-tenancy; see [ADR-009](../decisions/ADR-009-future-multi-tenancy-boundary.md).
- **Assumption:** PostgreSQL is authoritative for business state and media metadata. R2 is authoritative only for media bytes.
- **Open Decision:** Which countries, languages, currencies, and regulatory regimes are in the initial product scope.
- **Open Decision:** The final staff roles, approval responsibilities, and data-retention periods.

## Responsibilities

The platform provides:

- public property discovery, curated SEO landing pages, editorial content, advisor contact, lead capture, and appointment requests;
- secure operational workflows for advisors, operations staff, and administrators;
- authoritative lifecycle, audit, analytics, and integration records;
- controlled delivery of validated property media;
- reliable handoff to email, analytics, monitoring, and hosting/storage providers.

Primary actors are anonymous visitors, prospective customers, advisors, operations staff, administrators, and tightly scoped service identities. A person may hold more than one staff capability, but authorization is based on explicit permissions and object scope rather than actor labels alone.

External systems are Supabase Auth and PostgreSQL, Cloudflare R2, Resend, GA4, Sentry, and Vercel. Each is reached through an infrastructure adapter; none owns domain decisions.

## Boundaries

- The browser is untrusted. Client state, cookies, headers, URLs, form data, and uploads require server-side validation.
- Public delivery exposes only publishable read models and conversion commands. It never exposes privileged operational records.
- Admin delivery requires a validated session and action-plus-object authorization for every operation.
- PostgreSQL transactions define authoritative business commits. External calls occur after commit through an idempotent handoff or reconciliation path.
- R2 originals and quarantine objects remain private; only validated variants that are both technically ready and currently public-eligible may cross the controlled media delivery boundary.
- Analytics, email, and error reporting are non-authoritative and must not be on the critical path of public rendering or corrupt business transactions.

## Main data/control flow

1. A public request reaches the delivery layer, which normalizes the URL and invokes a public query use case.
2. The use case obtains an explicitly publishable read model from PostgreSQL-backed infrastructure and renders server-discoverable content; public caches may store that model under deterministic domain keys.
3. A conversion submission is parsed, rate-limited, validated, deduplicated, and executed as an application command inside an authoritative transaction.
4. An authenticated staff request validates the server-side session, resolves trusted permissions and object scope, then invokes one application use case.
5. The transaction enforces constraints, lifecycle rules, concurrency checks, audit records, and any durable integration handoff. Cache invalidation and external effects occur only after commit.
6. Media upload and processing follow the separate lifecycle in [media architecture](media-architecture.md); the public site receives only ready and currently public-eligible variant metadata.

## Security implications

Public and admin entry points have different threat profiles but share deny-by-default authorization, bounded input, abuse protection, correlation identifiers, and safe error mapping. Lead/customer PII must not enter URLs, GA4, client storage, cache keys, or ordinary logs. Service credentials stay server-only and environment-scoped. High-impact actions require audit evidence, and RLS is defense in depth rather than a replacement for application authorization.

## Performance implications

Public discovery is a cacheable read workload optimized for server-rendered indexable content, responsive images, low JavaScript, and non-blocking analytics. Admin commands favor fresh authoritative reads and predictable transactions over shared caching. Provider calls are kept out of database transactions and public render critical paths.

## Failure modes

- Database or Auth outage: fail protected operations closed; public cached content may serve only within its documented staleness policy.
- R2 or media delivery outage: preserve page structure and use a safe placeholder; do not substitute unvalidated originals.
- Resend, GA4, or Sentry outage: preserve the business result, retain a durable retry/reconciliation signal where delivery is required, and surface operational health.
- Cache invalidation failure: authoritative reads must still prevent access to unpublished/private data; reconcile stale public entries.
- Partial deployment or configuration drift: block promotion when environment identity, migrations, or required secrets are inconsistent.

## Scalability considerations

The initial modular monolith scales through stateless application instances, query-driven indexes, bounded pagination, cacheable public read models, immutable media variants, and isolated background work. Module contracts and a transactional outbox preserve extraction options, but no service split, queue, or event bus is justified before measured contention, ownership, or independent scaling needs exist.

## Rejected alternatives

- Microservices or distributed event architecture from the outset: adds consistency, deployment, and observability cost without current evidence.
- Browser-direct access to privileged database or storage capabilities: weakens authorization and validation boundaries.
- Using provider records or cache entries as authoritative business state: prevents coherent transactions and recovery.
- A single undifferentiated public/admin data surface: risks privacy leakage and couples incompatible caching needs.

## Open questions

- What staff roles, object scopes, and approval chains are required at launch?
- Which workflows require synchronous user confirmation versus eventual external delivery?
- What are the legal retention, erasure, consent, and audit requirements by data class?
- Is a separate staging environment mandatory, and may any non-production environment contain sanitized production-derived data?
