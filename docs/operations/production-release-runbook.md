# Production release runbook

## Pre-release gate

Record immutable candidate SHA, approver, production resource identities, canonical HTTPS origin, database/R2/Supabase environment, backup/PITR checkpoint, migration and restore evidence, provider ownership, alert routes, and worker kill switches. Confirm CI, dependency/secret scans, pgTAP, generated types, build, and smoke evidence. Any identity mismatch, missing backup, missing owner, P0/P1 defect, or unresolved migration lock blocks release.

## Controlled sequence

1. Disable schedulers and confirm no active worker leases or long transactions.
2. Capture the approved backup/PITR checkpoint and verify restore eligibility.
3. Apply reviewed migrations using the migration rehearsal; stop on lock timeout and forward-fix.
4. Deploy the schema-compatible application with `APP_ENV=production`, canonical origin/release, TLS database, Supabase, R2, and `CRON_SECRET` values from secret stores.
5. Verify `/api/health`, `/api/readiness`, security headers, robots/sitemap, public pages, and same-origin public media. Verify logs contain environment/release/correlation but no PII/secrets.
6. Perform production read-only smoke: public discovery, one known public property/media URL, admin authentication boundary without mutations, health/readiness, backlog/lease counts, and provider dashboards.
7. Controlled write smoke requires a separate explicit approval and dedicated records/recipients. It may cover lead capture, CRM visibility, appointment, conversion, matching, and media lifecycle; record authoritative DB invariants and idempotent cleanup policy.
8. Enable only media processing first, observe; then enable each approved provider-backed worker family separately. Reconciliation remains dry-run until a separately approved delete operation.

## Rollback and forward fix

Disable schedulers first. Roll back application traffic only when the prior version is compatible with the applied schema. Never roll back by dropping data-bearing schema under incident pressure. Use a reviewed forward migration for schema/data defects. Preserve R2 originals/quarantine and do not bulk-delete media. If authoritative data is corrupt, isolate traffic and follow backup restore; replay privacy tombstones before service resumes.

Provider configuration is conditional: Resend, Sentry, and GA4 remain disabled until sender/recipient, retention/scrubbing, consent/event dictionary, environment isolation, and owner decisions are approved. Tests/build must never make provider calls or use real recipients.
