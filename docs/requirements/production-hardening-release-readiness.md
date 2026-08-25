# Production Hardening and Release Readiness

## Status and scope

Phase 12 Package A audit, 2026-08-22. This document defines the release
contract for the existing modular monolith. It does not authorize a production
deployment, remote Supabase change, feature expansion, or infrastructure
mutation.

The audited baseline is `main` at
`2b344273b0f642b6e5ff8eb947120f34e9756e94`. Evidence came from the checked-in
application, all 18 migrations, database tests, generated types, GitHub Quality
workflow, configuration schemas, provider adapters, and operational
documentation. Provider dashboards and production resources were not inspected;
configuration described only in documents is not treated as wired.

## User-visible outcome

A release candidate is eligible for explicit human deployment approval only
after it proves that the existing property, media, public SEO, lead CRM,
appointment, matching, and conversion workflows operate as one secure,
observable, recoverable system. Phase 12 adds no new business capability.

## Architecture and trust boundaries

The production unit remains one Next.js modular monolith backed by PostgreSQL.
The observed dependency direction is coherent:

```text
browser
  -> Next.js pages, route handlers, and Server Actions
  -> application use cases and inward-facing ports
  -> provider-independent domain rules

infrastructure adapters
  -> application/domain ports
  -> PostgreSQL, Supabase Auth, R2, and future provider clients
```

No runtime domain or application module imports Next.js, React, PostgreSQL,
Supabase, R2, Sharp, or provider SDKs. Delivery modules compose concrete
infrastructure adapters, which is the intended composition boundary. A few
application-layer unit tests import the deterministic media adapter; this is
test composition, not a runtime dependency inversion violation.

The critical trust boundaries are:

- anonymous browser to public property and lead-capture delivery;
- authenticated browser cookie to Supabase session verification;
- verified Supabase subject to an active PostgreSQL staff identity and role;
- Server Action/route input to application authorization and validation;
- application use case to privileged PostgreSQL connection;
- browser upload grant to private R2 quarantine;
- database outbox or media claim to external worker/provider execution;
- public database projection to SEO pages and public media delivery;
- release operator to Vercel, Supabase, R2, DNS, email, analytics, and error
  tracking control planes.

### Architecture audit result

The modular boundaries are `ACCEPTED`. There is no evidence-backed reason to
split services or introduce a queue platform. Production release is currently
blocked by missing runtime/operations wiring rather than domain architecture.

| Severity | Finding                                                                           | Evidence and release treatment                                                                                                                                                                                                                                   |
| -------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BLOCKER  | The PostgreSQL pool cannot accept a production connection.                        | `env.server.ts` requires `LOCAL_DATABASE_URL` to be loopback port `55322`, and every PostgreSQL adapter calls `getLocalDatabasePool()`. Package B must introduce a production-only database contract with TLS/pool constraints while preserving local isolation. |
| BLOCKER  | Public R2 variants have no delivery binding.                                      | Public markup emits `/delivery/properties/...`, but no route, rewrite, CDN origin, or deployment mapping serves that prefix. Release must prove immutable public variants resolve while originals and quarantine remain private.                                 |
| BLOCKER  | Backup/restore ownership and proof do not exist.                                  | Architecture documents contain expectations only; there is no operations runbook, named owner, RPO/RTO, or restore rehearsal evidence.                                                                                                                           |
| HIGH     | Background workflows are libraries without production entrypoints.                | Lead outbox, appointment reminders, media processing, and reconciliation have claim/retry code but no cron, scheduled endpoint, worker process, provider consumers, or manual runbook.                                                                           |
| HIGH     | Observability is a proposed design, not a runtime capability.                     | Correlation helpers and a redacting logger exist, but no production sink, request lifecycle integration, Sentry adapter, release metadata, job metrics, alert route, or incident runbook exists.                                                                 |
| MEDIUM   | Delivery modules construct correlation/request identifiers inconsistently.        | Several actions accept unbounded request headers or create fresh IDs independently instead of using one validated request context.                                                                                                                               |
| ACCEPTED | Domain/application dependency direction is inward.                                | Runtime imports preserve provider-independent domain and application code.                                                                                                                                                                                       |
| ACCEPTED | Critical mutations use explicit application services and PostgreSQL transactions. | Property, lead intake, appointments, matching, media, and conversion use cases delegate persistence and concurrency to adapters.                                                                                                                                 |

## Security hardening audit

### Authentication and authorization

- Supabase session identity is verified server-side through `getClaims()`; the
  client is not trusted to supply a staff identity or role.
- The Supabase subject is resolved to one active PostgreSQL identity with one
  active `ADMIN` or `ADVISOR` role. Ambiguous/missing staff resolution fails
  closed.
- `ADMIN` principals require AAL2; advisors currently permit AAL1.
- Admin routes refresh sessions at the proxy and re-resolve the staff principal
  in the server layout. Object-scoped repositories and use cases independently
  enforce ADMIN/assigned-ADVISOR rules.
- Direct identifiers are UUID-validated at route/action boundaries where UUIDs
  are expected. Unauthorized/not-found behavior is generally non-enumerating.
- The admin layout currently converts every principal-resolution failure,
  including dependency failure, into a redirect. Package C must preserve
  non-enumeration while distinguishing authentication denial from an observable
  dependency outage.

### Security findings

