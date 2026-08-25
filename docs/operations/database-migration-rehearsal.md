# Database migration rehearsal

Status: local evidence captured 2026-08-25. This is not production migration authorization.

## Evidence

- Target was only the local Supabase project `emlak-platformu` on port `55322`.
- `supabase@2.113.0 db reset --local` replayed all 19 migrations and the seed successfully.
- `supabase@2.113.0 test db` passed 6 files and 121 assertions.
- No migration or generated database type changed in Package E.

## Lock-sensitive history

The baseline schema/index migration creates many ordinary indexes and the appointment GiST exclusion constraint. The media, lead, appointment, matching, and conversion migrations add columns, constraints, policies, triggers, and indexes with normal PostgreSQL table locks. The Package D lead abuse index uses a short `lock_timeout`, but is not concurrent. These operations are safe on an empty reset; that does not prove a populated production lock window.

Production sequence is therefore: freeze schema writers, capture backup/PITR checkpoint, inspect blockers in `pg_stat_activity`/`pg_locks`, apply migrations one release at a time in a reviewed maintenance window, observe lock wait and duration, then deploy the compatible app. Do not run a remote reset. If a lock timeout occurs, stop and forward-fix the migration method; do not repeatedly retry against traffic. Data-bearing migrations use forward fixes, not destructive rollback. Application rollback is permitted only while schema compatibility is retained.

## Remaining external proof

Representative production volume, Supabase plan/PITR ownership, maintenance window, lock budget, and production migration runner remain deployment-owner decisions for Package F. No remote resource was inspected or changed.
