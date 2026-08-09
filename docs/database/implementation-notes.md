# Phase 3 database implementation notes

## Purpose

These notes map the approved Phase 2 model to the first executable Supabase/PostgreSQL schema. The migrations implement database structure and security contracts only; they do not add application runtime, API exposure, storage integration, generated application types, or product workflows.

## Target and compatibility

- Local development uses Supabase CLI 2.113.0 and PostgreSQL 17, matching the current CLI's hosted-compatible local baseline.
- The first migration fails explicitly below PostgreSQL 15 because later use of `security_invoker` views must not be assumed on older servers. Phase 3 creates no view yet.
- `pgcrypto` and `btree_gist` are enabled from Supabase's supported extension catalog. `pgtap` is test-only.
- UUID primary keys use `gen_random_uuid()`. Money uses non-negative `bigint` minor units plus a three-letter uppercase currency code. Business instants use `timestamptz`.

## Migration ordering

1. Compatibility preflight, private schema, and required extensions.
2. Forty-four canonical tables in foreign-key-safe order.
3. Candidate keys, partial uniqueness, exclusion constraints, route taxonomy, FK indexes, and dominant query indexes.
4. Mutable metadata, append-only, lifecycle, matching, media-cover, and route-owner invariants.
5. Trusted database authorization helpers, RLS, defensive policies, and closed grants.
6. Minimal V1 reference data.

The migrations are normal ordered forward migrations. They intentionally do not attempt universal idempotency.

## Authorization and exposure

- All 45 tables have RLS enabled and forced. There are no `anon` policies.
- `authenticated` represents staff only. Role and permission decisions come from `user_identities`, active role assignments, roles, and permissions—not mutable user metadata.
- ADMIN policy access requires the trusted ADMIN role and Supabase Auth AAL2. This makes admin MFA a database access prerequisite; production Auth configuration and enrollment remain a deployment gate.
- ADVISOR policies are limited to active property assignments and the customer's assigned advisor. Publish/unpublish additionally requires `properties.publish`. Delete/restore, export, audit, and role management have no advisor policy.
- Narrow authorization lookups are `SECURITY DEFINER`, use `search_path = ''`, are executable only by `authenticated`, and expose boolean/identifier decisions rather than general SQL bypass.
- Supabase `service_role` remains reserved for trusted server/worker use. No new service-role bypass function exists.
- The local Data API is disabled and `anon`/`authenticated` receive no public base-table privileges. A future reviewed migration must grant only an explicit table or preferably a `security_invoker` projection when an endpoint is actually required.

## Integrity highlights

- Same-advisor non-cancelled appointments use a half-open `tstzrange` GiST exclusion constraint; there is no V1 overlap bypass.
- Property route keys enforce `/satilik|kiralik/{city}/{district}/{property-type}/{slug}` and permanent reservations support 301 history.
- A deferred commit-time trigger requires each route reservation to have exactly one owner of the matching kind and matching current/retired state.
- Media variants are immutable versioned WebP/AVIF records. Active media ordering and cover uniqueness are database constrained; a deferred check rejects an active media set without exactly one cover.
- State/price/slug/customer activity/conversion/audit/analytics history is append-only where Phase 2 requires it.
- Matching inputs are versioned; parent changes mark current match generations stale in the same transaction. The application command must still follow the documented deterministic parent-lock order when computing a new generation.

## Rollback and recovery

These foundational migrations are rolled back by restoring a database snapshot or applying a separately reviewed forward corrective migration. Production down-migrations that drop the schema are intentionally absent. Local `db reset` is permitted only against the isolated `emlak-platformu` namespace.

## Open decisions retained

- Exact legal retention, erasure, backup, and legal-hold durations remain configurable/open pending jurisdictional advice.
- Public/customer accounts remain V2; no customer identity link is implemented.
- V1 remains single organization; no tenant key or tenant policy is introduced.
- Product vocabularies and workflows that Phase 2 marked proposed—including property types, heating, feature catalog, detailed appointment types, CRM statuses, and broader deal/transaction management—are not seeded or expanded.
- Public Data API projections and their exact grants remain a future explicit decision.
- Generated TypeScript types are deferred until an application package and stable type output location exist; schema introspection is validated in this phase.