| Severity | Finding                                                                                 | Required treatment                                                                                                                                                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HIGH     | CSP permits `'unsafe-inline'` scripts and permits connections to all HTTPS/WSS origins. | Package C must use a per-request nonce or an equivalently restrictive tested Next.js CSP and an allowlisted `connect-src`. Keep style exceptions only where framework output proves necessary.                                                                            |
| HIGH     | No production HSTS strategy is implemented.                                             | Emit HSTS only on the confirmed HTTPS production host, with a reviewed max-age and subdomain/preload decision.                                                                                                                                                            |
| HIGH     | Public lead challenge verification is an always-allow placeholder.                      | Retain the current database-backed, HMAC-network rate limit, but add a deployable abuse-control decision and trusted-proxy header contract before public traffic. Do not claim bot protection exists until wired.                                                         |
| HIGH     | Upload initialization/processing has no actor quota or rate limit.                      | Add bounded active-upload and request-rate controls before release; keep the existing 15 MiB, format, pixel, edge, and single-page limits.                                                                                                                                |
| HIGH     | Critical worker failures have no alerting or operator visibility.                       | Dead-letter count, oldest due age, retry count, media failed/lease age, and last successful run require metrics/logs and an owned alert route.                                                                                                                            |
| MEDIUM   | Correlation and request headers are not uniformly validated/bounded.                    | Centralize UUID validation and generation and persist only bounded canonical IDs.                                                                                                                                                                                         |
| MEDIUM   | Some Server Actions rely on framework error handling instead of stable safe mapping.    | Map unexpected failures to stable responses, emit sanitized structured evidence, and never return PostgreSQL/provider messages.                                                                                                                                           |
| MEDIUM   | Admin routes lack explicit `noindex` metadata and no robots policy exists.              | Add defensive admin/preview `noindex` and production robots rules without treating robots as access control.                                                                                                                                                              |
| MEDIUM   | No secret/static-analysis gate is present in CI.                                        | Add a narrowly configured secret scan and document triage; keep dependency audit fail-closed for high/critical advisories.                                                                                                                                                |
| LOW      | The CSP repeats frame denial through CSP and `X-Frame-Options`.                         | Redundancy is harmless and may remain for legacy clients.                                                                                                                                                                                                                 |
| ACCEPTED | Service-role and R2 credentials are in server-only modules and have no browser imports. | Preserve browser leakage tests and `server-only` boundaries.                                                                                                                                                                                                              |
| ACCEPTED | Public media variants are generated from strict raster decode and re-encoding.          | Originals/quarantine remain private; raster allowlist, exact MIME match, decode limits, metadata stripping, immutable keys, and no SVG/HTML provide the documented malicious-file control. A malware vendor is not required unless threat review changes this acceptance. |

Authentication, appointment mutation, matching calculation, upload, and admin
bulk-abuse thresholds still need operational values. Client-side validation is
never a security control.

## Environment and configuration contract

Configuration must be parsed once at a server boundary and fail before serving
traffic. Production must not use dummy, test, loopback, or empty fallbacks.
Secrets remain server-only and are redacted from logs, build output, health
responses, browser bundles, and error tracking.

The matrix below records the Package A audit baseline. Package B closes the
configuration gaps as described after the matrix; the original findings remain
visible so the release evidence shows what changed.

| Variable                                      | Production classification                                                                    | Current state                            | Required release contract                                                                                                         |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                    | required non-secret                                                                          | Validated URL                            | HTTPS production Auth URL; environment-scoped.                                                                                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`               | required intentionally public value                                                          | Minimum-length validation                | Production publishable/anon key; RLS/grants remain authoritative.                                                                 |
| `SUPABASE_SERVICE_ROLE_KEY`                   | required secret under current schema                                                         | Server-only and minimum-length validated | Keep only if a named runtime adapter needs it; otherwise remove the unnecessary requirement. Never expose to previews by default. |
| `DATABASE_URL`                                | required secret                                                                              | Missing                                  | Add a production PostgreSQL URL contract, TLS requirement, bounded pool settings, and environment identity guard.                 |
| `LOCAL_DATABASE_URL`                          | local/test only                                                                              | Required globally and loopback-only      | Make local-only; production must reject it as the authoritative connection.                                                       |
| `LEAD_INTAKE_HMAC_SECRET`                     | required secret                                                                              | Validated to 32+ characters              | Independently rotatable; rotation procedure must describe rate-limit/idempotency effects.                                         |
| `LEAD_RATE_LIMIT_MAX_ATTEMPTS`                | optional production non-secret                                                               | Default `5`, max `100`                   | Keep bounded default; document owner and alert threshold.                                                                         |
| `LEAD_RATE_LIMIT_WINDOW_SECONDS`              | optional production non-secret                                                               | Default `900`, max `86400`               | Keep bounded default; document owner.                                                                                             |
| `MATCHING_CANDIDATE_LIMIT`                    | optional production non-secret                                                               | Default `500`, max `10000`               | Production default remains `500`; release smoke must verify `limit + 1` rejection.                                                |
| `R2_ACCOUNT_ID`                               | required production non-secret identifier                                                    | Optional grouped value                   | Required when `NODE_ENV=production`; validate environment identity.                                                               |
| `R2_BUCKET_NAME`                              | required production non-secret identifier                                                    | Optional grouped value                   | Required in production; public/private prefix and CORS/CDN policy must match it.                                                  |
| `R2_ACCESS_KEY_ID`                            | required production secret identifier                                                        | Server-only grouped value                | Least-privilege object access, environment-scoped.                                                                                |
| `R2_SECRET_ACCESS_KEY`                        | required production secret                                                                   | Server-only grouped value                | Least privilege, rotation owner, never browser-visible.                                                                           |
| `APP_BASE_URL`                                | required production non-secret                                                               | Missing                                  | Canonical HTTPS origin for metadata, sitemap, redirects, and release checks.                                                      |
| `APP_ENV`                                     | required production non-secret                                                               | Missing                                  | Enumerated `local`, `preview`, `staging`, `production`; must agree with resource bindings.                                        |
| `APP_RELEASE`                                 | required production non-secret                                                               | Missing                                  | Immutable commit/release identifier used in health and logs.                                                                      |
| `CRON_SECRET`                                 | required production secret if scheduled HTTP entrypoints are selected                        | Missing                                  | Authenticate scheduled endpoints; never use query strings.                                                                        |
| `SENTRY_DSN` and release/environment settings | optional until observability provider is approved; required by release if Sentry is selected | Missing                                  | Server/client exposure must follow the selected Sentry SDK contract and PII scrubbing policy.                                     |
| Resend key/from/recipient configuration       | unresolved production boundary                                                               | No dependency, env, or adapter           | Required only after notification recipients and provider ownership are approved.                                                  |
| GA4 measurement/consent configuration         | optional production integration                                                              | Not implemented                          | Enable only after event dictionary and consent decision; no PII.                                                                  |
| `PLAYWRIGHT_BASE_URL`                         | local/CI/release-test only                                                                   | Supported by Playwright                  | Never controls application production behavior.                                                                                   |

Preview environments must use isolated non-production Supabase, R2, email,
analytics, and telemetry resources. Production configuration must never be
available to arbitrary preview deployments.

### Package B environment implementation result

- `APP_ENV` is the bounded resource identity `local`, `test`, `preview`, or
  `production`; omission defaults only to `local` and never derives production
  authority from `NODE_ENV`.
- `APP_BASE_URL` is normalized to a credential-free HTTP(S) origin. Local/test
  default to `http://localhost:3000` and reject non-loopback origins; preview
  requires an explicit non-loopback origin; production additionally requires
  HTTPS. Root `metadataBase` and sitemap URLs consume this validated origin.
