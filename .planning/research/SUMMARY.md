# Project Research Summary

**Project:** Paperclip — v1.1 Deployment & SaaS Readiness
**Domain:** Monolith split — Vite SPA on Vercel CDN + Express 5 on Railway + Supabase PostgreSQL + Redis + in-process API Gateway
**Researched:** 2026-04-04
**Confidence:** HIGH

## Executive Summary

Paperclip v1.1 is not a rewrite — it is a deployment architecture migration. The existing Express 5 + Drizzle ORM + BetterAuth + React 19 stack remains unchanged; what changes is how it is deployed and served. The v1.0 monolith (Express serves both UI and API, embedded-postgres) splits into three layers: Vercel CDN hosts the static Vite build, Railway runs the Express API container using the existing Dockerfile, and Supabase replaces embedded-postgres as the shared global database. A Redis cache layer sits in front of Supabase for rate-limit state and optional query caching. All API Gateway concerns (CORS, rate limiting, security headers) are implemented as Express middleware in the existing server process — no separate gateway service is warranted at this scale.

The recommended approach is sequenced by hard dependencies: provision Supabase first (Railway needs DATABASE_URL at boot), deploy Railway second (Vercel needs the stable API URL at Vite build time), then deploy Vercel, then wire cross-domain env vars and redeploy Railway. This order prevents the most common failure mode — deploying the frontend before the backend URL is known, resulting in a bundle with an undefined VITE_API_BASE_URL. The minimal code changes required are: (1) fix three WebSocket URL constructions that use window.location.host, (2) update the API client base URL to use VITE_API_BASE_URL, (3) add CORS and rate-limit middleware to app.ts, and (4) configure BetterAuth cookies for cross-origin (SameSite=None; Secure).

The primary risks are cross-origin authentication failures, which are silent and confusing. SameSite=Lax cookies (the BetterAuth default) are silently blocked on cross-site requests — the user appears to log in but every subsequent request returns 401. The boardMutationGuard middleware has the same pattern: it accepts GET requests but returns 403 on all mutations from the Vercel origin. Both are env-var fixes with small code changes, but they must be done before end-to-end testing is possible. The Supabase connection mode is the other critical decision: the transaction-mode pooler (port 6543) breaks Drizzle's prepared statements; the session-mode pooler (port 5432) requires no code changes and is the correct choice for a long-lived Railway container.

---

## Key Findings

### Recommended Stack

The existing stack (React 19, Vite, Tailwind v4, shadcn/ui, Express 5, Drizzle ORM, BetterAuth, postgres.js) is fully retained. The only additions are deployment infrastructure packages. The `@paperclipai/db` package already supports external Postgres via DATABASE_URL — no DB-layer changes are needed to connect to Supabase beyond setting the environment variable and capping the postgres-js connection pool to `max: 5` (Supabase free tier allows 60 total connections).

New packages added to `server/` only:
- `redis` (node-redis v5.11.0): official Redis client, full TypeScript support, promise-based API — use this, not the maintenance-mode ioredis
- `helmet` (v8.1.0): HTTP security headers with zero config, Express 4.x and 5.x compatible
- `express-rate-limit` (v7.x): per-IP rate limiting with Redis store support
- `rate-limit-redis`: Redis store for express-rate-limit, persists rate-limit state across restarts

**Core technologies (additive only):**
- Railway: backend container host — native Dockerfile detection, private Redis networking, auto-assigned public domain, PORT env injection
- Vercel: frontend CDN — zero-config Vite/React SPA, VITE_ env var injection at build time, SPA routing via vercel.json rewrite
- Supabase: global Postgres host — session-mode pooler (port 5432), drop-in compatible with existing Drizzle + postgres.js setup
- Railway Redis addon: TCP Redis in same private network, fixed pricing, no HTTP overhead — preferred over Upstash for persistent servers
- `helmet` + `express-rate-limit` + `cors`: in-process API gateway — no separate gateway service required at v1.1 scale

