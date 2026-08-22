# Phase 11 lead customer conversion implementation plan

## Package A — design

Requirements, ADR, actual schema/RLS review and test matrix. Complete.

## Package B — domain policy

Provider-free contact normalization/resolution policy, conversion eligibility,
structured initial-request mapping and exhaustive unit tests. Complete:
deterministic identity lookup is exact normalized `VERIFIED` contact matching;
ambiguous candidates fail closed.

## Package C — schema foundation

Complete: expand-only `lead_conversions` provenance/request reference and
bounded codes; no destructive lead/customer migration, RLS weakening, or
guessed backfill.

## Package D — transactional conversion service

Complete: server command, trusted authorization, exact identity resolution,
customer and optional request creation, idempotency/concurrency, activity/audit
and real PostgreSQL integration tests. No provider call or automatic matching.

## Package E — admin lead UI

Complete: explicit conversion form on lead detail, safe immutable outcome,
request navigation where the authorized route exists, and non-leaking typed
error states. No global customer picker is exposed.

## Package F — final verification

Complete: documentation reconciliation, full relevant test/build/database
verification and PR preparation. No merge or remote database mutation. The
appointment reminder integration fixture uses an isolated earliest due
timestamp to avoid shared-outbox ordering flakiness; this is test-only
stabilization. Final review also keeps conversion-only lifecycle shortcuts
provenance-gated for every eligible state at the database boundary and records
only the verified contact channels that actually resolved an existing customer.
