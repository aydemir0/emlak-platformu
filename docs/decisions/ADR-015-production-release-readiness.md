# ADR-015: Production Release Readiness

## Status

Accepted for Phase 12 Package A on 2026-08-22. This decision defines release
gates and implementation sequencing. It does not authorize deployment or any
remote infrastructure mutation.

## Context

Phase 11 established the explicit lead-to-customer conversion workflow. The
repository now needs a production-readiness contract before additional feature
work or deployment. The Package A audit found sound domain and application
boundaries, server-verified staff identity, object authorization, forced RLS,
transactional lifecycle operations, deterministic media processing, and a
substantial CI workflow.

The same audit found release blockers and high-priority gaps:

- production PostgreSQL cannot be configured because the runtime accepts only a
  loopback `LOCAL_DATABASE_URL` on port `55322`;
- public property images use `/delivery/properties/...`, but no application,
  CDN, or origin binding serves that path;
- backup/PITR ownership, RPO/RTO, and an isolated restore rehearsal are not
  evidenced;
- worker libraries have no production scheduler or executor entrypoints;
- health, runtime logging, alerting, and incident response do not yet prove
  dependency readiness;
- release-critical provider, privacy, smoke-test, and operational decisions
  remain unresolved;
- Windows checkout line endings make the repository-wide Prettier gate fail
  locally even though the Linux Quality workflow is green.

Releasing without resolving these items would rely on undocumented assumptions
at database, media, worker, and operations trust boundaries.

## Decision

Production readiness will be delivered as gated hardening packages, without
feature expansion.

1. Every release candidate must identify an immutable commit, release owner,
   deployment window, required providers, migration set, smoke scope, rollback
   owner, and go/no-go approver.
2. A release is blocked unless the required CI workflow is green and dependency
   audit, lint, formatting, type checks, database tests, application tests,
   build, and browser tests pass for that exact commit.
3. Production configuration must be explicit, server-only where secret, schema
   validated, environment-aware, and fail fast. Local-only connection guards
   must remain available for local workflows but must not constrain production
   connectivity.
4. Production PostgreSQL access must require the approved Supabase connection
   identity, TLS mode, pooling model, least-privilege grants, and verified RLS
   posture. Schema drift or generated-type drift blocks release.
5. Forced RLS, grants, object authorization, staff identity resolution, AAL
   requirements, and secret boundaries are release invariants. Any unexplained
   regression is P0 and blocks release.
6. Runtime observability must provide validated correlation identifiers,
   structured redacted logs, release/environment metadata, dependency-aware
   readiness, worker metrics, actionable alerts, and an incident path. Health
   responses must not disclose secrets or claim readiness without checking
   required dependencies.
7. Production release requires an owned backup/PITR policy, approved RPO/RTO,
   and a successful isolated restore rehearsal for the release process. A
   backup without restore evidence is insufficient.
8. Database changes must be rehearsed on production-like volume, with locks,
   scans, runtime, compatibility, rollback, and data-preservation behavior
   recorded. Prefer a compatible forward fix after deployment; use down
   migration only when its data safety is demonstrated.
9. Public media release requires a verified `/delivery/properties/` delivery
   contract, R2 CORS and origin policy, private quarantine/original objects,
   immutable variant keys, and guarded reconciliation. Destructive media
   cleanup requires a dry run and count/scope guards.
10. Workers are enabled one family at a time only after their scheduler,
    authentication, idempotency, lease recovery, bounded retry/dead-letter
    policy, provider contract, monitoring, and manual recovery runbook pass.
11. Smoke verification must cover public property/media/lead behavior,
    authenticated CRM conversion, Matching V2, and property-media lifecycle.
    Production smoke is read-only by default; controlled writes require
    explicit approval, isolated records, safe recipients, and cleanup authority.
12. The release order is: ownership and candidate freeze; backup/restore proof;
    environment and resource identity validation; migration rehearsal;
    production backup and migration with post-checks; compatible application
    deployment; dependency health checks; staged worker enablement; smoke
    verification; observability and SEO verification; explicit go/no-go.
13. Rollback stops workers first when relevant, restores the previous compatible
    immutable application, preserves durable media, and uses a reviewed forward
    database fix by default. Cross-system atomic rollback is not assumed.
14. P0 findings always block. P1 findings block unless a named owner and approver
    record rationale, compensating controls, expiry, and a remediation date. P2
    findings require an owner and target date but may be accepted for release.
15. No production deployment, traffic change, migration, provider mutation, or
    remote Supabase action occurs without explicit human approval at the
    applicable release gate.
16. Package B will establish cross-platform LF policy and normalize the
    controlled checkout in a dedicated baseline-hygiene change. The permanent
    repository-wide formatting gate remains; Package A will not mass-format
    source files.

## Package boundaries

- Package A: audit, requirements, this ADR, and the executable hardening plan.
- Package B: baseline/CI hygiene, production configuration, origin identity,
  and release metadata foundations.
- Package C: security headers, request/error boundaries, observability, health,
  and abuse-control hardening.
- Package D: measured database/performance work and worker retry reliability.
- Package E: provider and scheduler wiring, media delivery, smoke automation,
  and operational runbooks after owner decisions are recorded.
- Package F: final full verification, evidence index, and human release signoff.

Each package is independently reviewable. A later package does not weaken an
earlier release gate, and Package B does not begin as part of this decision.

## Alternatives considered

### Release using documented provider defaults

Rejected. Documentation does not prove actual resource identity, backup,
delivery, scheduler, authentication, or alert behavior.

### Mix feature development with hardening

Rejected. It expands the regression surface and makes release evidence harder
to attribute to an immutable candidate.

### Weaken formatting to changed files only

Rejected as a permanent policy. It leaves checkout behavior inconsistent and
allows baseline drift. A dedicated LF normalization change gives the
repository-wide gate a stable cross-platform contract.

### Introduce microservices or a new telemetry platform immediately

Rejected. The modular monolith and existing worker boundaries are sufficient.
Production readiness requires wiring and evidence, not an unproven architecture
rewrite.

### Treat a green CI workflow as complete release evidence

Rejected. CI does not prove production resource identity, restore viability,
provider delivery, runtime alerts, or a controlled rollback path.

## Consequences

### Positive

- Release decisions become evidence-based and reproducible.
- Security, RLS, data integrity, backup, media, worker, SEO, and rollback gates
  are explicit rather than inferred.
- Hardening remains reviewable and avoids unrelated feature work.
- The process favors compatible, reversible changes and human-controlled
  production mutations.

### Costs and constraints

- Release is blocked until production database connectivity, media delivery,
  backup/restore proof, and other P0/P1 ownership decisions are resolved.
- Staging/provider access and accountable human owners are required for several
  Package E and F checks.
- Database and end-to-end verification will take longer because production-like
  rehearsal and isolated smoke data are mandatory.

## Security, data, SEO, and performance impact

- Security: forced RLS, explicit authorization, AAL, secret isolation, abuse
  controls, headers, and auditability are blocking release invariants.
- Data: migration compatibility, backup restore, retention/erasure ownership,
  transaction boundaries, and replay behavior must be demonstrated.
- SEO: canonical origin, robots policy, sitemap bounds, lifecycle visibility,
  and public media delivery must be verified on the release environment.
- Performance: indexes are added only from measured query evidence; locks,
  unbounded reads, worker batches, media memory, and write amplification require
  explicit budgets.

## Rollback and migration notes

This ADR changes no schema or runtime behavior. Reversing it requires a new ADR
that supplies equivalent release controls and explains how all P0 and P1 risks
remain bounded. Future schema rollback must be decided per migration; this ADR
does not authorize destructive reversal.
