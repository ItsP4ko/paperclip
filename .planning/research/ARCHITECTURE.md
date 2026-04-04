# Architecture Research

**Domain:** SaaS deployment — Vite SPA on Vercel + Express on Railway + Supabase PostgreSQL + Redis + in-process API Gateway
**Researched:** 2026-04-04
**Confidence:** HIGH (existing codebase fully inspected; official docs consulted for each new service)

---

## Existing Architecture (v1.0 Baseline)

Understanding the baseline is mandatory before describing what v1.1 changes.

```
[Browser]
    |
    v
[Express 5 server :3100]
    |-- /api/*           (all REST routes)
    |-- /api/auth/*      (BetterAuth handler)
    |-- /                (serves ui/dist/index.html when SERVE_UI=true)
    |-- /assets/*        (static UI files)
    |
    v
[Drizzle ORM + postgres-js]
    |
    v
[embedded-postgres :54329]  (local_trusted mode, no DATABASE_URL)
    OR
[external postgres via DATABASE_URL]  (authenticated mode)
```

Key facts from the codebase (directly read):

- `SERVE_UI=true` in the Dockerfile default — server reads `server/ui-dist/` or `../../ui/dist/` and serves `index.html` for all non-API routes. The SPA and backend are same-origin today.
- `SERVE_UI=false` makes the server API-only. This is the switch for v1.1.
- No `cors` npm package is in `server/package.json`. CORS is currently not needed (same-origin).
- BetterAuth: `deriveAuthTrustedOrigins()` in `auth/better-auth.ts` reads `allowedHostnames` from config to build `trustedOrigins`. The hook exists; it just needs to include the Vercel domain.
- DB connection: `createDb(url)` in `packages/db/src/client.ts` uses `drizzlePg(postgres(url), { schema })`. Standard `postgres-js` connection pool.
- Vite dev proxy (`/api → http://localhost:3100`) is in `vite.config.ts` under `server.proxy`. This is dev-only; the production Vite build contains no proxy.
- `PAPERCLIP_DEPLOYMENT_MODE=authenticated` activates BetterAuth. `PAPERCLIP_AUTH_PUBLIC_BASE_URL` must be set to the public backend URL.

---

## Target Architecture (v1.1)

```
┌───────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │  Vercel CDN  (ui/dist/ static assets, global edge network)     │   │
│  │  vercel.json: /* → /index.html  (SPA routing fallback)         │   │
│  │  VITE_API_BASE_URL baked in at build time                      │   │
│  └────────────────────────────┬───────────────────────────────────┘   │
└────────────────────────────────│─────────────────────────────────────┘
                                 │ HTTPS, credentials: include
                                 │ Origin: https://[app].vercel.app
                                 v
┌───────────────────────────────────────────────────────────────────────┐
│                   API + GATEWAY LAYER  (Railway Docker)                │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │  Express middleware stack (execution order matters)            │   │
│  │                                                                │   │
│  │  1. cors({ origin: allowedOrigins, credentials: true })  NEW  │   │
│  │  2. rateLimit({ store: RedisStore })                     NEW  │   │
│  │  3. express.json()                                    EXISTING│   │
│  │  4. httpLogger                                        EXISTING│   │
│  │  5. privateHostnameGuard                              EXISTING│   │
│  │  6. actorMiddleware (BetterAuth session resolution)   EXISTING│   │
│  │  7. /api/auth/* → BetterAuth handler                 EXISTING│   │
│  │  8. /api/*      → route handlers                     EXISTING│   │
│  │  SERVE_UI=false  (no static file serving in production)       │   │
│  └──────────────────────────────┬─────────────────────────────── ┘   │
└──────────────────────────────────│───────────────────────────────────┘
                      ┌────────────┴───────────────┐
                      v                            v
┌─────────────────────────┐        ┌──────────────────────────────────┐
│    CACHE LAYER           │        │          DATA LAYER               │
│                          │        │                                  │
│  Redis (Upstash or       │        │  Supabase PostgreSQL             │
│  Railway Redis add-on)   │        │  Session-mode pooler, port 5432  │
│                          │        │  DATABASE_URL=postgres://...     │
│  - Rate-limit state      │        │  Drizzle ORM (unchanged schema)  │
│  - Optional query cache  │        │  Migrations run on first boot    │
│    (cache-aside, 60s TTL)│        │                                  │
└─────────────────────────┘        └──────────────────────────────────┘
```

---

## Component Boundaries: New vs Modified vs Unchanged

