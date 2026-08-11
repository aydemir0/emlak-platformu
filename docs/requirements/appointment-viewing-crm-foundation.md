# Phase 9 — Appointment / Viewing CRM Foundation

## Status and purpose

**Status:** Implemented in Phase 9 Packages B–D; Package E verification in progress.

This specification adds a staff-operated appointment/viewing aggregate to the
lead CRM. An appointment belongs to exactly one lead, optionally references a
property, and has one responsible advisor. It is not a customer conversion
workflow and never changes the lead lifecycle implicitly.

## Verified baseline and boundary

The existing `public.appointments` table predates Phase 9. It is customer-owned
(`customer_id` is required), optionally relates to a customer request, uses
`advisor_id`, and already contains the locked status vocabulary. PostgreSQL
currently prevents half-open overlap for the same non-null advisor when the row
is not deleted and is not `CANCELLED`.

Phase 9 uses an expand-first migration: new appointments are lead-owned, while
`lead_id` remains nullable to preserve legacy customer-owned rows. It does not
invent a customer, convert a lead, delete a row, or impose a backfill.

## Scope

Included: staff-created lead-owned appointments; advisor assignment,
rescheduling, lifecycle, audit, and lead-timeline visibility; database-enforced
availability; provider-independent notification/reminder intents; and
operational SSR list/detail read models.

Excluded: customer conversion, automatic lead-status changes, customer/public
portal, payment, calendar/meeting sync, SMS/WhatsApp, provider delivery,
export/delete/restore, and public appointment booking.

## Proposed aggregate and schema contract

`appointments` remains the authoritative mutable aggregate. PostgreSQL owns its
state; an outbox message is only a durable request for later side effects.

| Field                                                        | Proposed contract                                         | Notes                                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| `id`                                                         | UUID primary key                                          | Existing UUID strategy remains.                                            |
| `lead_id`                                                    | nullable FK to `leads(id)`, `RESTRICT` update/delete      | Required by new command paths; null preserves legacy customer rows.        |
| `property_id`                                                | nullable FK to `properties(id)`, `RESTRICT` update/delete | A viewing may be lead-only before selection.                               |
| `advisor_id`                                                 | required FK to `advisors(id)`, `RESTRICT` update/delete   | Retain the existing physical name; it means assigned responsible advisor.  |
| `status`                                                     | required checked text                                     | `REQUESTED`, `CONFIRMED`, `COMPLETED`, `CANCELLED`, `NO_SHOW`.             |
| `starts_at`, `ends_at`                                       | required UTC `timestamptz` with `ends_at > starts_at`     | Existing half-open range semantics remain.                                 |
| `scheduled_timezone`                                         | nullable nonblank display timezone                        | New command paths require a supplied timezone; legacy values are retained. |
| `location_note`, `notes`                                     | nullable bounded staff-only text                          | Never copied to audit, analytics, or generic outbox payloads.              |
| `resolution_reason_code`, `resolution_note`                  | nullable terminal-outcome fields                          | For cancellation/no-show only; no product enum is introduced.              |
| `version`                                                    | required positive bigint                                  | Compared by every mutation.                                                |
| `created_by_user_identity_id`, `updated_by_user_identity_id` | trusted actor FKs                                         | Derived server-side, never from request input.                             |
| `idempotency_key`                                            | creation-command unique key                               | Exact create retry only.                                                   |
| timestamps / `deleted_at`                                    | existing metadata                                         | Delete/restore stays out of scope.                                         |

Package B added the append-only `appointment_events` table; appointment actions
are not duplicated into `lead_activities`.

| Field                                      | Contract                                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `id`, `appointment_id`, `occurred_at`      | immutable identity, required appointment FK, UTC instant                                                                    |
| `event_type`                               | checked: `CREATED`, `CONFIRMED`, `RESCHEDULED`, `CANCELLED`, `COMPLETED`, `NO_SHOW`, `ASSIGNED`, `REASSIGNED`               |
| `actor_user_identity_id`, `correlation_id` | trusted actor and request/job correlation evidence                                                                          |
| `source_idempotency_key`                   | unique nullable command key; a replay returns the existing result                                                           |
| `event_data`                               | allowlisted JSONB: status, old/new schedule, advisor IDs, non-PII reason code; never notes, contact data, or exact location |

`appointment_events` is immutable to normal roles. Retention, exceptional
redaction, and legal-hold handling follows the existing append-only evidence
policy.

### Migration proposal only

Package B should propose fields for lead ownership, timezone, trusted actor
metadata, terminal outcomes, and events, plus indexes/RLS described below. It
must first determine whether legacy rows exist before `lead_id`/`advisor_id` are
tightened to `NOT NULL` or customer/request columns are retired. Existing
`appointment_type` has no Phase 9 behaviour; it gets no invented default or
vocabulary.

## Lifecycle

```text
REQUESTED --confirm--> CONFIRMED --complete--> COMPLETED
     |                    |\--no-show----> NO_SHOW
     |                    \---cancel-----> CANCELLED
     \------cancel------------------------> CANCELLED

COMPLETED, CANCELLED, and NO_SHOW are terminal.
RESCHEDULED is an event on REQUESTED or CONFIRMED, not a status.
```

