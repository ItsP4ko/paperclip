# Feature Research

**Domain:** Deployment & SaaS Readiness — Vercel CDN + Railway backend + Supabase + API Gateway + Redis
**Researched:** 2026-04-04
**Confidence:** HIGH (infrastructure patterns), MEDIUM (BetterAuth cross-origin specifics)

---

## Context: What This Milestone Is

v1.0 shipped with a bundled architecture: Express server serves UI, uses embedded-postgres, runs in a single Docker container on a local machine. v1.1 separates the deployment into three layers:

- **Frontend** — Vercel CDN (static Vite build, global edge delivery)
- **Backend** — Railway (existing Dockerfile, Express 5, now with `SERVE_UI=false`)
- **Database** — Supabase (replaces embedded-postgres for the global, shared dataset)
- **Cache** — Redis on Railway (session/query caching layer in front of Supabase)
- **API Gateway** — Rate limiting + CORS enforcement (implemented in Express middleware, not as a separate service)

This is not a rewrite. The existing code changes minimally. The work is configuration, environment wiring, and adding a Redis middleware layer.

---

## Feature Landscape

### Table Stakes (Users Expect These)

These are the baseline behaviors expected from any SaaS deployment. Missing any of these means the deployment is not production-ready.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Frontend served from CDN | All modern SPAs are CDN-served; local latency is unacceptable for multi-user testing | LOW | Vite build deployed to Vercel. Requires `vercel.json` SPA rewrite rule + root directory set to `ui/`. Zero code changes if `VITE_API_URL` is injected at build time. |
| Backend accessible via stable public URL | Multi-user testing requires all clients to reach the same backend | LOW | Railway auto-assigns a public domain on first deploy. Set `PAPERCLIP_PUBLIC_URL` + `PAPERCLIP_DEPLOYMENT_MODE=authenticated`. |
| Environment variable injection for API URL | Frontend must know where to call the backend; hardcoding URLs breaks preview deployments | LOW | Vite requires `VITE_` prefix. Add `VITE_API_URL=https://[railway-url]` in Vercel project settings. All `fetch` calls in `ui/src/api/` must read `import.meta.env.VITE_API_URL`. Existing code likely hardcodes `localhost:3100` — this is the primary frontend code change. |
| CORS configured for cross-origin requests | Vercel frontend origin and Railway backend origin are different — browser enforces CORS | MEDIUM | Express must set `Access-Control-Allow-Origin: [vercel domain]` with `Access-Control-Allow-Credentials: true`. Wildcard `*` origin breaks cookie auth. Must be exact origin, not a pattern. |
| Database connection via env variable | Railway injects `DATABASE_URL`; the server must use it instead of embedded-postgres | LOW | `config.ts` already reads `process.env.DATABASE_URL`. Set `databaseMode: "postgres"` or inject `DATABASE_URL` directly. Supabase provides the connection string from the dashboard. |
| Session cookies work cross-origin | BetterAuth uses `Set-Cookie`; cross-origin cookies require `SameSite=None; Secure` | MEDIUM | `BETTER_AUTH_URL` must be set to the Railway backend public URL. Frontend `betterAuthClient` must use `baseURL: import.meta.env.VITE_API_URL`. All fetch calls need `credentials: 'include'`. Both Vercel and Railway provide HTTPS automatically. |
| Health check endpoint | Railway needs a `/health` route to validate successful deployment before routing traffic | LOW | Add `GET /health` returning `200 { status: "ok" }` in Express. Configure Railway service healthcheck path to `/health`. Default Railway timeout is 300 seconds. |
| Migrations applied to Supabase before first boot | App crashes on startup if tables do not exist | LOW | Supabase is a fresh Postgres instance. Run `pnpm db:migrate` with `DATABASE_URL` pointing to Supabase once before first deploy. Show SQL to user per global constraint — never auto-run. |
| Supabase connection pooling configured correctly | Direct connections from Railway to Supabase are limited; pooler avoids connection exhaustion | MEDIUM | Use Supabase Session Pooler (port 5432) for Railway — correct for long-lived server connections. Transaction Pooler (port 6543) is for serverless and breaks Drizzle prepared statements. Session Pooler supports prepared statements. |

