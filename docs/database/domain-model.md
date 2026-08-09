# Database domain model

## Purpose and scope

This document defines the provider-neutral relational domain model for the first, single-organization release. It is a design artifact, not executable DDL. PostgreSQL is authoritative for business state and media metadata; R2 is authoritative only for bytes. The exact 44-entity catalog is in [Entity catalog](entity-catalog.md), column-level detail is in [Schema draft](schema-draft.md), ownership and lifecycle coupling are in [Relationships](relationships.md), and diagrams are in [ERD](erd.md).

The design follows [domain boundaries](../architecture/domain-boundaries.md), [media architecture](../architecture/media-architecture.md), [SEO architecture](../architecture/seo-architecture.md), and ADRs [002](../decisions/ADR-002-supabase-postgresql.md), [003](../decisions/ADR-003-cloudflare-r2-media-storage.md), [004](../decisions/ADR-004-public-url-seo-taxonomy.md), [006](../decisions/ADR-006-authentication-authorization.md), [007](../decisions/ADR-007-event-outbox-strategy.md), and [009](../decisions/ADR-009-future-multi-tenancy-boundary.md).

## Global modeling rules

- **Decision — single organization:** V1 serves one organization. No `organization_id` or `tenant_id` is added, and V1 has no multi-tenancy. A future tenancy change requires an ADR and end-to-end migration.
- **Assumption — identifiers:** aggregate/business records use UUID primary keys. Pure junctions use composite primary keys unless another entity must reference the relationship or it has an independent lifecycle.
- **Assumption — time:** instants are `timestamptz` interpreted as UTC; business-calendar dates are `date`.
- **Decision — money:** monetary values are `bigint` minor units paired with an uppercase three-letter currency code. No floating point is used.
- **Assumption — evolving states:** lifecycle/state/type fields use `text` plus checks. PostgreSQL enums are deferred to avoid migration coupling.
- **Assumption — lifecycle metadata:** mutable business aggregates normally carry `created_at`, `updated_at`, `version`, and `deleted_at`. Immutable events/history and pure junctions document their exceptions.
- **Assumption — authority:** domain contracts contain no Supabase, R2, Resend, GA4, Sentry, or Vercel types. Provider identifiers and object keys are boundary metadata.
- **Assumption — deletion:** business records are soft-deleted by default. Immutable history, audit, analytics, and completed attempt records are retained or privacy-erased under a policy; they are not casually mutated.
- **Decision — delete/restore authorization:** V1 business-record soft delete and restore require `ADMIN`. Advisor lifecycle operations such as end, detach, cancel, dismiss, or deactivate are not delete/restore authority.
- **Assumption — JSON:** `jsonb` is used only for versioned, bounded payloads or genuinely evolving configuration. Known queried relationships remain relational.
- **Assumption — authorization:** application use cases authorize action plus object from trusted state. RLS is a deny-by-default second boundary on every exposed/client-accessible relation.

## Bounded contexts and aggregate roots

| Context | Aggregate roots / authoritative records | Dependent records |
| --- | --- | --- |
| Identity and access | `user_identities`, `advisors`, `roles`, `permissions`, `user_role_assignments` | `role_permissions` |
| Property inventory | `properties`, `locations`, `listing_types`, `property_types`, `property_features` | state/slug/price histories, feature/advisor assignments |
| Property media | `media_upload_sessions`, `property_media` | variants and processing attempts |
| CRM | `leads`, `customers`, `customer_requests` | conversions, contact points, merge history, request features, activities |
| Scheduling and matching | `appointments`, `property_customer_matches` | match reasons |
| SEO and content | `seo_pages`, `content_entries`, `public_route_reservations` | query definitions, SEO features, and retired slug histories |
| Analytics, audit, integration | event definitions, `analytics_events`, `audit_logs`, `outbox_messages`, `site_settings` | none |

`properties` are listing aggregates in V1. They own commercial and publication state. They do not own location hierarchy, media binaries, advisor identity, or SEO editorial policy.

## Core invariants

### Identity and access

- `user_identities` maps a stable application principal to one external authentication subject. The provider subject is integration metadata, not a foreign key used throughout the domain.
- V1 staff roles are exactly `ADMIN` and `ADVISOR`. Roles bundle controlled permissions; user-role assignment is the trusted current-grant source, and absence of an explicit grant denies access.
- Advisor profiles are optional business profiles linked one-to-zero-or-one to an identity. Disabling identity access does not delete advisor or historical business records.
- V1 has no customer or other public account. Public accounts are deferred to V2 and no identity-to-customer authorization relationship is introduced in V1.
- Admin MFA is mandatory before production. Advisor MFA is optional at launch; recent-authentication, offboarding service levels, and the precise permission bundles/object scopes remain Open Decisions.

### Properties, taxonomy, and location

- A property has one listing type, one property type, and one explicit location. `public_id` is stable and distinct from all slugs.
- Property state changes, prices, and slugs are recorded as append-only histories; the current columns on `properties` support bounded authoritative reads and must agree with the latest history after a successful transition.
- Locations form one explicit typed hierarchy. The composite self-reference `(parent_id, parent_level)` points to `(id, level)`. Checks enforce `CITY` roots, `DISTRICT -> CITY`, and `NEIGHBORHOOD -> DISTRICT`; names or slugs are never used to infer ancestry.
- Features are controlled vocabulary. Property-feature assignments use a composite identity and cannot outlive active public visibility merely because either parent is restored.
- **Open Decision:** whether a property represents a physical asset, a listing occurrence, or a V1 blend; relisting/history rules depend on this choice.
- **Open Decision:** exact property lifecycle, listing/property vocabularies, required facts by property type, cover-image rule, advisor assignment semantics, and public treatment of sold/rented/withdrawn/expired records.

### Media

