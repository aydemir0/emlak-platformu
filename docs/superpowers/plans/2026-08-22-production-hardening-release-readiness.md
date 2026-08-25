# Production Hardening and Release Readiness Implementation Plan

> **For agentic workers:** Execute one package at a time. Use the repository's
> relevant project skills and verification-before-completion discipline. Stop
> at every review gate and obtain explicit approval before push, deployment,
> remote Supabase access, or production infrastructure mutation.

**Goal:** Convert the Package A audit into a production-ready, evidence-backed
release candidate without feature expansion.

**Architecture:** Preserve the existing modular monolith and dependency
direction. Harden composition, configuration, delivery, persistence, and
operations boundaries while keeping deterministic business rules in domain and
application layers. Treat Supabase, R2, Vercel, Resend, GA4, and Sentry as
external trust boundaries whose identities and behavior must be verified.

**Tech stack:** Next.js, TypeScript, PostgreSQL/Supabase, Supabase Auth,
Cloudflare R2, Vercel, Tailwind CSS, shadcn/ui, Resend, GA4, Sentry, Vitest,
pgTAP, Playwright, GitHub Actions.

**Spec:** `docs/requirements/production-hardening-release-readiness.md`

## Global constraints

- Do not add product features or change approved domain behavior.
- Never place provider calls inside database transactions.
- Preserve forced RLS, least privilege, object authorization, AAL rules,
  append-only audit/history behavior, and server-only secret boundaries.
- Use production-like local or isolated staging resources for mutation tests.
- Production verification is read-only unless a separately approved controlled
  write defines exact records, recipients, time window, and cleanup authority.
- Do not deploy, push, merge, or touch remote Supabase without explicit user
  approval for that action.
- At every task boundary run the smallest relevant tests, inspect the diff, and
  create the specified focused commit only after checks pass.

---

## Package B: Baseline, configuration, and CI foundations

### Task B1: Establish a cross-platform text-format contract — complete

**Files:**

- Create: `.gitattributes`
- Modify: `.prettierignore` only if generated artifacts are proven to need an
  explicit exclusion
- Test: repository-wide tracked text EOL inventory

**Steps:**

1. Record `git ls-files --eol` output and separate CRLF checkout conversion from
   genuine Prettier differences.
2. Add explicit LF rules for source, configuration, migrations, workflows, and
   Markdown while preserving binary file handling.
3. Normalize tracked text in a controlled checkout; inspect every semantic diff
   and exclude unrelated formatting changes from this commit.
4. Run `npm run format:check`, `git diff --check`, typecheck, and tests affected
   by any semantic formatting correction.
5. Commit: `chore: normalize repository formatting baseline`.

**Result:** `npm run format:check` initially identified 149 files. All were
working-tree CRLF drift against LF index content; the formatter produced no
tracked content delta. Commit `dc981e1` adds only `.gitattributes`, preserves
binary files, and restores the repository-wide gate without source or generated
file rewrites.

### Task B2: Separate local and production server configuration — complete

**Files:**

- Modify: `src/config/env.server.ts`
- Modify: `src/infrastructure/postgres/pool.server.ts`
- Modify: `.env.example`
- Test: `src/config/env.unit.test.ts`

**Interfaces:**

- Add validated `APP_ENV`, `APP_BASE_URL`, and `APP_RELEASE` values.
- Add a production-capable `DATABASE_URL` with required PostgreSQL protocol and
  TLS policy.
- Retain `LOCAL_DATABASE_URL` and its loopback/port guard for local workflows.
- Make environment selection explicit; never silently fall back from production
  to a local URL.
- Validate R2 configuration as an all-or-none group and require it in production.

**Steps:**

1. Add failing tests for local/production selection, missing values, invalid
   origins, non-TLS production connection configuration, and secret-safe errors.
2. Implement the smallest typed configuration and pool factory change.
3. Replace local-only naming at call sites without changing repository behavior.
4. Run focused tests, `npm run typecheck`, `npm run test:types`, and `npm run lint`.
5. Commit: `fix: support validated production server configuration`.

**Result:** 33 focused parser cases prove valid local/test/preview/production,
safe local/test defaults, canonical origin/release identity, environment-specific
database selection, TLS/placeholder/loopback rejection, R2/Supabase identity
guards, and credential-safe errors. The pool is a trivial consumer of the
tested selected `DATABASE_URL`, so no duplicate implementation-structure test
was added.