- `APP_RELEASE` is a trimmed, non-empty, safe-character identifier of at most
  128 characters. Local/test default to their environment name; preview and
  production require an explicit release value.
- Local/test reject `DATABASE_URL` and select the loopback port-55322
  `LOCAL_DATABASE_URL`. Preview/production reject `LOCAL_DATABASE_URL` and
  require an explicit non-loopback, non-placeholder PostgreSQL host and exactly
  one `sslmode` set to `require`, `verify-ca`, or `verify-full`. Loopback
  normalization covers trailing-dot localhost, IPv4 `127.0.0.0/8`, and
  IPv4-mapped IPv6 forms.
- The selected connection is exposed internally as one canonical
  `DATABASE_URL`; `getDatabasePool()` is the only default PostgreSQL pool
  boundary. Parsing and pool construction do not open a connection during
  build.
- Local/test require loopback Supabase. Preview/production reject loopback
  Supabase. Test rejects R2 bindings; production requires the complete R2
  group. Remote preview-versus-production ownership cannot be inferred from a
  URL and remains a deployment-binding approval check.
- `env.server.runtime.ts` is the sole `process.env` reader for server-side
  resource identity and privileged runtime configuration and retains the
  `server-only` boundary. Supabase proxy/server clients use its lightweight
  guarded public subset before any remote call; only the browser client uses
  browser-safe public parsing. Validation errors use variable-level messages
  and do not echo database credentials.
- CI sets `APP_ENV=test`, a loopback application origin, the immutable GitHub
  SHA as `APP_RELEASE`, local Supabase/PostgreSQL values, and non-secret test
  placeholders. Production contract failures are exercised by unit tests; CI
  needs no production DB or provider credentials.

## Database and migration audit

The migration filenames are strictly ordered and unique. The baseline creates
44 public tables; later migrations add `heating_types`, three lead history
tables, and `appointment_events`, producing the tested canonical count of 49.
The GitHub Quality workflow performs a clean local reset, six pgTAP files, and
generated-type diff. The merged Phase 11 Quality run was green. Package A did
not connect to or mutate a remote database.

| Migration                                                 | Production risk class       | Audit result                                                                                                                                                                                                 |
| --------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `20260809162345_compatibility_extensions.sql`             | additive                    | Required extensions and private schema; no destructive data operation.                                                                                                                                       |
| `20260809162348_core_schema.sql`                          | additive baseline           | Creates 44 canonical tables. Use only as part of a clean baseline or reviewed first deployment.                                                                                                              |
| `20260809162351_constraints_indexes.sql`                  | locking risk                | Adds 85 indexes and exclusion/check constraints without `CONCURRENTLY`; safe for an empty baseline, but requires rehearsal and maintenance-window assessment on populated tables.                            |
| `20260809162354_invariant_triggers.sql`                   | metadata/additive           | Adds trigger functions; stale-marking updates occur on future mutations, not as an unbounded migration backfill.                                                                                             |
| `20260809162358_authorization_rls_grants.sql`             | security metadata           | Revokes Data API privileges, forces RLS on baseline tables, and adds policies. Any failure is P0.                                                                                                            |
| `20260809162401_reference_data.sql`                       | additive seed               | Deterministic reference inserts; verify conflict behavior in rehearsal.                                                                                                                                      |
| `20260809220000_heating_types.sql`                        | additive/locking            | Adds one table, FK, index, RLS, and reference data.                                                                                                                                                          |
| `20260809220001_property_admin_fields.sql`                | additive/locking            | Nullable columns plus validated checks; table lock required, no backfill.                                                                                                                                    |
| `20260809220002_property_lifecycle_alignment.sql`         | metadata                    | Replaces a lifecycle function; forward-only behavior change.                                                                                                                                                 |
| `20260810010000_property_media_pipeline.sql`              | rewrite/locking risk        | Adds a volatile UUID default as `NOT NULL`, replaces a check, adds a unique constraint and four indexes. Existing upload sessions can cause a rewrite and longer lock. Rehearse with production-like volume. |
| `20260810150000_lead_crm_foundation.sql`                  | additive/locking            | Adds three tables, indexes, forced RLS, policies, and append-only triggers; changes the lead status check.                                                                                                   |
| `20260810150001_enforce_lead_lifecycle.sql`               | metadata/security           | Adds lifecycle enforcement and explicit revokes.                                                                                                                                                             |
| `20260810160000_lead_activity_details.sql`                | additive                    | Nullable JSON details column; no backfill.                                                                                                                                                                   |
| `20260810170000_appointment_schema_domain_foundation.sql` | additive/locking risk       | Relaxes nullable columns, replaces a GiST exclusion constraint/policies, and adds events. Constraint rebuild can scan/block a populated appointments table.                                                  |
| `20260811153454_matching_profile_foundation.sql`          | additive/metadata           | Adds matching state columns with constant defaults and checks. Validate lock duration on target PostgreSQL version.                                                                                          |
| `20260811210000_matching_v2_stale_invalidation.sql`       | metadata/runtime write risk | Adds stale-invalidation triggers. Feature updates can mark many matches stale; index support and representative load must be measured.                                                                       |
| `20260811220000_lead_conversion_provenance.sql`           | additive/locking            | Nullable provenance and FK plus a non-concurrent partial index; no guessed backfill.                                                                                                                         |
| `20260812120000_align_lead_conversion_lifecycle.sql`      | metadata/security           | Replaces the lead lifecycle trigger; every `WON` transition requires immutable conversion provenance.                                                                                                        |

