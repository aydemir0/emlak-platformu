# Property lifecycle data design

**Status:** Proposed Phase 2 design; documentation only. No schema or migration is introduced.

## Purpose and ownership

The Properties domain owns property identity, commercial/publication state, canonical slug, price history, and advisor association. PostgreSQL is authoritative. This document refines [domain boundaries](../architecture/domain-boundaries.md), [SEO architecture](../architecture/seo-architecture.md), [caching strategy](../architecture/caching-strategy.md), and [ADR-002](../decisions/ADR-002-supabase-postgresql.md). V1 assumes one operating business and adds no speculative tenant key, per [ADR-009](../decisions/ADR-009-future-multi-tenancy-boundary.md).

Expected database peers are the [domain model](domain-model.md), [authorization matrix](authorization-matrix.md), [RLS design](rls-design.md), [index strategy](index-strategy.md), [transaction and concurrency design](transaction-concurrency.md), [outbox design](outbox-design.md), [retention and deletion design](retention-deletion.md), [media lifecycle](media-lifecycle.md), and [customer and lead model](customer-lead-model.md).

## Canonical records and invariants

| Table | Responsibility and important invariants |
| --- | --- |
| `properties` | Stable UUID identity, current state, current normalized slug, current commercial facts, `version`, timestamps, and soft-delete metadata. State is exactly `DRAFT`, `REVIEW`, `ACTIVE`, `RESERVED`, `SOLD`, `RENTED`, `PASSIVE`, or `ARCHIVED`. Money uses integer minor units plus currency. |
| `property_state_history` | Append-only transition evidence: property, from/to states, actor, intention/reason code, safe reservation or closing facts when required, property version, timestamp, correlation/idempotency identifier. It never substitutes for the audit log or become a contract/payment ledger. |
| `property_slug_history` | Immutable prior normalized slugs, validity/redirect timestamps, and `route_reservation_id` referencing the SEO/content-owned `public_route_reservations`. One current canonical slug is held by `properties`; history resolves old slugs without redirect chains. Old routes remain globally reserved for history/redirects. |
| `property_price_history` | Append-only effective price entries with amount/currency, actor/source, effective time, property version, and correction linkage. Updating current price and appending history is atomic; published price changes generate invalidation intent. |
| `property_advisor_assignments` | Temporal advisor associations with role, effective interval, assigner, reason, and version. Overlapping active assignments are permitted only for explicitly different roles/cardinality rules; the launch role/cardinality matrix is an Open Decision. |

All mutable business records use `created_at`, `updated_at`, `deleted_at`, deletion/restoration actor and reason where sensitive, and an optimistic `version`. Foreign keys use explicit delete behavior; business history is not cascade-deleted. The SEO/content domain owns global normalized route uniqueness through `public_route_reservations`, preventing a property route from colliding with location, landing, editorial, or another property route. Current and historical property paths retain reservations; archiving or renaming does not free an externally meaningful old route for unrelated reuse.

## Lifecycle contract

Every transition is an application use case. It authenticates and object-authorizes the actor, locks the `properties` row, requires the caller's expected `version`, re-evaluates preconditions, changes state, increments version, appends `property_state_history` and audit evidence, and writes any required outbox intent in one transaction. A version/state mismatch returns a conflict with safe current state; there is no last-write-wins behavior. Provider calls occur after commit. Every transition not listed below, including self-transitions, is invalid.

