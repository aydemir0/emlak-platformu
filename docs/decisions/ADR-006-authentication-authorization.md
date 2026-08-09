# ADR-006: Authentication and authorization

- **Status:** Proposed
- **Date:** 2026-08-09

## Context

The platform includes anonymous public content, customer/lead data, staff operations, publication controls, exports, deletion/restoration, media administration, and audit access. Authentication and authorization must remain distinct, survive client manipulation, and enforce least privilege across application and database boundaries.

## Decision

Use Supabase Auth as the authentication provider through supported server-side session validation. Map provider identity to a provider-neutral application principal. Each protected application use case authorizes the action and target object using current trusted grants, lifecycle state, and scope. Enable deny-by-default, operation-specific PostgreSQL RLS on every client-accessible table as defense in depth.

Do not trust client state, hidden fields, route visibility, or user-editable identity metadata for authorization. Keep service-role credentials server-only and tightly scoped. Record sensitive successes and meaningful denials. Define explicit offboarding and session invalidation behavior before production.

## Alternatives considered

- **Supabase Auth plus RLS only:** rejected because workflow/business permissions and privileged server paths also require application authorization.
- **Application checks without RLS:** rejected because a query or adapter mistake would have no independent database boundary.
- **Client-side role guards:** rejected because they cannot protect data or commands.
- **Custom authentication:** rejected because it adds high security and maintenance risk without a stated requirement.
- **External fine-grained authorization service:** deferred; current policy complexity does not justify another critical dependency.

## Consequences

Defense in depth reduces single-control failure and keeps business permissions explicit. It also creates two policy surfaces that must agree, be reviewed together, and be tested against an access matrix. Current-grant lookup can add query cost, and session revocation behavior must be designed rather than assumed.

## Security impact

The design denies by default, protects against IDOR and client-claim manipulation, isolates privileged credentials, and requires explicit authorization for publication, reassignment, export, bulk update, deletion, restoration, impersonation, and audit access. Cookies, CSRF, rate limiting, MFA/recent-auth triggers, invitation, reset, and account-enumeration controls remain implementation requirements once product decisions are resolved.

## Performance impact

Use bounded, indexed principal/scope lookups and reuse validated principal context only within its safe request lifetime. Express object scope in repository queries/RLS rather than issuing per-row checks. Do not cache permission-sensitive data in shared caches.

## Data and operations impact

Identity-provider identifiers are integration metadata linked to application profiles, not domain identity everywhere. Role/grant changes and high-impact actions require audit records. Offboarding must remove active grants and invalidate access without deleting required audit/business history. Access reviews and RLS policy tests become production-readiness gates.

## Migration/rollback considerations

No schema or policy is implemented by this ADR. Implementation must introduce profiles/grants and RLS using reviewed migrations, deny-by-default sequencing, and tests before exposing data. Changing Auth provider later is feasible through the identity adapter and stable application principal, but password/session migration may require forced reauthentication. Authorization must never be rolled back to client-only or authentication-only checks.

## Assumptions

- Staff access is controlled through invitation/provisioning.
- Supabase Auth supports the required server-side session pattern for the chosen application version.
- Application/database state is authoritative for current grants.

## Open Decisions

- Launch roles, permission matrix, ownership/organization scopes, and separation of duties.
- Whether customer accounts are in scope.
- MFA, recent-authentication, approval, and dual-control requirements.
- Session revocation and staff-offboarding service levels.
