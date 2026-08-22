# ADR-014: Lead customer conversion boundary

## Status

Accepted and implemented — 2026-08-11.

## Context

Leads, customers and requests already have separate ownership. `lead_conversions`
has one lead-to-customer record but current lifecycle and provenance do not yet
support a complete user-facing conversion command.

## Decision

Conversion is an explicit server-authorized operation. It keeps the lead as
history, resolves or creates exactly one canonical customer, optionally creates
one initial request, and writes one immutable conversion outcome. The existing
terminal `WON` lead state marks success; automatic conversion is prohibited.

The transaction locks the lead, relies on unique `lead_conversions.lead_id` for
one successful outcome, and commits customer/request/provenance/activity/audit
together. Exact normalized phone/email and an explicitly chosen authorized
customer are the only resolution inputs; ambiguity is a conflict. Matching V2,
notifications and appointment rewrites are excluded.

## Alternatives considered

- Mutating a lead into a customer: rejected; destroys acquisition history.
- Automatic conversion from appointments, status, or matching: rejected;
  violates explicit business consent and auditability.
- Fuzzy/name deduplication or automatic merge: rejected; unsafe identity link.
- Separate customer aggregate: rejected; duplicates existing canonical model.

## Consequences

The workflow is recoverable, idempotent and auditable, but requires an
additive provenance/request-reference migration before implementation. Existing
lead-owned appointments remain truthful. A human resolves ambiguous identity.

## Security and privacy impact

Application authorization and RLS remain defense in depth. Contact resolution
is server-only and permission-filtered; audit/outbox payloads omit raw PII.
No anonymous CRM access, service-role browser exposure, or customer enumeration
is introduced.

## Data and operations impact

The conversion uses indexed lead/conversion identity and exact normalized
contact lookup, not scans. It has no provider call inside the transaction. A
future post-commit effect uses the existing transactional outbox.

## Migration and rollback considerations

Use expand-first nullable provenance fields and retain all historic conversion
rows. Forward-disable the command if needed; never delete conversion evidence,
rewrite lead history, or backfill identity semantics by guesswork.

## Implementation evidence

Package C added only the nullable request reference and bounded provenance
codes. Package D implements a PostgreSQL transaction that locks the lead,
performs exact `VERIFIED` contact resolution or an explicit authorized link,
and writes the customer, optional all-`MISSING` request, conversion, `WON`
transition, activity, and audit atomically. The lead lock and conversion
uniqueness serialize concurrent commands; retries return the immutable outcome.
Exact-identity provenance records the verified channel or channels that
actually selected the canonical customer, not merely every contact on the lead.

Package E uses the existing lead detail route with a Server Action and a thin
client form. It has no customer enumeration, no Matching V2 trigger, no
provider call, and no appointment rewrite. Package F added regression coverage
that keeps the conversion persistence transition aligned with all three
eligible states: `QUALIFIED`, `VIEWING`, and `NEGOTIATION`. The database
requires conversion provenance for every `WON` transition; the ordinary status
workflow cannot create that outcome.
