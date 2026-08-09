# Database relationships and lifecycle rules

## Purpose

This document defines relationship ownership, cardinality, database delete behavior, soft-delete visibility, and restore semantics for the 44-table model. It complements the [Domain model](domain-model.md), [Entity catalog](entity-catalog.md), [Schema draft](schema-draft.md), and [ERD](erd.md).

## Ownership and dependency direction

Ownership is acyclic. A foreign key protects identity; it does not transfer write authority.

```text
identity/access and controlled catalogs
        ↓
properties, customers, SEO/content aggregate roots
        ↓
assignments, histories, requests, media, appointments, matches
        ↓
immutable events/evidence and post-commit delivery intents
```

- Cross-domain commands are coordinated by an application use case; a dependent module never updates its parent directly.
- External/provider calls never occur inside the authoritative transaction.
- `audit_logs`, `analytics_events`, and `outbox_messages` may carry logical target identifiers but do not own or foreign-key every possible aggregate.
- `public_route_reservations` owns the global URL namespace but not property/location/page/content lifecycles. The four current-route owners hold their current reservation FK; history rows hold prior reservations.
- There is no cascading hard delete across business aggregates. `ON DELETE RESTRICT` is the baseline. Pure junction rows may use `ON DELETE CASCADE` only during an explicitly authorized eventual hard purge of the parent.

## Relationship matrix

`R` means hard-delete restrict; `C*` means cascade is acceptable only for an authorized hard purge of a pure dependent/junction, never for ordinary soft deletion; `N` means `SET NULL` is acceptable because the relationship is historical/contextual rather than ownership.