| Component | Status | What Changes |
|-----------|--------|--------------|
| `ui/vercel.json` | NEW | SPA rewrite rule, build/output config for Vercel |
| `ui/src` API call base URL | MODIFIED | Add `VITE_API_BASE_URL` env constant; replace relative `/api/` paths |
| `ui/vite.config.ts` | UNCHANGED | Dev proxy stays; only build-time env var is added |
| Express CORS middleware | NEW | `cors` package added; mounts at top of `app.ts` stack |
| Express rate-limit middleware | NEW | `express-rate-limit`; Redis-backed for production |
| `server/src/app.ts` | MODIFIED | Mount CORS + rate-limit before existing middleware |
| Redis client module | NEW | `ioredis`; used by rate-limit store |
| `packages/db/src/client.ts` | MODIFIED (maybe) | Add `max: 5` to postgres-js pool; add `prepare: false` only if using transaction-mode pooler (session mode needs neither) |
| `server/src/auth/better-auth.ts` | MODIFIED | Add `SameSite=None; Secure` to cookie attributes for cross-origin |
| `PAPERCLIP_ALLOWED_HOSTNAMES` env var | MODIFIED | Must include Vercel domain (already read by `deriveAuthTrustedOrigins`) |
| `DATABASE_URL` env var | MODIFIED | Points to Supabase instead of embedded-postgres |
| `SERVE_UI` env var | MODIFIED | Set `false` in Railway (server stops serving static UI) |
| `PAPERCLIP_AUTH_PUBLIC_BASE_URL` env var | MODIFIED | Set to Railway public URL |
| Drizzle schema / migrations | UNCHANGED | Schema unchanged; migrations auto-apply against empty Supabase DB on first boot |
| embedded-postgres | UNCHANGED | Still used for local dev only |
| All route handlers | UNCHANGED | No business logic changes |
| BetterAuth plugin/adapter setup | UNCHANGED | Only cookie attributes and trusted origins change |

---

## Data Flow Changes

### Current (v1.0) — Same-Origin

```
Browser → GET / → Express → serves index.html
Browser → GET /api/issues → Express → Drizzle → embedded-postgres
Browser → POST /api/auth/sign-in → Express → BetterAuth → Drizzle

Cookies: SameSite=Lax works (same origin: localhost:3100 or server)
CORS: not needed (same origin)
```

### Target (v1.1) — Cross-Origin

```
Browser → GET https://[app].vercel.app/
        → Vercel CDN → index.html
          (VITE_API_BASE_URL = "https://[svc].railway.app" baked into JS bundle)

Browser → GET https://[svc].railway.app/api/issues
        → Railway Express:
            1. cors middleware: Origin header matches allowedOrigins? yes
            2. rateLimit: within window? yes
            3. actorMiddleware: reads session cookie from request headers
               (cookie sent because credentials: include + SameSite=None)
            4. route handler: Drizzle → Supabase PostgreSQL
               (optional: check Redis cache before DB query)
        → Response with CORS headers:
            Access-Control-Allow-Origin: https://[app].vercel.app
            Access-Control-Allow-Credentials: true

Browser → POST https://[svc].railway.app/api/auth/sign-in
        → BetterAuth sets cookie:
            Set-Cookie: better-auth.session=...; SameSite=None; Secure; HttpOnly
          (SameSite=None required for cross-site cookie sending)
```

---

## Integration Points

### 1. Vercel (Frontend CDN)

**What to create — `ui/vercel.json`:**
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

If deploying from monorepo root, also set in Vercel dashboard:
- Build Command: `pnpm --filter @paperclipai/ui build`
- Output Directory: `ui/dist`
- Install Command: `pnpm install`

Or place `vercel.json` inside `ui/` and point Vercel root to `ui/`.

**Environment variable in Vercel dashboard:**
- `VITE_API_BASE_URL` = `https://[svc].railway.app`
- This is baked into the JS bundle at build time via `import.meta.env.VITE_API_BASE_URL`
- Must be set BEFORE the Vercel build runs, or the variable is `undefined` in the bundle

**What NOT to do:** Do not add `/api/:path*` rewrites in `vercel.json` to proxy Railway. Direct cross-origin calls are simpler, avoid latency, and avoid cookie routing confusion with BetterAuth.

**Confidence:** HIGH — official Vite on Vercel docs, confirmed SPA rewrite pattern.

### 2. Railway (Backend)

**No Dockerfile changes needed.** Railway auto-detects the `Dockerfile` at the repo root. The existing multi-stage build is well-formed.