| Transition | Authorized actor intention | Preconditions | Transaction, audit, and outbox effect |
| --- | --- | --- | --- |
| `DRAFT -> REVIEW` | Editor submits a complete draft for approval | Required facts, location, price semantics, canonical candidate, and review checklist are valid; not deleted | Lock/version-check; append transition/audit. Notify reviewers only through post-commit outbox if required. |
| `DRAFT -> ARCHIVED` | Authorized operator abandons an unpublished record | No active reservation or prohibited dependency | Lock/version-check; append reason/audit; revoke preview/cache references through durable intent when exposed. |
| `REVIEW -> DRAFT` | Reviewer returns work for correction | Review is unresolved; reason supplied | Lock/version-check; append reason/audit; post-commit reviewer/editor notification if required. |
| `REVIEW -> ACTIVE` | Publisher approves and publishes | All publication checks pass, the normalized canonical route has a compatible global reservation, required public facts and location are valid, and media/SEO readiness contracts pass; not deleted | Lock/version-check and acquire/verify the SEO/content-owned route reservation atomically; append transition/audit; durable outbox for property/list/landing/sitemap/cache publication. |
| `REVIEW -> ARCHIVED` | Authorized operator cancels review and archives | No active reservation; reason supplied | Lock/version-check; append audit; durable revocation intent for any preview/public projection. |
| `ACTIVE -> REVIEW` | Publisher withdraws public availability for material correction/reapproval | No unresolved reservation; reason supplied | Lock/version-check; append audit; durable revocation/invalidation for page, lists, sitemap, and media eligibility. |
| `ACTIVE -> RESERVED` | Authorized advisor/operator records a real reservation | Reservation reference, responsible advisor, validity terms, and current availability pass; duplicate command rejected/idempotent | Lock property and reservation dependencies; append audit; durable public availability/cache/notification effects. |
| `ACTIVE -> PASSIVE` | Authorized operator intentionally withdraws from active marketing | No active reservation; withdrawal reason supplied | Lock/version-check; append audit; durable revocation from public reads, sitemap, and media eligibility. |
| `ACTIVE -> ARCHIVED` | Authorized operator retires an active listing | No active reservation; archive policy and reason pass | Lock/version-check; append audit; durable revocation and sitemap/cache/media effects. |
| `RESERVED -> ACTIVE` | Authorized actor releases/cancels reservation | Reservation is released/expired with evidence; property remains marketable | Lock property and reservation dependencies; append audit; durable availability/cache effects. |
| `RESERVED -> SOLD` | Authorized closer records completed sale | Completed transaction evidence, sale amount/currency/date, and reservation consistency pass | Lock/version-check; atomically record commercial facts/history and audit; durable availability, SEO, sitemap, cache, and notification effects. |
| `RESERVED -> RENTED` | Authorized closer records completed rental | Completed transaction evidence, rental amount/currency/date, and reservation consistency pass | Same atomic and durable effects as sale, using rental facts. |
| `RESERVED -> PASSIVE` | Authorized operator withdraws after reservation ends without relaunch | Reservation is released/expired; reason supplied | Lock property and reservation dependencies; append audit; durable revocation/invalidation. |
| `RESERVED -> ARCHIVED` | Authorized operator retires after reservation resolution | Reservation is released/cancelled or archive policy explicitly permits closed handling | Lock/version-check; append audit; durable revocation/invalidation. |
| `PASSIVE -> REVIEW` | Editor seeks renewed publication | Current facts, price, assignment, slug, and media are revalidated; withdrawal issue resolved | Lock/version-check; append audit. Reviewer notification may be outboxed; no public exposure yet. |
| `PASSIVE -> ARCHIVED` | Authorized operator retires withdrawn inventory | Retention/archive policy passes | Lock/version-check; append audit; durable cleanup/revocation intent if needed. |
| `SOLD -> ARCHIVED` | Authorized operator closes retained sold inventory | Required completion/audit retention exists; lifecycle-specific SEO decision is applied | Lock/version-check; append audit; durable URL/sitemap/cache/media policy effect. No other exit from `SOLD` is allowed. |
| `RENTED -> ARCHIVED` | Authorized operator closes retained rented inventory | Required completion/audit retention exists; lifecycle-specific SEO decision is applied | Same as sold. No other exit from `RENTED` is allowed. |
| `ARCHIVED -> DRAFT` | Authorized restorer reopens a retained record for fresh editing | Within restore retention; not privacy-erased/legal-blocked; canonical slug and physical-asset identity uniqueness checks pass; stale assignments, reservations, media eligibility, and public projections are not resurrected | Lock/version-check; restore only approved fields/relationships, append audit/history, and emit reconciliation intent. It is never restored directly to a public state. |

