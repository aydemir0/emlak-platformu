# Public Property Experience and SEO Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a safe, server-rendered V1 public property listing/detail experience with bounded filters, canonical SEO signals, redirects, sitemap output, and public-location redaction.

**Architecture:** Delivery routes parse untrusted paths/query values and invoke a public application read model. A server-only PostgreSQL adapter enforces the authoritative public predicates and returns redacted contracts; Server Components render those contracts without owning business rules. SEO metadata, JSON-LD, canonical, robots, and sitemap all consume the same projection.

**Tech Stack:** Next.js App Router, TypeScript strict, PostgreSQL/Supabase local, `pg`, React Server Components, Vitest, Playwright.

## Global Constraints

- Use only local `emlak-platformu`; do not link, mutate, seed, or query a remote Supabase project.
- Do not mutate production R2 or add a public delivery provider; use stored public-eligible variant paths as the Phase 7 contract.
- Canonical detail path is `/satilik|kiralik/{city}/{district}/{property-type}/{slug}`.
- Public rows require active/non-deleted property and `READY`/`PUBLIC`/non-deleted media with current non-purged variants.
- Treat only `location_visibility = EXACT` as exact; all other values redact address and coordinates before delivery.
- Keep arbitrary filter URLs `noindex,follow`; do not infer curated SEO pages.
- No Product schema, fake inventory, client-owned access checks, N+1 reads, or public access to privileged projections.

---

### Task 1: Define public contracts and deterministic SEO policy

**Files:**
- Create: `src/domain/public-properties/public-property-seo.ts`
- Create: `src/application/public-properties/public-property-contracts.ts`
- Test: `src/domain/public-properties/public-property-seo.unit.test.ts`

**Interfaces:**
- Produces `parsePublicSearchParams`, `buildCanonicalListingPath`, `getIndexability`, `buildPropertyCanonicalPath`, and redacted public property/media types.

- [ ] **Step 1: Write failing SEO-policy tests**

```ts
expect(getIndexability({ hasFilters: true, page: 1 })).toEqual("NOINDEX");
expect(buildCanonicalListingPath("SATILIK", { city: "Ankara", page: 1 })).toBe("/satilik?city=ankara");
expect(buildPropertyCanonicalPath(model)).toBe("/satilik/ankara/cankaya/daire/ornek-ilan");
```

- [ ] **Step 2: Run the focused test and confirm it fails because the policy module is absent.**

- [ ] **Step 3: Implement the minimal policy and strict input bounds.**

- [ ] **Step 4: Re-run the focused test and confirm it passes.**

### Task 2: Add public read port and redaction-aware PostgreSQL adapter

**Files:**
- Create: `src/application/public-properties/public-property-read-ports.ts`
- Create: `src/application/public-properties/get-public-property.ts`
- Create: `src/application/public-properties/list-public-properties.ts`
- Create: `src/infrastructure/public-properties/postgres-public-property-read-repository.server.ts`
- Test: `src/infrastructure/public-properties/postgres-public-property-read-repository.integration.test.ts`

**Interfaces:**
- `PublicPropertyReadRepository.getByRoute(route): Promise<PublicRouteResolution>`
- `PublicPropertyReadRepository.list(query): Promise<PublicPropertyPage>`
- `PublicPropertyReadRepository.listSitemapEntries(): Promise<PublicSitemapEntry[]>`

- [ ] **Step 1: Write failing integration tests for ACTIVE visibility, media eligibility, historical redirect, and non-EXACT redaction.**

```ts
expect(await repository.getByRoute(currentRoute)).toMatchObject({ kind: "PROPERTY" });
expect(await repository.getByRoute(oldRoute)).toMatchObject({ kind: "REDIRECT", status: 301 });
expect(model.location).not.toHaveProperty("addressLine");
expect(model.media.flatMap((item) => item.variants)).not.toContainEqual(expect.objectContaining({ visibility: "PRIVATE" }));
```

- [ ] **Step 2: Run the integration test and confirm it fails because the repository is absent.**

- [ ] **Step 3: Implement one bounded SQL projection per route family.**