**Environment variables to set in Railway dashboard:**

| Variable | Value |
|----------|-------|
| `SERVE_UI` | `false` |
| `PAPERCLIP_DEPLOYMENT_MODE` | `authenticated` |
| `PAPERCLIP_DEPLOYMENT_EXPOSURE` | `public` |
| `PAPERCLIP_AUTH_PUBLIC_BASE_URL` | `https://[svc].railway.app` |
| `PAPERCLIP_ALLOWED_HOSTNAMES` | `[svc].railway.app,[app].vercel.app` |
| `PAPERCLIP_ALLOWED_ORIGINS` | `https://[app].vercel.app` |
| `DATABASE_URL` | Supabase session-mode pooler URL |
| `BETTER_AUTH_SECRET` | strong random secret (32+ chars) |
| `REDIS_URL` | Redis connection URL |
| `HOST` | `0.0.0.0` (already default in Dockerfile) |
| `PORT` | `3100` (already default) |

**Health check:** Railway can use `/api/health` — this route exists (`routes/health.js`).

**Persistent volumes:** Not needed. No embedded-postgres in production. Storage goes to Supabase (DB) and S3/local (assets — configure `PAPERCLIP_STORAGE_PROVIDER=s3` separately if needed).

### 3. Supabase (Global Database)

**Connection URL format (session mode, recommended):**
```
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

Session mode (port 5432) is correct for Railway's long-lived Express container. It maintains connection affinity, is compatible with prepared statements, and needs no code changes.

**Transaction mode (port 6543) is NOT recommended** for this architecture because it requires adding `prepare: false` to the postgres-js client, which changes how Drizzle constructs queries and adds risk.

**Pool size:** Add `max: 5` to the postgres-js client in `createDb()` in `packages/db/src/client.ts`. Supabase free tier allows 60 total connections; the server default pool is unlimited. Explicitly cap it:

```typescript
export function createDb(url: string) {
  const sql = postgres(url, { max: 5 });  // was: postgres(url)
  return drizzlePg(sql, { schema });
}
```

**Migrations:** `applyPendingMigrations(url)` is called on startup in `server/src/index.ts`. On first boot against an empty Supabase DB, it will run all migrations automatically. This is safe — the server already handles empty-DB bootstrap correctly (seen in `client.ts`).

**Confidence:** HIGH — official Supabase docs, Drizzle docs.

### 4. CORS Middleware (API Gateway — in-process)

The "API Gateway" for v1.1 is Express middleware in the existing server process. A separate infrastructure gateway (Kong, AWS API GW, Nginx) is not warranted at this scale and would add operational complexity.

**New npm dependencies:**
- `cors` (not currently in `server/package.json`)
- `@types/cors`
- `express-rate-limit`

**New env var:** `PAPERCLIP_ALLOWED_ORIGINS` — comma-separated list of allowed origins (e.g., `https://[app].vercel.app`).

**Placement in `app.ts`:** Before `express.json()`, before all existing middleware. The CORS preflight `OPTIONS` response must be returned before any other middleware runs.

```typescript
// server/src/app.ts — top of createApp(), before any existing app.use()
import cors from "cors";
import rateLimit from "express-rate-limit";

const allowedOrigins = (process.env.PAPERCLIP_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no Origin (e.g., mobile apps, curl, same-origin)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "x-paperclip-run-id"],
}));
```

**Confidence:** HIGH — CORS spec, official cors package docs, Railway community confirmation.

### 5. BetterAuth Cross-Origin Cookie Configuration

When Vercel frontend (e.g., `app.vercel.app`) calls Railway backend (`svc.railway.app`), they are different sites. `SameSite=Lax` (BetterAuth default for HTTPS) prevents the browser from sending session cookies on cross-site requests — every authenticated API call returns 401.

**Fix in `server/src/auth/better-auth.ts`, inside `createBetterAuthInstance()`:**

```typescript
const authConfig = {
  // ... existing fields ...
  advanced: {
    useSecureCookies: true,
    defaultCookieAttributes: {
      sameSite: "none" as const,
      secure: true,
    },
  },
};
```

`SameSite=None` requires `Secure=true`. Both Vercel and Railway serve HTTPS, so this is safe.

The existing `deriveAuthTrustedOrigins()` function already handles `PAPERCLIP_ALLOWED_HOSTNAMES` — adding the Vercel hostname there is sufficient for the `trustedOrigins` config.

