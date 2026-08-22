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
- `lead_conversions` records one immutable conversion per lead through its
  unique `lead_id`, customer FK, actor, timestamp, correlation ID and
  idempotency key. It also retains the optional initial request, bounded
  resolution kind, and bounded resolution evidence code. Historic rows retain
  null Package C provenance fields rather than receiving guessed values.

## Conversion policy

The command accepts a lead ID, an operation idempotency key, an optional
explicit existing customer ID, and a boolean choice to create an initial
all-`MISSING` request. Structured request criteria are not accepted because the
current lead schema does not capture them. Actor, role, assignment scope and
ownership are always server-derived.

1. Lock the lead and authorize it. ADVISOR requires assigned lead scope.
2. Return the existing `lead_conversions` outcome for an idempotent retry.
3. Resolve the customer only by an explicitly supplied authorized customer ID
   or exact normalized phone/email candidates. Names and free text never match.
4. If no candidate exists, create one customer and purpose-limited contact
   points from lead intake provenance.
5. If one candidate exists, link it without overwriting customer/contact data.
   An ADVISOR also needs existing customer CRM scope. Provenance records only
   the exact verified channel or channels that actually resolved that customer.
6. If phone and email resolve to different customers, or exact lookup produces
   an ambiguous candidate set, fail with `CUSTOMER_IDENTITY_CONFLICT`; never
   merge or select arbitrarily.
7. Optionally create at most one initial request in the same conversion
   operation; write conversion provenance, lead activity/audit evidence and
   transition the lead to `WON` atomically.

`WON` is the existing terminal lead state and is the successful conversion
outcome. The ordinary status command cannot select it. A pre-existing legacy
`WON` lead without conversion provenance is an integrity conflict requiring an
ADMIN-reviewed repair, never an inferred link.

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

## Implemented provenance schema

The additive Package C migration extends `lead_conversions` with nullable
`customer_request_id` (`ON DELETE RESTRICT`), bounded `resolution_kind`, and a
safe bounded resolution evidence code. Historical rows are not backfilled.
The existing unique idempotency key remains the conversion retry guard; the
conversion activity uses a derived source idempotency key only to preserve its
append-only evidence identity. No contact global-uniqueness constraint was
introduced.

## Implemented delivery boundary

The existing `/admin/leads/[id]` route renders a bounded conversion outcome
read model. An eligible unconverted lead can submit a Server Action; the action
derives the staff principal server-side and delegates to the conversion use
case. It never accepts actor, advisor, role, or customer-scope assertions from
the browser. An already converted lead shows its immutable result; `WON`
without conversion provenance is an admin integrity warning, not an automatic
repair. The optional existing-customer input is a direct reference only; there
is no customer directory or fuzzy picker.

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

- Whether `VERIFIED` remains the final product definition of an identity
  eligible for deterministic customer lookup beyond V1.
- Exact request fields captured at lead intake and eligible for conversion.
- Whether a future conversion emits an operator notification via outbox.
