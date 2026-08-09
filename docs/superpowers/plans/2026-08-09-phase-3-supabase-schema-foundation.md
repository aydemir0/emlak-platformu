# Phase 3 Supabase schema foundation implementation plan

**Goal:** Implement the approved 44-table Phase 2 model as reviewable Supabase/PostgreSQL migrations with enforceable integrity, closed-by-default grants, staff RLS, minimal reference data, and clean-database verification.

**Architecture:** PostgreSQL remains the authoritative integrity boundary. Migrations are split by dependency and concern: compatibility/extensions, tables, constraints/indexes, invariant functions/triggers, authorization/RLS/grants, and reference data. Provider-facing access stays closed until a later explicit exposure migration.

**Target baseline:** PostgreSQL 17 on current hosted Supabase, with an explicit PostgreSQL 15 minimum preflight for `security_invoker` compatibility. Only Supabase-supported `pgcrypto`, `btree_gist`, and test-only `pgtap` are used.

## Task 1: Initialize the local Supabase project and write failing contracts

- Create `supabase/config.toml` with the Supabase CLI.
- Add pgTAP contracts under `supabase/tests/database/` for the 44-table inventory, UUID defaults, RLS, grants/policies, required seed rows, key constraints, appointment overlap, and route ownership.
- Run the contracts before migrations and retain the expected red result as test-first evidence.

## Task 2: Implement schema and relational integrity

- Add a version/extension preflight migration.
- Create all 44 public tables in dependency-safe order with `gen_random_uuid()` UUID keys, `bigint` minor-unit money, `timestamptz`, lifecycle checks, soft-delete metadata where specified, and explicit foreign-key actions.
- Add candidate keys, partial unique indexes, foreign-key indexes, measured query indexes, and the same-advisor appointment exclusion constraint.

## Task 3: Implement database-enforced cross-row invariants

- Add narrow trigger functions for mutable metadata/versioning, append-only records, route ownership, media ordering/cover safety, and other Phase 2 invariants that cannot be expressed as row checks.
- Use deterministic lock order and fail closed; avoid provider or application business logic in generic helpers.

## Task 4: Implement authorization, RLS, grants, and reference data

- Add private, minimum-privilege, safe-`search_path` authorization helpers derived from trusted database role/permission records.
- Enable and force RLS on all 44 tables; define no `anon` policies; define staff policies consistent with ADMIN and scoped ADVISOR rules.
- Revoke Data API table access from `anon` and `authenticated` by default; retain policies as a defense-in-depth contract for later explicit grants.
- Seed only ADMIN, ADVISOR, SATILIK, KIRALIK, and the explicit advisor publish permission code.

## Task 5: Document and validate

- Add `docs/database/implementation-notes.md` with ordering, compatibility, rollback, exposure, and unresolved legal/product decisions.
- Start Docker Desktop and run a clean local `supabase db reset`.
- Run pgTAP tests and introspection checks for table count, constraints, indexes, RLS/policies, grants, functions, triggers, and seed data.
- Run repository validation and diff checks.

## Task 6: Publish for review

- Review only the intended Phase 3 files.
- Commit to `agent/supabase-schema-foundation`, push, and open a Draft PR.
- Do not merge the PR.