### Differentiators (Competitive Advantage)

Features that make this deployment robust and testable beyond "it works."

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Redis cache layer for DB reads | Reduces Supabase query load; makes list endpoints fast even on Supabase free tier; cache-aside pattern is sufficient | MEDIUM | Check Redis first — hit returns cached JSON, miss queries Supabase and populates Redis with TTL. Key pattern: `company:{id}:issues`, `company:{id}:members`. Invalidate on write mutations. Use `ioredis` library. |
| Rate limiting on API endpoints | Prevents abuse during multi-user testing; required before any external user can access the app | LOW | `express-rate-limit` middleware applied globally and tighter on auth endpoints (`/api/auth/*`). 100 req/min global, 10 req/min on auth. In-memory store is sufficient for single Railway instance. |
| Separate `SERVE_UI=false` mode | Backend no longer serves the frontend; smaller Docker attack surface, cleaner separation | LOW | Already supported via `SERVE_UI` env var in `config.ts`. Set `SERVE_UI=false` in Railway service config. No code change needed. |
| Redis session caching for BetterAuth | Avoids a DB round-trip on every authenticated request; reduces latency on all authenticated routes | MEDIUM | BetterAuth supports a secondary cache adapter. With Redis, session lookup becomes Redis-first instead of always Supabase. Requires wiring BetterAuth session store to Redis client. |
| End-to-end smoke test for invite flow | Validates the deployment actually works for multi-user scenarios — the stated goal of v1.1 | LOW | Manual test plan: owner invites → new user signs up via invite link → task assigned → status changed → handoff to AI agent. No automation needed for v1.1 — a written checklist is sufficient. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Separate API Gateway service (Kong, Envoy, NGINX) | "Proper" microservices pattern; perceived security benefit | Adds an entire service to deploy, configure, and debug. For a single Express backend at v1.1 scale, all gateway concerns (auth, rate limiting, CORS) are cleanly handled in Express middleware. No traffic volume justification for a separate gateway. | Implement rate limiting with `express-rate-limit` and CORS with the `cors` npm package directly in Express. This is the actual industry standard for apps at this scale. |
| Supabase Auth (replacing BetterAuth) | Supabase has its own auth system; "keep it all in Supabase" | Replacing BetterAuth requires rewriting all auth routes, session handling, and the invite/join flow — a rewrite of v1.0's core. BetterAuth + Supabase-as-Postgres is the correct split: use Supabase for data only, not auth. | Keep BetterAuth. Point it at Supabase Postgres via `DATABASE_URL`. BetterAuth stores session data in the same Postgres it is already configured for. |
| Supabase Row-Level Security (RLS) | Supabase marketing prominently features RLS as a security layer | RLS requires all queries to run through the Supabase client or PostgREST, not through Drizzle over a direct Postgres connection. Drizzle bypasses RLS entirely. Enabling RLS without testing every query would silently break authorization logic already implemented in Express. | Authorization is already handled in the Express service layer (accessService, permission grants). Do not add RLS on top — it creates two competing authorization systems. |
| Transaction Pooler for Railway connection | Saves more database connections than Session Pooler | Drizzle uses prepared statements by default. Transaction mode breaks prepared statements, requiring `prepare: false` throughout — a non-trivial change to the entire DB client. Session Pooler handles long-lived connections correctly without code changes. | Use Supabase Session Pooler (port 5432) for Railway. The connection savings from Transaction mode are only needed for serverless/edge environments, not persistent Railway services. |
| Vercel serverless functions for backend | "Keep everything on Vercel" | The backend runs long-lived processes: WebSocket connections for live events, background schedulers for heartbeat and backup. Vercel Functions time out at 60 seconds and do not support persistent connections. | Backend on Railway (Docker, persistent process). Frontend on Vercel (static). This is the correct split. |
| Global Redis CDN via Upstash | Serverless Redis with edge caching; no infrastructure to manage | Upstash is HTTP-based, not TCP — requires the `@upstash/redis` SDK rather than standard `ioredis`. Adds a third external service dependency. At v1.1 scale (multi-user testing), Railway-hosted Redis is cheaper, simpler, and avoids API surface differences. | Deploy Redis as a Railway service in the same project. Private networking between Railway services means Redis is unreachable from the public internet — zero extra security config required. |
| Auto-run migrations on Railway deploy | "Zero-touch" deployment with pre-deploy command | The global project constraint prohibits automatic migrations. Any `ALTER TABLE` or `CREATE TABLE` must be shown to the user for manual review. Railway's pre-deploy command feature could trigger migrations, but this violates the project's migration protocol. | Show SQL to user. User runs manually against Supabase before deploying. For v1.1, the Supabase DB is new/empty, so the initial migration is a one-time `pnpm db:migrate` against the Supabase connection string. |

