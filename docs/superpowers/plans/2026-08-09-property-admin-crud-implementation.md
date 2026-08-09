# Property Admin CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task by task and `superpowers:test-driven-development` for every behavior change.

**Goal:** Deliver the Phase 5 property domain and secure admin CRUD foundation described in the approved design, with atomic history/audit/outbox writes and local-only Supabase validation.

**Architecture:** Keep property rules in the domain and application layers. Server Actions authenticate and translate form input, application use cases authorize and coordinate transactions, and a server-only PostgreSQL adapter implements persistence against the RLS-protected schema. Public/admin UI reads purpose-built projections and owns no lifecycle or authorization rules.

**Tech Stack:** Next.js App Router, TypeScript strict mode, React 19, Zod, PostgreSQL/Supabase, `pg`, Vitest, pgTAP, Playwright.

## Global Constraints

- The approved Phase 5 design is the source of truth.
- Use only local Supabase project `emlak-platformu` on ports `55321-55327`; never link to or mutate a remote Supabase project.
- Keep the heating vocabulary empty and do not invent location-visibility, assignment-role, publication-readiness, slug, or public-id product semantics.
- Add schema changes in one new additive migration; do not rewrite merged migrations.
- Preserve one transaction for authoritative property mutation, history, audit, and outbox effects.
- Use optimistic version checks for ordinary edits and deterministic row locking for lifecycle commands.
- Keep Server Actions thin and prevent database/service credentials from entering client bundles.
- Execute each task as red test, minimal green implementation, then refactor without changing behavior.

---

## Task 1: Add the canonical 45th entity and Phase 5 property fields

**Files:**

- Create: `supabase/migrations/20260809220000_heating_types.sql`
- Create: `supabase/migrations/20260809220001_property_admin_fields.sql`
- Create: `supabase/migrations/20260809220002_property_lifecycle_alignment.sql`
- Create: `supabase/tests/database/0008_property_admin_foundation.test.sql`
- Modify: `supabase/tests/database/0002_canonical_schema.test.sql`
- Modify: `src/types/database.generated.ts`
- Modify: `src/types/database.contract.ts`
- Modify only affected entity-count/reference sections under `docs/database/`

**Red:** Add pgTAP assertions for `heating_types`, its empty seed state, RLS/constraints/FK behavior, Phase 5 columns, coordinate pairing/ranges, area checks, and the exact 45-table contract. Confirm they fail before the migration exists.

**Green:** Add the empty reference table and nullable `properties.heating_type_id` in a small dedicated migration, add approved nullable facts/checks separately, and align the existing database trigger with the already-approved lifecycle graph without rewriting merged migrations. Use explicit `ON UPDATE RESTRICT ON DELETE RESTRICT`, narrowly useful indexes, RLS enable/force, and minimum-privilege policies/grants consistent with existing reference tables. Update the canonical contract deliberately from 44 to 45.

**Refactor/verify:** Reset only the local `emlak-platformu` database, run every pgTAP test, regenerate checked-in database types from that local schema, and prove no unapproved seed row exists.

## Task 2: Establish the property domain model and lifecycle

**Files:**

- Create: `src/domain/properties/property.ts`
- Create: `src/domain/properties/property-lifecycle.ts`
- Create: `src/domain/properties/property-validation.ts`
- Create: `src/domain/properties/property.test.ts`
- Create: `src/domain/properties/property-lifecycle.test.ts`

**Red:** Test the complete approved transition graph, rejection of self/unlisted transitions, price and paired-value invariants, nullable heating, disabled location-visibility writes, and canonical error codes.

**Green:** Implement immutable domain types, validation helpers, and a pure lifecycle transition function with no React, Next.js, Supabase, or PostgreSQL imports.

**Refactor/verify:** Remove duplicate predicates and keep failure mapping deterministic.

## Task 3: Define transaction and authorization contracts

**Files:**

- Create: `src/application/properties/property-ports.ts`
- Create: `src/application/properties/property-contracts.ts`
- Create: `src/application/properties/authorize-property-command.ts`
- Create: `src/application/properties/authorize-property-command.test.ts`
- Modify: `src/application/errors/application-error.ts`

**Red:** Cover ADMIN AAL2 enforcement, inactive staff denial, ADVISOR active-assignment scope, explicit publish permission, and advisor denial for delete/restore. Include a cross-advisor IDOR case that exposes no property details.

**Green:** Define a unit-of-work port, trusted authorization facts, command DTOs, and a pure authorization decision function. Map all denials to typed application errors.

**Refactor/verify:** Keep role/permission facts database-derived and make authorization reusable by every use case without a general bypass helper.

## Task 4: Implement draft creation and ordinary edits

**Files:**