- Upload sessions authorize one bounded quarantine upload; they do not grant readiness or publication.
- A media record progresses through explicit technical states. Only `ready`, non-deleted, visible media belonging to a public-eligible property may be delivered.
- PostgreSQL stores authoritative keys, checksums, dimensions, attempts, recipe versions, and lifecycle timestamps. It never infers readiness from R2 object presence.
- Variants are immutable and versioned. Processing attempts are append-only operational evidence. Old attempts cannot publish over a newer source/recipe version.
- R2 stores media bytes. Public responsive variants are immutable, versioned, and generated in WebP and AVIF.
- **Open Decision:** approved input formats, exact responsive recipes/fallbacks, size/dimension limits, malware controls, processing runtime, retry/lease policy, restore windows, legal retention periods, and hard delivery-revocation SLO.

### CRM, requests, appointments, and matching

- Leads, customers, and customer requests are separate lifecycles. A conversion explicitly links a lead to a customer and preserves acquisition history.
- Customer contact points normalize email/phone values for deduplication while retaining display values. Access, merge, export, deletion, and erasure are sensitive and audited.
- A customer may hold multiple requests; each request has its own status, criteria, consent/purpose context, and feature requirements.
- Appointments link the relevant customer and optionally a property/request/advisor. For appointments with an advisor, overlapping half-open time ranges are forbidden across every non-`CANCELLED`, non-deleted row; `REQUESTED` reserves time and there is no V1 administrator bypass.
- Matches link a property to a customer request and record explainable reasons. They never become authoritative availability, pricing, or qualification decisions.
- **Open Decision:** deduplication/merge policy, lawful-basis and consent evidence, configurable retention/erasure periods, appointment buffer duration/future multi-advisor scheduling, and whether automated matches require staff review.

### SEO and content

- SEO pages are curated records with one bounded query definition, explicit approval/publication state, canonical slug, and indexability policy. Arbitrary filter combinations never become records automatically.
- `properties`, `locations`, `seo_pages`, and `content_entries` each hold `current_slug` plus `current_route_reservation_id`. Their slug-history tables contain retired routes only. `public_route_reservations.route_key` is permanently globally unique across all four families. A mandatory deferred database constraint verifies exactly one type-consistent current-or-history owner at commit, protecting collisions and ambiguous ownership without a polymorphic owner FK.
- A route change reserves the new normalized path, moves the old slug/reservation to the owning history table, retires that old reservation, and updates the aggregate current-route pair in one transaction. Every old slug/route resolves with permanent `301` directly to its semantic owner's current canonical route, without redirect chains.
- The V1 canonical property-detail taxonomy is `/satilik|kiralik/{city}/{district}/{property-type}/{slug}`. Every retired property slug/route resolves with a permanent `301` redirect to the current canonical route.
- SEO page features constrain a curated query by controlled vocabulary; location constraints are explicit IDs in the query definition, never strings.
- Content entries are editorial aggregates with independent publication and slug history. Verified domain facts remain owned by their source domains.
- **Open Decision:** slug normalization details, facet allowlist, inventory/content thresholds, pagination policy, and lifecycle behavior when no equivalent current property route exists.

### Analytics, audit, outbox, and settings

- Analytics definitions version event contracts. Analytics events are append-only, PII-minimized observations and never authoritative business state.
- Audit logs are append-only evidence with safe bounded change summaries; normal application roles cannot update or delete them.
- Outbox messages are transactional delivery intents claimed with a recoverable lease and delivered at least once. Payloads contain references/minimum data, not secrets or raw PII.
- Site settings contain controlled, versioned operational configuration. Secrets and credentials are prohibited.
- **Open Decision:** event dictionaries, retention, consent, audit evidence detail, outbox scheduling/lease/replay policy, and which settings are database-owned rather than deployment configuration.

## Transaction and consistency boundaries

- A state change, its required history row, audit evidence, and necessary outbox intent commit atomically.
- External calls and cache invalidation happen after commit. At-least-once consumers use stable idempotency keys.
- Human-edited aggregates use optimistic `version` checks. Contended order, conversion, appointment, slug, and outbox-claim invariants use narrow locks and database constraints where needed.
- Restore is an `ADMIN`-only use case. It revalidates identifiers and current parents, and never silently revives assignments, public delivery, publication, or stale permissions.
- Public reads always constrain current publication, deletion, media readiness/eligibility, and SEO indexability from authoritative state.

## Deliberate extension points, not V1 schema

No organization/tenant table, physical-asset/listing split, spatial geometry, generalized workflow engine, event-sourcing framework, broker, search service, or provider-specific type is introduced. Each needs evidence and, where costly to reverse, an ADR.

## Canonical 44-table inventory

- Identity/access: `user_identities`, `advisors`, `roles`, `permissions`, `role_permissions`, `user_role_assignments`.
- Property/location/catalog: `listing_types`, `property_types`, `properties`, `property_state_history`, `property_slug_history`, `locations`, `property_features`, `property_feature_assignments`, `property_advisor_assignments`, `property_price_history`, `location_slug_history`.
- Media: `media_upload_sessions`, `property_media`, `property_media_variants`, `media_processing_attempts`.
- CRM: `leads`, `lead_conversions`, `customers`, `customer_contact_points`, `customer_merge_history`, `customer_requests`, `customer_request_features`, `customer_activities`.
- Scheduling/matching: `appointments`, `property_customer_matches`, `property_customer_match_reasons`.
- SEO/content/routes: `seo_pages`, `seo_page_query_definitions`, `seo_page_features`, `seo_page_slug_history`, `content_entries`, `content_slug_history`, `public_route_reservations`.
- Analytics/audit/integration/configuration: `analytics_event_definitions`, `analytics_events`, `audit_logs`, `outbox_messages`, `site_settings`.