`PASSIVE` can return toward publication only through `REVIEW`. `SOLD` and `RENTED` can only transition to `ARCHIVED`. Restoring `ARCHIVED` always returns to `DRAFT`.

## Slug, price, assignment, and query design

- Slug changes lock the property and relevant `public_route_reservations` rows in deterministic normalized-route order, then verify expected property version and global route ownership. In one transaction they acquire the new SEO/content-owned reservation, insert the old slug plus its retained `route_reservation_id` into `property_slug_history`, update the canonical slug/version, and append audit/outbox records. The old reservation is not released for unrelated reuse. A reservation conflict returns a domain conflict; historical lookups redirect directly to the current canonical only when lifecycle/SEO policy permits.
- Price writes require expected property version and append `property_price_history`; correction creates a new entry linked to the corrected one. Never rewrite history. Public price reads use the committed current value, and invalidation keeps visible, metadata, structured-data, and list prices aligned.
- Assignment changes lock the property and relevant open assignment rows in deterministic identifier order, close/open intervals atomically, and audit reassignment. Deleted/offboarded advisors cannot receive new assignments.
- Primary admin access paths need indexes for current state/non-deleted records, current slug, advisor plus open interval, and history by `(property_id, occurred_at desc)`. Public partial indexes cover only actually supported `ACTIVE` discovery queries; do not index every facet combination.

## Soft delete, restore, retention, and privacy

State and deletion are separate. Soft deletion immediately excludes a property from public/admin-default reads, revokes media delivery and public projections, and records actor/reason/time plus durable invalidation. It does not erase legally required transaction history. Restore is an authorized use case within a documented window, targets `DRAFT`, checks uniqueness and references, and never silently revives assignments, reservations, media visibility, or prior publication. Eventual hard deletion requires retention expiry, legal-hold/reference checks, media purge coordination, and an auditable tombstone sufficient to prevent slug/object ambiguity without retaining unnecessary PII. Exact retention, public sold/rented/archive behavior, and privacy-erasure rules remain open.

## Authorization and RLS boundary

Anonymous reads are limited to the publication-approved public projection; raw history, assignments, drafts, deleted rows, and internal identifiers are not public. Staff operations require current server-validated identity, explicit action/object scope, and application authorization. RLS is deny-by-default and operation-specific on every exposed table; normal roles cannot mutate history/audit rows. Service-role paths are server-only and narrowly scoped. Preview access is separately authorized, non-indexable, and never proof of publication.

## Assumptions and Open Decisions

- **Assumption:** Publication approval is a deterministic human-authorized action; AI may assist but cannot transition state.
- **Assumption:** One property row represents one stable listing aggregate. Whether repeated listings of the same physical asset share a separate durable asset identity remains an Open Decision.
- **Open Decision:** Relisting semantics and physical-asset identity: whether a later listing after sale/rental is a new `properties` row linked to the same physical asset, or a governed new lifecycle on an existing identity. This requires a dedicated decision before implementation.
- **Open Decision:** Exact publication completeness, review roles, approval/dual-control, reservation evidence, and advisor assignment cardinality.
- **Open Decision:** Whether future commercial operations require separate reservation/deal/contract/payment aggregates. V1 records only the minimum state-transition evidence needed to justify `RESERVED`, `SOLD`, and `RENTED`; it does not claim transaction-management scope.
- **Open Decision:** Sold/rented/archive public URL, redirect, status, sitemap, and retention behavior.
- **Open Decision:** Slug normalization, route-reservation ownership transfer/correction operations, retention/legal hold, and privacy-erasure details. Historical public routes remain reserved; any exceptional reuse requires a separate SEO decision and redirect-safety analysis.
