# ADR-010: Database identifier, money, and time value types

- **Status:** Proposed
- **Date:** 2026-08-09

## Context

The Phase 2 data model needs stable identifiers across domain modules, exact property prices, and unambiguous time semantics before any PostgreSQL migration is written. These choices affect every foreign key, index, API contract, cache key, audit record, import/export, and future data migration. The first release is a single-organization modular monolith, but public identifiers must not expose storage sequencing or bind URLs to mutable slugs.

## Decision

Use the following provider-neutral value-type rules:

### Identifiers

- Domain aggregates and independently addressable business records use immutable PostgreSQL `uuid` primary keys.
- `properties.id` is always the internal UUID. A separate immutable `properties.public_id` is the human/support-facing identifier, and slug history remains a separate SEO concern.
- Pure junction tables use a composite primary key when no record references the relationship and the relationship has no independent lifecycle. Junctions with provenance, ordering, lifecycle, or external references receive their own UUID.
- High-volume append-only records may use `bigint identity` as an internal storage key only when they also retain any externally supplied UUID/idempotency identifier needed for deduplication and correlation.
- UUID generation is an infrastructure concern. Implementation must use a cryptographically safe database- or server-generated value supported by the selected Supabase/PostgreSQL version; the domain contract depends only on UUID uniqueness and immutability.
- Public URLs, R2 object keys, and external integration payloads must not rely on sequential database identifiers.

### Money

- Store property prices and other exact monetary amounts as signed `bigint` minor units plus a required uppercase three-letter currency code.
- Domain checks make amounts non-negative where the business meaning cannot be negative. Calculated deltas may be signed but are never the authoritative price.
- Currency scale and display formatting come from an application-owned currency catalog/rule, not floating-point arithmetic or locale-formatted database strings.
- Do not use PostgreSQL `money`, IEEE floating-point, or a single implicit platform currency.

### Time

- Store instants as `timestamptz` and interpret them as UTC at persistence boundaries.
- Store business calendar dates without a time-of-day as `date`.
- Appointment boundaries use `starts_at` and `ends_at` instants with `ends_at > starts_at`; display and calendar interpretation use an explicit IANA timezone supplied by the application/site configuration.
- Do not store a timezone-less `timestamp` for an instant. Do not infer timezone from database server, browser, advisor, or deployment region defaults.
- Mutable records use `created_at` and `updated_at`; soft-deletable records use `deleted_at`. Append-only facts normally use one occurrence/creation instant rather than mechanical update metadata.

This ADR defines types and invariants, not executable DDL, UUID extensions, formatting code, or migrations.

## Alternatives considered

- **`bigint identity` for every primary key:** compact and index-friendly, but leaks ordering when exposed and makes distributed/imported identity coordination harder. Retained only for suitable internal append-only storage keys.
- **UUIDv4 for every row:** simple and broadly supported, but unnecessary on pure junctions and can create less-local indexes at high volume.
- **UUIDv7 as a mandatory database default:** improves index locality, but would prematurely require a specific PostgreSQL/Supabase capability or extension. It remains an implementation-time option after compatibility verification.
- **`numeric(p,s)` for all money:** exact and flexible, but scale/rounding decisions can drift between rows and clients. It is reserved for a future requirement that cannot be represented in known currency minor units.
- **Implicit Turkish lira:** simpler initially, but makes imports, reporting, and future currencies ambiguous. Currency is explicit even when TRY is the dominant default.
- **Floating point for prices:** rejected because binary floating point cannot guarantee exact monetary equality or history.
- **Local timestamp plus timezone text only:** rejected because ambiguous or repeated local times complicate ordering and collision checks.

## Consequences

Positive consequences are exact arithmetic, explicit currency boundaries, reliable instant ordering, stable non-sequential business identity, and consistent foreign-key contracts. Costs are larger UUID indexes than sequential integers, mandatory currency conversion/formatting rules, and explicit timezone handling at application boundaries.

## Security and privacy impact

Opaque internal UUIDs reduce trivial enumeration but are not authorization controls. Human public identifiers and UUIDs still require object-level authorization. Timezone and currency fields are not trusted client claims for pricing, availability, or authorization. Audit and analytics payloads may reference stable identifiers but must still avoid unnecessary PII.

## Performance impact

UUID indexes are larger than `bigint` indexes, so composite and covering indexes must remain query-driven. Pure junction composite keys avoid redundant surrogate indexes. Minor-unit `bigint` comparisons and sums are efficient and exact. Time-range and appointment collision indexes can operate on `timestamptz` boundaries without per-query timezone conversion.

## SEO, data, and operations impact

Public IDs and slugs remain independent: slug changes do not change entity identity, and public support references do not expose storage order. Price history uses the same amount/currency representation as current property price, preventing metadata and structured-data drift. Operations must define currency-scale validation and the canonical IANA timezone before imports and appointment scheduling begin.

## Migration/rollback considerations

No schema change is made by this ADR. The first migration must encode these types consistently because later conversion of primary keys, money scale, or timezone semantics is costly. A future UUID-generation change must preserve existing UUIDs. A money-type migration requires dual-write/reconciliation and exact conversion checks; a timezone correction requires source provenance and must never reinterpret historical instants silently.

## Assumptions

- TRY is the dominant initial currency, but records retain explicit currency codes.
- Monetary values needed in the initial scope can be represented in ISO-style minor units within signed `bigint` range.
- Appointments are stored as concrete instants rather than recurring local calendar rules in V1.

## Open Decisions

- Select the supported UUID generation mechanism after the target Supabase/PostgreSQL version and extension policy are confirmed.
- Define the format, issuance sequence, and non-reuse policy for `properties.public_id`.
- Confirm the canonical business IANA timezone and whether individual advisors may override it for display/calendar purposes.
- Confirm whether any planned amount requires fractional minor units or precision beyond the selected currency scale.