### Task B3: Harden the Quality workflow and release identity — complete

**Files:**

- Modify: `.github/workflows/quality.yml`
- Modify: `.gitignore`
- Update: the three Phase 12 requirements/decision/plan records

**Steps:**

1. Pin third-party Actions to reviewed commit SHAs while retaining version
   comments, and document the update owner and cadence.
2. Add concurrency cancellation per pull request/branch and preserve minimal
   permissions.
3. Add a secret-scanning gate with documented false-positive review ownership.
4. Preserve the repository-wide format, audit, Supabase reset/pgTAP/type-drift,
   lint, type, unit, build, and Playwright gates.
5. Record the implemented contract and remaining deployment-owner decisions in
   the Phase 12 documents.
6. Validate workflow syntax locally and obtain the real workflow result only
   after a separately approved push/PR; Package B does not push.
7. Commit with Package B configuration: `feat: harden production environment
configuration`.

**Result:** checkout/setup-node/Gitleaks use reviewed immutable release SHAs,
superseded runs are cancelled, the full-history secret scan is separate from
the unchanged Quality job, and CI uses only test identity/local resources.
Dependabot and the operations release checklist remain later owner/runbook work;
no update authority or deployment workflow was invented.

**Package B review gate:** Confirm LF behavior on Windows and Linux, production
configuration fail-fast tests, exact Quality workflow results, and no provider
mutation. Stop for approval before Package C.

---

## Package C: Security and observability hardening

**Implementation status (2026-08-23):** Local implementation is complete with
documented concerns; no Package C commit, deployment, remote mutation, SQL, or
dependency change was made. The original steps below remain the decision record;
the result notes distinguish implemented controls from Package D/E deferrals.

### Task C1: Apply a consistent request, error, and logging boundary

**Result:** Complete locally. Bounded canonical request/correlation IDs,
canonical `APP_ENV`/`APP_RELEASE`, fail-closed structured redaction, stable safe
errors, and sanitized runtime diagnostics are implemented. Telemetry remains a
conditional no-op absent an approved Sentry/provider transport.

**Files:**

- Modify: `src/application/observability/logger.ts`
- Modify: request-context helpers and delivery composition roots identified by
  `rg "correlation|requestId|create.*Action" src`
- Test: logger redaction, identifier validation, and safe error mapping tests

**Steps:**

1. Add failing tests for unbounded/untrusted identifiers, secret/PII redaction,
   stable public error codes, and unexpected internal failures.
2. Generate or accept only bounded validated correlation identifiers at the
   delivery boundary and propagate them through use cases and persistence.
3. Emit structured events with `APP_ENV` and `APP_RELEASE`; keep raw secrets,
   contact data, free text, and stack traces out of public responses.
4. Replace catch-all redirects that disguise dependency failure with an
   observable safe boundary while preserving unauthenticated redirects.
5. Run focused tests, typecheck, test:types, lint, and build.
6. Commit: `feat: establish production request observability boundaries`.

### Task C2: Harden browser and indexing policy

**Result:** Complete locally. Document CSP uses a per-request nonce with no
`script-src 'unsafe-inline'`; sources are narrow, including only the exact
validated virtual-hosted R2 presigned PUT origin when configured. Production-only
HSTS has no preload or subdomain scope; private robots/admin noindex controls
are present. Actual external HTTPS/R2 verification remains Package E.

**Files:**

- Modify: `next.config.ts`
- Create: `src/app/robots.ts`
- Modify: admin layout metadata boundary
- Test: header and robots behavior tests

**Steps:**

1. Inventory scripts, styles, images, connections, and frames used by current
   routes and approved providers.
2. Add tests for HSTS in production, frame/type/referrer/permissions policy,
   admin `noindex`, and robots exclusion of private routes.
3. Remove `unsafe-inline` from script policy using the framework-supported nonce
   or hash path validated against the production build. Narrow `connect-src` to
   approved origins.
4. Verify public SSR, JSON-LD, authentication, and browser tests under the final
   CSP.
5. Commit: `fix: harden browser security and crawl boundaries`.

### Task C3: Split liveness from dependency readiness

**Result:** Complete locally with operations wiring deferred. Liveness is public
and dependency-free; readiness is a minimal, coalesced DB-only read probe with
bounded response time and safe envelopes. Workers emit PII-free aggregate
summaries and enforce bounded poison/lease behavior, but scheduler/runtime
reporter, provider, alert, dashboard, and runbook wiring remain Package E.

