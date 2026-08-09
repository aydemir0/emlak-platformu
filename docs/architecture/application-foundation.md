# Application foundation

## Purpose

Record the Phase 4 framework boundary that implements ADR-001 without adding product workflows.

## Structure and dependency direction

`src/app` is delivery only. `src/application` owns use-case contracts, typed outcomes, errors, authentication orchestration, and observability ports. `src/domain` will own provider-independent rules. `src/infrastructure` implements provider adapters and depends inward. `src/features` may compose these boundaries but cannot own business rules.

Server Components are the default. Client Components are limited to interactive error recovery and owned shadcn primitives. Route Handlers and future Server Actions authenticate, validate transport input, create request context, call one application use case, and map its typed result.

## Supabase and authentication boundaries

- The browser client uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` with generated `Database` types.
- The server client is cookie/session aware and is created per request.
- `src/proxy.ts` refreshes and verifies claims for `/admin`; it is a coarse authentication gate, not business authorization.
- The privileged client imports `server-only`, disables session persistence/refresh, and is not exported through a shared barrel. It is reserved for narrowly reviewed server adapters.
- `authenticateStaffSession` verifies provider identity and then resolves current staff role/scope through an inward-facing trusted database port. ADMIN requires AAL2; customer principals do not exist in V1.
- Data API exposure and Phase 3 grants/RLS remain unchanged.

## Environment and secret handling

Public and server configuration are parsed separately. Secret-bearing runtime configuration imports `server-only`; the browser bundle contract is tested with esbuild. `.env.example` contains names and local endpoints only. Logs recursively redact credential-like field names, and health output contains no provider or secret detail.

## Headers and cookies

All routes receive CSP, nosniff, strict referrer policy, permissions restrictions, and clickjacking protection. Current CSP permits framework-required inline scripts/styles while denying third-party origins by default. Before adding third-party scripts or a strict nonce strategy, evaluate its effect on public caching; do not introduce per-request nonce rendering globally without a rendering ADR update.

Supabase SSR owns auth cookies. Production assumes HTTPS, HttpOnly provider-managed session cookies, secure deployment defaults, and reviewed SameSite/domain settings after the final admin hostname decision.

## Observability

The application exposes a provider-neutral structured logger interface and correlation/request context. A future Sentry adapter can consume the same safe records. Audit events remain a separate business responsibility.

## Open decisions

- Final admin hostname and cookie domain/SameSite topology.
- Login, invitation, recovery, MFA enrollment, offboarding, and recent-authentication UX.
- Production CSP nonce/hash design when third-party scripts are approved.
- SLOs, log adapter, sampling, retention, and Sentry/Vercel wiring.
- Exact health dependency checks and deployment readiness policy once production dependencies are connected.