---

## Feature Dependencies

```
[Supabase PostgreSQL provisioned]
    └──requires──> [DATABASE_URL set in Railway env]
                       └──requires──> [Backend boots without embedded-postgres]
                                          └──requires──> [databaseMode: "postgres" in config OR DATABASE_URL env override]

[Vercel frontend deployed]
    └──requires──> [VITE_API_URL set in Vercel project env vars]
                       └──requires──> [Railway backend has a stable public URL]

[CORS working]
    └──requires──> [Railway backend knows the exact Vercel frontend origin]
    └──requires──> [BetterAuth BETTER_AUTH_URL set to Railway URL]
    └──requires──> [All frontend fetch calls use credentials: 'include']

[Session cookies working cross-origin]
    └──requires──> [CORS with credentials enabled (non-wildcard origin)]
    └──requires──> [BetterAuth cookie options: SameSite=None, Secure=true]
    └──requires──> [HTTPS on both Vercel and Railway — both provide this automatically]

[Redis cache layer]
    └──requires──> [Redis service running on Railway private network]
    └──requires──> [REDIS_URL set in Railway API service env]
    └──depends-on──> [Supabase working] (Redis is a cache in front of Supabase, not a replacement)

[Health check passing]
    └──requires──> [GET /health endpoint added to Express]
    └──requires──> [Railway service healthcheck path configured to /health]

[End-to-end multi-user smoke test]
    └──requires──> [All of the above]
```

### Dependency Notes

- **Database before backend deploy:** Supabase must be provisioned and `DATABASE_URL` set before Railway can boot successfully. The server crashes without a database connection.
- **Railway URL before Vercel deploy:** Vercel needs `VITE_API_URL` at build time. Deploy Railway first, get the URL, then deploy Vercel.
- **CORS before testing auth:** Getting CORS wrong (wildcard origin) silently breaks cookie-based auth. Verify CORS headers with `curl -v` before testing any auth flows.
- **Redis is optional for v1.1 core:** Redis cache adds resilience but is not a hard dependency. The app works without it — Supabase can handle direct queries at v1.1 testing scale. Build Redis after the core deployment is verified and stable.

---

## MVP Definition

### Launch With (v1.1 core — "deployed and testable")

All of these must work for multi-user end-to-end testing to be possible.

- [ ] Frontend on Vercel CDN — Vite build deployed, SPA routing via `vercel.json` rewrite, `VITE_API_URL` pointing to Railway
- [ ] Backend on Railway — Dockerfile deploy, `SERVE_UI=false`, stable public URL, `GET /health` endpoint
- [ ] Supabase as database — `DATABASE_URL` injected, Session Pooler connection string, initial migrations applied manually by user
- [ ] CORS configured — Railway allows Vercel origin explicitly, `credentials: 'include'` on all fetches, BetterAuth cookies work cross-origin
- [ ] End-to-end smoke test passing — owner invites → user joins → task assigned → status changed → handoff to AI agent

