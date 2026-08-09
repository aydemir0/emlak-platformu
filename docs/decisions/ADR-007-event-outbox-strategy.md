# ADR-007: Transactional Outbox Boundary Without a Message Broker

Status: Proposed
Date: 2026-08-09

## Context

Committed property changes may require cache invalidation, email, analytics, or media work. Calling providers inside a database transaction holds locks and cannot atomically commit both systems. Calling them only after commit without durable intent can lose work when the process stops. The current scale does not justify a broker, managed queue, event bus, or microservice.

## Decision

Use a minimal transactional outbox in the same PostgreSQL transaction as the authoritative state change when a post-commit side effect must be delivered reliably. An outbox record contains a stable event name/version, unique identifier or idempotency key, owning domain, aggregate identifier, occurred time, safe bounded payload/reference, processing state, attempt metadata, and correlation ID.

After commit, a single logical dispatcher boundary claims eligible records atomically through a recoverable lease or equivalent crash-safe claim protocol, invokes the appropriate infrastructure adapter outside any business transaction, and records success or a categorized failure. Claim ownership and expiry must allow abandoned work to be reclaimed after a dispatcher crash. Delivery is at least once; every consumer/adapter must therefore be idempotent or reconcile by idempotency key. Retries are bounded and limited to transient failures. Permanent failures become visible for audited replay or resolution.

This is an internal reliability mechanism, not a commitment to public domain events or distributed architecture. Direct post-commit cache invalidation may accelerate convergence when loss is safely repairable, but it does not replace durable intent for unpublish, access restriction, privacy takedown, or another revocation-sensitive action. Use the outbox whenever missing the action would violate a stated consistency or operational requirement.

## Alternatives considered

- Provider call within the business transaction: holds locks and still cannot provide cross-provider atomicity.
- Unrecorded fire-and-forget after commit: can silently lose work.
- Managed queue, broker, or event bus now: adds delivery infrastructure and split-brain failure modes without demonstrated throughput need.
- Database triggers invoking external systems: hides orchestration and couples persistence to providers.
- Full event sourcing: disproportionate complexity for the stated product.

## Consequences

The authoritative change and delivery intent commit atomically, and failed side effects are observable/replayable. Costs include outbox growth, claim/concurrency logic, idempotent consumers, retention, monitoring, and possible delayed delivery. The pattern does not create exactly-once effects.

**Assumption:** Initial throughput can be handled by PostgreSQL-backed claiming with bounded concurrency.
**Open Decision:** Choose the execution trigger/runtime, lease duration/heartbeat behavior, polling cadence, batch size, retry schedule, retention, dead-letter/replay UX, and operations ownership from measured latency and deployment constraints.

## Security impact

Payloads contain references or minimum necessary data, never secrets, auth tokens, raw PII, signed URLs, or image bytes. Claim/replay/purge operations are privileged and audited. Consumers re-authorize where current authorization or lifecycle state matters; an old event cannot resurrect deleted/unpublished data or publish an obsolete media version.

## Performance impact

Outbox inserts add a small write/index cost to selected transactions; dispatcher work is outside user transactions. Query-driven indexes, bounded batches, atomic claims, retention, and backlog/oldest-age monitoring prevent scanning or contention from growing unchecked.

## SEO/data/operations impact

The outbox can make publish/unpublish, price, media ordering, and SEO metadata cache/search/sitemap reactions durable where required, while PostgreSQL remains authoritative during propagation delay. Email and analytics failures do not roll back business state. Operations must distinguish pending, retryable, permanent, resolved, and replayed work.

## Migration/rollback considerations

No outbox schema or dispatcher is implemented by this ADR. Introduce it additively for one side effect at a time and verify duplicate, crash, timeout, poison-message, and replay behavior. Rollback stops new production, drains or reconciles pending work, and removes the table only after retention/audit requirements are met. A future broker may consume from the same boundary without changing domain contracts, but extraction requires a separate ADR.