**Files:**

- Modify: `src/app/api/health/route.ts`
- Create: dependency readiness service and tests in the application layer
- Create: `docs/operations/health-and-alerting.md`

**Steps:**

1. Define a cheap liveness response and a separately authenticated or minimally
   disclosed readiness response.
2. Test timeout-bounded database/config checks, degraded behavior, `no-store`,
   correlation headers, and absence of secret details.
3. Wire release metadata and document alert thresholds, responder, and manual
   verification commands.
4. Run route tests, typecheck, lint, build, and Playwright health smoke.
5. Commit: `feat: add dependency-aware production health checks`.

### Task C4: Bound public intake and upload abuse

**Result:** Complete locally with authorized deferrals. Preview/production lead
intake fails closed when the challenge is unavailable; honeypot/body limits,
untrusted forwarding-header handling, durable DB rate control, media body/decode/
MIME/key/batch/encoded-output controls, authentication-before-matching expense,
the 500 candidate cap, and safe direct-ID mappings are implemented. Trusted
proxy/provider wiring, DB rate-query/index measurement, persisted upload quotas,
and matching cooldown policy remain Package E/D decisions.

**Files:**

- Modify: public lead intake challenge adapter and composition
- Modify: media upload authorization/application policy
- Add: focused database/application tests and migration only if measured storage
  state is required

**Steps:**

1. Record the approved challenge provider or deterministic operational fallback,
   trusted proxy chain, actor/property quotas, and bypass policy.
2. Add failing tests for forged forwarding headers, burst limits, replay,
   challenge failure, upload count/byte quotas, and privileged override audit.
3. Implement server-side enforcement with safe errors and structured audit
   events; retain MIME/decode/pixel/page validation.
4. Validate accessibility and a provider-outage fallback that fails according to
   the approved abuse-risk policy.
5. Commit: `fix: enforce production intake and upload abuse controls`.

**Package C review gate:** Local security tests, CSP browser verification,
readiness failure behavior, redaction evidence, and abuse-limit regressions have
passing task-report evidence. This is not a full release-gate pass: final C4
DB-backed integration and sitemap-prerender build checks are environment blocked
without local PostgreSQL/Supabase, and `npm audit` is registry-blocked under the
no-remote boundary. Any RLS, auth, secret, or PII regression blocks progression.
Package D/E deferrals remain required; stop for approval before Package D.

---

## Package D: Database, query, and worker reliability

### Task D1: Rehearse migrations and prove RLS/grants

**Files:**

- Create: `docs/operations/database-migration-rehearsal.md`
- Add: pgTAP tests under `supabase/tests/` for grants, forced RLS, default
  privileges, and critical role/object matrices
- Modify: migrations only when a rehearsal exposes a concrete defect

**Steps:**

1. Restore sanitized production-like volume into an isolated environment.
2. Record per-migration runtime, table/index lock level, scan/rewrite behavior,
   disk headroom, compatibility window, and forward-fix path.
3. Exercise anonymous, advisor, admin, and service identities against properties,
   media, leads, activities, appointments, customers, requests, matches, and
   conversions.
4. Run clean reset, all pgTAP tests, generated-type diff, and application
   integration tests.
5. Commit tests/runbook and any separately reviewed fix with focused messages.

### Task D2: Add only measured indexes

**Files:**

- Add: one timestamped migration per coherent measured index set
- Add: pgTAP index/behavior assertions where stable
- Update: migration rehearsal evidence

**Steps:**

1. Capture `EXPLAIN (ANALYZE, BUFFERS)` for lead abuse counting, public listing,
   property media lateral reads, appointment windows, matching stale/anti-join,
   and verified-contact lookup at production-like cardinality.
2. Prioritize the lead abuse composite `(abuse_network_signal, created_at)` only
   when the recorded plan confirms the current scan risk.
3. Use concurrent production index creation or an approved maintenance-window
   method compatible with the migration runner; document transaction limits.
4. Record storage and write-amplification cost and reject redundant indexes.
5. Re-run plans, pgTAP, reset, type generation, integration tests, and lock
   rehearsal.
6. Commit: `perf: add measured release-critical database indexes`.

### Task D3: Bound release-critical reads and writes

**Files:**