- Create: `src/application/properties/create-property-draft.ts`
- Create: `src/application/properties/update-property.ts`
- Create: `src/application/properties/change-property-price.ts`
- Create: `src/application/properties/assign-property-advisor.ts`
- Create: `src/application/properties/property-use-cases.test.ts`

**Red:** Test validation, missing references, ADMIN and scoped ADVISOR paths, cross-advisor denial, stale expected-version conflicts, idempotency, and exact atomic writes for price history/audit/outbox.

**Green:** Implement the four use cases against the transaction port. Generate an unbranded UUID `public_id`, keep `location_visibility` unwritable, and never partially commit authoritative or derived records.

**Refactor/verify:** Share transaction metadata and event construction while leaving business decisions visible.

## Task 5: Implement lifecycle, deletion, and restoration commands

**Files:**

- Create: `src/application/properties/change-property-state.ts`
- Create: `src/application/properties/property-lifecycle-use-cases.ts`
- Create: `src/application/properties/property-lifecycle-use-cases.test.ts`

**Red:** Cover all named commands, invalid transitions, optimistic conflicts, locking intent, required reservation/closing evidence, fail-closed publication readiness, ADMIN/ADVISOR publish boundaries, soft-delete/restore ADMIN-only rules, and atomic state-history/audit/outbox effects.

**Green:** Implement `submitPropertyForReview`, `publishProperty`, `unpublishProperty`, `reserveProperty`, `markPropertySold`, `markPropertyRented`, `archiveProperty`, `softDeleteProperty`, and `restoreProperty` as named wrappers over the shared lifecycle coordinator.

**Refactor/verify:** Ensure restore returns to `DRAFT` without reviving assignments or other soft-deleted relationships.

## Task 6: Build the server-only PostgreSQL adapter

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Modify: `src/config/env.ts`
- Create: `src/infrastructure/postgres/pool.server.ts`
- Create: `src/infrastructure/properties/postgres-property-unit-of-work.server.ts`
- Create: `src/infrastructure/properties/postgres-property-read-repository.server.ts`
- Create: `tests/integration/property-use-cases.integration.test.ts`

**Red:** Against local port `55322`, test successful atomic commands, rollback on derived-write failure, stale update rejection, row-lock lifecycle behavior, cross-advisor denial, empty heating references, and query-count expectations for list/detail projections.

**Green:** Add `pg`, validate a loopback-only `LOCAL_DATABASE_URL`, use parameterized SQL, transactions, deterministic locks, exact version predicates, and batched projection queries. Keep the module `server-only` and refuse non-local database hosts.

**Refactor/verify:** Centralize row mapping and transaction metadata, then rerun unit and integration suites.

## Task 7: Add thin Server Actions and minimal admin pages

**Files:**

- Create: `src/features/properties/property-form-schema.ts`
- Create: `src/features/properties/property-actions.server.ts`
- Create: `src/features/properties/property-queries.server.ts`
- Create: `src/features/properties/components/property-form.tsx`
- Create: `src/features/properties/components/property-list.tsx`
- Create: `src/app/admin/properties/page.tsx`
- Create: `src/app/admin/properties/new/page.tsx`
- Create: `src/app/admin/properties/[id]/page.tsx`
- Create: `src/app/admin/properties/loading.tsx`
- Create: `src/app/admin/properties/error.tsx`
- Create: `src/app/admin/properties/not-found.tsx`
- Create: `src/features/properties/property-actions.test.ts`

**Red:** Test schema coercion and safe error envelopes, authentication forwarding, use-case delegation, expected-version handling, empty heating/property-type states, and absence of business transition logic in UI/actions.

**Green:** Implement authenticated thin actions and server-rendered list/create/edit screens. Fetch list/count together, fetch reference data in batches, and render no fake property data.

**Refactor/verify:** Confirm client components receive only serializable public-safe data and no privileged import is reachable from client modules.

## Task 8: Complete browser coverage, security review, and branch delivery

**Files:**

- Create or modify: `tests/e2e/property-admin.spec.ts`
- Modify: `.github/workflows/quality-gate.yml` only if required for the new local-independent tests
- Modify: project documentation only where Phase 5 behavior is now implemented

**Red/green:** Add smoke coverage for unauthenticated admin denial and authenticated fixture-independent empty-state rendering where the existing test harness permits it. Do not weaken auth to make browser tests convenient.

**Verification:** Run dependency install, lint, typecheck, unit tests, integration tests, clean local migration reset plus pgTAP, generated-type drift check, production build, Playwright smoke, server-only leakage check, secret scan, and `git diff --check`. Review the full diff for lifecycle, authorization, history/audit/outbox atomicity, N+1 queries, and remote Supabase references.

**Delivery:** Commit cohesive changes, push `agent/property-admin-crud`, create or update a Draft PR, and do not merge it.