### Add After Core Deployment Verified (v1.1 hardening)

Add these once the base deployment is confirmed stable. They do not block the smoke test.

- [ ] Rate limiting — `express-rate-limit` added to Express; add after confirming the base deployment works so limits do not interfere with debugging
- [ ] Redis query cache — Railway Redis service + `ioredis` cache-aside middleware for read-heavy list endpoints; add once Supabase query patterns are understood under real load
- [ ] Redis BetterAuth session cache — reduces per-request DB latency; add after Redis is working for query cache

### Future Consideration (v1.2+)

- [ ] Preview deployment CORS — allow Vercel preview URLs (random subdomains) in BetterAuth `trustedOrigins`; needed when team uses PRs for feature review
- [ ] S3-compatible file storage — replace local disk attachments with persistent object storage; current `storageProvider: local_disk` is lost on every Railway redeploy (ephemeral filesystem)
- [ ] Horizontal scaling on Railway — multiple replicas require Redis-backed sessions (not in-memory); defer until load justifies it
- [ ] Custom domain — point `app.paperclip.ai` to Vercel and `api.paperclip.ai` to Railway; eliminates CORS complexity by using same-root domain with subdomains

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Frontend on Vercel CDN | HIGH — enables multi-user access from any browser | LOW — Vite build + vercel.json + env var | P1 |
| Backend on Railway (existing Dockerfile) | HIGH — prerequisite for everything else | LOW — Dockerfile already exists, env vars to set | P1 |
| Supabase as database | HIGH — replaces embedded-postgres for shared data | LOW — `DATABASE_URL` env swap, one manual migration run | P1 |
| CORS + cross-origin session cookies | HIGH — auth breaks without it; invisible failure | MEDIUM — multiple moving parts, must be exact | P1 |
| `GET /health` endpoint | MEDIUM — Railway deploy validation and monitoring | LOW — 5-line route addition | P1 |
| `VITE_API_URL` wired throughout frontend | HIGH — without this, frontend calls localhost in production | LOW-MEDIUM — must audit all `fetch` call sites in `ui/src/api/` | P1 |
| Rate limiting (express-rate-limit) | MEDIUM — prevents abuse; required before external users | LOW — one middleware, 10 lines of code | P2 |
| Redis query cache layer | MEDIUM — Supabase free tier has query limits; improves list endpoint speed | MEDIUM — cache-aside middleware, key design, invalidation on writes | P2 |
| Redis BetterAuth session cache | LOW at v1.1 scale — marginal latency gain for few users | MEDIUM — BetterAuth adapter wiring | P3 |
| Preview deployment CORS (Vercel random URLs) | LOW — only needed for PR review workflow | LOW — trustedOrigins config | P3 |
| S3 file storage | HIGH for persistence — LOW for v1.1 test scope (no file uploads in smoke test) | HIGH — new storage provider integration | P3 |

**Priority key:**
- P1: Required for "deployed and testable" to be true
- P2: Should have before real users; add immediately after P1 is stable
- P3: Future milestone; do not build in v1.1

---

## Platform-Specific Behavior Notes

### Railway

- Injects `PORT` automatically; server must `listen(process.env.PORT)`. Paperclip's `config.ts` already reads `process.env.PORT`. Confirm `HOST=0.0.0.0` is set — already present in Dockerfile `ENV`.
- Dockerfile is detected automatically from repo root. Paperclip's Dockerfile is at root — no additional configuration needed.
- `DATABASE_URL` and `REDIS_URL` are set as service-level environment variables in the Railway dashboard. Use Railway's reference variable syntax (`${{Postgres.DATABASE_URL}}`) only for Railway-managed Postgres. For Supabase, set `DATABASE_URL` manually as a plain env var.
- Health check timeout: 300 seconds. If the `/health` route is absent, Railway falls back to a TCP check on the PORT — less reliable; add the HTTP health endpoint.
- Ephemeral filesystem: files written to disk (attachments, secrets key file, backup dir) are lost on redeploy. For v1.1, this is acceptable. Note it as a known limitation for file attachments.
- Private networking: Railway services in the same project communicate over private hostnames (e.g., `redis.railway.internal`). Use this for the Redis URL — Redis is unreachable from the public internet, no firewall configuration needed.

