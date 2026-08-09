# ADR-008: Layered Observability with Privacy-Safe Telemetry

Status: Proposed
Date: 2026-08-09

## Context

The platform must protect SEO and conversion on the public site while making privileged admin, database, media, and integration failures diagnosable. Vercel, Sentry, GA4, and internal analytics have different purposes; none should become the authoritative record of sensitive business activity.

## Decision

Adopt one provider-neutral structured telemetry envelope with correlation ID, environment, release, operation, outcome, severity, duration, and allowlisted low-cardinality attributes. Use Sentry for scrubbed application errors/traces, Vercel for deployment/runtime visibility and performance signals, GA4 for a consent-aware PII-free public analytics subset, and internal analytics for versioned business events. Maintain append-only audit records separately for sensitive actions.

Monitor public availability and Core Web Vitals; server/database latency and errors; cache hit/staleness; admin command outcomes and authorization denials; outbox backlog; integration delivery; upload rejection and media processing; SEO crawl/sitemap/indexability health; and conversion funnels. Alerts require an owner, severity, actionable threshold, and runbook. Telemetry is asynchronous and must not block authoritative commits or server-rendered content.

## Alternatives considered

- Sentry, GA4, or logs as the audit/system-of-record store: insufficient integrity, privacy, and transactional guarantees.
- Unstructured console logging only: weak correlation, aggregation, redaction, and alerting.
- Log all payloads for debugging: unacceptable PII, secret, cost, and access risk.
- A separate observability service or comprehensive distributed platform now: unnecessary for one modular deployable.
- No observability until launch: makes security, reliability, SEO, and performance failures unverifiable.

## Consequences

Teams gain correlated operational, performance, and business evidence without coupling domain logic to providers. Costs include event governance, redaction tests, dashboards, sampling, retention, alert ownership, and periodic runbook exercises. Multiple signals require clear definitions to avoid contradictory metrics.

**Assumption:** Sentry and Vercel provide the initial error/runtime/performance views, while internal analytics plus GA4 cover approved funnels.
**Open Decision:** Approve SLOs, sampling, retention, telemetry export/drains, synthetic checks, consent model, data residency, incident ownership, and release-gate thresholds.

## Security impact

Use an allowlist-first schema and redact secrets, tokens, cookies, auth headers, signed URLs, request bodies, customer/lead PII, free text, raw EXIF, and provider/database payloads. Restrict production telemetry and audit access by job purpose, separate environments, verify inbound drain signatures, and maintain a response path for telemetry PII exposure.

## Performance impact

Instrumentation uses bounded payloads, sampling, and non-blocking delivery. Route-level LCP, INP, CLS, server latency, and third-party cost guide performance work. Telemetry provider failure degrades monitoring, not page rendering or transactions.

## SEO/data/operations impact

SEO operations gain crawl, sitemap, indexability, cache freshness, and Core Web Vitals evidence. Product metrics use a versioned dictionary and distinguish client intent from authoritative server milestones. Audit records remain separately governed and correlated rather than copied into analytics. Every production alert must map to an accountable owner and recovery procedure.

## Migration/rollback considerations

No SDK or telemetry configuration is added by this ADR. Instrument a small baseline first, verify redaction and environment separation, then add signals tied to decisions. Provider replacement occurs in adapters while retaining stable event names. Disable a leaking or high-cost signal independently, preserve required audit evidence, and document any monitoring blind spot during rollback.
