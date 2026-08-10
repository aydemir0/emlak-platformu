# ADR-011: Lead capture and CRM boundary

- **Status:** Accepted for Phase 8 design
- **Date:** 2026-08-10

## Context

Public property enquiries cross an anonymous-to-PII trust boundary. The platform must preserve conversion while preventing enumeration, IDOR, automatic identity decisions, and provider failure from corrupting CRM state.

## Decision

Use an independent lead per accepted public submission, with exact idempotency-key retry only. Keep raw and normalized contact values with versioned provenance, create duplicate candidates without automatic merge/linking, use separate append-only `lead_activities`, and keep new leads unassigned until an ADMIN explicitly assigns them. Enforce the locked lifecycle and ADMIN-only explicit customer conversion. Deliver notifications/analytics through the post-commit outbox.

## Alternatives considered

- Merge same-contact/property submissions: rejected because contact similarity does not establish person identity or intent.
- Auto-assign to a property advisor: rejected because ownership, load-balancing, and fallback rules are unapproved.
- Use `customer_activities` for lead history: rejected because it conflates a pre-conversion acquisition record with canonical customer history.
- Direct anon table insert: rejected because it weakens the CRM privacy/RLS boundary.

## Consequences

Operations receive a clear intake timeline and explicit assignment responsibility. Duplicate review adds staff work but prevents irreversible identity mistakes. The design adds normalized-intake, activity, and possibly assignment-history records rather than overloading existing tables.

## Security and privacy impact

Public input is server-validated, rate-limited, non-enumerating, and PII-minimized. No anon CRM base-table access exists. Advisor scope is trusted database state. Raw IP is excluded from CRM; abuse signals are pseudonymized. Analytics/outbox payloads exclude PII.

## Data and operations impact

Lead state, activity, audit, and durable effect intent commit atomically with optimistic concurrency. Outbox consumers are idempotent and cannot make provider failure roll back a lead. Retention/legal basis and exact consent language remain separately governed.

## Migration and rollback considerations

Implement with additive reviewed migrations: new activity/intake/history structures, lifecycle alignment, indexes, RLS and grants; backfill only if approved. A rollback must stop new delivery use cases before removing reads of new fields. Do not delete audit/activity evidence to roll back an application release.

## Open decisions

See [lead capture and CRM foundation requirements](../requirements/lead-capture-crm-foundation.md) for consent, retention, duplicate-review, notification, CAPTCHA, and assignment-history decisions.
