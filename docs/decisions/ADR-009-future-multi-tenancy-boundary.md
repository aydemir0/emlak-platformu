# ADR-009: Future multi-tenancy boundary

- **Status:** Proposed
- **Date:** 2026-08-09

## Context

The initial product scope does not confirm multiple independent real-estate organizations. Implementing tenant isolation speculatively would affect every table, constraint, index, RLS policy, cache key, object key, URL, analytics event, and operational workflow. Ignoring the possibility entirely could also make a later transition unnecessarily risky.

## Decision

Do not implement multi-tenancy in Phase 1 without a confirmed product requirement. Treat the initial platform as one operating business, while preserving conceptual organization scope at identity/access and integration boundaries and avoiding assumptions that global identifiers or roles must remain global forever.

Provider-neutral contracts should pass an explicit operating context where authorization genuinely needs one, but no speculative `tenant_id` is added mechanically. Public URL taxonomy, R2 key layout, cache keys, database schema, and role model must receive a dedicated ADR update before multi-tenancy is introduced. Cross-tenant isolation is not claimed until implemented and verified end to end.

## Alternatives considered

- **Add tenant identifiers and policies everywhere now:** rejected as a broad, unvalidated abstraction with significant correctness and operational cost.
- **Design only for permanent single tenancy:** rejected because global assumptions embedded in contracts and identifiers would make later isolation harder.
- **Separate deployment/database per future tenant:** deferred; strongest isolation but high provisioning, observability, migration, and cost overhead.
- **Shared database/schema with tenant-scoped rows:** deferred as one possible future model requiring verified composite constraints and RLS.

## Consequences

Initial implementation stays simpler and avoids pretending isolation exists. Contracts and identity concepts are reviewed for accidental global coupling. If multi-tenancy becomes required, a deliberate migration is still substantial and may touch most domains; this ADR reduces but does not eliminate that cost.

## Security impact

There is no current cross-tenant security promise. If introduced, organization context must come from trusted membership data, never request input; RLS, application authorization, uniqueness, caches, objects, jobs, exports, analytics, audit access, backups, and support tooling all require adversarial isolation tests. Service-role paths are especially sensitive.

## Performance impact

Avoiding unused tenant columns and policy joins reduces initial query/policy complexity. A future shared-data model may require tenant-leading composite indexes and affect cache efficiency; separate deployments may increase operational overhead. These costs must be measured against actual tenant count and workload shape.

## SEO, data, and operations impact

Future branded domains, canonical ownership, duplicate inventory, sitemap partitioning, and cross-organization property identity require product decisions before URL design changes. Data migration must prevent global uniqueness and foreign keys from creating cross-tenant collisions. Operations will need tenant-aware support, incident scope, exports, retention, audit, and observability.

## Migration/rollback considerations

A future proposal must inventory all authoritative and derived data, backfill organization ownership with verified mappings, introduce scoped constraints/indexes and deny-by-default policies, partition caches/object keys, and test every privileged path before enabling a second tenant. Use expand/migrate/contract and maintain reconciliation reports. Rollback after admitting multiple tenants cannot safely mean dropping scope; it requires disabling new tenancy and preserving isolation while data is separated or consolidated deliberately.

## Assumptions

- The first release serves one operating business.
- Stable opaque identifiers and provider-neutral contracts are used independently of tenancy.

## Open Decisions

- Whether multi-tenancy is a product requirement and what constitutes a tenant.
- Shared database/schema versus schema/database/deployment isolation.
- Organization-aware domain ownership, branding, domains, billing, and staff membership.
- Tenant-specific retention, residency, encryption, backup, and support-access requirements.
