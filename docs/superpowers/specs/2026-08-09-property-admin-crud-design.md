# Property Admin CRUD Design

**Status:** Approved for Phase 5 implementation review
**Date:** 2026-08-09

## Goal

Deliver a production-oriented property aggregate, application use cases, transactional PostgreSQL repository, and minimal admin CRUD surface without implementing media upload, CRM, leads, appointments UI, public property pages, SEO landing pages, analytics, email, or production observability adapters.

All database work in this phase is restricted to the isolated local Supabase project `emlak-platformu`. Hosted or linked Supabase mutation is prohibited.

## Architectural boundaries

The dependency direction is:

```text
admin page / Server Action
  -> transport validation and request context
  -> property application use case
  -> property domain rule
  -> repository and authorization ports
  -> local PostgreSQL infrastructure adapter
```

React components render state and collect input only. Server Actions remain thin and cannot contain lifecycle, authorization, pricing, assignment, or transaction rules. Domain and application modules do not import Next.js, Supabase, PostgreSQL, or React types.

The PostgreSQL adapter uses a server-only direct connection because the local Data API is intentionally disabled and a multi-table authoritative mutation cannot be assembled safely from independent REST writes. Phase 5 accepts only a local database URL whose host is loopback and whose port is `55322`; support for any hosted database requires a separate explicit approval and environment design.

## Property schema refinement

One additive migration introduces `heating_types` as the forty-fifth canonical table. It contains no seed rows and uses the same minimal reference-data lifecycle as `listing_types` and `property_types`:

- UUID primary key with `gen_random_uuid()`;
- normalized unique `code`;
- nonblank `label`;
- optional bounded `description`;
- `active` or `inactive` status;
- standard timestamps, optimistic version, and nullable soft-delete timestamp.

`properties.heating_type_id` is nullable and references `heating_types.id` with explicit `ON UPDATE RESTRICT ON DELETE RESTRICT`. The foreign key receives a query-supporting index. Heating is not represented through `property_features`, and no heating vocabulary is hardcoded or seeded.

The same additive migration adds the Phase 5 property facts that have provider-independent meaning:

| Column                | Type and nullability     | Database invariant                                                                                    |
| --------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `short_description`   | nullable text            | nonblank when present; bounded in authoritative validation                                            |
| `gross_area_sqm`      | nullable `numeric(12,2)` | non-negative                                                                                          |
| `net_area_sqm`        | nullable `numeric(12,2)` | non-negative and no greater than gross area when both exist                                           |
| `living_room_count`   | nullable small integer   | non-negative                                                                                          |
| `building_age_years`  | nullable small integer   | non-negative                                                                                          |
| `floor_number`        | nullable small integer   | negative values remain representable; display semantics are open                                      |
| `total_floor_count`   | nullable small integer   | non-negative                                                                                          |
| `furnished`           | nullable boolean         | null means not supplied, not false                                                                    |
| `address_line`        | nullable text            | nonblank when present; treated as operationally sensitive                                             |
| `latitude`            | nullable `numeric(9,6)`  | `-90..90`; paired with longitude                                                                      |
| `longitude`           | nullable `numeric(9,6)`  | `-180..180`; paired with latitude                                                                     |
| `location_visibility` | nullable text            | normalized and nonblank when present; writes remain disabled until the product vocabulary is approved |

The existing `floor_area_sqm` is retained for backward compatibility and is not silently reinterpreted as gross or net area. No low-selectivity indexes are added for furnishing, visibility, counts, or area fields. Existing `location_id` remains the single authoritative hierarchy reference; city, district, and neighborhood are loaded through the `locations` parent chain rather than duplicated or inferred from strings.

The canonical table contract and schema tests change deliberately from 44 to 45 tables. Generated TypeScript types are regenerated only from the isolated local database after the new migration passes on a clean local reset.

## Domain model and lifecycle

The property aggregate exposes only the Phase 2 states:

`DRAFT`, `REVIEW`, `ACTIVE`, `RESERVED`, `SOLD`, `RENTED`, `PASSIVE`, and `ARCHIVED`.

Every unlisted transition and every self-transition returns `PROPERTY_INVALID_TRANSITION`. State transitions require expected version and current state; stale callers return `PROPERTY_CONFLICT`. Ordinary edits use an expected-version conditional write. State-changing commands lock the aggregate and write state history in the same transaction.

The application layer provides:

- `createPropertyDraft`
- `updateProperty`
- `changePropertyPrice`
- `assignAdvisor`
- `submitPropertyForReview`
- `publishProperty`
- `unpublishProperty`
- `reserveProperty`
- `markPropertySold`
- `markPropertyRented`
- `archiveProperty`
- `softDeleteProperty`
- `restoreProperty`

Publication uses an injected readiness policy and fails closed when canonical routing, required reference data, location, commercial facts, advisor assignment, media eligibility, or other approved publication facts are missing. Phase 5 does not invent a slug, public-ID format, media exemption, or publication completeness rule.

