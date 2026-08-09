# Row-level security design

## Purpose

Define the policy model that will later translate the [database authorization matrix](authorization-matrix.md) into deny-by-default Supabase/PostgreSQL controls. This document contains no SQL, grants, policies, functions, or schema mutations.

## Layered authorization boundary

The controls have distinct jobs:

1. **Supabase Auth authenticates.** A supported server-side session pattern establishes an identity and validates expiry/account state.
2. **Application use cases authorize business actions.** They load the active application principal, current grants, object relationships, target lifecycle state, and command preconditions from trusted database state.
3. **Data API/schema/table grants determine whether an operation can reach a relation.** Grants are reviewed independently from RLS and remain least-privilege.
4. **RLS limits rows and resulting row states.** It is defense in depth against query, adapter, or routing mistakes; it does not replace application authorization.
5. **Database constraints protect invariants.** Authorization cannot make an invalid relationship or state transition valid.

All layers deny by default. A success requires every applicable layer to allow the same operation. Application code must not interpret an RLS denial as permission to retry with a broad privileged client.

## Trusted and untrusted inputs

Trusted policy inputs may include the authenticated Auth subject mapped to an active `user_identities` row, current role assignments and permissions in database state, and explicit object relationships such as an active property/advisor assignment or customer identity link. Those relationships are still checked for active/deleted/expired state.

Never use `user_metadata`, request fields, query/path identifiers, browser role flags, hidden inputs, or client-selected ownership as authorization facts. Application/JWT claims can be stale after role revocation, advisor offboarding, account disablement, or object reassignment. Claims may be a bounded hint only where documented; sensitive reads and all high-impact mutations consult authoritative current state. No `organization_id` is invented for V1.

## Policy-shape rules

- Every client-accessible table is RLS-enabled and starts with no allow policy. Policies are operation-specific; a read allowance never implies insert, update, or delete.
- Row predicates express stable identity and explicit relationships, not UI actor labels alone. The unresolved staff role matrix is not guessed inside policies.
- Public reads expose only publishable, non-deleted, public-safe rows through application-owned read contracts. Public and conversion actions normally use server use cases, so anonymous table access is not assumed.
- Inserts constrain both who may issue the operation and every security-sensitive initial value. Callers cannot choose owner, role, assignment, publication, audit provenance, processing outcome, or lifecycle fields.
- An update has two distinct checks: the existing row must be selectable and satisfy the equivalent of an operation's `USING` condition, and the proposed resulting row must satisfy the equivalent of `WITH CHECK`. PostgreSQL also requires the applicable `SELECT` access/policy for rows targeted by an update. Tests must cover both halves.
- Deletes are generally lifecycle commands. Soft-delete and restore are narrow updates mediated by application use cases; physical delete is denied to normal actors and reserved for a policy-governed privileged purge.
- Deleted parents and children are invisible by default. Explicit admin recovery reads use a purpose-built permission and never broaden ordinary advisor/customer policies.
- Security-definer helpers are exceptional. If later required, each must be non-public, narrowly granted, use an explicit safe search path, avoid caller-controlled object resolution, and receive security-specific review and tests.

## Actor policy intentions

| Actor | RLS intention |
|---|---|
| Anonymous | No default table access. Approved public content is returned by publication-filtered server use cases/read models; conversion and telemetry writes are server commands with abuse controls. |
| Authenticated customer | No privilege merely from authentication. If customer accounts are approved, policy scope derives from a trusted identity-to-customer link and allows only the explicit own-row operations in the matrix. |
| Advisor | Current explicit permissions plus current object scope are required. Advisor identity alone grants neither global CRM visibility nor publish/export/delete/restore/audit authority. |
| Admin | Current administrative permission is still checked by action and object. Admin access is broad only where the matrix states it and remains field-, lifecycle-, and audit-constrained. |
| Privileged service | Prefer separate narrow server adapters/workers and credentials per task. Where a service role bypasses RLS, the application/worker must recreate object/action authorization where relevant, restrict callers, minimize query surface, audit sensitive use, and alert on unexpected paths. |

## Relation-family rules

