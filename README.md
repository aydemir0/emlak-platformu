# Emlak Platformu

SEO, performance, conversion, operational speed, data integrity, and security by design around a modern real-estate platform.

## Status

Phases 1–3 established governance, architecture, and the Supabase/PostgreSQL schema. Phase 4 adds only the application foundation: a minimal public surface, a protected admin shell, provider boundaries, generated database types, and quality gates. Product workflows and final visual design remain intentionally out of scope.

## Planned stack

- Next.js and TypeScript
- PostgreSQL / Supabase and Supabase Auth
- Cloudflare R2
- Vercel
- Tailwind CSS and shadcn/ui
- Resend
- GA4 and internal analytics

## Core domains

Properties, property images, property features, locations, advisors, leads, customers, customer requests, appointments, SEO landing pages, blog, analytics, and audit logs.

## Product principles

- Public site: SEO, performance, and conversion.
- Admin: operational speed and safe workflows.
- Database: integrity, explicit lifecycle rules, and auditable changes.
- Architecture: business logic outside React components and deterministic business decisions.
- Inputs: mandatory server-side validation and secure upload handling.
- Data lifecycle: soft deletion by default.
- SEO: a first-class architecture concern with controlled filter indexability.
- Media: R2-backed originals and responsive delivery variants.
- Engineering: production readiness, Clean Code, SOLID where useful, and no speculative complexity.

## Repository guidance

Project-wide Codex instructions live in `AGENTS.md`. Specialized, reusable rules live under `.agents/skills/`. Architecture, requirements, and durable decisions belong under `docs/`.

## Local application checks

Copy `.env.example` to an ignored local environment file and provide the local `emlak-platformu` keys. Then run:

```text
npm ci
npm run quality
npx playwright install chromium
npm run test:e2e
```

The app expects the isolated local Supabase namespace documented under `supabase/`; it must not reuse or mutate LMS Docker resources. Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser code.
