# Lead Capture and CRM Foundation

## Purpose

Define the Phase 8 public property enquiry to staff CRM boundary. It creates auditable, privacy-minimized leads without exposing CRM tables to anonymous visitors or treating contact similarity as a customer identity decision.

## Confirmed decisions

- Each accepted real public submission creates an independent `lead`. Only an exact retry with the same idempotency key deduplicates.
- Contact similarity is a duplicate candidate, never an automatic lead merge, customer link, or customer merge.
- Raw and normalized contact input remain separate. Normalization records algorithm, version, provenance, and outcome. Email normalization excludes provider-specific Gmail dot/plus rewriting. Phone normalization uses a configurable default region; ambiguous values are not guessed.
- Lead activity uses a separate append-only `lead_activities` record, not `customer_activities`.
- V1 lead lifecycle is `NEW -> CONTACTED -> QUALIFIED -> VIEWING -> NEGOTIATION -> WON`; any non-terminal state may move to `LOST`. `WON` and `LOST` are terminal. Reopen is out of scope. `WON` is an explicit outcome and never automatically converts, links, or merges a customer.
- New public leads may be unassigned. There is no auto-assignment. Only ADMIN assigns or reassigns; ADVISOR sees and changes only leads currently assigned to that advisor.
- Public input requires property ID, at least one of phone/email, consent accepted, and idempotency key. Name and message are optional. Identity/customer/advisor IDs are never client-controlled.
- Accepted and duplicate-safe public responses are generic and non-enumerating.
- Conversion is an explicit ADMIN-only command in Phase 8. Advisor conversion remains deferred.
- Notifications use the transactional outbox after commit. A notification failure cannot roll back lead creation.
- Analytics events are PII-free. No email, phone, name, message, address, or raw lead ID enters GA4 or equivalent systems.
- Appointment creation is excluded. Phase 8 exposes only a future integration contract.

## Data model and invariants

`leads` owns inbound contact intent, property reference, lifecycle, assigned advisor, consent provenance, idempotency identity, duplicate-candidate evidence, optimistic version, and soft-deletion metadata. It is never canonical customer identity.

`lead_activities` is append-only and references one lead. Required activity types: `CREATED`, `NOTE_ADDED`, `STATUS_CHANGED`, `ASSIGNMENT_CHANGED`, `DUPLICATE_CANDIDATE_DETECTED`, `CONTACT_ATTEMPTED`, and `CONVERSION_RECORDED`. Each row records actor/source, safe structured details, occurred time, correlation ID, and an idempotency key where the originating command is retryable. Notes are bounded PII-bearing free text with purpose-limited access.

`lead_assignment_history` is append-only if the existing audit log cannot safely answer who changed assignment, from which advisor, to which advisor, why, and when without storing excess PII. It must never be reconstructed from mutable `leads.assigned_advisor_id`.

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

Duplicate-candidate detection runs inside intake/conversion use cases using bounded normalized contact lookups. It may append `DUPLICATE_CANDIDATE_DETECTED`; it never mutates a candidate lead/customer or reveals the candidate to the public actor.

## Authorization and RLS

| Action | ADMIN | ADVISOR | Public |
| --- | --- | --- | --- |
| Create lead | no direct table write | no direct table write | narrow server use case only |
| Read/list/detail | all permitted operational leads | assigned active leads only | none |
| Update status/note | permitted | assigned lead only | none |
| Assign/reassign | permitted | denied | none |
| Convert to customer | permitted explicit command | deferred | denied |
| Delete/restore/export/audit | permitted by explicit admin operation | denied | denied |

All CRM tables remain RLS-enabled and deny-by-default. Anon receives no CRM base-table grant or policy. Application authorization derives advisor scope from trusted database relationships, never payload fields or mutable client claims.

## Abuse, notifications, analytics, and appointment boundary

Rate limiting is a server-side adapter with configurable security defaults. Its key can combine property identity, pseudonymized keyed-HMAC network signal, and bounded submission/session signals. Raw IP is not stored in CRM records. CAPTCHA/bot providers implement an optional interface and are not required for Phase 8.

Outbox messages use reference-first, PII-minimized payloads and re-read authoritative state before delivery. Notifications and analytics occur post-commit. Analytics emits only allowlisted outcome/funnel data.

The future appointment contract may consume a qualified lead/customer identity, assigned advisor, optional property reference, correlation ID, and requested intent. It cannot create an appointment, reserve availability, or bypass the appointment exclusion constraint in this phase.

## Required future migration scope

- align the `leads` lifecycle constraint with the locked states;
- add normalized contact intake/provenance and idempotency/fingerprint fields with explicit privacy/retention behavior;
- add append-only `lead_activities` and, if needed after audit review, `lead_assignment_history`;
- add pseudonymized abuse-signal storage only where it is necessary and retention-governed;
- add only query-driven indexes for idempotency, advisor/status/updated lead lists, property/created lead lists, and duplicate-candidate lookup;
- add RLS/grants/constraint tests without granting anon CRM base-table access.

## Open decisions

- Exact consent text, purpose taxonomy, legal basis, and retention windows.
- Default phone region configuration ownership and invalid/ambiguous-input user messaging.
- Exact duplicate-candidate relationship representation and staff review UX.
- Lost/outcome reason vocabulary and whether a future reopen workflow is ever required.
- Notification recipients, template policy, retry/SLO, and provider selection.
- CAPTCHA provider, activation criteria, and rate-limit thresholds.
- Whether `lead_assignment_history` is required in addition to audit logs after an audit-payload review.