**Confidence:** MEDIUM-HIGH — official BetterAuth docs, confirmed by BetterAuth GitHub issues #2203 and #7657 describing this exact cross-origin deployment scenario.

### 6. Redis Cache Layer

**Purpose in v1.1:**
1. Rate-limiter state store (prevents per-process state from being bypassed if Railway scales to multiple instances)
2. Optional: cache-aside for high-read endpoints (issue list, member list)

**Recommended provider:** Upstash Redis (available as Railway add-on, or standalone at upstash.com). Pay-per-request pricing, HTTP-compatible, works with standard `ioredis` client.

**New npm dependencies:** `ioredis`, `rate-limit-redis`

**Rate limiter with Redis backend:**
```typescript
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args),
  }),
}));
```

**Cache-aside pattern (optional for v1.1 MVP):**
```
GET /api/issues?companyId=X
  → check Redis("issues:X") → HIT: return JSON, skip DB
  → MISS: query Supabase → store Redis("issues:X", result, EX 60) → return

PATCH /api/issues/:id
  → update Supabase
  → delete Redis("issues:[companyId]")  (invalidate)
```

Only apply caching to the highest-volume read endpoints. Start with the rate-limit backend as the only Redis use case; add query caching only if Supabase latency becomes observable.

**Confidence:** HIGH — official Redis docs, ioredis docs, rate-limit-redis package.

---

## Architectural Patterns

### Pattern 1: SERVE_UI Toggle — Zero Code Change Deployment Split

**What:** The server already reads `SERVE_UI` env var. Setting `SERVE_UI=false` in Railway makes the server API-only without any code changes. The Vercel deployment serves the SPA.
**When to use:** Any deployment where UI and backend are on separate hosts.
**Trade-off:** No code change needed. Only env var. Risk: forgetting to set it means Railway wastes resources serving static files no browser will request.

### Pattern 2: Vite Build-Time URL Injection

**What:** `VITE_API_BASE_URL` is injected at Vite build time (not runtime). The built JS bundle contains the hardcoded Railway URL via `import.meta.env.VITE_API_BASE_URL`.
**When to use:** Static SPAs on CDNs (no server-side rendering, no runtime env access).
**Trade-off:** Rebuilding required to change the API URL. Acceptable for v1.1. The UI codebase must not use relative paths like `/api/...` — these will resolve to the Vercel domain and return 404. Replace all relative API paths with the env-based base URL.
**Implementation approach:** Create a single `src/lib/api-base.ts` constant (`export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ""`) and import it in all fetch calls. Avoids scattered `import.meta.env` references.

### Pattern 3: In-Process Gateway — Express Middleware as API Protection

**What:** CORS + rate-limiting as Express middleware in the existing server, rather than a separate API Gateway infrastructure service.
**When to use:** Single-service Railway deployments at v1.1 scale (under 1k users).
**Trade-off:** Simpler ops (one deployed service), but gateway logic is co-located with app code. If Railway eventually runs multiple instances, Redis-backed rate-limit store is required for correctness. Extract to Nginx/standalone gateway only if multi-service becomes necessary.

### Pattern 4: Session-Mode Supabase Pooler

**What:** Use Supabase session-mode pooler (port 5432) for the Railway Express server connection.
**When to use:** Long-lived server processes (non-serverless, persistent Docker container).
**Trade-off:** Session mode holds connections longer than transaction mode, which uses slightly more database resources. In exchange, it is compatible with Drizzle's prepared statement optimizations and requires no changes to the existing `createDb()` function beyond a pool size cap.

---

## Anti-Patterns

### Anti-Pattern 1: Vercel Proxy Rewrites for API Calls

**What people do:** Add `vercel.json` rewrites like `{ "source": "/api/:path*", "destination": "https://svc.railway.app/api/:path*" }` to proxy API calls through Vercel.
**Why it's wrong:** Adds 50-150ms round-trip latency (Vercel edge → Railway). Breaks BetterAuth cookie semantics — the `Set-Cookie` domain is Railway, but the browser sees the request coming from Vercel's IP, causing cookie rejection. CORS credentials do not flow correctly through a rewrite proxy.
**Do this instead:** The UI calls Railway directly with `credentials: "include"`. Vercel `vercel.json` only needs the SPA fallback rewrite (`/(.*) → /index.html`).

### Anti-Pattern 2: Transaction-Mode Supabase Pooler Without `prepare: false`