- Modify: sitemap repository/delivery composition
- Modify: matching result reads
- Modify: property media and admin reference reads where recorded volume exceeds
  the approved budget
- Test: pagination, stable ordering, maximum result, and overflow behavior

**Steps:**

1. Establish budgets for sitemap entries, matches/reasons, media per property,
   reference catalogs, and admin pagination.
2. Add cursor pagination or segmentation with deterministic ordering and explicit
   maximums. Return deliberate overflow/error behavior instead of truncating
   silently.
3. Segment sitemap output and keep only canonical active records indexable.
4. Run query plans, focused tests, typecheck, lint, build, and SEO browser checks.
5. Commit: `perf: bound production query and sitemap workloads`.

### Task D4: Bound worker retries and recovery

**Files:**

- Modify: lead notification and appointment reminder batch policies
- Modify: persistence claim/failure transitions and migration if additional
  durable scheduling state is required
- Test: retry, lease expiry, poison message, dead-letter, replay, and concurrency

**Steps:**

1. Define per-worker attempt limit, exponential backoff with bounded jitter,
   lease duration, dead-letter reason, replay authorization, and alert threshold.
2. Add deterministic clock/randomness tests and concurrent claimant tests.
3. Preserve `FOR UPDATE SKIP LOCKED`, idempotency keys, stale lease recovery, and
   provider-call separation from database transactions.
4. Rehearse crash-before-send, send-before-acknowledge, provider timeout, and
   malformed payload paths.
5. Commit: `fix: bound worker retries and poison-message handling`.

**Package D review gate:** Migration and rollback evidence, RLS matrix tests,
measured query plans, workload bounds, and worker recovery tests pass in an
isolated environment. Stop for approval before Package E.

**Package D local completion record (2026-08-25):** A clean local Supabase
reset and 121 pgTAP assertions pass. The measured lead abuse-window index moves
the representative query from 380 buffers/2.041 ms to an index-only plan at 3
buffers/0.039 ms (6 buffers/0.033 ms after clean reset). Sitemap pages, matching
result reads, matching generation writes, worker batch/lease inputs, and no-op
stale invalidation are bounded with focused regressions. Production migration
rehearsal and all provider/scheduler/smoke/operations proof remain Package E;
no remote action is authorized.

---

## Package E: Production wiring and operational proof

### Task E1: Establish the public media delivery contract

**Files:**

- Modify: public media URL construction/composition
- Add: application route or documented CDN-origin binding selected by the
  approved architecture decision
- Create: `docs/operations/r2-media-operations.md`
- Test: CORS, cache, private-prefix denial, immutable delivery, and removed-media
  behavior

**Steps:**

1. Record the approved R2 bucket, custom domain/origin, CORS origins, cache
   policy, credential scope, and environment separation without secret values.
2. Serve only `delivery/properties/`; deny public quarantine and original
   prefixes. Keep variant paths immutable and recipe-versioned.
3. Test the real browser origin for upload CORS and public responsive image
   delivery in staging.
4. Add reconciliation dry-run, prefix allowlist, grace period, expected-count,
   maximum-delete, and explicit-confirmation guards to the runbook/tool boundary.
5. Commit: `feat: wire secure public property media delivery`.

### Task E2: Add authenticated production worker entrypoints

**Files:**

- Add: scheduler entrypoints at the approved Vercel or worker delivery boundary
- Modify: server environment schema for `CRON_SECRET` and worker batch budgets
- Create: `docs/operations/worker-operations.md`
- Test: authentication, overlap, timeout, lease recovery, and safe response

**Steps:**

1. Select and record the scheduler owner, frequency, concurrency, timeout,
   region, and failure notification path.
2. Require constant-time authenticated invocation and reject browser/user
   sessions from worker endpoints.
3. Wire lead, appointment, media-processing, and media-reconciliation workers
   independently with bounded batches and kill switches.
4. Enable one worker family at a time in staging; capture metrics and rehearse
   stop/restart/dead-letter replay.
5. Commit: `feat: add authenticated production worker execution`.

### Task E3: Wire approved provider adapters

**Files:**

- Add: Resend, Sentry, and GA4 adapters/configuration only for approved contracts
- Add: provider contract tests and staging smoke fixtures
- Update: `.env.example` and operations documentation without secret values

**Steps:**

1. Obtain decisions for notification recipients, sender/domain, nonproduction
   suppression, Sentry project/retention/scrubbing, GA4 consent, and environment
   isolation before writing adapters.
