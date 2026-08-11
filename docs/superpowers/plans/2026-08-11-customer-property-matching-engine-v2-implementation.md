# Phase 10 deterministic matching engine V2 implementation plan

## Status

Package A is complete design only. Every later package needs explicit approval.
No remote Supabase/R2 mutation is authorized.

## Shared guardrails

- Keep matching deterministic, integer/fixed-point only, explainable, and
  advisory; do not add AI, vectors, embeddings, or automatic conversion.
- Keep UI/delivery thin. Domain owns scoring; application owns authorization,
  bounded transactions, idempotency, and persistence; infrastructure owns SQL.
- Preserve existing request/property version, stale-generation, audit, RLS, and
  PII-minimization contracts. Do not expose matching to anonymous actors.
- TDD each rule and run only the verification appropriate to the approved
  package. No background recompute worker or notification provider in Phase 10.

## Package B — score engine and exhaustive unit tests

**Scope:** provider-free profile/property projection types, `matching-v2`
integer rules, stable reason codes, score breakdown, deterministic comparator,
typed validation/error outcomes, and exhaustive table-driven tests.

**Depends on:** Package A only; no database migration or UI.

**Evidence:** red-first unit tests for all specification matrix cases, typecheck,
lint/format, and diff check.

## Package C — schema expansion, candidate repository, and application service

**Scope:** reviewed expand-first preference-mode/net-area migration, generated
types, request/property candidate query, batched feature loading, candidate-limit
error, authorization/RLS reconciliation, atomic versioned result/reason writes,
and focused database/integration tests.

**Depends on:** Package B and explicit schema approval. The migration must make
no semantic backfill guess and preserve existing customer requests/matches.

**Evidence:** local clean reset, pgTAP/RLS tests, generated-type repeatability,
query-count/limit tests, stale/concurrency/idempotency tests, typecheck, and
scoped lint/format.

## Package D — staff CRM matching read model and explanations

**Scope:** bounded server-rendered customer-request matching view, refresh
command, safe score breakdown/reasons, empty/error/conflict states, and advisor
scope/IDOR coverage. No public personalized route and no business rules in
React.

**Depends on:** Package C.

**Evidence:** focused unit/integration and browser smoke tests; admin/advisor
scoping, no PII/notes/address leakage, pagination/query bounds, and build.

## Package E — analytics boundary, final verification, and documentation

**Scope:** PII-minimized internal event contract if approved, documentation
reconciliation, full affected verification, migration/type drift checks, and PR
preparation. No analytics provider or worker implementation.

**Depends on:** Packages B–D.

**Evidence:** full relevant tests, local database verification when available,
typecheck, lint, formatting, build, secret/remote-reference scans, and diff
check.

## Completion note

Packages B through D are implemented. Package C uses the approved additive
profile migration and a stale-only trigger migration; Package D adds the
server-rendered `/admin/customer-requests/[id]` matching workflow. No worker,
notification, customer portal, or automatic recalculation is included.

## Deferred decisions

See the Phase 10 requirements specification for candidate limit/SLO, future
location/area semantics, `avoid` policy, refresh triggering, and retention.
