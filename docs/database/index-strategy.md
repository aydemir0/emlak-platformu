# Index strategy

**Status:** Proposed

## Purpose

Define a minimal, query-driven PostgreSQL index plan for the 44-table Phase 2 model. The plan protects integrity and known public/admin/RLS workflows without attempting to index every possible real-estate filter combination. Actual migrations must validate important queries with representative data and `EXPLAIN (ANALYZE, BUFFERS)` before claiming performance.

## Principles

- Primary-key and unique constraints create indexes; do not duplicate them.
- Index every foreign-key column used for joins, ownership checks, or parent deletion validation unless an existing composite index has that column as its usable left prefix.
- Put equality predicates first, then range predicates, then stable ordering/tie-breaker columns.
- Include `id` as the final keyset-pagination tie-breaker when the primary sort is not unique.
- Match partial-index predicates exactly to stable application queries such as `deleted_at is null` and public-eligible state.
- Use partial unique indexes for identities reusable only after soft delete; preserve permanent uniqueness for public IDs and route history that must never be reassigned.
- Use GIN/GiST only for demonstrated operators: JSON containment with governed payloads, full text when approved, and time-range exclusion.
- Do not index low-selectivity state/boolean columns alone. Combine them with the query's equality, range, or order columns.
- Keep write-heavy analytics, audit, outbox, price/state history, and activity indexes narrow.
- RLS lookup columns are first-class query columns and require indexes.
- Review redundant prefixes and write amplification before migration approval.

## Confirmed query patterns

### Public discovery

1. Resolve a normalized route to one reserved route identity.
2. Load one active property by UUID/public ID and its current route, advisor, location, ready-and-public-eligible media, features, and current price.
3. Browse active properties by curated location/listing/property-type criteria, optional bounded price range, and stable recency/publication ordering.
4. Load approved SEO pages by current route and their canonical query definition.
5. Build bounded sitemap segments by public lifecycle and last meaningful modification.

### Admin operations

1. Property review queues by state and oldest/newest update.
2. Advisor-scoped property lists and appointment calendars.
3. Media lists ordered by property and `sort_order`; failed/processing queues by state and age.
4. Lead/customer lookup by normalized contact candidate, recent activity, assignment, and lifecycle.
5. Customer requests, appointments, and matches by customer/request/property.
6. Audit and correlation investigation by target, actor, correlation ID, and time.
7. Outbox claim by due time and operations backlog by status/age.

### Background/reconciliation

1. Expired upload and processing leases.
2. R2 metadata/object reconciliation by media/object key.
3. Soft-deleted records eligible for approved purge.
4. Analytics events by event definition/version and occurrence window.

## Integrity and lookup indexes

The following are schema-design requirements. Names are conceptual and may be adjusted only without changing intent.

