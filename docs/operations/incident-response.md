# Incident response

## Roles and severity

The release ticket must name incident commander, application owner, database owner, security/privacy lead, communications owner, and provider owners. SEV-1 covers active data loss/exposure, authorization bypass, unavailable critical journeys, or unsafe media publication; SEV-2 covers degraded providers, growing backlogs, repeated worker failure, or broken readiness with safe primary state.

## First response

1. Open an incident timeline and preserve release, environment, correlation/run IDs, safe logs, alerts, and audit evidence. Do not paste secrets, PII, signed URLs, request bodies, or images.
2. Contain with the narrowest reversible control: disable the affected scheduler/provider adapter, stop traffic promotion, revoke an exposed credential, or hide affected public media. Do not delete rows/objects or weaken RLS.
3. Verify scope across authentication/authorization, PostgreSQL, Supabase, R2, Resend, telemetry, GA4, caches, and backups. Keep LMS and unrelated resources out of scope.
4. Recover through idempotent replay, forward fix, compatible app rollback, or isolated restore. Validate authoritative invariants and privacy tombstones before re-enabling traffic.
5. Communicate status and regulatory/privacy escalation through named owners; record decisions and timestamps.

## Trigger-specific controls

- Credential exposure: disable adapter, rotate secret, invalidate sessions where applicable, audit use, and verify previews cannot access production.
- PII/log leak: stop emission, restrict evidence, request provider deletion, assess notification obligations, and add a schema/redaction regression.
- Worker backlog/dead letters: disable only the failing family, inspect safe categories and oldest age, fix root cause, then replay with idempotency and bounded batches.
- Malicious/corrupt media: remove public eligibility, keep original/quarantine private, stop processing if needed, preserve evidence, and reconcile references without broad deletion.
- Database/migration failure: stop deploy and writers, capture locks/errors, choose compatible rollback or forward fix; restore only into isolation using the backup runbook.
- Telemetry outage: treat monitoring as degraded, retain safe runtime logs, do not make product transactions depend on the provider.

After recovery, verify health/readiness, security headers, critical read-only smoke, worker last-success/backlog, provider isolation, and no new PII exposure. Close only after a reviewed timeline, root cause, action owners/dates, evidence-retention decision, and runbook/test updates.
