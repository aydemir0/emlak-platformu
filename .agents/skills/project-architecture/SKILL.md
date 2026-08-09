---
name: project-architecture
description: Design and review the production architecture of this real-estate platform. Use for module and domain boundaries, Next.js server/client placement, business-service design, API contracts, integration boundaries, cross-domain workflows, architecture documentation, ADRs, scalability choices, or any change that affects more than one layer or domain.
---

# Project Architecture

## Establish the context

Before proposing code or structure:

1. Identify the user outcome and the domain that owns the rule.
2. List affected actors, lifecycle states, trust boundaries, and external systems.
3. Separate confirmed requirements from assumptions and open questions.
4. Determine whether the decision is costly to reverse. Create an ADR when it is.
5. Apply `database-conventions` and `security-rules` for data-bearing flows; add the SEO or media skill when relevant.

## Enforce architectural boundaries

Organize by cohesive business capability rather than by technical file type alone. Treat properties, locations, advisors, leads, customers, customer requests, appointments, content/SEO, analytics, and audit logs as explicit domain areas.

Keep dependencies pointing inward:

```text
UI / route handlers -> application use cases -> domain rules
Infrastructure adapters -> application/domain contracts (ports)
```

- Define infrastructure-facing contracts in the application or domain layer. Make Supabase, R2, Resend, analytics, and other adapters implement and depend on those contracts.
- Never make the domain layer import or depend on infrastructure adapters, provider SDKs, or framework types.
- Keep domain rules independent of React, Next.js request objects, Supabase clients, R2 clients, Resend, GA4, and vendor SDKs.
- Put orchestration, authorization decisions, transactions, and idempotency in application use cases or server services.
- Put persistence, email, object storage, and analytics behind narrow adapters at the boundary where substitution or isolated testing has value.
- Do not create an interface for every class. Introduce an abstraction only for a real boundary, multiple implementations, test isolation, or high change volatility.
- Do not allow infrastructure types to leak through domain or application contracts.

## Place Next.js responsibilities deliberately

- Default to Server Components for public content and initial data rendering.
- Add Client Components only for actual browser interactivity or browser-only APIs, and keep their props serializable and minimal.
- Keep route handlers and Server Actions thin: authenticate, parse, validate, call one application use case, map the result, and return.
- Never implement pricing, publication, lead qualification, appointment, permission, or lifecycle rules inside a React component.
- Revalidate or invalidate caches only after a successful authoritative state change.
- Treat all client input, hidden fields, URL parameters, cookies, and headers as untrusted.
- Prevent server-only modules, secrets, or privileged Supabase clients from entering the client bundle.

## Define contracts and errors

- Use explicit input/output contracts at trust and module boundaries.
- Validate at runtime on the server; TypeScript types do not validate external data.
- Return typed outcomes or stable domain errors from use cases. Translate them to HTTP/UI semantics at the delivery boundary.
- Do not expose raw database, provider, or stack-trace errors to users.
- Carry a correlation identifier through request, job, integration, and audit events.
- Design retries only for idempotent operations or with an idempotency key.

## Model workflows

For every stateful workflow:

- define allowed states and transitions;
- define the actor and authorization required for each transition;
- identify the transaction boundary and concurrency behavior;
- define retry, duplicate, timeout, and partial-failure handling;
- identify emitted analytics and audit events;
- specify soft-delete, restoration, retention, and hard-delete behavior;
- document how external side effects are reconciled if the request fails.

Prefer an outbox or equivalent durable handoff when database state and an external side effect must remain consistent. Do not add queues or event-driven layers without a demonstrated reliability or latency need.

## Protect public-site goals

- Make indexable pages server-renderable and resilient without client-only data fetching.
- Budget performance around Core Web Vitals, payload size, query count, cacheability, and image delivery.
- Keep canonical URL and indexability decisions in an explicit SEO policy, not scattered components.
- Preserve conversion tracking without making third-party analytics a critical rendering dependency.
- Use progressive enhancement for important discovery and lead-capture journeys.

## Cache and read-model boundaries

- Treat public discovery pages as cacheable read models; do not couple their query shape to privileged admin commands.
- Keep cache keys/tags domain-specific and deterministic.
- Invalidate only after the authoritative transaction commits successfully.
- Do not cache permission-sensitive or user-specific data in shared public caches.
- Prefer explicit stale/revalidation behavior over implicit framework defaults for SEO-critical pages.
- Document consistency expectations for property publish, unpublish, price change, media reorder, and SEO metadata changes.

## Protect admin goals

- Optimize common operational flows for few steps, clear status, bulk-safe actions, and recoverability.
- Separate public read models from privileged operational commands when their security or performance needs differ.
- Require explicit confirmation and auditable events for destructive or high-impact actions.
- Design optimistic UI only when conflicts and rollback behavior are clear.

## Integrate external services safely

- Wrap Supabase, R2, Resend, GA4, and other providers at infrastructure boundaries.
- Keep provider identifiers as integration metadata unless they are the deliberate system identifier.
- Define timeouts, retry policy, idempotency, observability, and degraded behavior for every external call.
- Verify webhook signatures and make webhook consumers replay-safe.
- Do not let analytics or email failure corrupt the primary business transaction.

## Document decisions

Put long-lived architecture descriptions under `docs/architecture/`. Write an ADR under `docs/decisions/` for choices such as tenancy, URL taxonomy, cache strategy, RLS model, media processing, event delivery, or vendor coupling.

An ADR must include:

- status and date;
- context and decision drivers;
- decision and boundaries;
- alternatives considered;
- positive and negative consequences;
- security, privacy, data, SEO, performance, and operations impact as applicable;
- migration and rollback notes.

## Review checklist

- Does one domain clearly own each business rule and record?
- Is business logic absent from React and delivery code?
- Are trust boundaries validated and authorized server-side?
- Are transaction, concurrency, retry, and idempotency semantics explicit?
- Can external failures degrade safely?
- Are public SEO/performance and admin speed requirements both protected?
- Is the design testable without excessive mocking?
- Is each abstraction justified by current evidence?
- Are observability, auditability, lifecycle, and rollback covered?
