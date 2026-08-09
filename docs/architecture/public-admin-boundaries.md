# Public and admin boundaries

## Purpose

Keep the public experience optimized for SEO, Core Web Vitals, and conversion while the admin experience prioritizes authorized operational speed, auditability, and recoverable state changes.

## Assumptions and decisions

- **Assumption:** Public and admin experiences may share domain/application capabilities but use distinct delivery surfaces and read models.
- **Assumption:** Admin responses and data are dynamic and private by default; public shared caching is allowed only for explicitly publishable models.
- **Open Decision:** Whether admin uses a distinct hostname, route space, or separately deployed surface.
- **Open Decision:** Which admin actions require approval, recent authentication, or dual control.

## Responsibilities

The public surface renders canonical, indexable property/content pages, curated discovery, safe filters, responsive media, and progressive-enhancement conversion flows. It exposes no draft, deleted, internal-note, customer, audit, or permission-sensitive data.

The admin surface supports property/media/content lifecycles, lead/customer/request/appointment operations, assignment, review, restoration, reporting, and approved bulk actions. It provides explicit state, conflict feedback, safe retry, and audit evidence.

Shared application use cases enforce domain invariants. Separate query contracts prevent public cache shapes from coupling to privileged command or admin projection needs.

## Boundaries

| Concern | Public boundary | Admin boundary |
| --- | --- | --- |
| Identity | Anonymous by default; optional customer session | Validated server-side staff session required |
| Authorization | Explicitly publishable data and narrowly scoped public commands | Action and object permission, trusted role/scope, RLS defense in depth |
| Caching | Shared only for deterministic public read models | Private/no-store by default; no public cache reuse |
| Rendering | Server-rendered indexable content; minimal client JS | Dynamic operational views; client interactivity where it improves workflows |
| Errors | Stable, non-enumerating, privacy-safe | Actionable but still redacted and permission-filtered |
| Analytics | Consent-aware, no PII, off critical path | Purpose-limited operational telemetry; sensitive actions go to audit |

Preview is a third boundary: it must be authenticated, unguessable or short-lived as appropriate, non-indexable, excluded from sitemaps/caches, and unable to become a publication bypass.

## Main data/control flow

Public reads call a publishability-constrained query use case, produce server-discoverable content, and may populate deterministic caches. Public commands such as lead capture receive abuse controls, validation, consent handling, idempotency, and generic responses.

Admin commands validate the session on the server, load trusted grants and target scope, revalidate input, check current version/state, and execute one application use case. The authoritative transaction records state plus audit/outbox evidence. Only after commit do caches invalidate and external effects begin. Bulk actions authorize and report each target or use a documented all-or-nothing boundary.

## Security implications

No route prefix, hidden navigation, or client-side guard is an authorization control. Public identifiers cannot be used to access internal projections. Admin data must not enter shared caches, public analytics, source maps, or browser-visible secrets. High-impact actions require explicit permission and confirmation; impersonation, export, deletion, restoration, publication, and reassignment require enhanced audit controls.

## Performance implications

Public query shapes minimize database round trips, payload, blocking scripts, and media bytes. Admin can spend more JavaScript where it materially reduces operational steps, but must retain pagination, bounded queries, cancellation, and predictable mutation feedback. Separating caches prevents personalized/admin variation from destroying public cache efficiency.

## Failure modes

- Draft/private data appears publicly: enforce publishability in the query source and RLS, not only rendering filters.
- Stale unpublished content remains cached: authoritative access must fail closed, invalidate after commit, and reconcile failures.
- Admin optimistic update overwrites newer work: require a version/precondition and return conflict details.
- Bulk action partially succeeds ambiguously: declare atomicity, idempotency, and per-item outcome before execution.
- Auth service interruption: protected operations fail closed; do not fall back to client claims.

## Scalability considerations

Public and admin surfaces can later scale or deploy independently because read contracts and cache policies are separate. They initially remain in one modular monolith to preserve transaction simplicity. Operationally expensive reports, exports, or bulk work require bounded execution and observable progress before any distributed worker is introduced.

## Rejected alternatives

- One shared query model for public and admin: increases accidental disclosure and cache complexity.
- Client-only public rendering: weakens crawlability, resilience, and Core Web Vitals.
- Globally dynamic/no-cache public content: sacrifices predictable performance without a freshness requirement.
- Client-side-only admin authorization: cannot protect data or actions.

## Open questions

- Is a separate admin hostname required for security policy or operational deployment?
- Which public conversion flows support authenticated customers at launch?
- What are the approval, dual-control, and recent-authentication rules for sensitive actions?
- Should bulk operations be transactional as a batch or independently recoverable per item for each workflow?
