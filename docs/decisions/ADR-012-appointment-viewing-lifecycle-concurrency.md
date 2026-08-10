# ADR-012: Lead-owned appointment lifecycle and availability boundary

## Status

Proposed — Phase 9 Package A design, 2026-08-10.

## Context

The repository has a pre-Phase-9 `appointments` table with the desired basic
status vocabulary and a PostgreSQL GiST exclusion constraint. Its ownership and
advisor policies are customer-based, while Phase 8's CRM is lead-based.
Scheduling also needs an auditable reschedule history, trustworthy staff scope,
and provider-independent reminders without making external delivery
authoritative.

## Decision

Appointments are a separate, lead-owned aggregate. Each has one `lead_id`, an
optional `property_id`, and one assigned advisor. Its lifecycle is independent
from the lead lifecycle:

```text
REQUESTED -> CONFIRMED -> COMPLETED
REQUESTED -> CANCELLED
CONFIRMED -> CANCELLED | NO_SHOW
```

`COMPLETED`, `CANCELLED`, and `NO_SHOW` are terminal. Rescheduling changes the
same aggregate and creates one immutable `RESCHEDULED` event; it does not create
another appointment or alter lead state.

Every mutable command compares optimistic `version` and writes aggregate,
append-only event, audit, and outbox data in one transaction. The database
retains a half-open GiST exclusion constraint per advisor. `REQUESTED` and
`CONFIRMED` reserve availability. The exclusion constraint is final authority
for create, confirm, reschedule, and reassignment races.

`appointment_events` is the source of appointment entries in the lead timeline.
The timeline projects it alongside `lead_activities`; it does not duplicate
appointment events into that table. Outbox intents are versioned reference-only
payloads; consumers re-check appointment eligibility before delivery.

## Alternatives considered

### Keep appointments customer-owned

Rejected: it conflicts with the lead CRM boundary and implies an automatic
customer/link decision that Phase 9 excludes.

### Create a new appointment for every reschedule

Rejected: it complicates timeline, stale reminders, availability holds, and
operational context. One aggregate plus immutable events is auditable.

### Enforce availability only in application code

Rejected: concurrent confirms/reschedules can bypass a preflight query. The
GiST constraint is the transactional integrity guard.

### Reserve availability only when confirmed

Rejected for this operational default: requested appointments are staff-held
slots, so they prevent double-promising until their terminal outcome.

### Duplicate lead activities for appointment history

Rejected: two histories drift. The read model projects one source.

## Consequences

The existing relation needs an expand/migrate/contract migration before runtime
implementation. Customer-based RLS policies must be replaced with lead-scope
policies, generated types change, and writes need a transaction-capable use
case. The system gains collision prevention, reschedule evidence, and a clean
future notification boundary at the cost of legacy-row handling and scheduled
outbox reconciliation.

## Security impact

Application authorization and forced RLS derive staff scope from trusted role,
advisor, and lead-assignment records. Advisors cannot choose a different advisor
from request data, reassign an appointment, or access another advisor's record
by ID. `anon` receives neither CRM grants nor policies.

Events, audits, and outbox payloads exclude raw contact PII, free-text notes,
and exact location. Sensitive denials use the durable Phase 8 denial-audit
boundary. Any scope helper is private, least-privileged, search-path-safe, and
explicitly granted only after review.

## Privacy and data impact

UTC instants are authoritative; an IANA display timezone is contextual data.
Location and notes are staff-only. Append-only history follows existing
retention, legal-hold, exceptional-redaction, and access rules. A future
reminder consumer resolves contact data late and only when authorized, so the
outbox is not a PII replica.

## Performance and operations impact

GiST adds a necessary write-time conflict check. Query-driven indexes serve
advisor/date, lead/date, property/date, and active-status reads. Admin reads
use bounded joins/preloaded summaries rather than N+1. Outbox delivery is after
commit; retry/lease failures cannot block CRM writes. Phase 9 changes no public
SEO route, sitemap, or cache contract.

## Migration and rollback considerations

Do not edit applied migrations. First inventory existing appointment rows. Add
lead-compatible fields and history structures, backfill only from an approved
deterministic source, validate, then tighten constraints and replace
customer-based policies. If no safe mapping exists, preserve legacy records as
restricted history and begin lead-owned creation only after an approved
compatibility decision.

The forward fix for an application rollout is to disable the new command path
while retaining immutable history and database integrity. Do not drop events,
relax availability constraints, or reintroduce customer-based access as a
rollback shortcut.

## Open decisions

The Phase 9 requirements specification owns the pending legacy migration,
timezone, reason-vocabulary, reminder-policy, and advisor permission decisions.