### Vercel

- Root directory must be set to `ui/` in Vercel project settings, not the monorepo root.
- Build command to set in Vercel: `pnpm --filter @paperclipai/ui build` (or configure Vercel to detect Vite automatically from `ui/`).
- Output directory: `dist` (Vite default) — Vercel detects this automatically for Vite projects.
- Environment variables are set per-environment (Production, Preview, Development) in Vercel dashboard. `VITE_API_URL` must be set in the Production environment.
- SPA routing: add `vercel.json` inside `ui/` with `rewrites: [{ "source": "/(.*)", "destination": "/index.html" }]`. Without this, React Router routes return 404 on direct URL access or page refresh.
- `VITE_` prefix required for all frontend-accessible env vars. Backend secrets must never be prefixed `VITE_` — they would be exposed in the browser bundle.

### Supabase

- Use Session Pooler (port 5432), not Transaction Pooler (port 6543), for Railway's long-lived server connection. Drizzle uses prepared statements which are incompatible with Transaction mode.
- Connection string format from Supabase dashboard (Session Pooler): `postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres`
- Supabase free tier: 500 MB database, 2 GB bandwidth, 50,000 monthly active users. Sufficient for v1.1 multi-user testing.
- Run initial migrations manually: `DATABASE_URL=[supabase-session-pooler-url] pnpm db:migrate`. Show the SQL first per project constraint.
- Do NOT enable Row Level Security (RLS) — Drizzle bypasses it and authorization is already implemented in Express service layer.
- Do NOT use Supabase Auth — BetterAuth handles authentication; Supabase is used only as a Postgres host.

---

## Sources

- [Vite on Vercel — Official Docs](https://vercel.com/docs/frameworks/frontend/vite) — SPA rewrite config, `VITE_` env var prefix requirements (HIGH confidence)
- [Railway Express Deploy Guide](https://docs.railway.com/guides/express) — PORT injection, Dockerfile detection (HIGH confidence)
- [Railway SaaS Backend Architecture](https://docs.railway.com/guides/saas-backend) — Redis + Postgres + API service pattern (HIGH confidence)
- [Railway Healthchecks](https://docs.railway.com/deployments/healthchecks) — 300s timeout, /health endpoint configuration (HIGH confidence)
- [Supabase Connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres) — Session vs Transaction pooler, port 5432 vs 6543, connection string formats (HIGH confidence)
- [Drizzle ORM with Supabase](https://orm.drizzle.team/docs/connect-supabase) — `prepare: false` requirement for Transaction mode (HIGH confidence)
- [Redis on Railway one-click deploy](https://redis.io/blog/deploy-redis-on-railway-in-one-click/) — Railway Redis service setup (MEDIUM confidence)
- [BetterAuth cross-origin invalid origin issue](https://github.com/better-auth/better-auth/issues/2203) — `trustedOrigins` config requirement for Vercel preview URLs (MEDIUM confidence)
- [CORS from Vercel to Railway](https://station.railway.com/questions/cors-issue-post-request-blocked-from-ve-6920650c) — OPTIONS preflight behavior, Railway edge proxy behavior (MEDIUM confidence)
- [Express Redis Caching 2026](https://oneuptime.com/blog/post/2026-02-02-express-redis-caching/view) — cache-aside pattern with Express middleware (MEDIUM confidence)
- [BetterAuth not sending cookie in production — Railway](https://station.railway.com/questions/better-auth-in-production-not-sending-co-fea07157) — SameSite=None, Secure=true requirement (MEDIUM confidence)

---

*Feature research for: Paperclip v1.1 Deployment & SaaS Readiness*
*Researched: 2026-04-04*
