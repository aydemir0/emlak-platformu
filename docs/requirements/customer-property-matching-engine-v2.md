# Deterministic customer-property matching engine V2

**Status:** Accepted design for Phase 10 Package A, 2026-08-11. No matching
runtime or migration is authorized by this document.

## Purpose and ownership

The engine ranks eligible properties for one active `customer_requests` record.
`customer_requests`, rather than `customers` or `leads`, owns the matching
profile: a customer can have independent concurrent requirements, and a lead is
not a canonical customer. This preserves the existing
`property_customer_matches` three-way identity and does not imply customer
conversion.

The engine is deterministic, advisory, and explainable. The same normalized
property projection, request profile, and `matching-v2` rule version must yield
the same inclusion, component points, reasons, and ordering. No AI, embedding,
random value, current time, or provider result participates in a score.

## Profile and property contracts

The canonical profile is an active, non-deleted customer request plus its
feature rows. V2 consumes: listing type; one requested location; budget range
and currency; one preferred property type; bedroom range; a net-area range;
and distinct requested feature IDs by priority. A property's bounded projection
contains only ID/version, state/deletion status, listing/property type IDs,
location ancestry, price/currency, bedroom count, net area, and distinct active
feature IDs. It never loads media, address, contact PII, notes, or full
aggregates.

Current schema has one `location_id`, no request area range, and nullable
criteria with no way to distinguish missing from explicitly flexible. Package C
therefore needs an **expand-first proposal**, not a Package-A migration:

- nullable `net_area_min_deci_sqm` and `net_area_max_deci_sqm` on
  `customer_requests`, non-negative and ordered when both exist;
- `customer_request_matching_criteria` with `(customer_request_id,
criterion_code)` as its key and controlled `criterion_code` values
  `LOCATION`, `BUDGET`, `PROPERTY_TYPE`, `ROOMS`, `AREA`, `FEATURES`; each row
  has mode `FLEXIBLE` or `CONSTRAINED`.

No row means **missing/uncollected**, a `FLEXIBLE` row means an explicit no-op,
and a `CONSTRAINED` row requires the corresponding existing/request-area values.
Application validation prevents a constrained row without values. No location
set, gross-area preference, or importance multiplier is added in V2; these are
not necessary to deliver the locked six components.

## Eligibility and hard constraints

Candidate properties must be non-deleted and `ACTIVE`. Public route, media, and
address eligibility are not candidate predicates because this is a staff CRM
projection, not a public read model. The application and RLS still scope the
request/customer and returned matches to the acting staff member.

- A constrained listing type is a hard exclusion: a different listing type
  never receives a score.
- Every distinct `required` request feature is a hard exclusion when features
  are constrained. A property must have all such feature IDs.
- Budget, location, property type, bedrooms, net area, and `preferred`/`avoid`
  features are soft. Making them hard would turn ordinary preferences into
  unexplained inventory disappearance.
- `avoid` is a V2 soft penalty only: a candidate remains eligible, but its
  features component is zero if it has any avoided feature. This is explicit in
  its reason; it is never a hidden negative or a hard exclusion.

## Scoring rules

The total is an integer in `[0, 100]`, the sum of six integer components.
Missing or explicitly flexible criteria award their entire component weight to
every eligible candidate and emit `*_NOT_CONSTRAINED`; this is a neutral no-op,
not an accidental penalty. Missing candidate data for a constrained soft
criterion awards zero for that component and emits `*_PROPERTY_DATA_MISSING`.

| Component     | Weight | Exact formula                                                                                                                                                                                                                                                                                                                                               |
| ------------- | -----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Location      |     30 | Exact requested location ID: 30. Different location sharing the requested location's city ancestor: 18. Otherwise: 0. A city request matches every location in that city exactly. No fuzzy/geographic-distance inference.                                                                                                                                   |
| Budget        |     25 | If price/currency matches and price is inside inclusive `[min,max]` (with a missing bound treated as unbounded): 25. Otherwise let `d` be distance in minor units to the nearest supplied bound and `t = max(1, floor(reference * 10 / 100))`, where `reference` is that bound. Score is `floor(25 * max(0, t-d) / t)`. Currency mismatch/missing price: 0. |
| Property type |     15 | Exact preferred type: 15; different or missing candidate type: 0.                                                                                                                                                                                                                                                                                           |
| Rooms         |     10 | Uses existing bedroom fields only. Inside inclusive range: 10. Otherwise `d` is whole-bedroom distance to nearest bound and score is `max(0, 10 - 5*d)`.                                                                                                                                                                                                    |
| Area          |     10 | Uses net area only, represented as integer deci-square-metres. Inside range: 10. Otherwise `d` is distance to the nearest bound and `t = max(1, floor(reference * 10 / 100))`; score is `floor(10 * max(0, t-d) / t)`.                                                                                                                                      |
| Features      |     10 | Required features already passed the hard filter. If no preferred features: 10. If an avoided feature is present: 0. Otherwise score is `floor(10 * intersection(preferred, property) / count(preferred))`; duplicates are removed before counting.                                                                                                         |

