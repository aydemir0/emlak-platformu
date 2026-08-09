---
name: security-rules
description: Apply security by design across the real-estate platform. Use for threat modeling, authentication, authorization, Supabase RLS, server-side validation, public forms, uploads, secrets, sessions, webhooks, rate limiting, privacy, PII, audit logs, admin actions, dependency risk, security headers, incident readiness, or any feature that crosses a trust boundary.
---

# Security Rules

## Threat-model before implementation

For each feature:

1. Identify assets, actors, entry points, trust boundaries, and external systems.
2. Describe abuse cases, not only expected use.
3. Classify data sensitivity and retention obligations.
4. Define authentication, authorization, validation, rate limits, audit, monitoring, and failure behavior.
5. Apply the database and media skills when data or uploads are involved.

Prioritize risks by impact and likelihood. Document accepted risk, owner, rationale, and review date. Security controls must be testable.

## Authenticate safely

- Use Supabase Auth through supported server-side session patterns.
- Validate the session on the server for every protected operation; do not trust client state or hidden fields.
- Use secure, HTTP-only, same-site cookies as appropriate and enforce HTTPS.
- Rotate sessions after security-sensitive identity changes.
- Require recent authentication or step-up verification for high-impact admin/account actions when warranted.
- Do not reveal whether an account exists through password reset, invite, or sign-in responses.
- Rate-limit and monitor login, reset, verification, and invitation flows.
- Define account disable, advisor offboarding, token revocation, and session invalidation behavior.

## Authorize every object and action

- Deny by default and grant the least privilege needed.
- Check both the action and the target object server-side.
- Derive role, ownership, organization, and property scope from trusted data, never from request claims.
- Prevent insecure direct object references by authorizing every identifier lookup.
- Separate public, advisor, operations, administrator, and service capabilities.
- Require explicit permission for publication, reassignment, export, bulk update, deletion, restore, impersonation, and audit access.
- Combine application authorization with PostgreSQL RLS for defense in depth.
- Record sensitive authorization failures and successful high-impact actions without logging secrets or unnecessary PII.

## Validate all untrusted input

Validate on the server at every trust boundary:

- request bodies, query parameters, path parameters, headers, cookies, and form data;
- webhook and provider payloads;
- database values when crossing from less-trusted ingestion paths;
- filenames, object metadata, URLs, redirects, and rich text.

Use allowlists, strict schemas, bounded lengths/counts, normalized encodings, and domain-level validation. Reject unknown fields where silent acceptance could create privilege or lifecycle bugs.

Do not construct SQL, HTML, shell commands, object keys, email headers, or redirect URLs through unchecked string interpolation. Parameterize queries and encode output for its exact context.

## Secure public forms and lead capture

- Rate-limit by multiple safe signals and add progressive abuse controls.
- Use CSRF protection where the authentication/cookie model requires it.
- Add bot mitigation without making accessibility or legitimate conversion dependent on opaque scoring alone.
- Validate contact fields and consent server-side.
- Minimize collected data and state its purpose.
- Do not place lead/customer PII in URLs, analytics, logs, client storage, or third-party metadata.
- Use idempotency/deduplication controls for repeated submissions.
- Prevent response timing and messages from exposing customer or property-internal information.
- Audit access, assignment, export, merge, and deletion of lead/customer records.

## Secure uploads

Apply `property-media-pipeline` in full.

At minimum:

- authorize the property and actor before issuing narrow, expiring upload access;
- verify file signature, decoded type, size, dimensions, checksum, and safe decoding server-side;
- quarantine before validation and keep originals private;
- reject active content and unsupported formats;
- strip sensitive metadata such as GPS when required;
- process with resource/time limits and maintained libraries;
- serve public files from isolated, immutable variant paths with safe content types and headers;
- rate-limit upload and processing abuse;
- make deletion, retention, and orphan cleanup observable.

Never trust an object merely because it reached R2 successfully.

## Protect browser and rendering boundaries

