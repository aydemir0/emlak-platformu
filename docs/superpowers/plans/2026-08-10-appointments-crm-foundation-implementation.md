# Phase 9 appointment/viewing CRM implementation plan

## Status

Packages A–D are implemented and verified. Package E finalizes documentation,
verification, and PR preparation. This plan records the delivered boundaries;
it does not authorize future provider or scheduler work.

## Shared guardrails

- Preserve merged Phase 8 lead CRM behaviour.
- Use local `emlak-platformu` Supabase only for future database validation; no
  remote Supabase or R2 mutation is authorized.
- Follow TDD: focused failing test, smallest implementation, then refactor.
- Preserve forced deny-by-default RLS, no `anon` CRM grants, server-side
  authorization, correlation IDs, audit/outbox atomicity, and PII minimization.
- Do not add queue/event bus, provider integration, customer conversion, public
  portal, export, delete, or restore workflows.

## Package B — Schema and domain foundation — complete

**Estimated scope:** reviewable expand/migrate/contract migration sequence,
generated types, lifecycle/errors, repository contracts, and focused DB/domain
tests.

**Dependency:** Package A design plus approved legacy-row/backfill strategy. If
existing rows cannot safely gain a lead, stop before tightening constraints.

1. Add lead-owned fields, `appointment_events`, event idempotency/correlation,
   and query-driven indexes.
2. Preserve/replace the GiST constraint so `REQUESTED` and `CONFIRMED`
   half-open advisor intervals cannot overlap.
3. Reconcile appointment RLS from customer to trusted lead/advisor scope;
   preserve forced RLS and add no general bypass helper.
4. Regenerate database types only from the local CLI output.
5. Add pgTAP/domain tests for constraints, lifecycle, RLS, append-only events,
   and typed version/availability errors.

**Evidence:** local reset/migration, focused pgTAP, generated-type no-drift,
focused tests, typecheck, and diff check.

## Package C — Staff commands and read models — complete

**Estimated scope:** application use cases, thin delivery adapters, SSR
`/admin/appointments` and `/admin/appointments/{id}`, plus lead-detail
appointment/timeline projection.

**Dependency:** Package B schema, types, lifecycle, and RLS.

1. Implement create/read/list/confirm/reschedule/cancel/complete/no-show and
   admin-only assignment/reassignment with authoritative property/lead checks
   and optimistic versions.
2. Atomically write appointment/event/audit/outbox records; make exact command
   retries idempotent and map typed conflict/denial/transition outcomes.
3. Build bounded list/detail repositories with advisor/date/status/property/lead
   plus upcoming/past filters and pagination; prove no N+1 path.
4. Add minimal operational UI with loading/empty/error/conflict states. UI owns
   no authorization, lifecycle, or availability rule.
5. Test admin/advisor scopes, IDOR, reassignment denial, terminal/stale state,
   concurrent overlap, timeline single-write, and relation redaction.

**Evidence:** focused unit/integration/database tests, typecheck, lint/format,
build of affected routes where supported, and diff check.

## Package D — Outbox and reminder boundary — complete

**Estimated scope:** provider-independent appointment intent producer/consumer
contract, scheduled outbox semantics, focused worker tests; no provider or
scheduler runtime.

**Dependency:** Package B outbox-compatible schema and Package C commands.

1. Emit PII-minimized appointment intents only after a successful commit.
2. Reuse Phase 8 atomic claim/lease/retry/idempotency; provider calls remain
   outside transactions.
3. Re-read versioned appointment eligibility before a future delivery boundary;
   suppress stale rescheduled/cancelled reminders.
4. Test concurrent claim, lease reclaim, retry/non-retry failure, success
   idempotency, correlation preservation, stale suppression, and isolation.

**Evidence:** focused integration tests with no real outbound network call.

## Package E — Final verification and documentation — in progress

**Estimated scope:** reconcile docs to implementation, full verification, and
PR preparation only after B–D have approval and completion.

**Dependency:** Packages B–D.

1. Reconcile requirements, ADR, database/RLS/retention docs, and this plan.
2. Run full unit/integration/DB checks, generated type drift, typecheck, lint,
   format, production build, applicable Playwright, secret/remote-reference
   scan, and diff check.
3. Verify exclusions; do not broaden to providers, conversion, or public booking.

## Approval gates and open decisions

Package B must not begin without explicit approval of the schema proposal and
legacy data strategy. Packages C–E each require their own approval. Open
decisions are maintained in
[the requirements specification](../../requirements/appointment-viewing-crm-foundation.md).