| Parent → child | Cardinality | Owner of relationship | FK hard-delete rule | Parent soft delete | Parent restore |
| --- | --- | --- | --- | --- | --- |
| `user_identities` → `advisors` | 1 → 0..1 | Advisors owns optional profile link | R | disable access; profile may remain for business history | profile is not reactivated automatically |
| `user_identities` → `user_role_assignments` | 1 → 0..* | Identity/access | R | revoke/expire grants explicitly | grants remain revoked until explicit regrant |
| `roles` → `role_permissions` | 1 → 0..* | Identity/access | C* | role becomes unusable; links retained until purge | validate permissions before reuse |
| `permissions` → `role_permissions` | 1 → 0..* | Identity/access | C* | permission becomes unusable | explicit reactivation; no grant inference |
| `roles` → `user_role_assignments` | 1 → 0..* | Identity/access | R | active assignments are revoked/expired | not silently restored |
| `listing_types` → `properties` | 1 → 0..* | Properties references catalog | R | existing properties retain reference; no new assignment | validate meaning before reuse |
| `property_types` → `properties` | 1 → 0..* | Properties references catalog | R | same as listing type | same as listing type |
| `locations` → `locations` | parent 1 → 0..* children; root 0 parents | Locations | R | descendants remain explicit but are non-selectable/public policy-controlled; subtree action OD | validate entire ancestor chain; no inferred repair |
| `locations` → `properties` | 1 → 0..* | Properties owns selected location | R | affected property publication/edit transitions fail until valid | explicit property revalidation |
| `properties` → `property_state_history` | 1 → 1..* after first transition | Properties | R | history retained | no history mutation |
| `properties` → `property_slug_history` | 1 → 0..* retired routes | Properties with SEO namespace contract | R | history retained; resolver follows lifecycle policy | current route is separately revalidated |
| `public_route_reservations` → `property_slug_history` | 1 → 0..1 | SEO URL namespace | R | reservation remains permanent | only same semantic owner may reuse if policy permits |
| `public_route_reservations` → `properties.current_route_reservation_id` | 1 → 0..1 | SEO URL namespace + Properties | R | reservation retired, never reassigned | reactivate same route or allocate new one after checks |
| `properties` → `property_feature_assignments` | 1 → 0..* | Properties | C* | assignments hidden with property | retained assignments may reappear only after feature validation; detached rows stay detached |
| `property_features` → `property_feature_assignments` | 1 → 0..* | Properties consumes catalog | C* | assignment retained but feature unavailable | explicit feature revalidation |
| `properties` → `property_advisor_assignments` | 1 → 0..* | Coordinating assignment use case | R | active assignments may be ended per product policy; history retained | ended assignments never reopen automatically |
| `advisors` → `property_advisor_assignments` | 1 → 0..* | Coordinating assignment use case | R | active assignments must be ended/reassigned | explicit new assignment only |
| `properties` → `property_price_history` | 1 → 0..* | Properties | R | retained | no history mutation |
| `properties` → `media_upload_sessions` | 1 → 0..* | Property media | R | active sessions cancelled/expired | create a new session |
| `media_upload_sessions` → `property_media` | 1 → 0..1 | Property media | R | session expiry does not delete finalized media | not applicable |
| `properties` → `property_media` | 1 → 0..* | Property media owns media lifecycle | R | immediate public ineligibility; media records retained/private | each media object/hold/state revalidated; no automatic publication |
| `property_media` → `property_media_variants` | 1 → 0..* | Property media | C* | variants become delivery-ineligible, retained until purge | eligibility restored only after full checks |
| `property_media` → `media_processing_attempts` | 1 → 0..* | Property media | R | attempts retained | retry creates a new attempt |
| `properties` → `leads` | 1 → 0..*; lead → 0..1 property | Leads owns optional acquisition context | N | lead remains under retention; property context may be unavailable | no lead state change |
| `advisors` → `leads` | 1 → 0..*; lead → 0..1 advisor | Leads owns assignment | N/R by retention policy | reassign or leave historical reference | no automatic reassignment |
| `advisors` → `customers` | 1 → 0..*; customer → 0..1 advisor | Customers owns current CRM assignment | N/R by retention policy | reassign or leave restricted historical context | no automatic reassignment; exact assignment policy is Open Decision |
| `leads` → `lead_conversions` | 1 → 0..1 effective conversion (A) | Leads coordinates with Customers | R | conversion evidence retained | no reconversion |
| `customers` → `lead_conversions` | 1 → 0..* | Leads/Customers conversion use case | R | evidence retained or privacy-transformed | no automatic link change |
| `customers` → `customer_contact_points` | 1 → 0..* | Customers | C* | contact points hidden/restricted | revalidate verification, primary and duplicate rules |
| `customers` → `customer_merge_history` (source/survivor) | each 1 → 0..* | Customers | R | lineage retained under privacy policy | never unmerge implicitly |
| `customers` → `customer_requests` | 1 → 0..* | Customer requests | R | requests inactive/hidden | each request restored separately or revalidated explicitly |
| `customer_requests` → `customer_request_features` | 1 → 0..* | Customer requests | C* | features hidden | retained rows revalidated; detached rows stay detached |
| `property_features` → `customer_request_features` | 1 → 0..* | Customer requests consumes catalog | C* | requirement remains historical but cannot drive active matching | validate vocabulary |
| `customers` → `customer_activities` | 1 → 0..* | Customers | R | timeline restricted; privacy rules apply | no activity mutation |
| `customer_requests` / `leads` → `customer_activities` | each 1 → 0..*; activity optional to each | Customers timeline | N | activity remains with safe context | no automatic relink |
| `customers` → `appointments` | 1 → 0..* | Appointments | R | future appointments cancelled/reviewed by use case | conflicts/consent revalidated |
| `advisors` / `properties` / `customer_requests` → `appointments` | each 1 → 0..*; appointment optional to each | Appointments | N for contextual parents; customer R | cancellation/reassignment policy applies | never rebook automatically |
| `customer_requests` → `property_customer_matches` | 1 → 0..* | Matching | R | active matches stale/hidden | recompute from current request |
| `customers` → `property_customer_matches` | 1 → 0..* | Matching | R | active matches stale/hidden | recompute from the customer's current request; composite request/customer FK must agree |
| `properties` → `property_customer_matches` | 1 → 0..* | Matching | R | matches stale/hidden | recompute from current property |
| `property_customer_matches` → `property_customer_match_reasons` | 1 → 0..* | Matching | C* | reasons hidden | recompute; do not revive stale reasons |
| `seo_pages` → `seo_page_query_definitions` | 1 → 0..1 | SEO/content | C* | query excluded from public use | revalidate all catalogs/thresholds |
| `seo_pages` → `seo_page_features` | 1 → 0..* | SEO/content | C* | feature filters hidden | revalidate; detached filters stay detached |
| `property_features` → `seo_page_features` | 1 → 0..* | SEO/content consumes catalog | C* | page cannot rely on inactive feature | explicit editorial revalidation |
| `seo_pages` → `seo_page_slug_history` | 1 → 0..* retired routes | SEO/content | R | history retained | current route separately approved |
| `public_route_reservations` → `seo_page_slug_history` | 1 → 0..1 | SEO URL namespace | R | retained | same semantic owner only |
| `public_route_reservations` → `seo_pages.current_route_reservation_id` | 1 → 0..1 | SEO URL namespace | R | reservation retired | same route or new reservation after approval |
| `content_entries` → `content_slug_history` | 1 → 0..* retired routes | SEO/content | R | history retained | current route separately approved |
| `public_route_reservations` → `content_slug_history` | 1 → 0..1 | SEO URL namespace | R | retained | same semantic owner only |
| `public_route_reservations` → `content_entries.current_route_reservation_id` | 1 → 0..1 | SEO URL namespace | R | reservation retired | same route or new reservation after approval |
| `locations` → `location_slug_history` | 1 → 0..* retired routes | Locations + SEO contract | R | history retained | current route separately validated |
| `public_route_reservations` → `location_slug_history` | 1 → 0..1 | SEO URL namespace | R | retained | same semantic owner only |
| `public_route_reservations` → `locations.current_route_reservation_id` | 1 → 0..1 | SEO URL namespace | R | reservation retired | same route or new reservation after validation |
| `analytics_event_definitions` → `analytics_events` | 1 → 0..* | Analytics | R | definition is deprecated, not deleted | reactivation does not reinterpret old events |
| `user_identities` → `site_settings` (`updated_by`) | 1 → 0..*; setting → 0..1 actor | Platform configuration | N | setting remains; actor may be hidden | no setting mutation |

