# Lead Capture and CRM Foundation

## Purpose

Define the Phase 8 public property enquiry to staff CRM boundary. It creates auditable, privacy-minimized leads without exposing CRM tables to anonymous visitors or treating contact similarity as a customer identity decision.

## Implementation status

Phase 8 is implemented on `agent/leads-crm-foundation`: public intake, exact idempotency, duplicate-candidate evidence, scoped staff CRM, lifecycle commands, ADMIN-only assignment, append-only evidence, denial audit, and the PostgreSQL-backed outbox worker. Customer conversion and appointments remain deferred.

## Verification record

- Full unit suite: 148 tests across 41 files passed.
- Full local PostgreSQL integration suite: 27 tests across 10 files passed.
- Typecheck, ESLint, production build, and changed-file format checks passed.
- The existing five Playwright scenarios passed before the runner's local server teardown timed out. A separate rerun was blocked by the environment's process-start policy.
- The repository-wide format check reports pre-existing formatting drift in unrelated files; it was not mass-reformatted during this closing package.
- `npm audit` could not reach the npm audit endpoint in this environment. Supabase CLI and pgTAP are unavailable, and Docker API access is denied; clean reset, migration replay, and regenerated-type production drift verification remain outstanding.

## Confirmed decisions

- Each accepted real public submission creates an independent `lead`. Only an exact retry with the same idempotency key deduplicates.
- Contact similarity is a duplicate candidate, never an automatic lead merge, customer link, or customer merge.
- Raw and normalized contact input remain separate. Normalization records algorithm, version, provenance, and outcome. Email normalization excludes provider-specific Gmail dot/plus rewriting. Phone normalization uses a configurable default region; ambiguous values are not guessed.
- Lead activity uses a separate append-only `lead_activities` record, not `customer_activities`.
- V1 lead lifecycle is `NEW -> CONTACTED -> QUALIFIED -> VIEWING -> NEGOTIATION -> WON`; any non-terminal state may move to `LOST`. `WON` and `LOST` are terminal. Reopen is out of scope. `WON` is an explicit outcome and never automatically converts, links, or merges a customer.
- New public leads may be unassigned. There is no auto-assignment. Only ADMIN assigns or reassigns; ADVISOR sees and changes only leads currently assigned to that advisor.
- Public input requires property ID, at least one of phone/email, consent accepted, and idempotency key. Name and message are optional. Identity/customer/advisor IDs are never client-controlled.
- Accepted and duplicate-safe public responses are generic and non-enumerating.
- Customer conversion is a future ADMIN-only command boundary; it is not implemented in Phase 8. Advisor conversion remains deferred.
- Notifications and analytics use the transactional outbox after commit. Atomic PostgreSQL claims use leases; success marks `PROCESSED`, retryable failure returns to `PENDING`, non-retryable failure enters `DEAD_LETTER`, and expired leases are reclaimable. Provider calls remain outside database transactions and receive the outbox idempotency key.
- Analytics events are PII-free. No email, phone, name, message, address, or raw lead ID enters GA4 or equivalent systems.
- Appointment creation is excluded. Phase 8 exposes only a future integration contract.

## Data model and invariants

`leads` owns inbound contact intent, property reference, lifecycle, assigned advisor, consent provenance, idempotency identity, duplicate-candidate evidence, optimistic version, and soft-deletion metadata. It is never canonical customer identity.

`lead_activities` is append-only and references one lead. Required activity types: `CREATED`, `NOTE_ADDED`, `STATUS_CHANGED`, `ASSIGNMENT_CHANGED`, `DUPLICATE_CANDIDATE_DETECTED`, `CONTACT_ATTEMPTED`, and `CONVERSION_RECORDED`. Each row records actor/source, safe structured details, occurred time, correlation ID, and an idempotency key where the originating command is retryable. Notes are bounded PII-bearing free text with purpose-limited access.

`lead_assignment_history` is append-only assignment evidence. It must never be reconstructed from mutable `leads.assigned_advisor_id`.

