# Phase 11 lead customer conversion implementation plan

## Package A — design

Requirements, ADR, actual schema/RLS review and test matrix. Complete.

## Package B — domain policy

Provider-free contact normalization/resolution policy, conversion eligibility,
structured initial-request mapping and exhaustive unit tests. Depends on the
open canonical-contact policy.

## Package C — schema foundation

Expand-only `lead_conversions` provenance/request reference and any reviewed
index/RLS changes. No destructive lead/customer migration or guessed backfill.

## Package D — transactional conversion service

Server command, trusted authorization, exact identity resolution, customer and
optional request creation, idempotency/concurrency, activity/audit and real
PostgreSQL integration tests. No provider call or automatic matching.

## Package E — admin lead UI

Explicit confirmation/review on lead detail, safe existing-conversion state,
customer/request navigation and non-leaking error states.

## Package F — final verification

Documentation reconciliation, full relevant test/build/database verification
and PR preparation. No merge or remote database mutation.
