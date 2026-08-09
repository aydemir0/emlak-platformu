# Domain boundaries

## Purpose

Assign business rules and authoritative records to cohesive modules so the modular monolith does not become a shared-data monolith. This document refines the dependency policy in [application architecture](application-architecture.md).

## Assumptions and decisions

- **Assumption:** One deployable application and one PostgreSQL database are sufficient initially; logical module ownership is enforced before physical separation.
- **Assumption:** Cross-module reads use explicit query contracts, while cross-module state changes are coordinated by an application use case owned by the initiating workflow.
- **Open Decision:** Whether advisors belong to a distinct organization/account domain at launch or are staff profiles within the identity boundary.
- **Open Decision:** The exact property, lead, request, and appointment lifecycle states and approval rules.

## Responsibilities

| Module | Owns | Does not own |
| --- | --- | --- |
| Properties | Property identity, facts, commercial state, publication lifecycle | Media bytes, location hierarchy, lead qualification |
| Property media | Upload/validation/processing lifecycle, variants, ordering, alt-text provenance | Property publication eligibility except the media-readiness contract |
| Catalog | Property features and their controlled vocabulary | Per-property lifecycle |
| Locations | Stable hierarchy, names, slugs, geographic identity | Arbitrary filter state or landing-page editorial policy |
| Advisors | Advisor profile, availability references, property/advisor associations | Authentication credentials or customer ownership rules |
| Leads | Initial inbound interest, source, consent evidence, triage lifecycle | Canonical customer record or a customer's durable search request |
| Customers | Canonical person/contact record, privacy lifecycle, merge/export/erasure controls | Lead acquisition history or appointment scheduling |
| Customer requests | Durable property-search/service requirements linked to a customer | Public filter URL semantics |
| Appointments | Scheduling lifecycle, participants, conflicts, outcomes | Advisor identity or customer profile ownership |
| SEO/content | Curated landing pages, blog, indexability policy, slug history, redirects, sitemap eligibility | Arbitrary property filtering or property facts |
| Analytics | Versioned product-event definitions and internal aggregate/reporting inputs | Authoritative business state or PII-rich operational records |
| Audit | Append-only evidence of sensitive actions and outcomes | General analytics or mutable domain history |
| Identity/access | Mapping authenticated identities to active staff/customer profiles and trusted grants | Provider credential storage or business lifecycle decisions |

## Boundaries

- A module is the only writer of its owned records and invariants. Other modules request changes through application contracts.
- Foreign keys may preserve relational integrity across modules inside PostgreSQL, but direct cross-module updates are prohibited.
- Read models may join owned data for a defined public or admin query; the model does not transfer ownership.
- Domain contracts use provider- and framework-independent identifiers and value objects. Supabase, R2, Resend, GA4, Sentry, and Vercel types stop at infrastructure adapters.
- Leads, customers, and customer requests remain separate even when their fields overlap. Conversion or linking is an explicit, audited use case.
- SEO landing pages reference a curated query definition; they are not generated mechanically from every filter combination.

## Main data/control flow

For a cross-domain command, the delivery layer invokes one coordinating application use case. It loads required domain state through module ports, checks authorization, asks the owning domains to validate transitions, and commits coupled database changes atomically where they share the database. Required external effects are recorded as durable handoffs in the same transaction. Consumers receive stable identifiers or minimal event facts, not another module's mutable internal model.

Example: publishing a property asks Properties to validate its lifecycle and consults readiness contracts from Media, Locations, and SEO/content. Properties owns the publication transition; those modules retain ownership of their records. After commit, public cache/sitemap effects are triggered without allowing delivery failure to roll back publication.

## Security implications

Each command declares actor, permission, object scope, and data classification. Cross-module calls cannot bypass authorization by using internal identifiers. RLS mirrors access boundaries for exposed tables, while service-role access is isolated and audited. Customer and lead data is shared only by purpose-limited contracts; audit details avoid unnecessary PII.

## Performance implications

Logical ownership does not require network calls. Use in-process contracts and transaction-scoped repositories in the modular monolith. Public read models may use deliberate joins or projections that avoid command-model coupling. Index and denormalization decisions must follow measured query patterns, with a clear source and refresh rule.

## Failure modes

- Circular module dependencies: move orchestration to an application use case or narrow the shared contract; do not create a generic common business layer.
- Partial cross-module update: keep required database changes in one transaction and external effects outside it.
- Stale projection: label freshness, make sensitive state authoritative, and reconcile after invalidation failures.
- Duplicate lead/customer records: enforce idempotency and reviewed merge/link operations rather than silently collapsing concepts.
- Orphan references after soft deletion: define child visibility and restoration rules per lifecycle.

## Scalability considerations

Begin with namespaces, ownership rules, and narrow ports within one deployable. Extract a module only when measured load, failure isolation, data residency, or independent team ownership justifies the added distributed consistency cost. The database schema may be organized by module later; schema layout is not decided here.

## Rejected alternatives

- One generic CRUD/data-access module: obscures ownership and permits invariant bypass.
- A generic repository abstraction for every entity: adds indirection without a real boundary.
- Combining lead, customer, and request into one polymorphic record: conflates distinct lifecycles, consent, and retention.
- Independent service/database per domain now: creates premature distributed transactions and operational burden.

## Open questions

- Which module owns inventory publication approval when commercial and editorial approval differ?
- Can one customer hold multiple active requests, and what deduplication rules apply across leads and customers?
- What appointment conflict rules and advisor capacity semantics are required?
- Which audit events require immutable before/after evidence versus a safe summary?
