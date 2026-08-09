# Authentication and authorization

## Purpose

Define a deny-by-default identity and access boundary using Supabase Auth for authentication, application use cases for business authorization, and PostgreSQL RLS for defense in depth. The durable decision is recorded in [ADR-006](../decisions/ADR-006-authentication-authorization.md).

## Assumptions and decisions

- **Assumption:** Supabase Auth establishes identity; it does not decide property, customer, publication, export, or administrative permissions.
- **Assumption:** Staff access is invite/provisioning controlled rather than granted by ordinary public sign-up.
- **Assumption:** Application authorization loads active profile, grants, and object scope from trusted server/database state.
- **Open Decision:** Exact roles, permission bundles, organization/property scope, customer accounts, MFA policy, and step-up triggers.

## Responsibilities

- Authentication validates session authenticity, expiry, account status, and security-sensitive identity changes on the server.
- Authorization evaluates actor, action, target object, current lifecycle state, and trusted scope for every protected use case.
- RLS restricts every client-accessible table by operation and is tested as an independent layer.
- Audit records sensitive successes and meaningful denials with actor, target, outcome, timestamp, and correlation ID.
- Offboarding disables access, revokes sessions where supported, removes active grants, and preserves required audit history.

## Boundaries

- Browser session state and UI role flags are hints only. The server validates the session for every protected operation.
- User-editable identity metadata is never an authorization source. Trusted claims may accelerate decisions only when their staleness/revocation behavior is documented and an authoritative check protects sensitive changes.
- Service-role credentials remain server-only, least-privileged in use, and never provide a general bypass around application authorization.
- Authentication adapters map provider identities to provider-neutral application principals.
- Anonymous public access is restricted to explicitly published records and narrowly scoped, abuse-protected commands.
- Preview access is separately authorized, time-bounded where appropriate, non-indexable, and not equivalent to publish permission.

## Main data/control flow

1. The delivery boundary obtains the server-side session through a supported Supabase Auth pattern and rejects invalid, expired, disabled, or missing identity where required.
2. Identity is mapped to an active application principal. The use case loads current trusted grants and object relationships.
3. A policy evaluates `principal + action + target + state + scope`; absence of an explicit allow is a denial.
4. The repository query is scoped to the same access boundary, and PostgreSQL RLS applies an independent operation-specific restriction.
5. State-changing commands re-check authorization against current transactional state before mutation, write audit evidence, and prevent user-controlled ownership/role/publication fields.
6. Delivery returns stable errors that avoid account, object, or permission enumeration.

## Security implications

Cookies require HTTPS, HTTP-only and suitable same-site/CSRF policy; exact settings depend on the final domain topology. Login, reset, invitation, and verification flows are rate-limited and use non-enumerating responses. High-impact actions may require recent authentication or MFA. Permission changes, impersonation, exports, bulk operations, publication, deletion, restoration, and audit access are explicitly authorized and audited. RLS policies distinguish select/insert/update/delete and include both row visibility and allowed resulting state.

## Performance implications

Permission evaluation should use bounded indexed lookups and request-scoped reuse of already validated principal data, without extending trust beyond the request or documented token freshness. Public reads should not pay for staff authorization. Avoid per-row authorization loops by expressing object scope in the database query and RLS policy while retaining use-case checks for business actions.

## Failure modes

- Stale role/claim after revocation: consult authoritative grants for sensitive operations and define session invalidation/offboarding behavior.
- Application allows but RLS denies: fail closed, record a safe diagnostic, and test the policy matrix.
- Service-role misuse bypasses RLS: isolate privileged adapters, require application checks, restrict callers, and alert on unexpected use.
- IDOR through an identifier: scope the lookup by authorized relation, not by existence followed by a UI check.
- Auth provider outage: protected actions fail closed; existing public content remains governed by publication policy.
- Disabled/deleted profile with live token: active-profile status is checked server-side.

## Scalability considerations

Keep policy inputs explicit and provider-neutral. Index membership and ownership relations that real policies query. A future organization/tenant scope can be added to principals and policies only after [ADR-009](../decisions/ADR-009-future-multi-tenancy-boundary.md) is resolved; do not add speculative tenant columns now. Dedicated authorization infrastructure is not justified without materially more complex policy or scale evidence.

## Rejected alternatives

- Authentication-only access control: identity alone does not authorize an action or object.
- RLS as the sole business authorization layer: cannot express all workflow intent and is easier to bypass through privileged code.
- Client-side guards or hidden routes: do not protect server resources.
- User-editable metadata as role source: permits privilege manipulation.
- A service-role client throughout the application: creates an overly broad bypass and weakens defense in depth.

## Open questions

- What roles, permissions, object scopes, and separation-of-duty rules are required?
- Are customer accounts in the initial release, and how do they link to leads/customers without enumeration risk?
- Which actions require MFA, recent authentication, approval, or dual control?
- What are account disablement, advisor offboarding, invitation expiry, and session-revocation service levels?
