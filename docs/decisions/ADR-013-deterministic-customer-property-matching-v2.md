# ADR-013: Deterministic customer-property matching V2

## Status

Accepted — Phase 10 Package A design, 2026-08-11. Implementation requires a
separate approval.

## Context

The existing schema already models versioned, stale-aware
`property_customer_matches` and normalized reasons, but has no authoritative
matching implementation. The platform needs explainable staff CRM ranking,
without changing a lead into a customer or delegating a commercial decision to
AI.

## Decision

`customer_requests` owns matching profiles. V2 is an integer-point,
deterministic `matching-v2` rule with weights location 30, budget 25, property
type 15, rooms 10, area 10, and features 10. Listing type and explicitly
required features are hard constraints; ordinary preferences remain soft.

V2 computes a bounded, indexed candidate projection in the application/domain
layer and persists its versioned result/reasons through the existing match
tables. It records rule/property/request versions and a basis fingerprint,
retains the current locking/staleness protocol, and uses no worker, model,
embedding, randomness, or timestamp ranking.

The missing/flexible/constrained distinction and net-area input require a later
expand-first Package-C migration; Package A adds no database objects.

## Alternatives considered

- **Customer-wide profile:** rejected; concurrent needs would overwrite each
  other and it would collapse request ownership.
- **Lead-owned matching:** rejected; it would silently bypass the explicit
  conversion boundary.
- **On-demand only:** rejected; loses durable review/explanation/staleness
  evidence already represented in the schema.
- **Score every property or add a background worker:** rejected; unbounded cost
  and extra operational machinery are not justified.
- **AI/vector ranking:** rejected; it is not deterministic or authoritative
  enough for V2.

## Consequences

New scores are reproducible, bounded, testable, and safely tie-broken. Existing
match/result tables are reused, avoiding a duplicate projection. Later V3 can
coexist by its explicit version. Candidate-limit overflow fails visibly instead
of returning a misleading partial ranking.

## Security and privacy impact

Application authorization and RLS use trusted customer scope for both request
and result queries. Matching projections omit contact values, notes, addresses,
and media. Reasons use fixed codes and points only. No anonymous CRM grant,
service-role shortcut, or client-selected advisor/customer scope is introduced.

## Data and performance impact

The proposed preference-mode relation and net-area columns are additive and
require validation/index review before migration. Candidate query and feature
batch load are bounded; no N+1 or full inventory scan is permitted. Persisting
generations uses the existing version/fingerprint uniqueness and parent-lock
protocol, so concurrent changes cannot install stale results.

## Migration and rollback considerations

Do not change existing match tables in Package A. Package C must add nullable
columns and the new preference-mode relation first, without backfill-based
semantic guesses. A forward fix may disable the new matcher while retaining
immutable generated rows; it must not relax stale-generation or RLS controls.

## Open decisions

Candidate limit/SLO, multiple locations, gross-area support, final `avoid`
semantics, refresh permission/triggering, and match retention/review visibility
remain in the Phase 10 requirements specification.
