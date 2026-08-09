# Application architecture

## Purpose

Define a production-ready modular-monolith structure that protects domain rules from delivery frameworks and providers. The durable choice is recorded in [ADR-001](../decisions/ADR-001-application-architecture.md).

## Assumptions and decisions

- **Assumption:** The initial system is one Next.js deployable backed by PostgreSQL and provider adapters, not a set of distributed services.
- **Assumption:** Module boundaries are expressed through code ownership, contracts, tests, and transaction rules; exact folders are deferred to implementation planning.
- **Open Decision:** Whether a small number of shared value objects belongs in a deliberately constrained kernel or is duplicated to preserve module autonomy.

## Responsibilities

The layers are:

```text
UI / delivery layer
        |
        v
application use cases
        |
        v
domain rules

infrastructure adapters ---> application/domain contracts (ports)
```

- **Delivery:** authenticate request context, parse and validate transport input, invoke one use case, and translate typed outcomes to HTTP/UI semantics.
- **Application:** authorize action and object, orchestrate modules, define transaction/idempotency/concurrency boundaries, and coordinate post-commit effects.
- **Domain:** enforce lifecycle transitions, invariants, policies, and provider-independent value semantics.
- **Infrastructure:** implement ports for PostgreSQL/Supabase, R2, Resend, analytics, monitoring, and hosting-specific facilities.

## Boundaries

- Dependencies point inward. Infrastructure adapters depend on application/domain contracts; domain code never imports infrastructure, Next.js, React, or provider SDK types.
- React components render state and emit intent. They do not contain business rules, authorization, or transaction logic.
- Delivery handlers remain thin and do not become an alternative application layer.
- Use cases return typed successes or stable domain/application failures. Provider errors and stack traces are mapped and retained only in protected diagnostics.
- Interfaces exist at actual volatile or trust boundaries, not mechanically for every class.
- AI output is advisory only and never controls publication, access, lead qualification, pricing, or another authoritative decision.

## Main data/control flow

1. Delivery constructs a correlation-aware request context and validates untrusted transport data.
2. The selected use case validates identity, trusted grants, object scope, and command preconditions.
3. It loads state through ports and delegates invariants/transitions to the owning domain.
4. Required database mutations, audit evidence, and durable outbox records commit in one transaction. Concurrency uses version checks, narrow locks, and constraints appropriate to the workflow.
5. The use case returns a provider-neutral result. Only after commit may adapters invalidate caches or perform external side effects.
6. Idempotent consumers retry transient external failures and reconciliation detects missed or stuck work.

Queries use purpose-built public or admin read contracts. Public read models expose only published data and may be shared-cacheable; admin queries are permission-sensitive, fresh by default, and never share public caches.

## Security implications

Authentication at delivery does not imply authorization. Every protected use case checks action plus object from trusted server data, with RLS as a second enforcement layer. Validation repeats at trust boundaries; database constraints remain the final integrity guard. Privileged clients and secrets are server-only. Audit and correlation data are created at the application boundary without leaking PII.

## Performance implications

In-process module calls avoid network overhead. Public queries can be shaped and cached independently of admin commands. Server-rendered content and minimal client boundaries reduce JavaScript. Transactions exclude provider calls, and query/index decisions are driven by real access paths rather than generic repositories.

## Failure modes

- Delivery code accumulates rules: move orchestration to a use case and invariants to the owning domain.
- Adapter types leak inward: map them to stable contracts at the adapter boundary.
- External call succeeds while commit fails, or vice versa: commit the authoritative state and outbox atomically; make consumption idempotent.
- Authorization differs between application and RLS: test an explicit access matrix and fail closed on disagreement.
- Optimistic edit conflict: return a stable conflict result with the latest safe state; never silently overwrite.

## Scalability considerations

Scale the stateless deployable horizontally and optimize modules independently inside it. Explicit ports, outbox records, and ownership boundaries permit later extraction if metrics demonstrate a need. Extraction requires an ADR covering latency, consistency, deployment, and operational ownership; it is not the default evolution path.

## Rejected alternatives

- Microservices at launch: no demonstrated independent scaling or ownership need.
- Framework-centric architecture with domain rules in routes/components: couples business behavior to delivery mechanics.
- Active Record models shared across all modules: allows invariants and ownership to be bypassed.
- Universal repository/service abstractions: conceal query intent and introduce premature generalization.

## Open questions

- Which use cases require optimistic concurrency versus narrow database locking?
- Which post-commit effects require durable delivery, and which may be best-effort telemetry?
- What test boundaries and contract-test coverage are required before implementation?
- What maximum public staleness is acceptable for each publication-related transition?
