# Codex Project Governance

## Mission

Build a production-ready, SEO-first real-estate platform whose public experience optimizes discoverability, performance, and conversion; whose admin experience optimizes operational speed; and whose data model protects integrity and traceability.

The planned stack is Next.js, TypeScript, PostgreSQL/Supabase, Supabase Auth, Cloudflare R2, Vercel, Tailwind CSS, shadcn/ui, Resend, GA4, and internal analytics.

## Current phase gate

Until the user explicitly starts implementation, limit work to repository governance, planning, requirements, and architecture/decision documentation.

Do not:

- scaffold Next.js or another application framework;
- install dependencies or create lockfiles;
- write database migrations or seed data;
- build UI components, pages, routes, or runtime services.

## Required engineering rules

- Keep business rules out of React components. Components render state and delegate actions.
- Keep AI out of authoritative business decisions. AI output may assist users only when a deterministic, reviewable fallback exists.
- Validate every untrusted input on the server, even when client validation exists.
- Treat upload security as a mandatory workflow, not a controller-level check.
- Use soft deletion for business records unless a documented legal, privacy, or storage lifecycle requires hard deletion.
- Design SEO into routing, data, rendering, and content architecture from the beginning.
- Do not make every filter combination indexable. Use an explicit indexability policy.
- Support R2-backed originals and responsive image variants in the property-media design.
- Apply security by design, least privilege, defense in depth, and auditable state changes.
- Prefer clear, cohesive modules and SOLID boundaries where they reduce change coupling.
- Avoid speculative abstractions, generic repositories without a demonstrated need, and premature optimization.

## Domain scope

Treat these as core domains: properties, property images, property features, locations, advisors, leads, customers, customer requests, appointments, SEO landing pages, blog, analytics, and audit logs.

Do not collapse distinct lifecycle concepts merely because they share fields. In particular, keep leads, customers, and customer requests conceptually separate until requirements prove otherwise.

## Skill routing

Read every skill that materially applies before planning or editing. Use the smallest sufficient set, but combine skills for cross-cutting work.

- Use `.agents/skills/project-architecture/SKILL.md` for module boundaries, layering, Next.js server/client placement, service contracts, integrations, cross-domain flows, architecture reviews, and ADR decisions.
- Use `.agents/skills/real-estate-seo/SKILL.md` for public routes, location/property landing pages, metadata, canonicals, structured data, sitemaps, internal linking, crawl controls, filter URLs, and SEO measurement.
- Use `.agents/skills/property-media-pipeline/SKILL.md` for upload flows, R2 object design, validation, processing jobs, responsive variants, delivery, metadata, ordering, retention, and media security.
- Use `.agents/skills/database-conventions/SKILL.md` for PostgreSQL/Supabase schemas, naming, constraints, indexes, RLS, transactions, soft deletion, migrations, auditability, and data lifecycle decisions.
- Use `.agents/skills/security-rules/SKILL.md` for authentication, authorization, input validation, secret handling, uploads, abuse prevention, privacy, audit logs, threat modeling, and security review.

Common combinations:

- New domain or cross-domain flow: project architecture + database conventions + security rules.
- Public property or location page: project architecture + real-estate SEO + security rules.
- Property image feature: property media pipeline + database conventions + security rules; add real-estate SEO when rendered publicly.
- Lead capture or appointment flow: project architecture + database conventions + security rules; add real-estate SEO for public conversion pages.

## Decision workflow

1. State assumptions and the user-visible outcome.
2. Identify affected domains, trust boundaries, data ownership, and lifecycle states.
3. Apply the relevant project skills and note any rule conflict.
4. Choose the simplest design that meets current requirements and leaves explicit extension points only where evidence warrants them.
5. Record durable or costly-to-reverse decisions under `docs/decisions/` as ADRs.
6. Record architecture views under `docs/architecture/` and behavior/acceptance criteria under `docs/requirements/`.
7. Verify security, data integrity, SEO/indexability, performance, observability, and rollback implications before implementation.

## Documentation conventions

- Use Markdown with descriptive kebab-case filenames.
- ADR filenames should follow `NNNN-short-title.md` and include status, context, decision, alternatives, consequences, security/data/SEO impact, and rollback or migration notes.
- Requirements should distinguish functional behavior, acceptance criteria, non-functional constraints, edge cases, and open questions.
- Architecture documents should describe boundaries and data flow without duplicating implementation details that belong in code.
- Update documentation in the same change as the decision it explains.

## Definition of done for future implementation

A change is not done until relevant tests and checks pass, server-side validation and authorization are present, failure paths are handled, sensitive actions are auditable, data lifecycle behavior is explicit, and affected architecture/requirements/decisions documentation is current.