**What people do:** Copy the Supabase connection URL with port 6543 (transaction mode) without disabling prepared statements.
**Why it's wrong:** Prepared statements are connection-scoped. Transaction mode does not guarantee connection affinity, so a prepared statement created on connection A is unknown on connection B. Results in silent failures and "prepared statement does not exist" errors at runtime.
**Do this instead:** Use session-mode pooler (port 5432). If transaction mode is needed later (e.g., serverless), add `prepare: false` to the postgres-js client constructor.

### Anti-Pattern 3: Wildcard CORS Origin in Production

**What people do:** Set `origin: "*"` in Express CORS middleware for simplicity.
**Why it's wrong:** `Access-Control-Allow-Credentials: true` is incompatible with `Access-Control-Allow-Origin: *`. The browser rejects the response. BetterAuth session cookies will never be sent. Every API call returns 401.
**Do this instead:** Enumerate exact allowed origins in `PAPERCLIP_ALLOWED_ORIGINS`. Validate per-request in the CORS origin callback.

### Anti-Pattern 4: SameSite=Lax Cookies Across Different Domains

**What people do:** Leave BetterAuth cookie defaults (SameSite=Lax) unchanged after moving to cross-origin deployment.
**Why it's wrong:** `SameSite=Lax` blocks cookies on cross-site requests. The browser will never send the session cookie when the Vercel frontend calls the Railway backend. Every authenticated request returns 401 even after successful login.
**Do this instead:** Set `SameSite=None; Secure` in BetterAuth's `advanced.defaultCookieAttributes`. Both Vercel and Railway are HTTPS, so `Secure` is always met.

### Anti-Pattern 5: Embedded-Postgres in Production Railway Container

**What people do:** Deploy Railway without setting `DATABASE_URL`, letting the server fall back to embedded-postgres inside the container.
**Why it's wrong:** Railway containers are ephemeral — any restart or redeploy destroys all embedded-postgres data. The database volume cannot be shared across container restarts.
**Do this instead:** Always set `DATABASE_URL` to Supabase in Railway environment variables. Embedded-postgres is local development only.

---

## Build Order for v1.1

Dependencies determine sequencing. Later steps depend on URLs produced by earlier steps.

```
Step 1: Supabase setup
  - Create Supabase project
  - Copy session-mode pooler URL (postgres://... port 5432)
  - Record DATABASE_URL for use in Step 2
  (Migrations will auto-run on first Railway boot — no manual SQL needed for empty DB)

Step 2: Redis provisioning
  - Create Upstash Redis instance (or use Railway Redis add-on)
  - Copy REDIS_URL

Step 3: Code changes (parallel)
  a. Add cors + express-rate-limit to server/package.json
  b. Mount CORS + rate-limit middleware at top of app.ts
  c. Modify BetterAuth cookie attributes (SameSite=None; Secure)
  d. Add pool size cap to createDb() in packages/db/src/client.ts
  e. Add VITE_API_BASE_URL usage in UI (API base constant + replace relative paths)
  f. Create ui/vercel.json (SPA rewrite)

Step 4: Railway deploy
  - Set all env vars (DATABASE_URL, REDIS_URL, BETTER_AUTH_SECRET,
    PAPERCLIP_AUTH_PUBLIC_BASE_URL, PAPERCLIP_DEPLOYMENT_MODE=authenticated,
    SERVE_UI=false, HOST=0.0.0.0)
  - Deploy; note the assigned Railway URL (e.g., paperclip-production.railway.app)
  - Verify /api/health returns 200

Step 5: Vercel deploy
  - Set VITE_API_BASE_URL = Railway URL in Vercel dashboard
  - Connect repo, set build/output dirs
  - Deploy; note assigned Vercel URL (e.g., paperclip.vercel.app)

Step 6: Cross-domain wiring
  - Add Vercel domain to Railway env:
    PAPERCLIP_ALLOWED_HOSTNAMES=[railway-host],[vercel-host]
    PAPERCLIP_ALLOWED_ORIGINS=https://[vercel-host]
  - Railway redeploys automatically on env var change

Step 7: End-to-end validation
  - Open Vercel URL in browser
  - Sign up, log in (verify SameSite=None cookie is set)
  - Create a company, invite a second user (verify CORS + credentials flow)
  - Assign tasks, verify real-time updates (WebSocket from Vercel → Railway)
```

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-100 users | Current plan is sufficient. Single Railway instance. Supabase free tier (60 connections). In-memory rate limiter acceptable initially. |
| 100-1k users | Redis-backed rate limiter (required if Railway scales to >1 instance). Monitor Supabase connection count (`pg_stat_activity`). Consider `max: 3` in postgres-js if connections spike. |
| 1k+ users | Supabase Pro (dedicated pooler, higher connection limits). Railway autoscaling with Redis rate-limit state. Add Redis query caching for `/api/issues` and `/api/companies/:id/members`. Consider Nginx layer for SSL termination + static assets. |