| Table | Keys/predicate | Kind | Supports / rationale |
| --- | --- | --- | --- |
| `user_identities` | `(auth_provider, provider_subject)` | Permanent unique | One application principal per external Auth subject; provider lookup without spreading provider IDs through the domain |
| `advisors` | `user_identity_id` | Permanent unique when present | One advisor profile per principal; offboarding cannot free an identity link for takeover/reinterpretation |
| `roles` | normalized `code` | Permanent unique | Stable authorization meaning; retired role codes are never silently reused |
| `permissions` | normalized `code` | Permanent unique | Permission meaning is stable and must not be silently reused |
| `role_permissions` | `(role_id, permission_id)` | Composite primary key | Prevent duplicate grants; role-first authorization load |
| `role_permissions` | `(permission_id, role_id)` | Secondary B-tree | Permission impact/revocation review uses reverse direction |
| `user_role_assignments` | `(user_identity_id, role_id)` where `status = ACTIVE` | Partial unique | Stable predicate for V1 global assignment uniqueness; authorization separately checks optional expiry |
| `listing_types` | normalized `code` | Permanent unique | Stable controlled vocabulary |
| `property_types` | normalized `code` | Permanent unique | Stable controlled vocabulary |
| `properties` | `public_id` | Permanent unique | Human/support identifier is immutable and never reused |
| `properties`, `locations`, `seo_pages`, `content_entries` | `current_route_reservation_id` | Unique FK per table | Each aggregate points to one globally reserved current route; the reservation's global normalized-route uniqueness is authoritative |
| `property_slug_history` | `route_reservation_id` | Unique FK | One retired property route belongs to one immutable history row |
| `public_route_reservations` | normalized `route_key` | Permanent unique | Cross-domain route collision prevention; history remains reserved |
| `location_slug_history` | `route_reservation_id` | Unique FK | One retired location route belongs to one immutable history row |
| `seo_page_slug_history` | `route_reservation_id` | Unique FK | One retired SEO-page route belongs to one immutable history row |
| `content_slug_history` | `route_reservation_id` | Unique FK | One retired content route belongs to one immutable history row |
| `locations` | `(id, level)` | Unique | Target for composite self-FK that validates parent level |
| `locations` | `(parent_id, parent_level, normalized_name)` where active | Partial unique | Prevent duplicate sibling names at a known hierarchy level |
| `locations` | `(parent_id, level, normalized_name, id)` where active | B-tree | Stable child navigation; equality parent first, normalized label next |
| `property_features` | normalized `code` | Permanent unique | Stable feature meaning for historical assignments and SEO contracts |
| `property_feature_assignments` | `(property_id, feature_id)` | Composite primary key | No duplicate feature on property; property detail load |
| `property_feature_assignments` | `(feature_id, property_id)` | B-tree | Curated feature filter uses reverse direction |
| `property_advisor_assignments` | `(property_id, advisor_id)` where active | Partial unique | No duplicate active relation |
| `property_advisor_assignments` | `(advisor_id, property_id)` where active | B-tree | Advisor work queue and RLS scope |
| `property_media` | `(property_id, sort_order)` where active | Partial unique | Stable unique active ordering |
| `property_media` | `property_id` where active and cover | Partial unique | At most one active cover per property |
| `property_media_variants` | `(property_media_id, source_version, recipe_version, width_px, format)` | Permanent unique | Immutable recipe output identity; purge evidence does not permit identity reuse |
| `media_upload_sessions` | `object_key` | Permanent unique | One server-issued quarantine object target per session; no raw capability token is persisted |
| `media_upload_sessions` | `(status, expires_at, id)` where unconsumed | Partial B-tree | Expired-session cleanup; equality status then range/order |
| `customer_contact_points` | `(channel, normalized_value)` where active | B-tree, not automatically unique | Duplicate-candidate lookup; verified/shared-contact uniqueness is Open Decision |
| `lead_conversions` | `lead_id` | Permanent unique | Conversion rows record the single effective committed conversion; failed attempts belong in audit evidence |
| `customer_requests` | `(id, customer_id)` | Unique | Composite FK target proving a match/request belongs to customer |
| `customer_request_features` | `(customer_request_id, feature_id)` | Composite primary key | No duplicate requested feature |
| `appointments` | `idempotency_key` where not null | Unique | Duplicate booking submission protection |
| `property_customer_matches` | `(property_id, customer_id, customer_request_id, rule_version, property_version, request_version, basis_fingerprint)` | Permanent unique | Identical deterministic generation is idempotent and distinguishable from later inputs |
| `property_customer_matches` | `(property_id, customer_id, customer_request_id)` where status is `PROPOSED` or `REVIEWED` | Partial unique | At most one current nonterminal generation per business tuple |
| `property_customer_match_reasons` | `(property_customer_match_id, reason_code)` | Composite primary key | Controlled, non-JSON reason set |
| `seo_page_query_definitions` | `seo_page_id` | Unique | One canonical query definition per curated page |
| `seo_page_features` | `(seo_page_id, feature_id)` | Composite primary key | No duplicate curated feature constraint |
| `analytics_event_definitions` | `(event_name, event_version)` | Permanent unique | Versioned event contract identity |
| `analytics_events` | `event_id` | Permanent unique | Producer idempotency independent of storage PK |
| `outbox_messages` | `idempotency_key` | Permanent unique | One durable effect per deterministic contract key |
| `site_settings` | normalized `setting_key` where active | Partial unique | One active typed setting per key; restore conflict is explicit |