Normalized intake/contact candidate records retain raw display value, normalized comparison value when unambiguous, contact channel, algorithm/version, provenance, and verification state. They permit candidate lookup but are not globally unique for unverified/shared data.

## Public intake contract

The delivery adapter accepts a strict allowlist:

```ts
type CreatePublicLeadInput = {
  propertyId: string;
  phone?: string;
  email?: string;
  consentAccepted: true;
  idempotencyKey: string;
  name?: string;
  message?: string;
};
```

The server derives `source`, timestamps, correlation/request identifiers, and bounded pseudonymized abuse signals. It first resolves the property through the same public-eligibility boundary used by the public property experience; draft, deleted, inactive, or restricted records yield the same generic public result.

The transaction validates input and consent, checks idempotency by a server-bound fingerprint, creates one lead for a new key, adds `CREATED`, writes audit/outbox evidence, and returns a generic acceptance envelope. Reuse of a key with materially different input returns a stable conflict internally and the same privacy-safe public response.

## Lifecycle and concurrency

Every transition checks current state and expected lead version, updates `leads.version`, appends `STATUS_CHANGED`, writes audit evidence, and enqueues only required post-commit effects in one transaction. Unlisted transitions and terminal-state edits fail with typed application errors. Assignment has its own expected-version update plus `ASSIGNMENT_CHANGED` and append-only assignment evidence.

Duplicate-candidate detection runs inside intake using bounded normalized contact lookups. It may append `DUPLICATE_CANDIDATE_DETECTED`; it never mutates a candidate lead/customer or reveals the candidate to the public actor.

## Authorization and RLS

| Action                      | ADMIN                                 | ADVISOR                    | Public                      |
| --------------------------- | ------------------------------------- | -------------------------- | --------------------------- |
| Create lead                 | no direct table write                 | no direct table write      | narrow server use case only |
| Read/list/detail            | all permitted operational leads       | assigned active leads only | none                        |
| Update status/note          | permitted                             | assigned lead only         | none                        |
| Assign/reassign             | permitted                             | denied                     | none                        |
| Convert to customer         | deferred                              | deferred                   | denied                      |
| Delete/restore/export/audit | permitted by explicit admin operation | denied                     | denied                      |

All CRM tables remain RLS-enabled and deny-by-default. Anon receives no CRM base-table grant or policy. Application authorization derives advisor scope from trusted database relationships, never payload fields or mutable client claims.

## Abuse, notifications, analytics, and appointment boundary

Rate limiting is a server-side adapter with configurable security defaults. Its key can combine property identity, pseudonymized keyed-HMAC network signal, and bounded submission/session signals. Raw IP is not stored in CRM records. CAPTCHA/bot providers implement an optional interface and are not required for Phase 8.

Outbox messages use reference-first, PII-minimized payloads and re-read authoritative state before delivery. Notifications and analytics occur post-commit. Analytics emits only allowlisted outcome/funnel data.

The future appointment contract may consume a qualified lead/customer identity, assigned advisor, optional property reference, correlation ID, and requested intent. It cannot create an appointment, reserve availability, or bypass the appointment exclusion constraint in this phase.

## Implemented schema scope

- `20260810150000_lead_crm_foundation.sql` aligns lifecycle values; adds idempotency fingerprint and pseudonymized abuse signal fields, normalized contact intakes, append-only activities/assignment history, query-driven indexes, RLS, and grants.
- `20260810150001_enforce_lead_lifecycle.sql` applies the authoritative transition trigger and keeps CRM writes server-mediated.
- `20260810160000_lead_activity_details.sql` adds safe structured activity details.

## Open decisions

- Exact consent text, purpose taxonomy, legal basis, and retention windows.
- Default phone region configuration ownership and invalid/ambiguous-input user messaging.
- Exact duplicate-candidate relationship representation and staff review UX.
- Lost/outcome reason vocabulary and whether a future reopen workflow is ever required.
- Notification recipients, template policy, retry/SLO, and provider selection.
- CAPTCHA provider, activation criteria, and rate-limit thresholds.
- Worker identity/attempt fencing and operational retry budget/backoff configuration.
