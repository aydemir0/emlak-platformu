# Rendering Strategy

**Status:** Proposed

## Purpose

Define how public and administrative experiences produce HTML while protecting search visibility, Core Web Vitals, conversion, authorization, and operational speed. This document sets rendering boundaries; it does not select framework APIs or create runtime code.

## Responsibilities

- Deliver the primary content, headings, navigation, canonical URL, metadata, and structured data of every indexable page in the initial server response.
- Keep public discovery and lead-capture journeys useful through progressive enhancement.
- Default public presentation to server-rendered components and add browser-side code only for genuine interaction.
- Keep authenticated admin views request-aware, permission-aware, and outside shared public rendering caches.
- Assign page indexability through the policy in [SEO architecture](./seo-architecture.md), not through rendering mode alone.

## Boundaries

The delivery layer selects a rendering policy and invokes application read use cases. Read use cases return provider-neutral page models; rendering code must not query Supabase, R2, or other provider SDKs directly and must not contain publication, pricing, permission, or lifecycle rules.

Public read models and privileged admin command/query models are separate contracts even when they use the same authoritative records. Browser components receive only the minimal serializable data they need. Draft previews are authenticated, authorization-checked server responses and are never public cache entries.

**Assumption —** The initial application uses the Next.js App Router and Server Components, consistent with the planned stack; the architecture remains expressed in provider-neutral responsibilities.

## Main data/control flow

1. The delivery layer normalizes the host, path, locale, and query input and rejects unsafe or unsupported states.
2. It resolves the route's audience and indexability classification.
3. A public read use case loads an authorized-for-publication page model, or an admin use case authenticates and authorizes the actor before loading operational data.
4. The server renders content and SEO signals from the same page model so visible facts, metadata, and structured data cannot drift.
5. Optional browser components hydrate only interactive islands such as galleries, maps, filters, and forms.
6. Analytics loads outside the critical render path and never determines whether core content is available.

Rendering classes:

| Experience | Default rendering | Shared cache | Indexability |
| --- | --- | --- | --- |
| Curated public discovery and property pages | Complete server-rendered HTML, eligible for precomputation/revalidation | Allowed under explicit policy | Allowlisted |
| Arbitrary filters and internal search | Server-rendered when user-facing; bounded query space | Allowed only for non-sensitive public data | `noindex` by default |
| Draft/property preview | Dynamic authenticated server rendering | Prohibited | Inaccessible to indexing |
| Admin | Dynamic authenticated server rendering | Prohibited | Inaccessible to indexing |

## Security implications

- Every preview and admin render revalidates the server session and object/action authorization; client state is never authority.
- Shared output contains only published, public, non-personal data. Cookies, identity, private inventory notes, lead/customer data, and signed private-media URLs make a response ineligible for shared caching.
- Untrusted route, query, rich-text, and structured-data inputs require server-side validation and context-appropriate output encoding.
- Admin and preview hosts/routes need access controls and explicit anti-indexing signals; robots directives alone are not security controls.
- Server-only credentials and provider clients must never cross into browser bundles.

## Performance implications

Server rendering avoids client-only discovery delays and lets crawlers and users receive meaningful HTML immediately. Public read models should minimize query count and payload size and follow [Caching strategy](./caching-strategy.md). Client JavaScript, fonts, third-party scripts, and LCP media need explicit budgets before implementation. Responsive media must provide dimensions, suitable candidates, stable aspect ratios, and high priority only for the actual LCP image.

## Failure modes

- If the authoritative read fails, return a stable error or unavailable state; do not render stale private/draft data or invent facts.
- If optional analytics, maps, recommendations, or social widgets fail, primary content and conversion actions remain usable.
- If a browser component fails to hydrate, critical property facts, internal links, and basic form semantics remain present.
- If route classification is unknown, fail closed for indexability and shared caching.
- If cached content cannot be trusted after an unpublish/security-sensitive transition, bypass or invalidate it as specified in [Caching strategy](./caching-strategy.md).

## Scalability considerations

Start with one modular monolith and scale public reads through bounded page models, database query tuning, explicit caching, and responsive media. Partition rendering or introduce a separate read service only after measured load, deployment isolation, or fault-containment needs justify the added consistency and operational cost.

## Rejected alternatives

- Client-only rendering for indexable pages: weakens resilience, crawlability, and initial performance.
- Static generation without an explicit freshness contract: makes publication changes and removals unpredictable.
- One rendering/cache policy for public and admin experiences: risks data leakage and constrains operational freshness.
- Rendering code that calls providers or embeds business rules: couples UI to infrastructure and makes rules inconsistent.
- Rendering every theoretical filter combination as an indexable page: creates thin content and an unbounded crawl space.

## Open questions

- **Open Decision —** Which page families require request-time rendering versus precomputation after measured traffic and freshness requirements are known?
- **Open Decision —** What JavaScript, LCP-media, font, TTFB, and third-party-script budgets are acceptance criteria for each public template?
- **Open Decision —** Which map and gallery interactions must work without hydration, and which may be enhanced only in the browser?
- **Open Decision —** What authenticated preview workflow and preview URL lifetime meet editorial needs?
