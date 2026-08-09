# Transactional outbox design

**Status:** Proposed

## Purpose

Turn selected committed database changes into recoverable post-commit work without calling external providers inside business transactions and without introducing a broker, managed queue, event bus, or microservice. This document makes the crash-recovery boundary in [ADR-007](../decisions/ADR-007-event-outbox-strategy.md) concrete at schema-design level while remaining non-executable.

## Boundary and ownership

The application use case that owns the authoritative transaction decides whether an effect requires durable delivery. It inserts one or more `outbox_messages` rows in the same transaction as business state and required audit evidence. The integration/application boundary owns dispatch semantics; provider adapters own the actual R2, Resend, cache, analytics, or other call.

The outbox is:

- an internal reliability table, not the domain model;
- not a source of truth for property, customer, media, SEO, or authorization state;
- not a public event stream or integration contract;
- not proof of exactly-once provider effects;
- not a replacement for current-state authorization and lifecycle checks at consumption time.

## Message catalog

`outbox_messages` stores one bounded, versioned work request:

| Field | Type intent | Required | Rule |
| --- | --- | --- | --- |
| `id` | UUID | Yes | Immutable message and delivery idempotency identity |
| `event_name` | text | Yes | Allowlisted stable name such as `property.publication_revoked` |
| `event_version` | positive small integer | Yes | Payload contract version; consumer rejects unsupported versions safely |
| `owning_domain` | text | Yes | Allowlisted producer boundary, not an arbitrary topic |
| `aggregate_type` | text | Yes | Allowlisted target type |
| `aggregate_id` | UUID | Yes | Stable target reference; consumer re-reads current state when required |
| `correlation_id` | UUID | Yes | Connects request, audit, outbox, provider attempt, and diagnostics |
| `idempotency_key` | text | Yes | Unique within the effect contract; deterministic and free of PII |
| `payload` | bounded JSONB | Yes | Minimum allowlisted facts/references validated by event name/version |
| `status` | checked text | Yes | `PENDING`, `PROCESSING`, `PROCESSED`, or `DEAD_LETTER` |
| `attempt_count` | non-negative integer | Yes | Incremented once per claimed delivery attempt |
| `next_attempt_at` | timestamptz | Yes | Eligibility boundary for pending/retry work |
| `lease_owner` | text | No | Opaque dispatcher instance identity; never a user or secret |
| `lease_expires_at` | timestamptz | No | Required only while processing; enables crash reclamation |
| `last_attempt_at` | timestamptz | No | Operational evidence |
| `last_error_code` | text | No | Bounded safe category, not raw provider response |
| `processed_at` | timestamptz | No | Required only when processed |
| `dead_lettered_at` | timestamptz | No | Required only when dead-lettered |
| `created_at` | timestamptz | Yes | Transactional enqueue instant |

Known business data belongs in relational columns. `payload` is justified only as a versioned message envelope; size, keys, nesting, and data classification are validated per `event_name` and `event_version`. It never contains secrets, tokens, signed URLs, raw media, free-form request bodies, or unnecessary lead/customer PII.

## State machine

```text
PENDING --claim--> PROCESSING --success--> PROCESSED
   ^                    |
   |                    +--transient failure--> PENDING (future next_attempt_at)
   |                    +--permanent/exhausted--> DEAD_LETTER
   |
   +------ lease expiry / crash reclamation ------+

DEAD_LETTER --audited replay after remediation--> PENDING
```

Allowed transitions:

| From | To | Preconditions | Atomic effects |
| --- | --- | --- | --- |
| New | `PENDING` | Inserted with authoritative transaction | `attempt_count = 0`, immediate or future `next_attempt_at` |
| `PENDING` | `PROCESSING` | Eligible time reached and no live lease | Assign owner/expiry, increment attempt, set last attempt |
| Expired `PROCESSING` | `PROCESSING` | Previous lease expired | New owner/expiry, increment attempt; duplicate delivery remains safe |
| `PROCESSING` | `PROCESSED` | Caller owns current lease and adapter outcome is successful/reconciled | Clear lease, set `processed_at`, clear safe transient error |
| `PROCESSING` | `PENDING` | Caller owns lease; failure is retryable and attempts remain | Clear lease, calculate bounded future `next_attempt_at`, store category |
| `PROCESSING` | `DEAD_LETTER` | Permanent failure or retry budget exhausted | Clear lease, set escalation time/category |
| `DEAD_LETTER` | `PENDING` | Privileged reviewed replay with remediation note | Clear terminal fields as defined, retain attempt/audit history |

All unlisted transitions are invalid. `PROCESSED` is terminal. A processed message is never changed back to pending merely to resend; a deliberate new effect receives a new message identity and audit trail.

## Atomic claim protocol

1. Select a bounded batch where status is pending and `next_attempt_at` is due, or where processing lease has expired.
2. Exclude rows currently locked by another claimant so dispatchers do not block each other.
3. In the same short transaction, assign `lease_owner`, `lease_expires_at`, `PROCESSING`, `last_attempt_at`, and increment `attempt_count`.
4. Commit before any network or media-processing call.
5. Invoke the adapter with the outbox `id` or deterministic idempotency key.
6. In a new short transaction, complete only if the row still has the expected message ID, processing state, lease owner, and attempt identity. A stale worker cannot overwrite a later claimant.

