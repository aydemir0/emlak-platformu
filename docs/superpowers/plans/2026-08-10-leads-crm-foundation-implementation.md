# Lead Capture and CRM Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement an abuse-resistant public lead intake and scoped staff CRM foundation without automatic identity/assignment decisions.

**Architecture:** Thin public/admin delivery adapters invoke application use cases. PostgreSQL owns lifecycle, idempotency, activity, audit, and outbox state; RLS is defense in depth. Provider adapters handle rate limiting, notification, and analytics after commit.

**Tech Stack:** Next.js App Router, TypeScript strict, PostgreSQL/Supabase local, Vitest, Playwright.

## Global constraints

- Use only local `emlak-platformu`; never link, mutate, or query a remote Supabase project.
- No anon CRM base-table grants or policies; all public writes go through a narrow server use case.
- No automatic lead/customer merge, link, customer conversion, or advisor assignment.
- Keep PII out of analytics, URLs, logs, shared caches, and outbox payloads.
- Do not create appointments in this phase.

## Package A — Schema and domain foundation

**Scope:** One reviewed additive migration, generated types, lifecycle/domain contracts, and database constraints for lead states, exact idempotency, normalized intake/provenance, `lead_activities`, optional justified assignment history, abuse signal, and query-driven indexes.

**Depends on:** None. **Estimated scope:** 1 migration; 6–10 domain/application/persistence files; unit/integration constraint tests.

- [ ] Write failing lifecycle, idempotency, normalized-contact, append-only activity, and RLS/grant contract tests.
- [ ] Apply the smallest additive local migration; regenerate database types; prove no anon CRM grant/policy exists.
- [ ] Implement strict domain transition and contact-normalization contracts without a hardcoded default region.
- [ ] Run focused database/integration/type tests and commit.

## Package B — Public lead intake

**Scope:** Public property-detail form contract, thin handler/action, server validation, public-property eligibility recheck, idempotent lead creation, duplicate-candidate recording, generic response, and rate-limit/CAPTCHA ports with deterministic test adapters.

**Depends on:** A. **Estimated scope:** 8–12 application/infrastructure/delivery files; public component enhancement; unit/integration/Playwright tests.

- [ ] Write failing tests for inactive/deleted property denial, contact/consent validation, exact idempotent retry, changed-payload key conflict, generic response, and PII-free delivery/analytics payloads.
- [ ] Implement one transaction that creates lead/activity/audit/outbox or returns the existing idempotent result.
- [ ] Add rate-limit and optional challenge interfaces; test adapter decisions without a provider integration.
- [ ] Render progressively enhanced property-detail form without client-owned business rules; run focused tests and commit.

## Package C — Admin CRM read and command surface

**Scope:** Admin lead list/detail, bounded scoped read models, status/note commands, ADMIN assignment/reassignment, and optimistic conflict feedback.

**Depends on:** A; B for real public intake fixtures. **Estimated scope:** 10–14 files; unit/integration/Playwright admin-flow tests.

- [ ] Write failing tests for ADMIN global scope, ADVISOR assigned-only scope, cross-advisor IDOR denial, stale transition conflict, terminal-state denial, and append-only activity/history.
- [ ] Implement application use cases and PostgreSQL read/write adapters with trusted current advisor scope.
- [ ] Add thin authenticated routes/actions and minimal operational UI; no export or appointment creation.
- [ ] Run focused tests and commit.

## Package D — Authorization, audit, and durable effects

**Scope:** Permission mapping, application/RLS alignment, audit detail, post-commit notification/analytics outbox contracts, and operational-safe failure behavior.

**Depends on:** A–C. **Estimated scope:** 5–8 files plus migration policy additions only when Package A did not establish them; integration tests.

- [ ] Write failing authorization matrix tests including no anon access, assignment/reassignment denial, conversion ADMIN-only, and service-role boundary.
- [ ] Add only necessary permissions/policies and transactionally emitted, PII-minimized outbox events.
- [ ] Implement deterministic notification/analytics adapters or no-op test adapters; prove provider failure does not roll back authoritative state.
- [ ] Run focused tests and commit.

## Package E — Verification and documentation

**Scope:** Cross-package regression coverage, database migration verification on local `emlak-platformu`, public/admin browser smoke flows, threat-model checks, and documentation reconciliation.

**Depends on:** A–D. **Estimated scope:** test/docs only; no new product behavior.

- [ ] Add end-to-end public intake, duplicate-safe retry, scoped advisor operation, and admin conversion smoke coverage.
- [ ] Run lint, format check, typecheck, unit, integration, local migration validation, build, Playwright, secret scan, remote-reference scan, and `git diff --check`.
- [ ] Reconcile architecture/database/ADR documentation and record unresolved decisions without inventing defaults.
- [ ] Commit verified work and open a Draft PR without merging.

## Plan self-review

- Packages A–E cover every locked Phase 8 decision: independent submissions, normalization, activity, lifecycle, manual assignment, privacy-safe intake, ADMIN conversion, abuse, outbox, analytics, and future appointment boundary.
- Schema precedes public intake; public intake precedes realistic CRM fixtures; authorization/effects are verified after commands exist; cross-flow tests finish the work.