There is no destructive data migration, table drop, truncate, or hard-delete in
the chain. “Additive” does not mean lock-free. Before production, run the exact
chain against a size-representative snapshot, record duration/locks, validate
all constraints, compare generated types, and test application compatibility.
Applied migration files are immutable; use a forward fix unless a reviewed,
data-preserving rollback is demonstrably safer.

## Final RLS and authorization matrix

SQL revokes all schema/table/sequence/function privileges from `anon` and
`authenticated`, revokes default privileges, enables and forces RLS on all 49
public tables, and grants only named private helper execution. The application
currently uses a privileged PostgreSQL connection, so application authorization
is mandatory even when RLS remains defense in depth.

Legend: `none` means no matching policy and no base-table grant; `scoped` means
the policy requires the trusted assignment/ownership helper; `admin` means the
`private.is_admin()` policy; `service` means narrowly owned privileged runtime.

| Entity                             | ANON | Authenticated unauthorized | ADVISOR scoped                                                             | ADMIN                                                                   | Service/worker                                  |
| ---------------------------------- | ---- | -------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------- |
| Properties                         | none | none                       | SELECT, UPDATE; lifecycle/permission trigger restricts high-impact changes | SELECT/INSERT/UPDATE/DELETE by policy, further constrained by use cases | named property/public read and command adapters |
| Property media and upload sessions | none | none                       | SELECT/INSERT/UPDATE for assigned properties; no RLS DELETE                | admin                                                                   | media worker/reconciliation only                |
| Leads                              | none | none                       | SELECT/INSERT/UPDATE for assigned advisor; no DELETE                       | admin                                                                   | public intake and CRM/conversion adapters       |
| Lead activities/history            | none | none                       | SELECT for assigned lead; no mutation                                      | INSERT/SELECT, while append-only trigger rejects UPDATE/DELETE          | intake/CRM/conversion append only               |
| Appointments/events                | none | none                       | scoped SELECT/INSERT/UPDATE; events SELECT only                            | admin; event trigger remains append-only                                | reminder/appointment adapters                   |
| Customers/contact points           | none | none                       | scoped SELECT/UPDATE for customer; contact SELECT/INSERT/UPDATE            | admin                                                                   | conversion/CRM adapters                         |
| Customer requests/features         | none | none                       | scoped SELECT/INSERT/UPDATE                                                | admin                                                                   | conversion/matching adapters                    |
| Matching results/reasons           | none | none                       | scoped result SELECT/INSERT/UPDATE; reasons have no direct advisor policy  | admin                                                                   | matching transaction/read adapter               |
| Lead conversions                   | none | none                       | no direct policy                                                           | admin, with immutable business provenance                               | conversion transaction only                     |

Release validation must query `pg_tables`, grants, policies, functions, and
default privileges after migration and test ANON, unauthorized authenticated,
scoped ADVISOR, cross-scope ADVISOR, ADMIN, and service paths. A policy/grant
regression is P0.

## Observability and health requirements

The current `/api/health` endpoint proves only that a Next.js function can
return JSON. It exposes no secrets, uses `no-store`, and emits correlation
headers, but incorrectly labels the application `ready` without checking the
database or critical configuration.

Production requires:

- a cheap liveness endpoint that proves the process/event loop responds and
  performs no network write;
- a readiness endpoint that validates parsed configuration, release identity,
  and a bounded read-only PostgreSQL probe; optional providers are reported as
  configured/degraded without exposing hosts, keys, buckets, or stack details;
- non-cacheable sanitized envelopes with a stable schema and status code;
- a provider-neutral structured runtime logger with timestamp, severity,
  event, environment, release, operation, outcome, duration, and canonical
  correlation/request IDs;
- allowlisted context and recursive redaction; no cookies, authorization,
  tokens, signed URLs, lead/customer fields, free text, addresses, or SQL rows;
- explicit request, Server Action, database, worker, and provider error
  boundaries;
- outbox/media metrics for due age, attempts, dead letters, stale leases,
  processing latency, failure category, orphan count, and last successful run;
- alert owners and links to incident/worker/media/backup runbooks;
- SLO and retention decisions before production traffic.

Readiness performs no expensive scan or write. External email/analytics outages
must not make authoritative transactions fail, but their backlog and degraded
state must be visible.

## Outbox and worker operations

The lead and appointment repositories use ordered `FOR UPDATE SKIP LOCKED`
claims, leases, stale-lease recovery, idempotency keys, and explicit processed,
pending, and dead-letter states. Media processing also uses a lease, immutable
object writes, checksum verification, bounded decode, deterministic rejection,
and reconciliation pagination.

Missing production wiring:

- no authenticated scheduled entrypoint or worker process;
- no Vercel Cron or equivalent configuration;
- no lead notification/analytics consumers;
- no appointment notifier or approved recipient model;
- no Resend, analytics, or Sentry runtime adapters;
- retryable outbox failures use a fixed delay and have no maximum-attempt poison
  transition;
- no dead-letter replay command, operational dashboard, last-run signal, or
  manual fallback;
- no scheduled media processing, orphan reconciliation, or purge execution;
- no scheduler concurrency/timeout/runtime-limit contract.

Use bounded scheduled endpoints on the selected deployment platform only after
provider limits and authentication are confirmed. Each invocation claims a
small batch or one media item, is replay-safe, reports a sanitized summary, and
has a manual runbook. Recipient semantics for lead and appointment
notifications are an explicit product/operations decision; they must not be
guessed from PII.

## Package C implementation record (local evidence, 2026-08-23)

The Package A sections above are the audited baseline and remain part of the
release record. Package C implements the following local controls; it does not
turn an unconfigured provider, absent scheduler, or unavailable environment
gate into release evidence.

### Browser, crawl, and request/error boundaries

