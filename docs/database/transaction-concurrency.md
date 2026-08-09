# Transaction and concurrency design

**Status:** Proposed

## Purpose

Define atomicity, isolation, locking, conflict, retry, and idempotency boundaries for the Phase 2 domain model before executable schema or runtime work begins. PostgreSQL is authoritative; provider calls remain outside transactions. This document refines [ADR-002](../decisions/ADR-002-supabase-postgresql.md), [ADR-007](../decisions/ADR-007-event-outbox-strategy.md), and the application boundary in [application architecture](../architecture/application-architecture.md).

## Global rules

- Keep transactions short and exclude R2, Resend, GA4, Sentry, cache-provider, and other network calls.
- Use constraints as the final race-condition guard; application prechecks exist for useful errors, not integrity guarantees.
- Use optimistic version checks for ordinary human edits. A mutation supplies the last observed `version`; zero updated rows returns a typed conflict and current safe state.
- Use row locks only for state transitions, ordering, merge, allocation, or other invariants that cannot be protected by one conditional statement or constraint.
- Acquire multiple locks in a stable order: owning aggregate first, then child tables, then rows ordered by immutable identifier.
- Retry serialization failures and deadlocks only at the complete idempotent use-case boundary, with a strict attempt limit and jitter. Do not retry validation, authorization, uniqueness, or invalid-transition failures.
- Every externally repeatable command has an idempotency key or a domain uniqueness constraint. The transaction records the authoritative result before a repeated caller receives success.
- Required audit evidence and durable outbox intent commit in the same transaction as the business change.
- Soft delete and restore are commands with current-state and uniqueness checks; they are never blind timestamp updates.

**Assumption:** PostgreSQL's default `READ COMMITTED` isolation is sufficient when paired with explicit conditional writes, narrow locks, unique/exclusion constraints, and atomic claims. A use case that requires a stronger isolation level must justify it explicitly.

## Concurrency primitives

| Primitive | Use | Avoid when |
| --- | --- | --- |
| Conditional update with `version` | Human edits, property/SEO/content/settings mutations | Several rows must be validated and reordered together |
| Unique or partial unique constraint | Public IDs, active contact identities, current slugs, one active cover, idempotency keys | The rule depends on another row's mutable state |
| Row lock on aggregate | Lifecycle transition, media reorder, customer merge | A single constraint or conditional update is sufficient |
| Deterministic multi-row locks | Reordering children, merging customer graphs | Lock set is unbounded or external work occurs inside transaction |
| GiST exclusion constraint | Advisor appointment overlap if collisions are forbidden | Product permits overlaps or tentative states should not block time |
| Atomic `SKIP LOCKED` claim with lease | Outbox and media processing work | Business commands or user-visible ordering |
| Transaction-scoped advisory lock | Rare global coordination with no natural row | Routine per-aggregate commands; row/constraint locking is clearer |

## Use-case transaction matrix

