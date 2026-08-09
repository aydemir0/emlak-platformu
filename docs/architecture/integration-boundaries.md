# Integration Boundaries

Status: Proposed

## Purpose

Define how the modular monolith communicates with Supabase, Cloudflare R2, Resend, GA4, Sentry, and Vercel without allowing provider SDKs or failure modes to become domain concerns.

## Assumptions and open decisions

- **Assumption:** PostgreSQL is authoritative for operational state; provider responses and identifiers are integration metadata.
- **Assumption:** External notifications and analytics are not allowed to roll back an authoritative business transaction.
- **Open Decision:** Select concrete timeout, retry, circuit-breaking, and data-retention values from measured behavior and product/legal requirements before implementation.
- **Open Decision:** Define the inbound webhook inventory, callback origins, and consent regimes before exposing any handler.

## Responsibilities

- Application-owned ports describe persistence, object storage, email, analytics, error reporting, and deployment-platform capabilities in domain language.
- Infrastructure adapters implement those ports, translate provider errors into stable outcomes, and own provider authentication, serialization, timeouts, retry classification, and observability.
- Application use cases own authorization, idempotency, transaction orchestration, and the decision to request a side effect.
- PostgreSQL/Supabase owns business records, workflow state, audit evidence, and durable outbox records. R2 owns binary objects; Resend transports email; GA4 measures approved public behavior; Sentry captures approved diagnostic data; Vercel hosts and supplies deployment/runtime telemetry.

## Boundaries

The dependency direction is:

```text
delivery -> application use cases -> domain rules
infrastructure adapters -> application/domain contracts
```

Domain and application contracts must not expose Supabase clients, SQL row shapes, R2 request types or URLs, Resend payloads, GA4 event objects, Sentry types, or Vercel request/runtime types. Privileged credentials remain server-only and environment-scoped. Provider calls must not occur while a database transaction is open.

## Main data/control flow

1. Delivery authenticates, parses, validates, and calls one application use case.
2. The use case authorizes the actor, evaluates domain rules, and commits authoritative changes through a persistence port.
3. A required post-commit side effect is recorded in the same transaction as an outbox entry; cache invalidation occurs only after commit.
4. An infrastructure adapter claims eligible work, invokes the provider with an idempotency key where supported, records the outcome, and emits safe telemetry.
5. Inbound webhooks are authenticated from the raw request, replay-checked, schema-validated, and mapped to an idempotent use case before state changes.

See [ADR-007](../decisions/ADR-007-event-outbox-strategy.md) for the durable handoff decision and [media architecture](media-architecture.md) for the R2-specific lifecycle.

## Security implications

- Use separate least-privilege credentials and resources per environment; never expose service-role, R2, Resend, Sentry, or deployment secrets to browsers.
- Verify webhook signatures, timestamp/replay windows, destination allowlists, and object-level authorization server-side.
- Minimize PII sent to vendors. GA4 events, URLs, logs, error payloads, and provider metadata must not contain lead/customer contact data, signed URLs, secrets, or raw media metadata.
- Treat RLS as defense in depth, not a substitute for application authorization. Data API grants and RLS policies are separate controls.

## Performance implications

- Analytics, email, and error reporting stay off public rendering and authoritative transaction critical paths.
- Adapter calls use bounded timeouts and retries only for transient, idempotent operations.
- Provider payloads are narrow and versioned; public reads use purpose-built read models rather than privileged command shapes.

## Failure modes

- Provider outage: preserve committed state, retain retryable outbox work, expose an operational status, and degrade non-critical behavior.
- Timeout or ambiguous response: reconcile by idempotency key/provider identifier rather than blindly repeating.
- Poison payload or permanent rejection: stop bounded retries, record a safe error category, and provide an audited recovery action.
- Duplicate or reordered webhook: reject invalid signatures and make valid consumption idempotent and state-aware.
- Credential exposure: revoke/rotate, contain affected adapters, audit access, and follow an incident runbook.

## Scalability considerations

Keep integrations in-process with the modular monolith until workload or isolation evidence justifies a separate runtime. Scale database connections, outbox claiming, provider concurrency, and rate limits independently through adapter configuration. The port boundary permits provider substitution without pre-creating microservices.

## Rejected alternatives

- Direct provider SDK calls from React components, routes, or domain entities: leaks credentials/types and scatters policy.
- Dual-writing database state and external providers without a durable handoff: creates unresolvable partial failures.
- A broker, event bus, or integration microservice now: adds operational and consistency complexity without demonstrated need.
- Treating provider analytics or email delivery as authoritative business state: couples core correctness to third-party availability.

## Open questions

- Which emails are legally or operationally critical, and what delivery/reconciliation target applies to each?
- Which analytics events require consent by market, and which system owns the consent record?
- Which webhook providers and callback flows are required for the first release?
- What provider-specific rate, cost, and data-residency constraints apply to each environment?