**What NOT to add:** ioredis (maintenance mode — use node-redis v5), Upstash (HTTP-based, designed for serverless not persistent servers), Kong/Nginx/Envoy as a separate gateway service, Supabase transaction-mode pooler without `prepare: false`, a separate `cors` npm package conflicts with BetterAuth if added naively, Supabase Auth (replacing BetterAuth is a massive rewrite), Supabase RLS (bypassed by Drizzle, creates competing auth systems).

### Expected Features

The milestone has a clear two-tier structure: P1 features must all work for multi-user end-to-end testing to be possible; P2 features add hardening and are deferred until the core deployment is verified stable.

**Must have (table stakes — P1, "deployed and testable"):**
- Frontend on Vercel CDN — Vite build, SPA routing via vercel.json rewrite, VITE_API_BASE_URL pointing to Railway
- Backend on Railway — existing Dockerfile, SERVE_UI=false, stable public URL, GET /health endpoint
- Supabase as database — DATABASE_URL injected, session-mode pooler URL (port 5432), initial migrations applied manually by user
- CORS configured — Railway explicitly allows Vercel origin with credentials, BetterAuth cookies work cross-origin
- VITE_API_BASE_URL wired throughout frontend — all fetch calls and three WebSocket URL constructions updated
- End-to-end smoke test passing — owner invites, user joins, task assigned, status changed, handoff to AI agent

**Should have (hardening — P2, add after core deployment is stable):**
- Rate limiting — express-rate-limit middleware; add after base deployment confirmed (limits interfere with debugging otherwise)
- HTTP security headers — helmet middleware; zero-config, low risk, but defer to keep debugging scope small
- Redis query cache — cache-aside for read-heavy list endpoints; add once Supabase query patterns are understood under real load
- Redis BetterAuth session cache — reduces per-request DB latency; add after Redis is working for query cache

**Defer (v2+):**
- Preview deployment CORS — Vercel preview URLs (random subdomains) in BetterAuth trustedOrigins; needed for PR review workflow
- S3-compatible file storage — replace local disk attachments; ephemeral Railway filesystem loses files on redeploy
- Horizontal Railway scaling — multiple replicas require Redis-backed sessions
- Custom domain — eliminates CORS complexity by using same-root domain with subdomains (app.paperclip.ai / api.paperclip.ai)

### Architecture Approach

The target architecture separates concerns cleanly across three tiers with no shared process boundaries: Vercel CDN delivers static assets, Railway runs the Express API container with all gateway middleware inline, and Supabase provides the persistent data layer with Redis as an optional caching layer in the same Railway private network. The critical insight is that the Vite dev proxy (which makes local development same-origin) masks the cross-origin problem completely — developers working locally never see CORS errors, WebSocket construction problems, or cookie issues. Every cross-origin pitfall only manifests in production.

**Major components:**
1. Vercel CDN (ui/vercel.json + VITE_API_BASE_URL) — static SPA host with SPA routing fallback; VITE_ env vars baked into the JS bundle at Vite build time, not at runtime
2. Railway Express container (SERVE_UI=false, existing Dockerfile) — API-only server with inline gateway middleware stack: cors → rateLimit → express.json → existing middleware chain
3. Supabase PostgreSQL (session-mode pooler, port 5432) — drop-in replacement for embedded-postgres via DATABASE_URL; schema and migrations unchanged
4. Railway Redis (private TCP, same project network) — rate-limit state store (required for multi-instance correctness); optional query cache for high-read endpoints
5. BetterAuth cross-origin config (SameSite=None; Secure cookies + PAPERCLIP_ALLOWED_HOSTNAMES) — two env vars plus two lines of cookie config unlock cross-origin auth

**Build order is determined by URL dependency chain:**
Supabase provisioned → Railway deployed (gets public URL) → Vercel deployed (uses Railway URL at build time) → Railway env updated with Vercel origin → Railway redeploys → end-to-end validation.