## Composite and cross-row invariants

### Location hierarchy

`locations` exposes a unique candidate key `(id, level)`. The child columns `(parent_id, parent_level)` form one composite self-FK. Row checks require:

- `level = 'CITY'` iff both parent columns are null;
- `level = 'DISTRICT'` only with `parent_level = 'CITY'`;
- `level = 'NEIGHBORHOOD'` only with `parent_level = 'DISTRICT'`;
- `parent_id <> id`.

These rules prevent invalid immediate edges. Cycle prevention beyond the fixed three-level depth is inherent because the allowed level transition always moves toward CITY; names and paths are never parsed to determine ancestry.

### Public route namespace

Current routes live on `properties`, `locations`, `seo_pages`, and `content_entries` as `current_slug` plus `current_route_reservation_id`. The reservation has a permanently unique normalized `route_key`. A route change transaction:

1. locks the aggregate and old reservation;
2. creates/resolves the new unique reservation for the expected `route_kind`;
3. copies the old slug/reservation into the corresponding slug-history table and retires the old reservation;
4. updates both current fields atomically; and
5. writes audit/outbox evidence.

History tables contain only retired routes—no `is_current` row and no `valid_to`-as-current convention. Because PostgreSQL cannot express “exactly one of four current tables or four history tables references a reservation” with ordinary foreign keys, implementation requires a reviewed deferred constraint trigger. At commit it must prove exactly one owner reference, match `route_kind` to the owner family, require current owners to reference a non-retired reservation, and history owners to reference a retired reservation. The namespace application use case still owns the transaction and useful conflict response; the mandatory database check is the final race/integrity guard. No polymorphic owner FK is added to `public_route_reservations`.

### Current state plus history

`properties.current_state` and current price columns are optimized authoritative current values. Every change appends the relevant history in the same transaction. History is not reconstructed from audit logs, and audit logs are not substituted for domain history.

### Soft delete and restore

- Soft deletion updates the aggregate state/version and public eligibility in one transaction, with audit and durable invalidation intent where required.
- Children are hidden, ended, cancelled, or retained according to the matrix; no broad soft-delete cascade is assumed.
- Restore verifies active parents, uniqueness, route ownership, privacy/hold constraints, and current authorization.
- Former assignments, grants, matches, public delivery, indexability, and publication never revive solely because `deleted_at` becomes null.

## Open decisions

- **Open Decision:** exact `ON DELETE` actions at eventual privacy/legal purge time, after retention requirements are approved.
- **Open Decision:** whether location soft deletion blocks while active descendants/properties exist or performs a reviewed subtree transition.
- **Open Decision:** appointment overlap enforcement (exclusion constraint versus application lock), advisor capacity, and tentative-status semantics.
- **Open Decision:** whether an effective lead conversion is strictly one per lead and how an audited reversal is represented.
- **Open Decision:** whether a retired route may reactivate for the same semantic aggregate. It is never reassigned to another aggregate.