- Document responses use a per-request nonce CSP. `script-src` has no
  `'unsafe-inline'` or wildcard, and `connect-src` is `'self'` plus only the
  validated virtual-hosted R2 presigned-upload origin when the complete R2
  identity is configured. The same canonical addressing contract drives the
  presigner and CSP; malformed account or bucket labels produce no origin.
- The remaining sources are deliberately narrow: same-origin images, forms,
  and connections; `frame-src 'none'`; `frame-ancestors 'none'`; and only the
  framework-required `style-src 'unsafe-inline'` exception. No unreviewed
  analytics, telemetry, font, CAPTCHA, or delivery origin is allowed.
- HSTS is `max-age=63072000` only under `APP_ENV=production`. It has neither
  `includeSubDomains` nor `preload` because subdomain ownership is not proven.
  Confirmed production HTTPS/header delivery is still a release-owner check.
- Admin metadata is `noindex,nofollow`; `robots.ts` excludes the bare and
  descendant private admin, auth, CRM, customer, lead, and customer-request
  paths. Robots is defense in depth, not authorization.
- `createRequestContext` admits only bounded canonical correlation IDs and
  generates a UUID for missing or invalid input. Delivery, Server Action, media,
  health, and safe diagnostic paths propagate this ID instead of consuming raw
  request headers independently.
- Structured logging derives canonical `APP_ENV`/`APP_RELEASE`, applies
  fail-closed recursive redaction, and retains only finite allowlisted
  operational values. Safe diagnostics contain an error code, operation, and
  correlation ID only; raw errors, stacks, provider/database responses, free
  text, and PII are excluded. The provider-neutral telemetry boundary is a
  production-conditional no-op unless an approved transport is injected; Sentry
  or another provider is not wired.

### Health and bounded worker behavior

- `GET /api/health` is dependency-free public liveness: HTTP 200 with the
  minimal `status: ok` envelope, `no-store`, and canonical request headers. It
  does not call PostgreSQL, R2, Supabase, or a provider.
- `GET /api/readiness` performs only parsed critical-config validation and one
  read-only `SELECT 1` through the canonical pool. Concurrent callers coalesce
  onto one probe; each response has a one-second bound and returns a minimal
  200/503 envelope without configuration or database detail. R2 and async
  providers are deliberately not readiness-critical.
- Lead outbox, appointment reminders, media processing, and reconciliation
  emit aggregate PII-free run summaries: bounded counts, safe failure category,
  stale-lease recovery, and no payload, object key, recipient, or provider
  response. Retry attempts are bounded; terminal retryable failures use
  deterministic poison/dead-letter outcomes, and guarded transitions fail on a
  lost or expired lease rather than reporting an unpersisted success.
- This is application-level visibility only. Authenticated scheduler entrypoints,
  runtime reporter injection, provider adapters, external metrics/dashboards,
  alert ownership, and worker runbooks remain Package E work.

### Intake, media, matching, and direct identifiers

- Public lead intake has a bounded honeypot and a 64 KiB Server Action body
  limit. Challenge outcomes are truthful: unconfigured verification is
  `UNAVAILABLE`; preview/production then persist no lead and return the safe
  unavailable state. Spoofable forwarding headers are ignored until a trusted
  proxy contract exists. Existing durable database idempotency, duplicate
  handling, and rate acquisition remain in place.
- The durable rate key remains intentionally conservative. Provider selection,
  trusted ingress/client-address rules, query/index measurement, and an
  approved enabled-production intake policy are deferred; no in-memory or
  guessed substitute rate limiter was introduced.
- Media metadata/finalize bodies are bounded at 16 KiB and media command bodies
  at 128 KiB before authentication or schema work. Existing object, MIME,
  decode, dimension, pixel, key, batch, and re-encoded-output bounds remain;
  per-variant and aggregate encoded output are capped by the 15 MiB recipe
  budget. Persisted actor, property, and active-session quotas remain deferred
  because the current model has no reviewed bounded count or policy.
- Matching authenticates before configuration/database construction and enforces
  the application-owned candidate maximum of 500. A persisted rapid-execution
  cooldown/window is not implemented without an approved durable policy.
- Direct-ID delivery normalizes missing and unauthorized lead, property, media,
  and applicable mutation responses while preserving typed lifecycle, conflict,
  validation, MFA, and genuine role failures internally and where appropriate
  outwardly. Database-backed verification remains environment-blocked where the
  local PostgreSQL/Supabase service is unavailable.

### Package C verification and unchanged release conditions

Focused C1–C4 regressions, CSP/browser checks, unit/type/lint/format checks,
and `git diff --check` have local passing evidence in their task reports.
Package C does **not** mark its integration/build/npm-audit gates as passing:
the final C4 integration and sitemap-prerender build require unavailable local
PostgreSQL/Supabase, and the dependency audit registry endpoint was unavailable
under the no-remote boundary. Package D retains measured database/index and
additional reliability work; Package E retains media delivery, scheduler,
provider, telemetry, operations, and smoke wiring. These conditions continue to
block release until their respective evidence exists.

## Media and R2 production requirements

Current controls include a 15 MiB limit, JPEG/PNG/WebP allowlist, exact declared
versus decoded MIME, 12,000-pixel edge and 50-megapixel limits, single-page
decode, no animation, Sharp fail-on-error, no upscale/crop, WebP/AVIF
re-encoding, metadata absence checks, SHA-256, private quarantine/original
prefixes, immutable variant keys, five-minute single-object PUT grants,
idempotent finalize, and paginated reconciliation.

Before release:

- R2 credentials must be least-privilege and server-only;
- the bucket must deny public listing and direct access to `private/` prefixes;
- browser PUT CORS must allow only production/staging origins, required methods
  and headers, and no credential wildcard;
- `/delivery/properties/` must map to the R2/CDN public variant origin and serve
  correct MIME, `nosniff`, immutable caching, and no directory listing;
- upload initialization and active sessions need actor/property quotas;
- processing needs platform memory, CPU, wall-time, and concurrency budgets;
- reconciliation must run by cursor with a grace period and dry-run/count
  evidence before deletion;
- soft deletion removes media from public projections immediately; physical
  purge follows retention/hold policy and remains idempotent;