2. Implement provider interfaces at infrastructure boundaries; keep domain and
   application rules provider-neutral.
3. Use deterministic idempotency, redaction, timeout, retry classification, and
   no-real-recipient test modes.
4. Verify staging delivery/telemetry and provider outage behavior using isolated
   records.
5. Commit one provider family per reviewable change.

### Task E4: Build the minimum release smoke suite

**Files:**

- Add: Playwright specs and isolated fixtures under `tests/e2e/`
- Add: seed/cleanup helpers that refuse unapproved production targets
- Update: CI workflow for isolated smoke execution

**Scenarios:**

1. Public property, responsive media, canonical/noindex, lead intake, replay
   protection, and CRM visibility.
2. Authenticated CRM appointment followed by explicit conversion into customer
   and customer request with provenance and audit verification.
3. Matching V2 deterministic ordering, overflow behavior, and stale-result
   invalidation.
4. Property admin media upload/process/reorder/remove lifecycle and public
   delivery visibility.

**Steps:**

1. Use dedicated test identities and deterministic records in CI and staging.
2. Verify both UI outcome and authoritative database invariants.
3. Make cleanup idempotent and scoped to unique run identifiers; never hard
   delete business history unless the environment policy explicitly permits it.
4. Separate production read-only checks from separately approved controlled
   writes.
5. Commit: `test: add production release smoke coverage`.

### Task E5: Complete operations, backup, and privacy runbooks

**Files:**

- Create: `docs/operations/backup-restore.md`
- Create: `docs/operations/production-release-runbook.md`
- Create: `docs/operations/incident-response.md`
- Update: `docs/database/retention-deletion.md`

**Steps:**

1. Record accountable owners, Supabase backup/PITR capability, RPO/RTO, restore
   destination isolation, encryption/access, evidence retention, and escalation.
2. Perform an isolated restore rehearsal and verify schema, counts, critical
   relationships, RLS/grants, login, lead/customer provenance, appointments,
   matching, and media references.
3. Resolve legal retention, erasure, legal-hold, provider deletion, backup expiry,
   and tombstone replay decisions for all identified PII stores.
4. Document exact deploy order, postchecks, worker kill switches, compatible app
   rollback, forward database fix, media preservation, and incident roles.
5. Commit: `docs: add production operations and recovery runbooks`.

**Package E review gate:** Staging provider identities, media delivery, worker
operations, smoke suite, restore rehearsal, privacy ownership, alerts, and
rollback drill have evidence. Stop for explicit approval before Package F.

---

## Package F: Final verification and release signoff

### Task F1: Re-run the complete release evidence matrix

**Files:**

- Create: `docs/operations/release-evidence/<candidate-sha>.md`
- Update: requirements/ADR only if an approved decision changed

**Steps:**

1. Freeze the candidate SHA and verify a clean tree, reviewed diff, dependency
   audit, secret scan, repository-wide format, lint, type checks, all tests,
   production build, and browser suite.
2. Run isolated database reset, all pgTAP tests, generated-type diff, migration
   rehearsal, RLS/grant matrix, and restore rehearsal for the candidate.
3. Verify environment/resource identities, TLS/DNS/canonical origin, R2
   CORS/delivery/privacy, provider staging behavior, health, logs, alerts,
   worker dashboards, runbooks, and rollback controls.
4. Execute staging smoke and approved production read-only smoke. Attach exact
   evidence; do not infer a pass from partial checks.
5. Enumerate every remaining P0/P1/P2 item. Reject all P0. Require owner,
   approver, compensating control, expiry, and remediation date for any accepted
   P1; require owner/date for P2.

### Task F2: Human go/no-go and controlled release

**Steps:**

1. Present candidate SHA, checks, migration/restore evidence, smoke results,
   remaining risks, deploy sequence, and rollback decision points to the named
   approver.
2. Stop. Do not deploy, migrate, enable workers, change traffic, merge, push, or
   touch remote Supabase until the user explicitly authorizes the specific next
   action.
3. If release is authorized in a later task, execute only the approved step and
   report its evidence before proceeding to the next human gate.

**Package F completion gate:** No P0 blockers, approved handling of every P1/P2,
all required evidence tied to the immutable candidate, and explicit human
approval. A green Package F audit is readiness evidence, not deployment
authorization.
