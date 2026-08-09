# Observability

Status: Proposed

## Purpose

Provide enough correlated evidence to detect, diagnose, and recover failures across public discovery, admin workflows, database operations, media processing, and external integrations while protecting privacy.

## Assumptions and open decisions

- **Assumption:** Sentry is the primary application error-tracking boundary and Vercel supplies deployment/runtime visibility; GA4 plus internal analytics measure approved product outcomes.
- **Assumption:** Audit logs and observability telemetry are distinct: audit logs prove sensitive business actions, while telemetry diagnoses system behavior.
- **Open Decision:** Define service-level objectives, alert thresholds, sampling, retention, data residency, on-call ownership, and Vercel telemetry export/drain requirements before production.
- **Open Decision:** Approve the analytics event dictionary and consent model before emitting client events.

## Responsibilities

- Delivery and use-case boundaries emit structured events with timestamp, environment, release, severity, operation, outcome, duration, and a correlation identifier.
- Sentry receives scrubbed errors and traces; Vercel exposes deployment/runtime logs and performance signals; Core Web Vitals monitoring reports route-level real-user performance.
- Internal analytics owns versioned business events and funnel semantics. GA4 receives a minimized, consent-aware subset without PII.
- Append-only audit records capture actor, action, target, outcome, correlation ID, and safe change summary for privileged operations.
- Operational dashboards and runbooks cover availability, latency, errors, database health, outbox backlog, integration failures, upload/processing health, cache behavior, SEO health, and conversions.

## Boundaries

Application/domain code emits provider-neutral telemetry contracts; infrastructure adapters translate them for Sentry, Vercel, GA4, or internal storage. Telemetry failures never determine domain outcomes. Logs are not a data lake for request bodies, SQL rows, JWTs, cookies, headers, signed URLs, image metadata, or customer content. Audit records have stricter access, immutability, and retention than diagnostic telemetry.

## Main data/control flow

1. The edge/delivery layer accepts or creates a correlation ID and records a bounded request-start signal.
2. Use cases and adapters propagate that identifier through database, outbox, media, and provider operations and emit categorized outcomes and timings.
3. Errors are normalized and scrubbed before Sentry/log delivery; user responses receive stable errors without provider details or stack traces.
4. Public clients emit only approved performance and funnel events after applicable consent; server events confirm authoritative milestones such as accepted lead or booked appointment.
5. Dashboards aggregate health and business signals; alerts link to an owner and runbook. Audit lookup can correlate a sensitive action without duplicating private payloads.

See [ADR-008](../decisions/ADR-008-observability-strategy.md), [integration boundaries](integration-boundaries.md), and [media architecture](media-architecture.md).

## Security implications

- Apply deny-by-default telemetry fields and allowlist safe attributes. Redact secrets, tokens, cookies, authorization headers, full IPs where not justified, lead/customer PII, free text, addresses, signed URLs, raw EXIF, and database/provider payloads.
- Restrict audit, production logs, replays, and error details by job purpose; record access to sensitive operational evidence.
- Environment and release tags must prevent preview/test telemetry from contaminating production analysis.
- Verify signatures on any inbound telemetry drain, rate-limit ingestion, and protect dashboards and alert destinations.

## Performance implications

- Telemetry is asynchronous/buffered where possible and must not block server-rendered public content, conversions, or authoritative commits.
- Use sampling and bounded payloads for high-volume traces while retaining unsampled counters and required audit evidence.
- Measure route-level LCP, INP, CLS, server latency, database/query latency, cache hit/staleness, and third-party script cost; third-party analytics remains off the critical rendering path.

## Failure modes

- Telemetry provider outage: preserve application behavior, emit a bounded local/runtime signal where safe, and surface the monitoring gap.
- Cardinality or volume explosion: drop/aggregate unbounded attributes, enforce budgets, and alert before cost or ingestion failure cascades.
- Missing correlation: flag instrumentation defects and fall back to release/environment/time without logging more user data.
- PII leak: stop affected emission, revoke access if necessary, follow deletion/provider incident procedures, and review the event schema.
- Silent alert failure: test alert routes and runbooks on a schedule and expose last-success health.

## Scalability considerations

Adopt one event envelope and controlled dictionaries before adding tools. Scale through sampling, aggregation, retention tiers, and provider-native export only when volume requires it. Keep OpenTelemetry-compatible concepts at the boundary without requiring distributed tracing infrastructure for a single modular monolith.

## Rejected alternatives

- Logging arbitrary objects or full request/response bodies: unacceptable privacy, security, and cost risk.
- Using GA4 or Sentry as the authoritative business/audit store: weak transactional and governance guarantees.
- Blocking a transaction or response on analytics/error delivery: converts monitoring failure into product failure.
- Adding a separate observability service or broad distributed tracing stack now: premature for one deployable.
- Relying only on unstructured console text: poor correlation, aggregation, alerting, and redaction control.

## Open questions

- What SLOs and paging thresholds apply to public availability, admin commands, lead capture, media readiness, and outbox age?
- Which Sentry features, Vercel telemetry exports, synthetic checks, and retention tiers are approved and budgeted?
- Which business events and Core Web Vitals budgets are release gates?
- Who owns each dashboard, alert, incident severity, and runbook?
- What legal basis, consent, residency, deletion, and access rules apply to analytics and diagnostic data?