- missing object, stale variant, corrupt source, provider outage, and accidental
  publication runbooks are required.

## Public web, SEO, and privacy requirements

Confirmed strengths are server-rendered property/listing content, controlled
canonical path construction, normalized/bounded filter input, filtered-page
`noindex,follow`, permanent redirects only from recorded slug history, genuine
404s for missing detail pages, public lifecycle filtering, responsive image
markup, safe JSON-LD serialization, and sitemap membership restricted to active
properties with current public media.

Release gaps:

- no explicit production origin/`metadataBase`; canonicals, Open Graph values,
  and sitemap entries are relative;
- no `robots.ts`, preview/staging exclusion contract, or admin `noindex`;
- the public layout links crawlers to `/admin` even though it is private;
- invalid listing-type pages return an empty component rather than an explicit
  404;
- sitemap generation is one unbounded query with no segmentation/page limit;
- there is no production verification of rendered canonical/robots/sitemap/
  redirect/media URLs.

Admin authentication remains the privacy boundary; robots is defense in depth.
Exact address/coordinates may be public only when the explicit
`location_visibility='EXACT'` business decision is approved for that property.
CRM PII must never enter metadata, public JSON-LD, URLs, caches, sitemap, GA4,
logs, or error trackers.

## Performance and index audit

Known bounded behavior:

- public listing: 24 rows per page, maximum page 100;
- Matching V2 candidate load: configured 500 plus one overflow sentinel;
- deterministic matching calculation: `O(C + F)` scoring plus
  `O(C log C)` ordering within the candidate bound;
- lead conversion: one lead lock, bounded exact identity lookup, and an optional
  request in one transaction;
- lead detail: 20 appointments and 100 combined timeline records;
- reconciliation: maximum 250 objects per application page;
- outbox/reminder claims: caller-supplied bounded batch contract, but the
  production caller does not yet exist.

Actual unbounded or insufficiently bounded reads:

- sitemap reads every eligible property in one request;
- matching read view returns all current/stale results and reasons for a request;
- admin reference-data selectors read all locations/advisors/catalog rows;
- property media admin/public projections have no database row cap;
- stale-invalidation triggers can update every active result for a property or
  request;
- public lead rate limiting counts by `abuse_network_signal` and time without a
  supporting composite index;
- lead free-text search uses leading-wildcard `ILIKE` without a trigram/search
  index;
- OFFSET pagination is capped in public pages but admin operational lists need a
  measured migration path to keyset pagination before very deep use.

Existing indexes cover the major FK joins, active property discovery,
assignment checks, normalized contact channel/value lookup, appointment
advisor/time access, outbox pending/lease claims, current matching results,
media process/reclaim, and lead status/advisor listing. Candidate additions must
be justified with `EXPLAIN (ANALYZE, BUFFERS)` on production-like distributions.
Priority measurements are:

1. `leads(abuse_network_signal, created_at)` partial active lookup;
2. public active listing filter/order queries, including price/rooms;
3. public route plus current-media lateral aggregation;
4. advisor/admin appointment filters and due reminders;
5. matching required-feature anti-join and current-result read;
6. exact verified contact lookup, including verification-status selectivity;
7. RLS helper joins for active roles and assignments.

Every new index must state its query, expected selectivity, lock/build method,
and write-amplification cost. No speculative combination index is approved.

## Reliability and transaction audit

The critical flows use explicit `BEGIN/COMMIT/ROLLBACK`, parameterized SQL,
row/advisory locks, expected versions, idempotency keys, and unique/exclusion
constraints as final guards:

- property mutations lock the aggregate and use optimistic versions plus
  append-only history/audit/outbox;
- media upload initialization/finalization separates R2 calls from PostgreSQL
  transactions and rechecks locked state before commit;
- public lead intake locks the eligible property, serializes a hashed network
  limit, uses an idempotency fingerprint, and writes lead/history/audit/outbox
  atomically;
- appointment commands use versions, lifecycle triggers, a GiST overlap guard,
  events, and reminder outbox rows atomically;
- Matching V2 uses a request advisory lock, request row lock, candidate bound,
  deterministic fingerprints, and a single transaction;
- lead conversion locks the lead and persists customer/request/provenance/WON/
  activity/audit atomically with uniqueness-backed retry behavior.

Risks to address or measure:

- public lead intake holds a property row lock while counting the rate window;
  document lock order and measure hot-property contention;
- matching persists up to the candidate bound with per-match/reason statements;
  measure transaction duration and query count before optimizing;
- media writes can succeed before the final database commit, so reconciliation
  is a required operational control, not optional maintenance;
- fixed, unlimited retryable outbox attempts can create poison-message churn;
- claim `limit`, lease, retry delay, and worker concurrency are not validated by
  a production entrypoint;
- stale-match trigger updates may amplify a single feature change;
- no transaction may make a Resend, analytics, Sentry, or other provider call.

## Backup, restore, retention, and privacy

PostgreSQL owns authoritative records and R2 owns media bytes referenced by
PostgreSQL. A release is blocked until an owner approves and rehearses:

- Supabase/PostgreSQL backup tier, encryption, retention, RPO, RTO, PITR
  capability, restore access, and quarterly restore evidence;
- pre-migration backup/snapshot decision and restore/forward-fix decision tree;
- restored-environment isolation and erasure-tombstone replay before traffic;
- R2 versioning/retention choice, object inventory, database-reference
  reconciliation, and missing/orphan recovery limits;
- credential and backup access auditability.

PII exists in leads, contact intakes, customers/contact points, appointments,
activities, conversions, audit linkage, free text, and potentially media
metadata. Current soft-delete/history design protects provenance but does not
implement legal erasure. Before production, product/legal owners must decide
retention periods, lawful purpose, access/export, erasure/anonymization,
legal-hold authority, vendor deletion, and backup expiry. This document makes no
claim of Turkish or other legal compliance.

Technical controls must ensure ordinary reads hide deleted records, public media
is revoked immediately, logs/outbox/analytics are minimized, and restoration
does not resurrect erased data. A controlled, audited exceptional workflow—not
normal CRUD—handles hard purge or anonymization.

## CI and dependency audit