- **Identity and access:** users may never self-assign roles or permissions. Role changes, revocation, identity linking, and offboarding rely on authoritative state and invalidate or override stale claims.
- **Public property, catalog, location, SEO, and content:** public visibility requires all relevant publication, active, non-deleted, canonical, route-reservation, and media-eligibility predicates. Draft/preview access is a separate authenticated path, never a relaxed public policy. `public_route_reservations` is never a customer/advisor write surface; public route resolution occurs through publishable server models, while reviewed admin commands and narrow service reconciliation manage reservations.
- **Media:** upload sessions and media writes require current property scope. Processing attempts and variants are service-written. A technically ready object is not public unless the current property/media state also makes it eligible.
- **CRM and appointments:** customer ownership derives from the trusted identity-to-customer link if customer accounts ship. Advisor scope derives from `customers.assigned_advisor_id`; dependent contacts, requests, activities, appointments, and matches inherit scope only through indexed FKs to that customer/request. Leads use their explicit assigned advisor. No submitted advisor/customer ID grants scope. A future per-request/shared-team assignment model requires a schema and matrix change. PII stays unavailable to anonymous actors and unassigned advisors. Merge, export, erase, assignment, and restore remain application commands even if a row predicate could be expressed.
- **History, analytics, and audit:** state/price/slug/merge/conversion history, analytics events, and audit logs are append-only for normal application roles. Normal roles cannot update or delete audit logs. Analytics access and retention are separate from operational/audit access and must not expose PII-rich payloads.
- **Outbox:** `outbox_messages` is privileged infrastructure data. Claim, lease, retry, replay, resolve, and purge are unavailable to normal application actors; admin operations use a safe purpose-built projection/command rather than raw table access.

## Views, functions, and the Data API

Every exposed view must use security-invoker behavior so the caller's grants and RLS remain effective. If that behavior cannot be guaranteed for the selected PostgreSQL/Supabase version, the view remains outside exposed schemas and inaccessible to public/authenticated Data API roles. No view, materialized projection, function, or RPC may become an accidental RLS bypass.

Public/admin read shapes are purpose-built and column-minimized. Sensitive base columns do not become safe merely because a view omits them unless grants, ownership, view semantics, and underlying RLS are all verified. Function execution grants are reviewed independently from table grants, and privileged functions never accept caller assertions of role, ownership, publication, or processing state.

## Policy lifecycle and drift control

The authorization matrix is the source test contract. A schema, relationship, grant, policy, view, or function change must update the matrix/design first or in the same reviewed change. Generated database types do not prove authorization. Production policy deployment will use deny-first sequencing and a forward-fix/rollback plan that does not temporarily expose rows.

High-risk policy changes require review of application checks, grants, RLS, indexes used by policy relationships, audit behavior, cache/read models, soft-deleted visibility, and service-role call sites together. Revoking access must fail closed even while JWT claims or cached application context remain stale.

## Access-matrix-to-policy test requirements

For all 44 tables, generate a test grid covering five actors times `SELECT`, `INSERT`, `UPDATE`, `DELETE/soft-delete`, and named special commands. Each allow case must have at least one same-shape deny case.

Required fixtures and assertions include:

- anonymous, authenticated-but-unlinked, linked customer, advisor scoped and unscoped, admin with and without the specific permission, disabled identity, revoked/expired assignment, and tightly scoped service contexts;
- published/draft/unpublished, active/deleted, own/not-own, assigned/unassigned, ready/not-ready, and current/obsolete workflow states;
- direct Data API attempts, server repository calls, forged identifiers, user-controlled metadata, stale claims, cross-object access, bulk targets, and malformed/null relationship state;
- insert attempts that set protected ownership/role/publication/audit/processor fields;
- update tests where existing-row visibility passes but resulting-state validation fails, and the reverse visibility failure; tests also prove the required `SELECT` policy/grant behavior;
- soft-delete invisibility, authorized recovery visibility, restore conflict, hard-purge denial, append-only update/delete denial, and outbox isolation;
- view/RPC tests proving invoker semantics and column minimization, plus a build/deployment check that no unintended schema, table, view, or function is exposed;
- parity tests showing application denial and RLS denial each independently protect a forbidden action, with safe diagnostics on disagreement.

## Assumptions

- The application primarily reaches PostgreSQL through server-side repositories/use cases; direct browser Data API access is minimized and may be absent for many tables.
- One operating business is in scope; future tenancy requires a new end-to-end design under ADR-009.
- Staff authorization uses roles/permissions plus explicit relationships, but the exact staff role matrix is not yet approved.
- Soft-delete visibility and purge follow [retention and deletion](retention-deletion.md).

## Open Decisions

- Exact staff roles, permission bundles, object scopes, approval/dual-control rules, and whether any advisor access derives from assignment versus a broader operational permission.
- Whether customer accounts ship initially and the authoritative identity-to-customer linking/recovery process.
- Which relations, if any, are directly exposed through the Data API, and the minimum grants for each environment.
- Final Supabase/PostgreSQL version and verified view security-invoker behavior.
- Which high-impact commands require current-grant database lookup, recent authentication/MFA, or an approval step beyond the baseline.
- Service credential decomposition, rotation, monitoring, and emergency break-glass procedure.