The SQL must join current property route reservation, listing/property types, city/district hierarchy, and public current-recipe variants. It must filter `p.current_state='ACTIVE'`, `p.deleted_at is null`, `pm.state='READY'`, `pm.visibility='PUBLIC'`, `pm.deleted_at is null`, `pm.ready_at is not null`, and `v.purged_at is null`. Aggregate media in the query or a lateral subquery; do not issue queries per property.

- [ ] **Step 4: Re-run integration tests and add a query-count assertion proving listing rendering does not issue N+1 queries.**

### Task 3: Render public listing/detail routes and SEO signals

**Files:**
- Create: `src/app/(public)/[listingType]/page.tsx`
- Create: `src/app/(public)/[listingType]/[city]/[district]/[propertyType]/[slug]/page.tsx`
- Create: `src/features/public-properties/components/public-property-card.tsx`
- Create: `src/features/public-properties/components/public-property-gallery.tsx`
- Create: `src/features/public-properties/components/public-property-breadcrumbs.tsx`
- Create: `src/features/public-properties/public-property-page.server.ts`
- Test: route/component unit tests under `src/features/public-properties/`

**Interfaces:**
- Consumes only `PublicPropertyPage` and `PublicPropertyDetail` contracts.
- Produces server-rendered HTML and `generateMetadata` from the same model.

- [ ] **Step 1: Write failing render tests.**

```tsx
expect(await screen.findByRole("heading", { name: detail.title })).toBeVisible();
expect(screen.queryByText(detail.location.addressLine ?? "")).toBeNull();
expect(screen.getAllByRole("img")[0]).toHaveAttribute("srcSet");
```

- [ ] **Step 2: Run tests and confirm route/component imports are missing.**

- [ ] **Step 3: Implement Server Components with semantic links, dimensions, `srcSet`, `sizes`, BreadcrumbList JSON-LD, placeholder CTA, canonical metadata, and no client state for property facts.**

- [ ] **Step 4: Re-run tests and verify non-EXACT values cannot appear in HTML, metadata, JSON-LD, or props.**

### Task 4: Implement redirect, robots, and sitemap delivery boundaries

**Files:**
- Create: `src/app/sitemap.ts`
- Modify: public detail route from Task 3
- Test: `src/app/sitemap.unit.test.ts`, detail-route tests

- [ ] **Step 1: Write failing tests for direct 301 old-slug redirects, not-found unavailable routes, sitemap exclusion, and `noindex,follow` filtered listings.**

```ts
expect(metadata.robots).toEqual({ index: false, follow: true });
expect(entries).toEqual([expect.objectContaining({ url: canonicalUrl })]);
expect(entries.map((entry) => entry.url)).not.toContain(oldUrl);
```

- [ ] **Step 2: Run tests and confirm current routes do not yet provide these outcomes.**

- [ ] **Step 3: Use `permanentRedirect` only for the repository’s confirmed historical route resolution. Return `notFound()` for unavailable or non-public rows. Generate sitemap entries from the public repository only.**

- [ ] **Step 4: Re-run focused SEO tests.**

### Task 5: Browser verification and documentation

**Files:**
- Modify: `tests/e2e/foundation.spec.ts` or create `tests/e2e/public-property.spec.ts`
- Modify: `docs/requirements/public-property-seo.md`
- Modify: `docs/architecture/seo-architecture.md` only if implementation resolves an architecture ambiguity

- [ ] **Step 1: Write a failing browser flow for canonical property navigation, filter noindex, and old-route redirect.**

- [ ] **Step 2: Run the browser test and confirm it fails before route support exists.**

- [ ] **Step 3: Implement only the missing delivery wiring.**

- [ ] **Step 4: Run lint, format check, typecheck, unit, integration, build, Playwright, secret/remote scans, and `git diff --check`.**

- [ ] **Step 5: Commit the implementation and open/update the draft PR without merging.**

## Plan self-review

- Public lifecycle, media eligibility, redaction, canonicalization, redirects, sitemap, pagination, noindex policy, query count, responsive rendering, metadata, structured data, and Playwright coverage map to Tasks 1–5.
- No schema or remote-provider mutation is introduced.
- Curated landing implementation, CRM/CTA workflow, final map behavior, cache SLOs, and location vocabulary remain outside the plan.