`.github/workflows/quality.yml` runs on pull requests and pushes to `main` with
read-only repository permissions and a 30-minute timeout. It enforces `npm ci`,
high-severity `npm audit`, local Supabase start/reset, six pgTAP files, generated
database type diff, lint, repository format check, typecheck, compile-time type
test, unit/integration tests, build, Chromium install, and E2E.

The merged Phase 11 run is green. A fresh Package A `npm audit` returned zero
known vulnerabilities across 955 total dependencies (467 production,
452 development, with npm overlap categories as reported). All declared package
versions are exact and the lockfile is committed. No major upgrade is approved
without a separate compatibility review.

On this Windows checkout, repository-wide Prettier reported 149 files. Git
evidence shows those files are `i/lf` but `w/crlf`, `core.autocrlf=true`, and no
`.gitattributes` exists; the same gate is green on Linux CI. This is primarily a
cross-platform EOL contract defect, not evidence that 149 source files require
semantic reformatting.

The selected format strategy is **A: one dedicated baseline-hygiene commit in
Package B**. It must add a repository LF policy, normalize in a controlled
checkout, separate any genuine Prettier changes from functional work, and prove
the Linux and Windows gates. The long-term CI gate remains repository-wide;
changed-files-only formatting is rejected because it permanently tolerates
unknown debt, and an unreviewed 100+ file rewrite is rejected because it hides
functional changes.

CI hardening also needs action SHA pinning or an approved update policy,
concurrency cancellation for superseded PR runs, secret scanning, explicit Node
and Supabase version ownership, and retained failure artifacts where useful.

Package B implemented the baseline controls without changing the permanent
repository-wide gate:

- the initial 149 Prettier failures in the configured repository scope were
  confirmed as working-tree CRLF drift; rewriting that scope produced zero
  tracked content changes;
  `.gitattributes` now requires LF and explicitly marks common media/font files
  binary;
- checkout `v4.3.1`, setup-node `v4.4.0`, and Gitleaks Action `v3.0.0` are
  pinned to reviewed immutable commit SHAs with version comments;
- concurrency cancels superseded runs per workflow and pull request/ref;
- Gitleaks scans full Git history in a separate read-only job. A finding blocks
  CI; any false-positive exclusion requires a reviewed narrow rationale. The
  repository owner reviews action updates monthly and before a release
  candidate;
- `.gitignore` covers local env files, production env exports, private-key
  containers, common credential JSON exports, and secret directories;
- generated database types, migrations, lockfile, excluded governance/legacy
  documents, and ignored build artifacts remain outside the formatting policy;
  the three Phase 12 release-readiness documents are explicitly enforced, and
  the existing generated-type drift gate remains unchanged.

If repository ownership moves to an organization, Gitleaks licensing and token
permissions must be validated before that move; the scan must not be silently
disabled. Failure-artifact retention remains a later CI operations enhancement.

## Test and release-smoke strategy

Current E2E contains five foundation checks: root rendering, security header,
unauthenticated admin redirects, health envelope, and filtered-listing
`noindex`. It does not test an authenticated business workflow.

The minimal deterministic release suite is intentionally small:

1. **Public discovery and lead intake:** seeded active property with ready media,
   canonical page, real media HTTP response, accepted lead, CRM visibility, and
   idempotent replay.
2. **CRM appointment and conversion:** authenticated scoped actor processes one
   test lead, creates/transitions an appointment, converts the lead, and observes
   the immutable customer/optional request result.
3. **Matching V2:** refresh the test request, verify deterministic results,
   overflow rejection, and stale invalidation after a controlled input change.
4. **Property/media administration:** create/update/publish a tagged test
   property, initialize/finalize/process a small fixture, verify public delivery,
   then soft-delete and verify immediate public removal.

CI uses isolated local resources and deterministic seeds. Staging uses isolated
production-like resources and a dedicated test staff identity. Production
post-deploy checks are separated:

- read-only safe checks: liveness/readiness, auth denial, approved staff login,
  admin route, canonical public page, robots/sitemap, media GET, release metadata,
  and dashboards;
- controlled writes requiring explicit release approval: one tagged canary lead,
  appointment, conversion/request, match refresh, and optionally one media
  lifecycle using pre-approved records and deterministic cleanup/soft deletion;
- destructive checks, arbitrary customer records, real recipients, and hard
  deletion are prohibited in routine production smoke.

Each write records correlation/idempotency keys, owner, expected records, and
cleanup evidence. A failed cleanup is an incident, not a reason to hide the test.

## Deployment dependency checklist

| Dependency               | Repository state                                 | Release evidence required                                                                                         |
| ------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| GitHub/main protection   | Quality workflow exists                          | Required green checks, reviewed commit, protected merge/deploy authority.                                         |
| Vercel application       | Documented only; no project/cron/runtime config  | Bound project/environment, Node/runtime limits, canonical domains, preview isolation, rollback owner.             |
| Supabase Auth            | SSR integration and local config exist           | Production URL/key, redirect allowlist, signup policy, staff bootstrap/offboarding, AAL2 admin verification.      |
| PostgreSQL               | 18 migrations/tests exist; runtime is local-only | Production TLS/pool config, migration rehearsal, backup/restore proof, post-migration RLS/grant/type checks.      |
| Cloudflare R2            | Storage/processing adapters exist                | Dedicated bucket, least-privilege key, CORS, private prefixes, delivery domain/rewrite, lifecycle/reconciliation. |
| Resend                   | Not implemented                                  | Recipient semantics, provider account/domain, key/from policy, idempotent adapter, safe non-production sink.      |
| GA4/internal analytics   | Schema/docs only                                 | Consent decision, event dictionary, PII review, environment separation, verification.                             |
| Sentry/runtime logs      | Proposed docs and logger primitive only          | Approved sink, scrub rules, release/environment tags, alerts, retention/access owner.                             |
| DNS/TLS/security headers | Not configured in repository                     | Canonical host, TLS, HSTS decision, CSP verification, redirect and certificate checks.                            |
| Scheduler/workers        | No production entrypoints                        | Authenticated schedule, provider limits, concurrency, poison handling, dashboards, manual fallback.               |
| Operations               | No runbooks                                      | Release, incident, backup/restore, worker, media, credential exposure, and rollback procedures.                   |