| Use case | Atomic writes | Concurrency guard | Idempotency and conflict outcome |
| --- | --- | --- | --- |
| Create property | `properties`, initial slug, advisor assignment when supplied, audit | Unique public ID/slug plus request idempotency | Duplicate key returns existing command result or conflict; never creates two listings |
| Submit property for review | Property state/version, state history, audit | Conditional state/version update | Only `DRAFT -> REVIEW`; stale version or other source state fails |
| Approve/publish property | Property state/version, state history, required audit, revocation/freshness outbox intent | Lock property; verify required location, price, advisor and ready/public-eligible media facts in the same snapshot | Only `REVIEW -> ACTIVE`; duplicate approved command returns the committed state |
| Reserve/close/withdraw property | Property state/version, state history, price/public effects as relevant, audit/outbox | Lock property; conditional allowed transition | All unlisted transitions fail; repeated transition is reported without duplicating history/outbox |
| Change property price | Property current minor-unit amount/currency/version plus `property_price_history`, audit/outbox | Conditional version update; amount/currency checks | Same idempotency key cannot record price history twice |
| Change property slug | Retired old-slug history row, aggregate current slug/reservation, property version, audit/outbox | Lock property and affected route reservations in deterministic order; globally reserved route uniqueness | Collision fails before old canonical is retired; repeated request resolves to one aggregate-owned current slug |
| Upload finalization | Upload-session consumed state, new/updated media state, processing outbox, audit | One-time session token/idempotency key and expected object metadata | Duplicate finalization returns same media; mismatched actor/property/object fails |
| Claim/process media | Processing attempt, media lease/state, result/variant metadata | Atomic eligible claim with expiring lease; attempt/version guard prevents stale worker publication | Crash leaves reclaimable lease; duplicate completion cannot overwrite a newer attempt |
| Reorder media/change cover | Property/media versions, all affected active media positions, audit/outbox | Lock property then active media by ID; partial unique cover invariant | Stale version returns conflict; operation is all-or-nothing and produces dense positive order |
| Soft-delete/restore media | Media state/version, public eligibility, audit, durable purge/invalidation intent | Lock media and property; active-cover/position checks | Delete is idempotent; restore may fail on cover/order conflict and never silently displaces current media |
| Capture lead | Lead plus consent/provenance and optional audit/analytics outbox | Submission idempotency and bounded normalized contact candidate lookup | Repeated form returns generic success without multiplying records or exposing duplicates |
| Convert lead to customer | Customer/contact records or selected existing customer, `lead_conversions`, lead state, activity, audit | Lock lead; lock candidate customers/contact points in ID order; unique one-successful-conversion invariant | One lead converts once; duplicate command returns conversion result; ambiguous match requires reviewed choice |
| Merge customers | Survivor/customer version, contact points, requests, activities, appointments, matches, merge history, audit | Lock both customers in ascending UUID order and all moved child rows deterministically | Merge command idempotent; uniqueness/retention conflicts abort entire transaction; source becomes merged/soft-deleted |
| Create/update customer request | Request, feature junctions, activity/audit where required | Customer/request version; feature rows replaced transactionally | Stale version conflicts; deleted customer cannot gain new active requests |
| Book/reschedule appointment | Appointment and activity/audit/outbox | Conditional version plus exclusion constraint if no-overlap policy is approved | Collision returns typed scheduling conflict; repeated booking key returns same appointment |
| Complete property/customer match generation | Retire the prior current generation, insert/return the versioned match and normalized reasons | Lock property first, then customer request, then current match rows in immutable-ID order; verify the stored property/request versions while parent locks are held; permanent generation-basis uniqueness plus one-current-generation constraint | Identical basis returns one result; a stale worker fails/no-ops. Every property/request mutation that changes matching input marks its affected current matches `STALE` in the same parent transaction before commit |
| Publish SEO/content | Record/version, current slug/history, audit, cache/sitemap outbox | Lock aggregate/current slug and check global route namespace | Canonical collision fails atomically; no partial sitemap/cache effect |
| Update access grants | Role assignment, audit, revocation outbox where required | Principal/assignment locks plus uniqueness | Revocation becomes authoritative at commit; stale JWT is not trusted for sensitive access |
| Soft-delete/restore business record | Aggregate version, delete/restore provenance, audit/outbox and required child transitions | Lock aggregate; verify child and active-uniqueness policy | Restore is explicit and may fail rather than overwriting a reused identity |

## Property state transitions

Property lifecycle commands lock one property and require both the expected state and expected version. State history is inserted only when the state changes. Publication checks use the same transaction snapshot; provider delivery is not part of the transaction. See [property lifecycle](property-lifecycle.md) for the complete transition graph.

Two staff members editing non-state fields use optimistic concurrency. The application may support field-aware conflict assistance later, but the authoritative default is no silent last-write-wins. Bulk transitions use one transaction per bounded batch or one independently recoverable command per property; the exact atomicity is a workflow decision, not a UI assumption.

## Media ordering and cover invariant

The reorder command:

