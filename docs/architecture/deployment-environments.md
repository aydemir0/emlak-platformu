# Deployment Environments

**Status:** Proposed

## Purpose

Define environment isolation, promotion, rollback, and public-host behavior for a Vercel-hosted modular monolith with Supabase/PostgreSQL and Auth, Cloudflare R2, Resend, GA4, Sentry, and internal analytics. This is an architecture contract, not deployment or CI configuration.

## Responsibilities

- Separate local development, pull-request preview, pre-production validation, and production trust boundaries.
- Keep credentials, databases, auth tenants/configuration, R2 storage, email behavior, analytics, callbacks, and observability destinations environment-scoped.
- Promote reviewed, reproducible application artifacts with explicit schema/data compatibility checks when implementation begins.
- Make code, configuration, database, and media-processing rollback responsibilities distinct.
- Ensure only the production canonical host is indexable.

## Boundaries

Vercel is the application delivery boundary; Supabase/PostgreSQL remains authoritative for operational data; R2 owns binary objects; Resend, GA4, Sentry, and internal analytics are external adapters. Provider projects/resources and credentials must not be shared across trust levels merely for convenience.

Preview deployments never receive production service-role credentials, production R2 write access, production customer/lead data, or production callback destinations by default. Environment selection is deployment-owned configuration and cannot be influenced by request input.

**Assumption —** Local, preview, and production are distinct trust boundaries. A production-like staging tier is recommended for release rehearsal, but whether it is a separate mandatory environment is an open decision.

## Main data/control flow

1. A reviewed commit produces a reproducible deployment artifact and immutable revision identity.
2. The delivery platform injects environment-scoped, least-privilege configuration from approved secret stores.
3. Preview deploys validate the change against synthetic or safely sanitized non-production data and non-production integrations.
4. The same reviewed revision is promoted through a staging tier when one is required, then to production; environment differences are configuration and resource bindings, not unreviewed source edits.
5. Health, functional, security, SEO, and observability gates determine promotion readiness.
6. A failed release rolls application traffic back to a compatible revision or moves forward with a reviewed fix; data rollback follows the migration plan and never assumes code rollback reverses committed data.

Environment baseline:

| Environment | Data/integration boundary | Public indexing | Primary purpose |
| --- | --- | --- | --- |
| Local | Local/emulated or dedicated developer resources; no production secrets | No | Fast isolated development and checks |
| Preview | Ephemeral app revision with isolated non-production resources and safe email/analytics sinks | No; access control plus defensive directives | PR review and verification |
| Staging (if adopted) | Production-like isolated resources and controlled test identities | No; access control plus defensive directives | Release, integration, migration, and rollback rehearsal |
| Production | Production-only credentials, data, domains, callbacks, and telemetry | Canonical allowlisted public routes only | Live service |

## Security implications

- Secrets live in approved provider stores, are scoped by environment and purpose, and are never committed, exposed to browser variables, copied into logs, or displayed in previews.
- Production access requires least privilege, protected release authority, auditable changes, and rapid credential revocation.
- Preview/staging hosts require access control; robots directives are only defense in depth.
- Callback/webhook origins and redirect allowlists are explicit per environment; production callbacks cannot target preview hosts.
- Non-production email is suppressed, allowlisted, or redirected to a safe sink; analytics and error tracking are separated and free of production PII.
- Production data copies are prohibited unless an approved minimization, masking, access, retention, and deletion process exists.

## Performance implications

Production-like staging should verify server response, cache behavior, responsive-media delivery, Core Web Vitals budgets, and third-party loading without assuming preview performance equals production. Cold-cache and warm-cache paths both need checks. Environment-specific debug tooling must not increase production payloads or expose internals.

## Failure modes

- Wrong environment binding: fail startup/health validation on inconsistent host, resource identity, callback, or credential metadata rather than silently connecting across environments.
- Provider outage: follow integration-specific degraded behavior; analytics/email failure does not corrupt the authoritative transaction.
- Bad application release: stop promotion or roll traffic back to the last compatible revision and retain evidence/correlation IDs.
- Incompatible data change: halt release and use the migration's forward-fix/rollback plan; never apply destructive automatic reversal.
- Leaked credential: revoke/rotate, audit use, assess exposure, and follow the incident runbook.
- Preview indexation: remove access, invalidate any exposed URLs, verify search removal, and correct canonical/sitemap isolation.

## Scalability considerations

Begin with one application deployment per environment and provider-native managed resources. Scale runtime capacity, connection management, cache, and media delivery from measured demand. Additional regions, services, or tenant-specific deployments require evidence about latency, residency, isolation, or failure domains and a separate decision record.

## Rejected alternatives

- Sharing production data or privileged credentials with previews: unacceptable confidentiality and change-isolation risk.
- Environment-specific source branches or manual code edits: causes drift and weakens reproducibility.
- Treating deployment rollback as database rollback: risks irreversible corruption or data loss.
- Indexable staging/preview sites: creates duplicate content and can expose unfinished/private material.
- Microservices or per-domain deployments at launch: add operational and consistency cost without demonstrated need.

## Open questions

- **Open Decision —** Is staging always-on, on-demand, or a protected production-like preview, and who may access it?
- **Open Decision —** What exact Vercel/Supabase/R2 resource topology and region choices satisfy latency, residency, recovery, and cost requirements?
- **Open Decision —** What release approvals and automated verification gates are mandatory before production promotion?
- **Open Decision —** What recovery objectives, backup validation cadence, and disaster-recovery ownership are required?
- **Open Decision —** How are safe preview email, analytics, webhooks, and seed/test identities provisioned without production data?
- **Open Decision —** Which schema-change compatibility window and deployment order will be required when migrations are later introduced?
