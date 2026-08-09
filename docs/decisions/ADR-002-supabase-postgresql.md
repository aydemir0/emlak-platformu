# ADR-002: Supabase PostgreSQL as the Authoritative Operational Database

Status: Proposed
Date: 2026-08-09

## Context

Properties, media metadata, features, locations, advisors, leads, customers, requests, appointments, SEO pages, audit records, analytics events, and integration handoffs require relational integrity, transactional workflows, concurrency control, privacy lifecycles, and defense-in-depth authorization. The planned stack already includes PostgreSQL/Supabase and Supabase Auth.

## Decision

Use Supabase-managed PostgreSQL as the authoritative operational database for the modular monolith. Model cohesive domain ownership in relational structures; enforce required fields, relationships, business uniqueness, and expressible invariants with database constraints as well as server-side domain validation.

Application use cases own transaction boundaries, authorization, lifecycle transitions, idempotency, and concurrency policy. Use optimistic version checks for conflicting human edits, narrow row locks or database constraints for contended invariants, and keep provider network calls outside transactions. Business records are soft-deleted by default; restoration, retention, privacy erasure, and eventual hard deletion are explicit use cases.

Enable RLS deny-by-default for every client-accessible/exposed table, with object- and action-specific policies. Application authorization remains mandatory. Data API grants are reviewed separately from RLS. Service-role credentials are server-only and narrowly used. Audit records are append-only to normal application roles. Read models and views must not bypass RLS; use invoker semantics or keep them inaccessible to public roles.

## Alternatives considered

- Self-managed PostgreSQL: more operational control but unnecessary infrastructure burden at this phase.
- Document or key-value database as primary storage: weaker fit for relationships, invariants, transactions, and reporting.
- Provider SDK/direct table access as the domain model: couples rules to transport and risks bypassing use cases.
- RLS as the only authorization system: cannot express or consistently audit all business actions at the application boundary.

## Consequences

Positive consequences include one transactional source of truth, mature relational constraints, a durable outbox option, RLS defense in depth, and simpler operations. Costs include careful policy testing, migration discipline, connection management, lock awareness, and explicit separation between public read models and privileged commands.

**Assumption:** The first release's scale fits one primary operational PostgreSQL boundary with query-driven indexes and managed connection pooling.
**Open Decision:** Approve exact schemas, identifiers, role/permission matrix, appointment concurrency rules, backup/recovery targets, data residency, retention, and environment topology before implementation.

## Security impact

RLS is enabled and tested for anonymous, authenticated, advisor, operations, admin, service, cross-account, deleted, and malformed cases. Authorization data cannot come from user-editable metadata, and JWT-derived claims are treated as potentially stale for sensitive changes. Privileged functions are exceptional, non-public, least-privilege, and explicitly reviewed. Secrets, PII, and auth tokens are excluded from audit/analytics payloads.

## Performance impact

Indexes follow demonstrated filters, joins, ordering, active/published subsets, and foreign keys; no index is created for every SEO/filter combination. Transactions remain short, connections are pooled appropriately for the runtime, and important queries are verified with representative data and plans before optimization claims.

## SEO/data/operations impact

PostgreSQL supplies canonical property/location/SEO state and change timestamps for server-rendered read models, sitemap decisions, redirects, and cache invalidation. Soft deletion does not itself satisfy erasure. Backups, exports, analytics, and audit access follow the same classification and retention model. Operational changes are correlated with append-only audit evidence.

## Migration/rollback considerations

No schema is created by this ADR. Future changes use deterministic reviewed migrations, expand/migrate/contract for breaking changes, bounded backfills, explicit RLS/grants/constraints/indexes, and forward-fix or rollback instructions based on data-loss risk. Provider exit requires exporting relational data, auth identity mappings, and audit evidence while preserving identifiers and lifecycle semantics.
