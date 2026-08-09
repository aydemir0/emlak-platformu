# ADR-001: Modular-monolith application architecture

- **Status:** Proposed
- **Date:** 2026-08-09

## Context

The platform spans public SEO/read workloads, privileged operational workflows, relational integrity, secure media, and external providers. It needs clear ownership and testable boundaries without the distributed consistency and operational cost of independent services. Business logic must remain outside React and independent of Next.js, Supabase, R2, Resend, Vercel, and other provider APIs.

## Decision

Build one modular monolith with cohesive domain modules and inward dependencies:

```text
UI / delivery -> application use cases -> domain rules
infrastructure adapters -> application/domain contracts
```

Domain modules own their invariants and records. Application use cases own authorization, orchestration, transaction/idempotency/concurrency boundaries, and post-commit coordination. Infrastructure implements narrow ports defined inward and maps provider types at the edge. Public and admin delivery use distinct read contracts and cache policies while sharing approved use cases. PostgreSQL transactions are authoritative; required external effects use a transactional outbox or reconciliation boundary.

This ADR chooses architectural direction, not folder names, framework scaffolding, database schema, or runtime implementation.

## Alternatives considered

- **Microservices per domain:** rejected until independent scaling, failure isolation, data residency, or team ownership creates evidence that outweighs distributed complexity.
- **Framework-centric layered application:** rejected because placing rules in routes/components couples the domain to delivery and encourages boundary leakage.
- **Single shared CRUD/data layer:** rejected because it obscures ownership and permits cross-domain invariant bypass.
- **Generic repository/interface for every type:** rejected as premature abstraction; ports are introduced only at real boundaries.

## Consequences

Positive consequences are simple deployment, local transactional consistency, low-latency in-process collaboration, provider isolation, and a clear path to tests. Negative consequences are the need for disciplined module ownership, risk of accidental cross-module database access, and one deployable's broader blast radius. Architecture checks and reviews must enforce boundaries because process separation will not.

## Security impact

Protected use cases centralize server-side action/object authorization, validation, audit, and trusted transaction boundaries. Infrastructure credentials remain outside domain/delivery code. RLS remains an independent defense. A modular monolith does not imply shared privilege: privileged adapters and data projections stay narrowly scoped.

## Performance impact

In-process module calls avoid network latency and distributed tracing overhead. Public read models can be shaped and cached independently. A single deployment may eventually create resource contention; measured bottlenecks should be addressed with query/index/cache/workload isolation before service extraction.

## SEO, data, and operations impact

SEO-critical rendering and cache decisions remain explicit public application contracts rather than component behavior. Cross-module database updates can remain atomic. Operations manages one deployable initially, but must monitor module-level workloads, correlation IDs, and failure categories so future extraction decisions use evidence.

## Migration/rollback considerations

Adoption is incremental because no runtime exists yet. Reversal before implementation is documentation-only. After implementation, moving to a different architecture requires preserving module contracts and data ownership, with an ADR and staged migration. Any future service extraction uses an expand/migrate/contract plan and must not introduce dual writes without reconciliation.

## Assumptions

- One deployable and one PostgreSQL system are adequate for initial scale and team ownership.
- Module boundaries can be enforced through code structure, contracts, tests, and review.

## Open Decisions

- Exact module/folder layout and allowed shared-kernel contents.
- Which workflows use optimistic concurrency versus database locking.
- Concrete test and architecture-boundary enforcement mechanisms.
