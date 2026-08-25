# Backup and restore

## Scope and safety

PostgreSQL is authoritative for business state; R2 is separately backed by object retention/versioning policy. Backups contain PII and require encryption, least-privilege access, environment isolation, access audit, and an approved retention schedule. Never restore production data into local, CI, preview, or LMS resources.

The accountable database owner, incident commander, security/privacy approver, production RPO/RTO, Supabase backup tier, PITR window, residency, and expiry policy must be recorded in the release ticket before deployment. Until then the release gate remains open.

## Local rehearsal evidence, 2026-08-25

After a clean local reset, an application-scoped custom-format dump was made from only `public`, `private`, `auth`, and `supabase_migrations`. A new explicitly named local database was created in `supabase_db_emlak-platformu`; required `extensions.btree_gist` and `extensions.pgcrypto` prerequisites were installed; the dump restored with `--exit-on-error --no-owner --no-privileges`; the temporary database was then dropped.

Verified after restore: 49 public tables, 24 private functions, 19 migration-history rows, 49 public tables with RLS enabled, and the appointment overlap exclusion constraint. Seed business counts were zero both before and after reset, so non-zero count equality could not be proven locally. The first full-stack dump also proved why platform-owned schemas must use the provider-supported backup/PITR path: restoring the `realtime` function required a privileged setting unavailable to the ordinary restore role.

## Production procedure

1. Verify exact source project, backup timestamp, encryption, checksum, PITR capability, and approvers. Stop on any identity mismatch.
2. Create an isolated restore destination with no public traffic, schedulers, provider credentials, email delivery, analytics, or R2 delete authority.
3. Use the provider-supported full backup/PITR workflow for Supabase-owned schemas. For application-only logical recovery, install reviewed extension prerequisites before restoring the four application schemas above.
4. Verify migration count, schema/table counts, critical foreign keys and exclusion constraints, all RLS/grants, lead conversion rows, appointments, matching rows, media references, and audit/outbox integrity. Run pgTAP and application integration tests.
5. Replay approved privacy erasure/tombstones before access. Never enable providers or workers during validation.
6. Record duration against RTO and oldest recoverable point against RPO. Destroy the isolated destination under the approved retention process.

Restore failure is handled by preserving evidence, stopping traffic enablement, and using a forward repair or an earlier verified recovery point. Never “fix” a failed production restore by dropping unknown schemas or bypassing RLS.