Only the arrows above are valid. Reschedule changes the existing appointment's
UTC interval, display timezone if supplied, and `version`, then records exactly
one event. It never creates a replacement appointment or changes lead status.
Terminal commands return typed terminal-state/invalid-transition errors.

## Concurrency and availability

Every mutable command receives `expected_version`. The application locks the
appointment, verifies trusted authorization and version, writes one mutation,
event, audit row, and applicable outbox records in one transaction. A stale
version returns a typed conflict without partial effects.

The current GiST exclusion constraint uses `tstzrange(starts_at, ends_at,
'[)')`, so adjacent bookings are valid. Package B retains a database exclusion
constraint after lead ownership. `REQUESTED` and `CONFIRMED` participate;
`CANCELLED`, `COMPLETED`, and `NO_SHOW` do not. An exclusion violation is the
final availability authority for create, confirm, reschedule, and reassignment;
it rolls back every command side effect.

## Authorization and RLS alignment

Authentication establishes staff identity. Application authorization and RLS
independently derive role/scope from trusted tables; payloads never select
advisor identity, lead scope, or assignment.

| Action                                     | ADMIN                                   | ADVISOR                                | RLS target                                       |
| ------------------------------------------ | --------------------------------------- | -------------------------------------- | ------------------------------------------------ |
| List/read                                  | Any permitted operational row           | Only own assigned, lead-scoped rows    | Same predicate on `SELECT`.                      |
| Create                                     | Accessible lead; chooses active advisor | Accessible lead; self-assignment only  | `INSERT` checks lead scope and self-assignment.  |
| Confirm/reschedule/cancel/complete/no-show | Any visible row                         | Own assigned, lead-scoped row only     | `UPDATE` uses matching `USING` and `WITH CHECK`. |
| Assign/reassign                            | Allowed                                 | Denied                                 | Advisor change is privileged-only.               |
| Event/timeline read                        | Audit policy allows                     | Only own authorized appointment events | Correlated appointment visibility.               |

Package B conservatively splits legacy customer rows from new lead-owned rows:
new advisor access requires self-assignment and trusted lead scope; legacy rows
retain their existing safe customer scope. Force RLS/deny-by-default remains;
no `anon` grant/policy or general bypass helper was added.

## CRM timeline and audit contract

Appointment events are written once. The lead-detail timeline reads authorized
`lead_activities` and appointment events in descending time order; it does not
insert duplicate lead-activity rows. Creation, confirmation, reschedule,
cancellation, completion, no-show, and reassignment atomically write the
aggregate change, exactly one event, minimized audit evidence, and applicable
outbox records. Notes, contact data, and exact location never enter event,
audit, or outbox JSON.

## Outbox and reminder contract

Use the existing PostgreSQL outbox claim/lease/retry/idempotency contract. No
queue, event bus, or real provider is added. The implemented producer intent is
`appointment.reminder_requested.v1`.

Payloads contain references only: appointment ID/version, event ID/type,
correlation ID, and a non-PII reminder key. A later authorized dispatcher
re-reads current appointment/contact data. Provider failure never rolls back
the authoritative transaction.

Reminder work is scheduled by outbox due/next-attempt data. The configurable
default emits one standard reminder 24 hours before a future `CONFIRMED`
appointment; terminal and `REQUESTED` appointments emit none. Its idempotency key
derives from appointment ID, version, and reminder key. Before delivery the
consumer rechecks that the appointment is non-deleted, `CONFIRMED`, and has the
expected version/schedule. Reschedule/cancel therefore suppresses stale work
without an unsafe cross-system cancel.

## Read models and UI boundary

Package C will add server-rendered `/admin/appointments` and
`/admin/appointments/{id}`. The list has upcoming/past, advisor, date, status,
property, and lead filters plus pagination. Detail includes authorized event
history, lifecycle controls, and admin-only assignment. Lead detail receives a
bounded appointment section/timeline. Repositories preload lead/property/advisor
summaries to avoid N+1; UI owns no lifecycle, availability, or authorization.

## Implemented acceptance criteria

- No appointment exists without an authorized lead and responsible advisor.
- Only the documented graph is accepted; terminal states never reopen.
- Stale version or GiST collision leaves no partial event/audit/outbox effect.
- Advisors cannot access, mutate, or reassign another advisor's appointment by ID.
- A business action appears once in appointment history and once in timeline projection.
- Provider payloads contain no contact PII or staff notes; provider failure is isolated.
- Public property and Phase 8 lead-intake behaviour remains unchanged.

## Open decisions

1. Safe future retirement/backfill strategy for legacy customer-owned rows.
2. Final reminder timings, kinds, recipient resolution, consent and quiet-hours policy.
3. Notification provider and scheduler runtime.
4. Mode/location and cancellation/no-show reason vocabularies and retention.
5. Final IANA timezone validation/default policy.
