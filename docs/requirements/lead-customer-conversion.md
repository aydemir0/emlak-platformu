# Lead to customer conversion

## Purpose

Define an explicit, auditable workflow that converts one qualified inbound lead
into one canonical customer and optionally one initial customer request. A lead
remains an immutable historical inbound record; conversion never mutates it
into a customer and is never automatic.

## Confirmed model

- `leads` hold inbound contact/message/consent evidence and currently end at
  `WON` or `LOST`.
- `customers` are canonical CRM entities; contact identity is held separately
  in `customer_contact_points`.
- `customer_requests` own independent search and Matching V2 profiles.
- `lead_conversions` already records one immutable conversion per lead through
  its unique `lead_id`, customer FK, actor, timestamp, correlation ID and
  idempotency key. It does not yet reference an initial request or a durable
  identity-resolution decision.

## Conversion policy

The command accepts a lead ID, an operation idempotency key, optional explicit
existing customer ID, and explicitly structured initial-request fields. Actor,
role, assignment scope and ownership are always server-derived.

1. Lock the lead and authorize it. ADVISOR requires assigned lead scope.
2. Return the existing `lead_conversions` outcome for an idempotent retry.
3. Resolve the customer only by an explicitly supplied authorized customer ID
   or exact normalized phone/email candidates. Names and free text never match.
4. If no candidate exists, create one customer and purpose-limited contact
   points from lead intake provenance.
5. If one candidate exists, link it without overwriting customer/contact data.
   An ADVISOR also needs existing customer CRM scope.
6. If phone and email resolve to different customers, or exact lookup produces
   an ambiguous candidate set, fail with `CUSTOMER_IDENTITY_CONFLICT`; never
   merge or select arbitrarily.
7. Optionally create at most one initial request in the same conversion
   operation; write conversion provenance, lead activity/audit evidence and
   transition the lead to `WON` atomically.

`WON` is the existing terminal lead state and is the successful conversion
outcome. A pre-existing `WON` lead without conversion provenance is an
integrity conflict requiring an ADMIN-reviewed repair, never an inferred link.

## Initial customer request

Creation is optional. Only structured, explicitly captured lead-interest data
may map to a request. Unknown criteria are `MISSING`; a known explicit value is
`CONSTRAINED`; `FLEXIBLE` is used only when captured explicitly. Free-text
message, appointment history and AI extraction never fabricate budget, rooms,
location, property type or features. Conversion does not calculate Matching V2.

## Authorization and privacy

ADMIN may convert leads in administrative scope. ADVISOR may convert only an
assigned lead and may link/create only within trusted customer/request policy.
Unauthorized lead/customer IDs are non-enumerating. Contact lookup stays in the
server transaction; responses/audits contain identifiers and safe outcome
codes, not raw email, phone, name, message or payload.

## Transaction, idempotency and side effects

One PostgreSQL transaction locks the lead, resolves/creates the customer,
creates the optional request, writes immutable provenance/activity/audit, and
marks the lead `WON`. The unique conversion relation plus the lead row lock
serializes concurrent commands. Failure rolls back every mutable record.
No email, analytics or match generation occurs in the transaction. A future
notification must use the existing post-commit outbox boundary.

## Required Package C schema proposal

An additive migration should extend `lead_conversions` with nullable
`customer_request_id` (FK restrict), a bounded `resolution_kind`, and a safe
resolution evidence code; it should not alter historical rows. Package C must
also decide whether a conversion-specific source idempotency key is required in
addition to the existing unique conversion key. No contact global-uniqueness
constraint is proposed until canonical/verified contact policy is approved.

## Appointment interaction

Existing lead-owned appointments stay attached to their lead and are not
rewritten or duplicated. Future customer-native appointments require a separate
forward-only decision; conversion merely preserves provenance.

## Acceptance and test matrix

- New customer, exact existing customer, idempotent retry and one-conversion
  uniqueness.
- Conflicting/ambiguous normalized identities, no fuzzy matching, and no
  canonical-data overwrite.
- ADMIN allow; scoped ADVISOR allow; cross-lead/customer denial without ID
  disclosure.
- Optional request with only explicit criteria; unknown values remain missing;
  no automatic Matching V2 generation.
- Concurrent attempts, rollback after every mutable step, provenance/activity/
  audit evidence, RLS and append-only behavior.

## Open decisions

- Which verified/canonical contact-point state makes an email or phone eligible
  for deterministic customer lookup.
- Whether ADVISOR conversion is permitted in V1 or remains ADMIN-only pending
  an approval policy; Package A preserves the requested scoped design but this
  role grant needs product confirmation.
- Exact request fields captured at lead intake and eligible for conversion.
- Whether a future conversion emits an operator notification via outbox.