## Public property indexes

Start with only the query families committed to the public architecture:

| Conceptual index | Keys / predicate | Query and column-order rationale |
| --- | --- | --- |
| `properties_public_location_listing_published_idx` | `(location_id, listing_type_id, published_at desc, id desc)` where `deleted_at is null and current_state = 'ACTIVE'` | Curated location + transaction-intent pages use equality on location/listing, then keyset publication order |
| `properties_public_location_type_price_idx` | `(location_id, property_type_id, price_amount_minor, id)` where `deleted_at is null and current_state = 'ACTIVE'` | Approved location/type pages with a price range: equality columns precede range; ID stabilizes cursor |
| `properties_public_listing_type_published_idx` | `(listing_type_id, property_type_id, published_at desc, id desc)` where `deleted_at is null and current_state = 'ACTIVE'` | Broader curated listing/property-type discovery without speculative facets |
| `properties_admin_state_updated_idx` | `(current_state, updated_at desc, id desc)` where active row | Review/operations queues use state equality then stable recency ordering |
| `properties_location_id_idx` | `(location_id)` | FK validation and direct joins not covered by the left prefix of a retained composite index after redundancy review |

Do not add one composite index per room count, floor, heating type, view, map bound, advisor, price band, or feature combination. Add a new filter index only after the URL/query policy approves the filter, representative plans show a problem, and the index is compared with existing prefixes. If multi-feature intersection becomes a measured bottleneck, evaluate set-based junction queries or a deliberate read projection before indexing arbitrary JSON.

## History and child-read indexes

| Table | Keys / predicate | Query |
| --- | --- | --- |
| `property_state_history` | `(property_id, occurred_at desc, id desc)` | Property timeline and transition audit |
| `property_price_history` | `(property_id, effective_at desc, id desc)` | Current/recent price and history display |
| `property_advisor_assignments` | `(advisor_id, assigned_at desc, property_id)` where active | Advisor portfolio |
| `property_media` | `(property_id, sort_order, id)` where active | Ordered gallery/detail query |
| `media_processing_attempts` | `(property_media_id, attempt_number desc)` | Media attempt history |
| `media_processing_attempts` | `(status, lease_expires_at, id)` where claimable/processing | Claim and crash recovery |
| `leads` | `(status, created_at desc, id desc)` where active | Lead triage queue |
| `leads` | `(assigned_advisor_id, status, created_at desc, id desc)` where active | Advisor-scoped lead queue and RLS lookup |
| `customers` | `(assigned_advisor_id, updated_at desc, id desc)` where active | Advisor CRM work list |
| `customer_requests` | `(customer_id, status, updated_at desc, id desc)` where active | Customer request list |
| `customer_activities` | `(customer_id, occurred_at desc, id desc)` | CRM timeline/keyset pagination |
| `appointments` | `(advisor_id, starts_at, id)` where non-cancelled and non-deleted | Advisor calendar and collision precheck |
| `appointments` | `(customer_id, starts_at desc, id desc)` where active | Customer appointment history |
| `property_customer_matches` | `(customer_request_id, status, score desc, id)` where active | Request recommendations with stable order |
| `property_customer_matches` | `(property_id, status, created_at desc, id desc)` where active | Property-side candidate list |
| `seo_pages` | `(status, updated_at desc, id desc)` where active | Editorial/SEO queue |
| `content_entries` | `(status, published_at desc, id desc)` where active | Public/editorial content list |

Every remaining foreign key receives a narrow B-tree index if it is not the left prefix of a listed primary/unique/composite index. Migration review must produce an FK-to-index coverage report rather than relying on memory.

## Appointment exclusion

V1 requires a partial GiST exclusion constraint conceptually on:

```text
advisor_id WITH equality,
half-open range [starts_at, ends_at) WITH overlap
WHERE advisor is present, row is not deleted, and status is not CANCELLED
```