`reference` is the nearest violated bound. All values are non-negative integer
minor units or integer deci-square-metres. SQL adapters convert stored `numeric`
area to deci-square-metres with PostgreSQL numeric rounding before the domain
boundary; JavaScript floating-point values are prohibited. Division rounds down,
then every component and total is clamped to its stated bounds. The stored
`property_customer_matches.score` remains the exact numeric `total / 100`; one
reason row per component stores its normalized contribution `points / 100`.

## Ordering, explanations, and versioning

Results sort by: (1) total descending; (2) component vector location, budget,
property type, rooms, area, features descending; (3) property UUID in canonical
bytewise ascending order. No timestamp or random tie-breaker is allowed.

The delivery contract contains no PII:

```ts
{
  ruleVersion: "matching-v2",
  totalScore: 0, // integer 0..100
  components: { location: 0, budget: 0, propertyType: 0, rooms: 0, area: 0, features: 0 },
  reasons: [{ code: "LOCATION_EXACT", component: "location", points: 30 }]
}
```

Reason codes and points are derived solely from the formula. Human display copy
is a delivery concern and must not alter calculation or persist free-text PII.
`matching-v2` is an application/domain constant. It is stored in the existing
`rule_version`, with current property/request versions and deterministic SHA-256
basis fingerprint. A future V3 writes different generations beside V2; it does
not reinterpret old results.

## Compute, persistence, and query strategy

V2 is hybrid: compute a bounded fresh candidate set synchronously in the domain,
then persist a generation and normalized reasons in the existing match tables.
Persisted results support explanation, review, stale detection, and future
notifications without a background worker. Existing locks, version checks,
generation uniqueness, and same-transaction staleness handling remain the
authoritative race controls. No new result table is required.

Candidate SQL first applies `ACTIVE`, non-deleted, listing-type, and required
feature predicates. It returns only score inputs plus city ancestry and batch
loads all candidate features in one query. It must request `limit + 1`; if the
configured limit is exceeded it returns a typed limit error rather than silently
ranking a partial inventory. The limit is an operations configuration and is an
Open Decision, not a hidden constant. Scores are then calculated in memory and
persisted atomically using the established property -> request -> current-match
lock order.

For `C` selected candidates, `F` returned feature assignments, and `P` distinct
preferred features, selection is `O(C + F)` with indexed joins, scoring is
`O(C + F)` after feature sets are built, and feature overlap is `O(F + C*P)` in
the worst case (or linear in the smaller set per candidate with a hash set).
There is no N+1 query or unbounded full-table scoring path.

## Authorization, privacy, and concurrency

`ADMIN` may run matching for authorized customer requests. `ADVISOR` may do so
only where the trusted customer assignment grants CRM scope; neither a request
customer ID nor an advisor ID from delivery input is trusted. Read repositories
scope joins by that same relationship and RLS remains defense in depth. Results
contain safe property/request IDs and score facts only; no customer contact,
notes, exact address, or internal audit detail appears in a matcher payload.

The computation locks property, then request, then current match rows; verifies
versions while locks are held; marks prior current rows stale; and inserts the
new generation/reasons in one transaction. A stale input yields a typed conflict
or safe no-op, never a last-write-wins result.

## Test matrix

- perfect six-component 100; each component's lower/upper bound; total never
  below 0 or above 100;
- listing-type and required-feature hard rejection;
- exact district/location, city-only, and outside-location behavior;
- within-budget, boundary-near, currency mismatch, missing price, zero and huge
  minor-unit values;
- property-type mismatch; bedroom distance; net-area distance; inverted range
  validation; and missing candidate values;
- partial feature overlap, duplicate IDs, no requested features, and avoided
  feature behavior;
- missing versus explicitly flexible versus constrained preference modes;
- empty location set/single-location validation, unsupported currency, and
  unsupported gross-area input;
- deterministic repeat result, UUID tie-break, rule version/fingerprint capture,
  stale parent version rejection, idempotent generation, and no N+1/query-limit
  breach;
- admin/advisor scoped allow and cross-customer/request denial without PII
  leakage.

## Open decisions

- configured candidate limit and operational latency/SLO;
- whether a future profile needs multiple locations or gross-area basis;
- whether `avoid` should become a hard constraint after product evidence;
- staff UI permission code and whether a match refresh is manual-only or also
  triggered by a later approved worker;
- retention/review visibility of persisted match explanations.

## Implementation final state (Phase 10)

- `customer_requests` owns the persisted V2 profile. Six explicit criterion
  states preserve `MISSING`, `FLEXIBLE`, and `CONSTRAINED` semantics.
- `MATCHING_CANDIDATE_LIMIT` has one server-side default of `500`; selection
  reads one additional candidate and rejects overflow without partial ranking.
- Existing match/reason tables persist the `matching-v2` rule, score, stable
  reason codes, SHA-256 basis fingerprints, and current/stale generations.
- Stale invalidation covers matching request/profile fields, request features,
  property matching fields, and property feature assignments.
- The admin request detail is server-rendered. ADVISOR access requires both
  trusted CRM request scope and property assignment scope; no browser scoring
  or client authorization is used.