- Keep secrets and privileged clients in server-only modules.
- Escape user-controlled output by context and sanitize allowed rich text with a maintained allowlist.
- Avoid unsafe HTML injection. When unavoidable, document the source, sanitizer, and tests.
- Use a restrictive Content Security Policy and tighten it as integrations become known.
- Set frame-ancestor, content-type sniffing, referrer, permissions, transport, and cookie policies deliberately.
- Validate redirects against an allowlist of local paths or approved origins.
- Protect server-side fetches from SSRF: validate scheme/host/port, block private and metadata networks, limit redirects, and enforce timeout/size.
- Do not expose stack traces, provider responses, internal IDs, or secrets in browser errors.

## Manage secrets and environments

- Store secrets in approved environment/provider secret stores, never in Git or client-exposed variables.
- Commit only documented placeholders in `.env.example` when implementation begins.
- Use separate credentials and resources per environment.
- Scope tokens to the smallest permissions and shortest practical lifetime.
- Rotate exposed or departing-user credentials promptly and document ownership.
- Prevent secrets from appearing in logs, analytics, error trackers, build output, PRs, or screenshots.
- Verify preview deployments cannot access production data or privileged callbacks by default.

## Secure external integrations

- Verify webhook signatures against the raw payload, enforce timestamp/replay windows, and make handlers idempotent.
- Authenticate outbound callbacks and constrain destinations.
- Set timeouts and bounded retries; do not retry permanent failures indefinitely.
- Validate provider response shape before use.
- Minimize data sent to Resend, analytics, error tracking, and other vendors.
- Keep GA4 and analytics free of PII and consent-aware.
- Treat vendor compromise or outage as a designed failure mode.

## Protect data and privacy

- Classify public property data, operational data, authentication data, lead/customer PII, and sensitive audit data.
- Collect only what the product needs and restrict access by job purpose.
- Encrypt in transit and use provider-supported encryption at rest.
- Define retention, soft deletion, restoration, legal hold, export, and irreversible erasure.
- Remember that soft deletion alone does not satisfy an erasure request.
- Redact or tokenize sensitive values in logs and events.
- Make backups, exports, and admin search follow the same access and retention rules.
- Do not use customer or lead data for AI features without explicit requirements, lawful basis, minimization, and a reviewed provider/data-retention boundary.

## Rate-limit and prevent abuse

Set limits for authentication, lead forms, search/filter requests, uploads, image processing, email, appointment actions, exports, and admin bulk operations.

- Prefer user/account/organization keys when authenticated; combine IP/device signals cautiously for public traffic.
- Return stable errors without leaking thresholds that materially aid attackers.
- Prevent cost-amplification paths across R2, image processing, email, database queries, and analytics.
- Add quotas, concurrency limits, pagination caps, query timeouts, and circuit breakers where relevant.
- Monitor blocks, spikes, and bypass patterns.

## Audit and observe

Audit security-sensitive changes with actor, action, target, timestamp, outcome, request/correlation ID, and safe change summary. Protect logs from normal mutation and limit access.

Alert on repeated auth failures, privilege changes, unusual exports, cross-account access denials, upload rejection spikes, webhook signature failures, unexpected service-role use, and destructive admin actions.

Maintain runbooks for credential exposure, compromised account, malicious upload, PII disclosure, provider breach, and suspicious data export. Preserve evidence safely and define notification/escalation ownership before production.

## Dependency and release security

- Pin and review dependencies when implementation begins.
- Minimize packages, scripts, and transitive attack surface.
- Run secret, dependency, and static analysis in CI with an explicit triage policy.
- Review framework/provider advisories and patch supported versions promptly.
- Use protected branches and required reviews for sensitive changes.
- Ensure production migrations and releases have rollback/forward-fix plans.
- Never weaken a control only to make a test or deployment pass without documenting and approving the risk.

## Review checklist

- Are assets, actors, trust boundaries, abuse cases, and data classifications explicit?
- Is every protected operation authenticated and object-authorized server-side?
- Are inputs strictly validated and outputs safely encoded?
- Are RLS and application authorization both present where applicable?
- Are uploads quarantined, verified, bounded, and isolated?
- Are secrets, sessions, redirects, webhooks, and server-side fetches protected?
- Are public endpoints rate-limited against abuse and cost amplification?
- Are PII collection, analytics, retention, export, and erasure controlled?
- Are sensitive actions auditable and alerts/runbooks actionable?
- Can the control be verified by automated or documented manual tests?
