# Phase 4 Application Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a production-ready Next.js foundation with strict boundaries, staff authentication infrastructure, validated configuration, observability contracts, tests, and CI—without implementing business workflows.

**Architecture:** One Next.js App Router modular monolith uses Server Components by default. Delivery imports application contracts/use cases, infrastructure implements inward-facing ports, and privileged provider adapters are isolated behind `server-only`; public and admin delivery/read boundaries remain distinct.

**Tech Stack:** Next.js 16.3.0, React 19, strict TypeScript, Tailwind CSS 4, shadcn/ui, Supabase JS/SSR, Zod, structured logging contract, Vitest, Testing Library, Playwright, ESLint, Prettier, npm.

## Global Constraints

- Do not implement property CRUD, media uploads, CRM, lead workflows, SEO landings, analytics, R2, Resend, Sentry, or final visual design.
- Do not weaken the Phase 3 RLS, grants, or disabled Data API boundary.
- Never expose or log `SUPABASE_SERVICE_ROLE_KEY`.
- Customer accounts remain out of V1; authenticated actors are ADMIN and ADVISOR staff.
- Use only the isolated `emlak-platformu` Supabase namespace and 55321–55327 ports; never mutate LMS Docker resources.
- Keep Route Handlers, Proxy, and future Server Actions thin; authorization remains mandatory inside application use cases.

---

### Task 1: Scaffold and dependency baseline

**Files:** Create `package.json`, `package-lock.json`, Next.js/Tailwind/ESLint/Prettier configs, `components.json`, and `src/app` root files.

- [ ] Scaffold Next.js App Router with `src/`, strict TypeScript, Tailwind, ESLint, npm, and import alias.
- [ ] Pin runtime and test dependencies, initialize shadcn non-interactively, and add scripts for lint, format check, typecheck, unit, integration, E2E, build, and generated-type verification.
- [ ] Verify a baseline production build before adding application behavior.

### Task 2: Configuration and server-only boundaries

**Files:** Create `src/config/env.client.ts`, `src/config/env.server.ts`, `src/config/env.test.ts`, `.env.example`, and boundary tests.

- [ ] Write failing tests proving malformed public URLs/keys fail, missing service credentials fail only at the privileged boundary, and secrets are never returned from client config.
- [ ] Implement Zod schemas with separate client/server accessors and `server-only` on secret-bearing modules.
- [ ] Add a leakage test that bundles/imports the browser boundary and proves the service-role key is absent.

### Task 3: Supabase clients and staff authentication

**Files:** Create browser, server, privileged, proxy/session, principal, and authentication port modules under `src/infrastructure/supabase` and `src/application/auth`.

- [ ] Write failing auth tests for missing claims, staff principal mapping, AAL2 ADMIN context, and unauthenticated `/admin` redirect.
- [ ] Implement browser/session-aware server clients with generated `Database` types and `getClaims()` verification.
- [ ] Implement a separate server-only privileged client with auth persistence/refresh disabled; expose no general bypass helper.
- [ ] Add `src/proxy.ts` for token refresh and coarse admin authentication only; application authorization remains independent.

### Task 4: Delivery, errors, correlation, and logging

**Files:** Create typed error/result/request-context/logger contracts, public/admin layouts, boundaries, and `src/app/api/health/route.ts`.

- [ ] Write failing tests for application error mapping, correlation ID validation/generation, health response shape, public render, and unauthenticated admin denial.
- [ ] Implement typed errors/results without provider types, request context with propagated/generated UUID, and a structured logger interface that redacts sensitive fields.
- [ ] Implement thin health/readiness delivery and minimal public/admin shells with loading, error, global-error, and not-found boundaries.

### Task 5: Security headers and generated database types

**Files:** Modify `next.config.ts`; generate `src/types/database.generated.ts`; add headers/type checks.

- [ ] Add CSP, nosniff, referrer, permissions, and frame-ancestor protections with a documented production nonce follow-up if inline scripts later require one.
- [ ] Generate Supabase types from the isolated local schema and verify the generated 44-table contract compiles without manual edits.
- [ ] Add tests/checks proving server-only modules are not reachable from Client Components.

### Task 6: Browser verification and CI

**Files:** Create Playwright config/smoke spec and `.github/workflows/quality.yml`.

- [ ] Add a smoke test for the public root and unauthenticated admin redirect/deny using a production-like local server.
- [ ] Add the quality gate: clean install, lint, format check, typecheck, unit/integration tests, generated-type verification, build, and Playwright smoke.
- [ ] Run the complete local quality gate, secret scan, and `git diff --check`; review all TSX with React best practices.

### Task 7: Publish for review

**Files:** All Phase 4 files only.

- [ ] Confirm the worktree contains no unrelated or secret-bearing files.
- [ ] Commit and push `agent/application-foundation`.
- [ ] Open a Draft PR targeting `main`; do not merge it.