Lease expiry is a recovery mechanism, not proof that an earlier call did not reach the provider. A reclaimed message may be delivered again; consumers and adapters must be idempotent or reconcile the provider outcome.

**Assumption:** Initial throughput is handled by bounded PostgreSQL claims from the modular monolith. There is no separate broker or distributed event topology.

## Delivery and idempotency semantics

- Delivery is at least once.
- Database consumption uses unique business keys or conditional state transitions.
- Provider calls use provider-supported idempotency keys where available.
- If a provider times out after possibly accepting a request, reconcile by message/provider identity before retrying.
- Cache/media revocation handlers first re-read authoritative eligibility or act on a non-reversible revision/tombstone. An old message cannot republish or re-expose current private state.
- Media processing compares media version/attempt identity before recording variants or readiness.
- Analytics uses a unique event identity so replay does not double-count authoritative milestones.
- Email templates classify whether duplicate provider acceptance is tolerable, detectable, or must be reconciled.

## Retry classification

Retry only transient conditions such as bounded timeouts, rate limits, and documented temporary provider failures. Invalid payload version, forbidden destination, missing required authoritative record, revoked effect, permanent provider rejection, and policy violation do not retry indefinitely.

Backoff uses a bounded schedule with jitter and a maximum attempt/age policy per event family. Exact delays and budgets remain configuration decisions based on consistency SLOs and provider limits. Revocation-sensitive work has a separate hard-removal protection and does not rely only on eventual retry; see [caching strategy](../architecture/caching-strategy.md) and [media lifecycle](media-lifecycle.md).

## Dead-letter and escalation

Dead-letter is a visible operational state in the same table, not a second queue. A dead-letter row includes safe failure category, last attempt time, attempt count, correlation ID, age, and owning domain. Operations can:

- inspect current authoritative state and safe attempt history;
- mark an obsolete effect resolved only through a documented command;
- repair configuration/data and replay with an audited reason;
- create a replacement message when the contract version or intent changes.

Replay is privileged and audited. The operator cannot edit the historical payload casually or bypass current authorization/lifecycle checks.

## Retention and deletion

- Pending, processing, and dead-letter rows are never purged by age alone.
- Processed rows remain for an approved operational reconciliation window, then may be hard-deleted in bounded batches.
- Payload retention is minimized by reference-first envelopes and data classification.
- Privacy erasure removes or tokenizes unnecessary PII in payloads while preserving minimal delivery/audit evidence where legally required.
- Backups inherit the approved outbox retention and erasure limitations.

Exact periods are an **Open Decision** tied to incident investigation, vendor reconciliation, privacy, and cost requirements.

## Authorization and RLS intention

- Anonymous, authenticated customers, and advisors have no direct table access.
- Admins receive read-only operational visibility only if an explicit permission is approved; they do not claim, update, delete, or replay rows directly.
- A narrowly scoped privileged dispatcher/service performs claim and completion commands.
- Replay, resolution, and purge are separate privileged application commands with audit records.
- RLS and grants deny default; service-role possession does not replace application command checks or payload validation.

## Query patterns and indexes

Required patterns are:

1. dispatcher eligibility ordered by `next_attempt_at`, then stable creation/ID;
2. completion by primary key plus expected lease/attempt identity;
3. operations backlog by status/domain/event/age;
4. correlation and aggregate investigation;
5. uniqueness by idempotency key;
6. bounded retention purge of processed rows.

Proposed indexes are documented in [index strategy](index-strategy.md). Do not add a broad GIN index on payload by default; known operational filters belong in columns.

## Observability

Measure enqueue rate, claim rate, processed rate, retry categories, dead-letter count, oldest eligible age, lease-expiry reclamations, attempt distribution, handler duration, and provider reconciliation results. Alert on revocation-sensitive age, growing backlog, repeated lease expiry, poison-message clusters, and dispatcher inactivity. Logs use IDs and safe codes, not payload contents.

## Failure-mode review

| Failure | Safe behavior |
| --- | --- |
| Process crashes before business commit | Neither business change nor message exists |
| Process crashes after commit before dispatch | Pending row remains claimable |
| Dispatcher crashes after claim | Lease expires and work is reclaimed |
| Provider succeeds but completion write fails | Reclaim/retry reconciles idempotently; duplicate effect is controlled |
| Completion write succeeds but response is lost | Message remains processed; caller must not create a second row for same key |
| Stale worker completes after lease transfer | Conditional completion rejects stale owner/attempt |
| Poison message | Bounded attempts lead to visible dead-letter escalation |
| Old event conflicts with current state | Consumer re-reads/revalidates and records obsolete/no-op outcome safely |

## Rejected alternatives

- Provider calls inside business transactions: long locks without cross-system atomicity.
- Unrecorded fire-and-forget callbacks: crash window loses required work.
- Database triggers that call providers: hidden orchestration and unsafe external coupling.
- Broker, queue, or event bus now: premature infrastructure for unmeasured throughput.
- Exactly-once claims: not achievable across arbitrary providers; idempotent at-least-once delivery is explicit.
- Unbounded generic event payloads: create an ungoverned JSON data store and privacy risk.

## Open Decisions

- Dispatcher runtime/trigger and operations ownership.
- Lease duration, heartbeat policy, batch size, concurrency, retry schedule, and maximum event age by family.
- Which email and analytics effects require durable delivery rather than best effort.
- Dead-letter remediation permissions and operator workflow.
- Processed-message and attempt-history retention periods.