**Key architectural decisions:**
- Use the `cors` npm package in Express (not a duplicate of BetterAuth CORS — BetterAuth's CORS only covers auth routes; the `cors` package covers all API routes)
- PAPERCLIP_ALLOWED_HOSTNAMES env var already exists and is read by `deriveAuthTrustedOrigins()` — no new config infrastructure needed
- An existing `/api/health` route may already exist (routes/health.js seen in ARCHITECTURE.md) — verify before adding a new one

### Critical Pitfalls

1. **WebSocket URLs built from window.location.host (3 specific files)** — In production, Vercel frontend constructs WebSocket URLs pointing at Vercel (wss://app.vercel.app/api/...) which Vercel cannot serve. Vercel does not support WebSockets at all. Fix: replace `window.location.host` with `new URL(import.meta.env.VITE_API_BASE_URL).host` in LiveUpdatesProvider.tsx (line 776), useLiveRunTranscripts.ts (line 189), and AgentDetail.tsx (line 3567). Hard blocker — live events stop working silently while REST calls succeed.

2. **API client uses relative /api path** — `ui/src/api/client.ts` has `const BASE = "/api"` which resolves to the Vercel CDN in production, returning 404 for all API calls. `ui/src/api/auth.ts` also uses literal `/api/auth/...` strings. Fix: `const BASE = (import.meta.env.VITE_API_BASE_URL ?? "") + "/api"`. When VITE_API_BASE_URL is unset in local dev, relative paths still work via the Vite proxy.

3. **BetterAuth SameSite=Lax blocks all cross-origin cookies** — Sign-in returns 200 but every subsequent authenticated request returns 401 because the session cookie is never sent. Fix requires both: (a) `advanced.defaultCookieAttributes: { sameSite: "none", secure: true }` in better-auth.ts, and (b) BETTER_AUTH_TRUSTED_ORIGINS env var set to the Vercel production URL. Both steps are required — either alone is insufficient.

4. **boardMutationGuard returns 403 for all mutations from the Vercel frontend** — GET requests succeed but POST/PATCH/DELETE return 403 because the guard matches request origin against the server's own hostname only. Fix: add the Vercel hostname to PAPERCLIP_ALLOWED_HOSTNAMES env var in Railway. No code changes needed — the config already reads and processes this env var.

5. **Supabase transaction-mode pooler (port 6543) silently breaks Drizzle** — postgres.js sends prepared statements by default; transaction mode does not support prepared statements. Results in `PreparedStatementAlreadyExists` or `query is not prepared` errors in Railway logs. Fix: use session-mode pooler (port 5432) which requires no code changes. Only add `prepare: false` to createDb() in packages/db/src/client.ts if transaction mode is specifically required later.

6. **BETTER_AUTH_SECRET left as "paperclip-dev-secret" in production** — The fallback in better-auth.ts uses this known string; anyone with the source code can forge valid session tokens. Railway startup produces no warning if the env var is absent. Fix: `openssl rand -base64 32` and set as BETTER_AUTH_SECRET in Railway before any public-facing deployment.

---

## Implications for Roadmap

The research reveals a clear two-phase structure. All P1 features are atomically interdependent — they cannot be independently verified before the others are in place, so they belong in a single phase. P2 hardening features are genuinely independent of each other and can be built in any order after P1 is stable. The dependency chain forces a strict internal sequence within Phase 1, but the phase as a whole is deliverable in one iteration.

### Phase 1: Core Deployment Split

**Rationale:** All P1 features are interdependent and must be deployed together before any end-to-end testing is possible. The URL dependency chain (Supabase URL → Railway deploy → Railway URL → Vercel deploy → Vercel URL → Railway CORS config → Railway redeploy) means this is one logical phase with a fixed internal sequence. Splitting it would create a phase that cannot be verified until the next phase completes — a false checkpoint. All critical pitfalls (Pitfalls 1-6) must also be resolved before the first deployment is meaningful.

**Delivers:** A publicly accessible multi-user deployment where the full end-to-end smoke test is possible — owner invites user, user joins, task assigned to human, status changed, handoff to AI agent.

**Addresses (P1 features from FEATURES.md):**
- Frontend on Vercel CDN (vercel.json + VITE_API_BASE_URL)
- Backend on Railway (SERVE_UI=false, GET /health endpoint)
- Supabase as database (DATABASE_URL, session-mode pooler, manual migration run by user)
- CORS and cross-origin BetterAuth session cookies configured
- VITE_API_BASE_URL wired throughout frontend (API client.ts + auth.ts + 3 WebSocket URL files)
- End-to-end smoke test execution and sign-off

**Code changes (all small and targeted):**
- `ui/src/api/client.ts` — update BASE URL to use VITE_API_BASE_URL
- `ui/src/api/auth.ts` — update literal /api/auth strings
- `ui/src/context/LiveUpdatesProvider.tsx` (line 776) — WebSocket URL from env
- `ui/src/components/transcript/useLiveRunTranscripts.ts` (line 189) — WebSocket URL from env
- `ui/src/pages/AgentDetail.tsx` (line 3567) — WebSocket URL from env
- `server/src/app.ts` — mount cors + rateLimit middleware at top of stack (before existing middleware)
- `server/src/auth/better-auth.ts` — add SameSite=None; Secure to cookie attributes
- `packages/db/src/client.ts` — add `max: 5` to postgres-js pool constructor
- NEW: `ui/vercel.json` — SPA routing rewrite rule

**Avoids (all critical pitfalls from PITFALLS.md):**
- WebSocket URLs pointing at Vercel (fix before any deployment)
- API client resolving to Vercel CDN (fix alongside WebSocket URLs)
- BetterAuth cookie blocking cross-origin sessions (env + code)
- boardMutationGuard 403 on all mutations (PAPERCLIP_ALLOWED_HOSTNAMES env)
- SERVE_UI=true serving stale Railway-bundled UI (SERVE_UI=false in Railway env)
- BETTER_AUTH_SECRET left as default (generate and set before public access)

### Phase 2: API Hardening

**Rationale:** Rate limiting, security headers, and Redis caching are genuine optimizations and protection layers — they do not affect correctness of the deployment. Adding them during Phase 1 would introduce debugging noise (rate limits block rapid manual testing) and premature cache key design (optimal cache strategy depends on observed Supabase query patterns). These features are genuinely independent of each other and can be built in any order within this phase.

**Delivers:** A production-hardened API layer resilient to abuse and performant under real user load. Redis also enables future horizontal Railway scaling with distributed rate-limit state.

**Addresses (P2 features from FEATURES.md):**
- HTTP security headers (helmet — HSTS, CSP, X-Frame-Options, X-Content-Type)
- Rate limiting (express-rate-limit + RedisStore — distributed, persistent across restarts)
- Redis query cache (cache-aside pattern for read-heavy list endpoints)
- Redis BetterAuth session cache (secondaryStorage adapter — reduces DB round-trip per authenticated request)

**Uses (from STACK.md):**
- `redis` (node-redis v5.11.0) — TCP client for Railway Redis private network
- `helmet` v8.1.0 — zero-config security headers, Express 5 compatible
- `express-rate-limit` v7.x + `rate-limit-redis` — distributed rate limiting

**Avoids (from PITFALLS.md):**
- Never cache BetterAuth session validation in Redis — must always hit DB to detect revoked sessions
- Scope Redis cache keys per-company to prevent cascade invalidation on writes
- Use short TTLs; never cache unbounded list queries (Redis string size limits)

### Phase 3: Future (v1.2+ — Post-Milestone)

**Rationale:** These items require architectural decisions that go beyond the v1.1 scope. Each is triggered by a specific growth event, not by the current multi-user testing goal.

**Defers (from FEATURES.md v2+):**
- Preview deployment CORS — Vercel preview random subdomain URLs in BetterAuth trustedOrigins; needed for PR review workflow but not for production testing
- S3-compatible file storage — replace local disk attachments lost on Railway redeploy; not required for v1.1 smoke test (no file uploads in test plan)
- Horizontal Railway scaling — requires Redis-backed sessions (not in-memory); defer until load justifies multiple instances
- Custom domain — app.paperclip.ai → Vercel, api.paperclip.ai → Railway; eliminates CORS complexity but requires DNS management

### Phase Ordering Rationale

- **Supabase before Railway deploy:** Railway container crashes on boot without a valid DATABASE_URL — embedded-postgres is unavailable in the cloud environment. Supabase must be provisioned and the connection string known before Railway deployment begins.
- **Railway before Vercel deploy:** VITE_API_BASE_URL is baked into the Vite JS bundle at Vercel build time. If Railway URL is unknown, the env var is undefined in the production bundle and all API calls resolve to undefined — fails silently.
- **Cross-domain env wiring after both platforms have URLs:** PAPERCLIP_ALLOWED_ORIGINS and PAPERCLIP_ALLOWED_HOSTNAMES require the Vercel URL, which is only known after Vercel deployment. This env update triggers a Railway redeploy — the final step before testing.
- **Hardening phase only after smoke test passes:** Rate limits and Redis cache add variables that complicate debugging auth and CORS issues. Confirming the base deployment works first eliminates confounding factors.
- **P3 deferred entirely:** All P3 items require new external service integrations (S3) or load-triggered scaling decisions that are premature at v1.1 multi-user testing scale.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 2 (Redis query cache):** Cache key design, TTL strategy, and write-invalidation pattern depend on actual query access patterns observed in Phase 1. The STACK.md documents the cache-aside pattern and suggests key formats, but the full key taxonomy should be designed from observed Phase 1 data. Flag for `/gsd:research-phase` before Phase 2 planning begins.

Phases with standard patterns (skip research-phase during planning):

- **Phase 1 (Core deployment):** All integration points are fully documented with code-verified findings and official sources. The exact files and line numbers that need changing are identified. Implementation is mechanical configuration plus targeted small code changes — no unknowns remain.
- **Phase 2 (Rate limiting + security headers):** helmet and express-rate-limit are industry-standard Express packages with zero-config defaults. STACK.md documents exact versions and the complete middleware snippet. No further research needed.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All new packages verified from npm registry and official docs. Version compatibility confirmed against Express 5 and Node.js 18+. No ambiguity on package selection. |
| Features | HIGH | P1/P2/P3 distinction is grounded in the hard dependency graph, not opinion. Platform-specific behavior notes verified against Railway, Vercel, and Supabase official docs. |
| Architecture | HIGH | Existing codebase was directly read and inspected — findings are code-verified against specific files and line numbers, not inferred. All integration patterns confirmed by official documentation. |
| Pitfalls | HIGH | Six of eight pitfalls are code-verified against specific file paths and line numbers in the existing codebase. The remaining two (API Gateway WebSocket stripping, Redis cache invalidation) are confirmed by official documentation. |

**Overall confidence:** HIGH

### Gaps to Address

- **BetterAuth cross-origin cookie attribute field names (MEDIUM confidence):** The exact BetterAuth config field for cross-origin cookies (`advanced.cookieOptions` vs `advanced.defaultCookieAttributes`) varies between BetterAuth versions. Community issues #2203, #4038, and #7657 confirm the behavior but show slightly different field names. Verify against the installed BetterAuth version in server/package.json before implementing. The behavioral requirement (SameSite=None; Secure) is certain; only the exact API field needs version verification.

- **Railway IPv6 for Supabase direct connection (deploy-time verification):** Supabase direct connection (port 5432) uses IPv6. If Railway's network does not support IPv6 outbound, fall back to the session-mode pooler URL (also port 5432, IPv4-compatible). This is a deploy-time check — no code change between the two options, only the connection string differs.

- **Redis query cache key design (intentionally deferred):** STACK.md documents the cache-aside pattern and suggests key formats, but the full key taxonomy and invalidation strategy should be designed from Phase 1 observed access patterns. This gap is intentional — cache design that precedes observation is premature optimization.

- **Existing /api/health endpoint (verify before adding):** ARCHITECTURE.md notes a `routes/health.js` file may already exist. Verify before adding a new GET /health route to avoid duplicate route registration.

---

## Sources

### Primary (HIGH confidence)
- [Railway Dockerfile docs](https://docs.railway.com/builds/dockerfiles) — Dockerfile detection, PORT injection, health check configuration
- [Railway Variables docs](https://docs.railway.com/variables) — service-to-service references, env var injection
- [Railway Express guide](https://docs.railway.com/guides/express) — DATABASE_URL pattern, health checks
- [Railway SaaS Backend Architecture](https://docs.railway.com/guides/saas-backend) — Redis + Postgres + API service pattern
- [Supabase: Connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres) — session vs transaction pooler, port 5432 vs 6543, connection string formats
- [Drizzle ORM + Supabase](https://orm.drizzle.team/docs/connect-supabase) — prepare: false requirement for transaction mode
- [node-redis official docs](https://redis.io/docs/latest/develop/clients/nodejs/) — v5 API, createClient, connect()
- [Vercel Vite framework docs](https://vercel.com/docs/frameworks/frontend/vite) — VITE_ prefix, SPA rewrites, build settings
- [BetterAuth Options Reference](https://better-auth.com/docs/reference/options) — trustedOrigins, defaultCookieAttributes
- [express-rate-limit GitHub](https://github.com/express-rate-limit/express-rate-limit) — rate limiting middleware
- [helmet npm](https://www.npmjs.com/package/helmet) — v8.1.0 security headers, Express 5 compatibility
- Existing codebase (directly read): `server/src/app.ts`, `server/src/auth/better-auth.ts`, `server/src/config.ts`, `packages/db/src/client.ts`, `ui/vite.config.ts`, `Dockerfile`, `ui/src/api/client.ts`, `ui/src/api/auth.ts`, `ui/src/context/LiveUpdatesProvider.tsx`, `ui/src/components/transcript/useLiveRunTranscripts.ts`, `ui/src/pages/AgentDetail.tsx`, `server/src/middleware/board-mutation-guard.ts`

### Secondary (MEDIUM confidence)
- [BetterAuth issue #2203](https://github.com/better-auth/better-auth/issues/2203) — trustedOrigins with Vercel preview deployments
- [BetterAuth issue #4038](https://github.com/better-auth/better-auth/issues/4038) — cross-domain cookies not set in production
- [BetterAuth issue #7657](https://github.com/better-auth/better-auth/issues/7657) — cross-origin auth broken with 1.4.x
- [Railway Help Station — CORS Vercel to Railway](https://station.railway.com/questions/cors-issue-post-request-blocked-from-ve-6920650c) — CORS config confirmed by Railway employees
- [BetterAuth not sending cookie in production on Railway](https://station.railway.com/questions/better-auth-in-production-not-sending-co-fea07157) — SameSite=None requirement confirmed
- [Redis Cache-Aside Pattern](https://redis.io/tutorials/howtos/solutions/microservices/caching/) — cache-aside implementation guidance
- [Express Redis Caching](https://oneuptime.com/blog/post/2026-02-02-express-redis-caching/view) — cache-aside pattern with Express middleware

### Tertiary (LOW confidence)
- [Upstash vs Railway Redis comparison](https://www.buildmvpfast.com/compare/upstash-vs-redis-cloud) — third-party; used only to confirm Railway Redis preference, not for technical decisions

---
*Research completed: 2026-04-04*
*Ready for roadmap: yes*