Soft deletion is separate from lifecycle state, is ADMIN-only, removes the record from default admin/public reads, and writes audit plus durable invalidation intent. Restore is ADMIN-only, conflict-checked, and returns the aggregate to `DRAFT`; it does not revive prior assignments, publication, reservation, or media eligibility.

## Authorization

Authorization runs inside every use case using trusted database-backed identity, role, permission, advisor, and active assignment records.

- ADMIN requires an active ADMIN role, the action permission, and AAL2. ADMIN may perform all Phase 5 property commands.
- ADVISOR requires an active ADVISOR identity and an active assignment to the target property.
- ADVISOR publish/unpublish additionally requires `properties.publish`.
- ADVISOR cannot soft-delete or restore.
- Caller-supplied advisor, identity, role, permission, or ownership fields never establish scope.

The route proxy remains only a coarse authentication gate. RLS remains deny-by-default, but the direct privileged repository must reproduce application authorization before database writes and keep its query surface narrow.

## Transaction contracts

Each command is one application-level transaction:

- Create draft: property, optional initial primary assignment when an approved assignment role is supplied, initial audit, and idempotency evidence.
- Update property: expected-version update and audit; matching inputs are marked stale where required by the Phase 3 schema.
- Price change: current price/version, append-only `property_price_history`, audit, and durable invalidation outbox intent.
- Assignment: lock property and open assignments in stable order, close/open intervals, update version, and audit.
- Lifecycle change: property state/version, append-only `property_state_history`, audit, and required outbox intent.
- Delete/restore: deletion metadata or restored DRAFT state, version, audit, and invalidation/reconciliation intent.

Provider calls and framework cache invalidation occur only after commit. Outbox messages use deterministic, PII-free idempotency keys and bounded payloads. Raw PostgreSQL or Supabase errors are mapped to stable application errors.

## Read model and admin delivery

The admin routes are:

- `/admin/properties`
- `/admin/properties/new`
- `/admin/properties/[id]`

The list is server-rendered and executes one bounded page query plus one count query. It supports page, state, listing type, advisor, location, search, and allowlisted sort inputs. The row projection contains status, current price, resolved location, current primary advisor, `updated_at`, and actions without per-row queries.

Reference data is loaded from active, non-deleted database rows. Empty property-type or heating catalogs render explicit empty states and block draft submission that needs the missing reference; they never fall back to hardcoded values. Location selectors use the stored CITY -> DISTRICT -> NEIGHBORHOOD hierarchy.

The create/edit forms use shadcn primitives, accessible labels, keyboard-operable controls, authoritative server-side Zod validation, and a normal draft-save command. Client dirty-state protection may warn about unsaved changes but is not authoritative autosave. Media remains a non-interactive informational placeholder.

## Error contract

Phase 5 adds these stable error codes:

- `PROPERTY_NOT_FOUND`
- `PROPERTY_FORBIDDEN`
- `PROPERTY_INVALID_TRANSITION`
- `PROPERTY_CONFLICT`
- `PROPERTY_VALIDATION_FAILED`
- `PROPERTY_REFERENCE_DATA_MISSING`

Delivery adapters translate these codes to safe UI outcomes. Provider messages, SQL details, stack traces, internal authorization predicates, and deleted-record existence are not returned to users.

## Verification

Tests cover the complete transition table, invalid/self transitions, ADMIN/ADVISOR permissions, AAL2, cross-assignment IDOR, forged advisor fields, stale versions, deleted rows, price-history atomicity, audit/outbox/history rollback, soft delete/restore, paginated list query shape, reference-data empty states, Server Action validation, unauthenticated admin access, and browser smoke behavior.

Repository integration tests and migration/pgTAP tests run only against the isolated `emlak-platformu` local database. Final validation includes lint, formatting, strict typecheck, unit/integration tests, production build, Playwright, npm audit, secret scan, remote-reference scan, and `git diff --check`.

## Open Decisions

- Human-facing `public_id` issuance and display format. Phase 5 may accept an explicit server-generated UUID value but cannot invent a branded sequence.
- Canonical slug normalization, collision suffix, and admin editing UX. Publication remains fail-closed without an existing valid route reservation.
- Location visibility vocabulary and exact public redaction behavior. The column remains nullable and non-editable until approved.
- Floor display semantics for basement, ground, garden, mezzanine, and roof levels. Storage remains a nullable signed number without invented labels.
- Advisor assignment-role vocabulary and cardinality beyond the existing one-active-primary assumption. The application accepts only an approved supplied role; the UI does not invent options.
- Exact publication completeness checklist, media minimum, approval/dual-control rule, and whether selected transitions require recent authentication beyond ADMIN AAL2.
- Sold/rented/archive public URL and sitemap behavior, exact retention periods, and broader reservation/deal aggregates.

These decisions may limit which UI commands can complete, but they must not be bypassed with placeholder semantics.