## Release order and rollback decision points

1. Approve owners, release candidate SHA, maintenance window, RPO/RTO, smoke
   scope, and go/no-go authority. Stop if any P0/P1 gate is open.
2. Verify backup/PITR availability and complete an isolated restore rehearsal.
   Stop if restore evidence or access is missing.
3. Validate production env and resource identities without printing secrets.
   Stop on any missing/mismatched binding.
4. Run the full migration chain on production-like data; record locks, duration,
   constraints, RLS/grants, type diff, and forward-fix path. Stop on drift.
5. Take the approved pre-migration backup/snapshot and apply migrations in order.
   Verify schema, RLS, grants, functions, generated contract, and critical reads.
6. Deploy the exact application revision compatible with the expanded schema.
   Verify liveness/readiness, release metadata, headers, public media, and auth.
7. Enable schedulers/workers one family at a time; observe last-success, backlog,
   retries, and dead letters before enabling the next.
8. Run staging/full smoke, then production read-only smoke. Run controlled writes
   only with explicit approval and cleanup ownership.
9. Verify logs, alerts, dashboards, sitemap/robots/canonical host, and provider
   health. Enable/announce traffic only after the release owner signs off.

Application rollback selects the previous compatible immutable deployment.
Workers can be stopped independently without deleting claims; expired leases
must be recoverable. Database rollback prefers a forward fix. A down migration
is used only when reviewed, compatible with both app versions, and data-safe.
Media objects are not destructively rewritten during rollback; delivery changes
select an earlier compatible recipe/path while reconciliation preserves
evidence. There is no promise of a single transaction across app, database,
worker, R2, or provider deployment.

## Release gates

### P0 — immediate no-go

- exploitable critical/high runtime vulnerability, secret exposure, broken auth,
  object authorization, RLS/forced-RLS, or privilege regression;
- production database connectivity/config failure, schema drift, migration
  failure, destructive/unbounded migration without an approved procedure, or
  generated-type mismatch;
- data-loss/corruption risk, failed backup restore proof, or incompatible app/DB
  rollback state;
- required CI, pgTAP, integration, E2E, typecheck, lint, format, audit, or build
  failure;
- missing/invalid required production secret or cross-environment resource
  binding;
- broken canonical public page, lead intake, authentication, or R2 public media
  delivery;
- confirmed PII/secret leakage in browser, logs, analytics, errors, metadata, or
  public storage.

### P1 — release blocked until owned and resolved

- missing scheduler/provider wiring for a required worker or no poison/dead-letter
  operating procedure;
- no critical job/request error visibility, alert owner, health/readiness, or
  incident route;
- no approved backup/restore runbook, RPO/RTO, or recent rehearsal;
- no deterministic staging/release smoke and cleanup procedure;
- missing public abuse/upload quota posture or trusted proxy contract;
- missing canonical origin, robots/admin index controls, delivery CORS/CDN
  policy, or production dependency checklist approval;
- unacceptable migration lock duration or measured query bound.

### P2 — may be deferred with owner and date

- non-critical UX polish, optional rich-result enhancement, non-blocking
  dashboard convenience, or documentation improvement that does not weaken a
  P0/P1 control.

An accepted risk names the owner, rationale, compensating control, expiry/review
date, and release approver. “Works locally” and “provider default” are not release
evidence. Production deployment always requires explicit human approval.

## Phase 12 delivery packages

- **Package A — complete with this commit:** system audit, requirements,
  ADR-015, and implementation plan only.
- **Package B — complete on this branch:** LF contract, green repository format
  gate, production env/database/origin/release validation, CI immutable action
  pins/concurrency/Gitleaks, and safe test/build placeholders.
- **Package C — security, observability, and health/readiness:** request context,
  CSP/HSTS/robots, safe errors/logging, production health, abuse quotas, and
  provider-neutral job visibility.
- **Package D — evidence-backed database/performance/reliability:** production
  migration risk probes, only measured indexes/query bounds, poison retry
  policy, stale-match/media/transaction contention fixes.
- **Package E — production wiring, smoke/E2E, and operations:** media delivery,
  authenticated schedulers/provider adapters after recipient decisions, compact
  E2E, and release/incident/backup/worker/media runbooks.
- **Package F — final release audit and sign-off:** full clean reset, CI parity,
  staging rehearsal evidence, dependency/security review, release checklist,
  and PR-ready report. It does not deploy or merge without explicit approval.

## Unresolved production decisions

These findings do not block Package A completion, but the named gate must close
before release:

1. Production Supabase/PostgreSQL project, region, connection mode, TLS/pool
   limits, backup tier, RPO/RTO, and restore owner — P0/P1.
2. Vercel plan/runtime limits, staging topology, canonical domains, and release
   authority — P1.
3. R2 bucket, CORS, delivery-domain mapping, retention/versioning, and
   reconciliation owner — P0/P1.
4. Lead and appointment notification recipients, Resend domain/from identity,
   non-production sink, and delivery ownership — P1 if notifications are
   required at launch; otherwise formally disable and accept.
5. Sentry versus provider-log operating model, SLOs, alerts, retention, and
   on-call owner — P1.
6. GA4 consent/event dictionary and whether analytics launches on day one — P2
   unless a release KPI depends on it.
7. PII retention, erasure/anonymization, legal hold, export, vendor deletion,
   and backup expiry decisions — P1/P0 where data-loss or unlawful processing
   risk is identified by the responsible owner.
8. Production controlled-write smoke records, recipients, cleanup authority,
   and allowed time window — P1.

## Package A acceptance criteria

- All findings are tied to checked-in evidence or explicitly labeled as an
  unresolved provider/owner decision.
- The three required documents are the only Package A product artifacts.
- No runtime code, dependency, migration, provider resource, production
  infrastructure, or remote Supabase state changes.
- Typecheck, type tests, lint, scoped document Prettier, and `git diff --check`
  pass before the Package A commit.
- The branch is committed locally and is not pushed. Package B does not start.