1. locks the property row;
2. verifies the supplied property/media ordering version;
3. locks all active media rows for the property in UUID order;
4. validates that the submitted set equals the authoritative active set;
5. assigns a dense `sort_order` beginning at one and exactly one cover flag when media exists and the lifecycle requires a cover;
6. increments versions and commits audit/outbox records.

A partial unique invariant on active cover rows is the final guard. Temporary uniqueness collisions during reorder must be avoided through a two-phase position update inside the same transaction or a deferrable-equivalent design chosen during migration planning. This document does not prescribe executable SQL.

## Appointment collision strategy

**Assumption:** Appointments use half-open intervals `[starts_at, ends_at)` so an appointment may begin when the previous one ends.

If product policy prohibits an advisor from holding overlapping appointments in blocking states, prefer a PostgreSQL GiST exclusion constraint over a check-then-insert query. The predicate must include only active blocking states and non-deleted rows; implementation would require validating the supported extension/operator setup. Application prechecks improve messages, but the exclusion constraint wins races.

**Open Decision:** Define blocking appointment states, whether tentative/requested appointments reserve time, buffers between meetings, multi-advisor appointments, and administrator override semantics. Until resolved, no overlap guarantee is claimed.

## Customer duplicate and merge concurrency

Normalized email/phone values identify duplicate candidates, not an automatic merge authorization. Contact-point uniqueness policy must distinguish verified from unverified values and reused/shared contact information. A reviewed merge locks both customers and their active contact points in stable order. The survivor is explicit; child ownership moves atomically; merge history prevents chains from becoming ambiguous. Privacy erasure and legal hold can block or alter the merge.

## Outbox and processing claims

Claims select eligible rows and change lease ownership/expiry atomically. Workers never hold a database transaction open during provider or image-processing calls. Completion compares message/attempt identity and current lease or media version. Expired claims are reclaimable; therefore delivery is at least once and consumers must be idempotent. See [outbox design](outbox-design.md).

## Deadlock prevention and operational limits

- Document lock order in every multi-aggregate use case and cover it with concurrency tests.
- Bound rows per bulk command, media count per reorder, and children moved per customer merge.
- Apply transaction-local statement and lock timeouts appropriate to the operation; exact values are environment-tested configuration.
- Monitor deadlocks, lock waits, transaction duration, version conflicts, exclusion violations, claim age, and retry exhaustion.
- Never catch a database error and continue using the same failed transaction.
- A retry creates no duplicate audit/outbox/history rows because the command/idempotency key is unique.

## Failure modes

- **Lost update:** version predicate rejects the stale writer.
- **Check-then-insert race:** unique/exclusion constraint decides atomically.
- **Deadlock:** database aborts one transaction; the idempotent use case retries within a strict budget.
- **Worker crash after claim:** lease expires and another worker reclaims the record.
- **Ambiguous provider result:** transaction is already committed; reconciliation uses idempotency/provider identifiers outside it.
- **Partial reorder or merge:** transaction rollback leaves the previous coherent state.
- **Restore uniqueness conflict:** restore fails with an actionable conflict; it never steals the active value.

## Verification requirements before migration

- Transition table tests cover every allowed and every invalid property/media transition.
- Two-session tests demonstrate price/version conflict, cover uniqueness, media reorder, lead conversion, customer merge, appointment collision, slug collision, and outbox reclaim behavior.
- Constraint tests prove normalized contact, current slug, public ID, idempotency, and active uniqueness rules.
- Transaction tests verify audit/outbox/history rollback with the business change.
- Query plans and lock behavior are evaluated on representative row counts before performance claims.

## Open Decisions

- Appointment blocking states, buffers, overrides, and whether the exclusion constraint is enabled.
- Bulk-command atomicity and maximum batch sizes per workflow.
- Customer contact uniqueness rules for verified, shared, recycled, or household contact points.
- Exact transaction/lock timeouts and retry budgets.
- Whether publication approval requires one actor, separation of duties, or dual control.