This may require a supported operator extension for UUID equality and must be verified against the target Supabase/PostgreSQL environment before migration implementation. Requested appointments reserve time and there is no V1 administrator bypass. The B-tree calendar index remains useful for reads even when exclusion is enabled.

## RLS and authorization indexes

- `user_role_assignments(user_identity_id, role_id)` supports principal grant evaluation.
- `property_advisor_assignments(advisor_id, property_id)` supports advisor property scope.
- `leads.assigned_advisor_id`, `customers.assigned_advisor_id`, and `appointments.advisor_id` support scoped reads.
- Customer-owned tables begin with `customer_id` or have a composite path proven by indexed foreign keys.
- Deleted-state predicates are included in active partial indexes and must match RLS/application visibility semantics.
- If a policy requires a complex helper lookup, index the helper relation before considering privileged database functions.

RLS performance is verified with the same actor matrix as functional authorization; an index is not accepted if it makes an unsafe policy appear acceptable.

## Outbox, audit, analytics, and retention indexes

| Table | Keys / predicate | Query |
| --- | --- | --- |
| `outbox_messages` | `(next_attempt_at, created_at, id)` where pending or lease-expired eligible | Small ordered claim batches; predicate excludes processed history |
| `outbox_messages` | `(status, created_at, id)` | Backlog/age dashboard |
| `outbox_messages` | `(aggregate_type, aggregate_id, created_at desc)` | Aggregate reconciliation |
| `outbox_messages` | `(correlation_id)` | Incident trace |
| `outbox_messages` | `(processed_at, id)` where processed | Bounded retention purge |
| `audit_logs` | `(target_type, target_id, occurred_at desc, id desc)` | Target history |
| `audit_logs` | `(actor_user_identity_id, occurred_at desc, id desc)` where actor exists | Actor review |
| `audit_logs` | `(correlation_id)` | Request/incident evidence |
| `analytics_events` | `(event_definition_id, occurred_at desc, storage_id desc)` | Versioned event/time analysis |
| `analytics_events` | `(occurred_at, storage_id)` | Retention export/purge and time-window scans |

For very large append-only tables, BRIN or time partitioning is a later evidence-based decision. Do not partition at inception: it complicates unique constraints, RLS, retention, and operations. Do not index audit/analytics/outbox JSON payloads by default.

## Soft-delete uniqueness policy

Classify every identity as one of:

- **Never reusable:** property public ID, global route reservation, permission code, event definition/version, outbox idempotency key. Uniqueness includes deleted/history rows.
- **Reusable only after reviewed deletion:** site setting key and explicitly lifecycle-scoped assignment identities. Use a stable partial unique predicate and make restore conflict explicit.
- **Candidate, not identity:** normalized customer/lead email/phone. Use a non-unique candidate index until verified/shared/recycled-contact policy is approved.

Restore commands query the same unique predicate and fail without displacing the active row. RLS hides deleted rows by default but does not change database uniqueness.

## Verification checklist

- Map every proposed index to a named query, constraint, FK, or RLS predicate.
- Confirm equality/range/order column order and keyset cursor shape.
- Verify partial predicates match query/RLS expressions.
- Detect redundant indexes, including constraint-created indexes and left-prefix coverage.
- Run representative public, admin, RLS, reconciliation, and purge queries with realistic data distribution.
- Measure insert/update cost for media ordering, events, audit, price history, and outbox.
- Test deep pagination with keyset cursors; do not use offset for unbounded operational lists.
- Re-review indexes when the approved filter allowlist, lifecycle states, or access matrix changes.

## Open Decisions

- Approved public filter/query families and their traffic/selectivity expectations.
- Customer contact uniqueness rules after normalization and verification policy are defined.
- Appointment buffer duration, any future multi-advisor scheduling model, and GiST extension availability. Same-advisor overlap prevention is locked.
- Whether full-text, spatial, JSON containment, BRIN, or partitioning is justified by measured requirements.
- Retention volumes that may require partitioning or specialized purge indexes.