**First bottleneck:** Supabase connection limit (60 on free tier). The postgres-js pool in `createDb()` uses defaults — cap it at `max: 5` immediately.

**Second bottleneck:** BetterAuth resolves the session on every authenticated request via a DB query (`auth_sessions` table lookup). Fix: Redis session cache with 30-60s TTL. BetterAuth supports a `secondaryStorage` adapter for this.

---

## Integration Points Summary

| Service | Integration Pattern | Files Changed | Key Env Var |
|---------|---------------------|---------------|-------------|
| Vercel CDN | Static SPA host, `vercel.json` SPA rewrite | NEW: `ui/vercel.json` | `VITE_API_BASE_URL` |
| Railway | Existing Dockerfile, env vars only for mode change | No code change in infra | `SERVE_UI=false`, `PAPERCLIP_AUTH_PUBLIC_BASE_URL` |
| Supabase | Postgres via `DATABASE_URL`; session-mode pooler | MODIFIED: `packages/db/src/client.ts` (pool cap) | `DATABASE_URL` |
| CORS middleware | New Express middleware, top of stack | MODIFIED: `server/src/app.ts`; new deps | `PAPERCLIP_ALLOWED_ORIGINS` |
| Rate limiter | New Express middleware, Redis-backed | MODIFIED: `server/src/app.ts`; new deps | `REDIS_URL` |
| Redis | Rate-limit state store; optional query cache | NEW: Redis client module | `REDIS_URL` |
| BetterAuth cookies | SameSite=None for cross-origin | MODIFIED: `server/src/auth/better-auth.ts` | `PAPERCLIP_ALLOWED_HOSTNAMES` |
| UI API base URL | Vite build-time env injection | MODIFIED: `ui/src/` (API call sites) | `VITE_API_BASE_URL` |

---

## Sources

- [Railway Dockerfiles Documentation](https://docs.railway.com/builds/dockerfiles) — Dockerfile detection, build-time ARG, env vars (HIGH confidence, official)
- [Vite on Vercel — SPA configuration](https://vercel.com/docs/frameworks/frontend/vite) — SPA rewrite, `VITE_` env var prefix, build settings (HIGH confidence, official)
- [Vercel Project Configuration](https://vercel.com/docs/projects/project-configuration) — `rewrites`, `buildCommand`, `outputDirectory` (HIGH confidence, official)
- [Supabase — Connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres) — Session vs transaction pooler, port 5432 vs 6543 (HIGH confidence, official)
- [Drizzle ORM — Supabase](https://orm.drizzle.team/docs/connect-supabase) — `prepare: false` for transaction pool mode (HIGH confidence, official)
- [BetterAuth — Options Reference](https://better-auth.com/docs/reference/options) — `trustedOrigins`, `defaultCookieAttributes` (HIGH confidence, official)
- [BetterAuth issue #2203](https://github.com/better-auth/better-auth/issues/2203) — Invalid Origin with Vercel preview deployments (MEDIUM confidence, community + team)
- [BetterAuth issue #7657](https://github.com/better-auth/better-auth/issues/7657) — Cross-origin auth broken with 1.4.x (MEDIUM confidence, community)
- [Railway Help Station — CORS Vercel→Railway](https://station.railway.com/questions/cors-issue-post-request-blocked-from-ve-6920650c) — CORS config confirmed by Railway employees (MEDIUM confidence)
- [express-rate-limit GitHub](https://github.com/express-rate-limit/express-rate-limit) — Rate-limiting middleware (HIGH confidence, official)
- [Redis Cache-Aside Pattern](https://redis.io/tutorials/howtos/solutions/microservices/caching/) — Cache-aside implementation (HIGH confidence, official Redis docs)
- Existing codebase: `server/src/app.ts`, `server/src/auth/better-auth.ts`, `server/src/config.ts`, `packages/db/src/client.ts`, `ui/vite.config.ts`, `Dockerfile` (HIGH confidence, direct read)

---

*Architecture research for: Paperclip v1.1 deployment (Railway + Vercel + Supabase + Redis)*
*Researched: 2026-04-04*
