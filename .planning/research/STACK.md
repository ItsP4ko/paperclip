# Stack Research: v1.1 Deployment & SaaS Readiness

**Project:** Paperclip — v1.1 Deployment & SaaS Readiness
**Researched:** 2026-04-04
**Scope:** New additions ONLY — what to add for Railway, Supabase, API Gateway, Redis
**Confidence:** HIGH (verified against official docs and current npm registry)

---

## Orientation: This Is an Additive Milestone

The existing stack (React 19, Vite, Tailwind v4, shadcn/ui, Express 5, Drizzle ORM, BetterAuth,
postgres.js) is already proven and is NOT being changed. This file documents only what gets ADDED
for v1.1 deployment infrastructure.

**Critical finding:** The `@paperclipai/db` package already supports external Postgres via
`DATABASE_URL` env var (see `packages/db/src/runtime-config.ts:221`). No DB-layer changes needed to
connect to Supabase — just set the env var.

---

## Recommended Stack Additions

### Deployment Targets

| Platform | Purpose | Why |
|----------|---------|-----|
| Railway | Backend container host | Native Dockerfile support, zero-config detection, service-to-service variable references, Railway Redis addon available in same project |
| Vercel | Frontend CDN | Zero-config Vite/React SPA deployment, global CDN, `VITE_` env var injection at build time |

**Railway vs alternatives:** Render requires manual Dockerfile config. Fly.io adds operational
complexity. Railway's `${{ServiceName.VAR}}` reference syntax means the frontend on Vercel can
reference the backend URL automatically if both are Railway services. But since frontend goes to
Vercel, the backend `RAILWAY_PUBLIC_DOMAIN` gets set as `VITE_API_URL` in Vercel dashboard manually
once — acceptable tradeoff.

**Confidence: HIGH** — Railway Dockerfile detection is documented at docs.railway.com/builds/dockerfiles.
Vercel Vite support is documented at vercel.com/docs/frameworks/frontend/vite.

---

### Database: Supabase as Global Postgres

| Connection Type | Port | When to Use |
|----------------|------|------------|
| Direct Connection | 5432 | Preferred for Railway (persistent server, long-lived connection) |
| Pooler — Session Mode | 5432 | Fallback if Railway VM doesn't support IPv6 |
| Pooler — Transaction Mode | 6543 | Do NOT use — incompatible with Drizzle's prepared statements |

**Configuration required:** The existing `createDb()` in `packages/db/src/client.ts` uses
`postgres(url)` which defaults prepared statements to ON. This is correct for direct connection and
session-mode pooler. Do NOT use transaction-mode pooler URL (port 6543) without also adding
`prepare: false` to the postgres client.

**Recommendation:** Use the Supabase **direct connection** string (port 5432, IPv6). If Railway's
network does not support IPv6 outbound (verify at deploy time), switch to the **pooler session mode**
string (also port 5432, IPv4-compatible). No code change required between these two — only the
connection string changes.

**No new packages needed.** `postgres` and `drizzle-orm/postgres-js` are already installed.

**Confidence: HIGH** — Supabase connection type guidance from supabase.com/docs/guides/database/connecting-to-postgres.
Drizzle+Supabase integration verified at orm.drizzle.team/docs/connect-supabase.

---

### Redis Cache Layer

**Choice: Railway Redis addon (native TCP) over Upstash**

Rationale: Backend runs as a persistent Express server on Railway — TCP connections are maintained,
no serverless cold start issues. Upstash charges per-command (HTTP REST overhead + per-request cost)
and is designed for serverless/edge. Railway Redis runs in the same private network as the backend
container, giving sub-millisecond latency without egress costs.

**Client library: `redis` (node-redis) v5**

| Library | Version | Why |
|---------|---------|-----|
| `redis` | 5.11.0 | Official Redis client, full TypeScript support built-in, promise-based API, actively maintained by Redis Inc |

Do NOT use `ioredis` for new code. It is in maintenance mode. The `redis` (node-redis) package is
the official recommendation for new Node.js projects as of 2025–2026.

```bash
# In server/
npm install redis
```

**Usage pattern (Express middleware):**

```typescript
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

// Cache-aside pattern for expensive DB reads
async function getCached<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as T;
  const fresh = await fetcher();
  await redis.set(key, JSON.stringify(fresh), { EX: ttl });
  return fresh;
}
```

**Important:** Always handle Redis errors gracefully. If Redis is down, fall through to the DB.
The cache is an optimization, not a requirement for correctness.

**Confidence: HIGH** — node-redis v5 is the official client, documented at redis.io/docs/latest/develop/clients/nodejs/.
Railway Redis addon availability confirmed at railway.com.

---

### API Gateway: Express Middleware Stack (Not a Separate Gateway Process)

**Choice: Inline Express middleware — NOT a standalone API gateway service**

Rationale: Adding Kong, Nginx, or a dedicated gateway service adds operational complexity (another
process to deploy and monitor) for a single-service backend with one client. The full protection
set can be achieved with ~30 lines of Express middleware added to the existing server entrypoint.

**Packages to add:**

| Package | Version | Purpose | Why |
|---------|---------|---------|-----|
| `helmet` | 8.1.0 | HTTP security headers (HSTS, CSP, X-Frame-Options, X-Content-Type) | Industry standard, ~1.8M weekly downloads, zero config |
| `express-rate-limit` | 7.x | Per-IP rate limiting with Redis store support | Prevents abuse, pairs with `rate-limit-redis` store |
| `rate-limit-redis` | latest | Redis store for `express-rate-limit` | Makes rate limits persistent across restarts |

```bash
# In server/
npm install helmet express-rate-limit rate-limit-redis
```

**CORS is already handled** by BetterAuth's built-in CORS configuration. Do not add a separate
`cors` package — it will conflict with BetterAuth's cookie/session headers.

**Middleware order** (add to Express entrypoint, before routes):

```typescript
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

// 1. Security headers first
app.use(helmet());

// 2. Rate limit after security headers
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,                  // per IP
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redis.sendCommand(args),
  }),
});
app.use(limiter);

// 3. Existing routes after
```

**JWT validation is already handled** by BetterAuth session middleware. Do not add a separate JWT
validation layer — it duplicates auth and can break the existing session model.

**Confidence: HIGH** — helmet v8.1.0 and express-rate-limit v7.x verified from npm registry searches.
rate-limit-redis is the standard store documented in express-rate-limit docs.

---

### Frontend Deployment: Vercel + vercel.json

**No new npm packages.** Vercel deployment is config-file driven.

**Required files:**

`ui/vercel.json` — SPA routing fix (without this, direct URL loads return 404):
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

**Environment variable naming** — Vite requires `VITE_` prefix for any variable exposed to the
browser bundle:
```
VITE_API_URL=https://your-railway-backend.railway.app
```

Set this in the Vercel dashboard under Settings > Environment Variables. Do not put secrets in
`VITE_` variables — they are compiled into the public JS bundle.

**Confidence: HIGH** — Vercel Vite SPA configuration documented at vercel.com/docs/frameworks/frontend/vite.

---

### Railway Dockerfile Notes

The existing `Dockerfile` already works. Two Railway-specific considerations:

1. **PORT**: Railway injects `PORT` at runtime. The existing `Dockerfile` sets `PORT=3100` as a
   default ENV. Railway will override this with its own value. The Express server must read
   `process.env.PORT` — verify the server entrypoint does this (or add fallback: `|| 3100`).

2. **Health check endpoint**: Add `GET /health` returning `200 { ok: true }` to the Express app.
   Railway uses this to verify the container is ready before routing traffic.

**No Dockerfile changes needed** beyond ensuring PORT is read from env. Railway auto-detects the
existing Dockerfile at the repo root.

**Confidence: HIGH** — Railway Dockerfile requirements from docs.railway.com/builds/dockerfiles.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `ioredis` | Maintenance mode; official Redis Node.js client is now `redis` (node-redis v5) | `redis` v5.11.0 |
| Upstash Redis | HTTP-based, per-request pricing — designed for serverless, not persistent servers | Railway Redis addon (TCP, fixed pricing, same private network) |
| Kong / Nginx / Envoy as gateway | Adds a second deployable service; full protection achievable with Express middleware | `helmet` + `express-rate-limit` |
| Transaction-mode Supabase pooler | Incompatible with Drizzle prepared statements; adds hidden bugs | Direct connection or session-mode pooler URL |
| `cors` npm package | BetterAuth already configures CORS; adding this causes conflict | BetterAuth built-in CORS |
| Prisma | Already using Drizzle ORM; no reason to migrate | Stay on Drizzle 0.38.x |
| Separate JWT validation middleware | BetterAuth already validates sessions; duplication creates auth surface conflicts | BetterAuth existing session middleware |

---

## Version Compatibility

| Package | Version | Compatible With |
|---------|---------|----------------|
| `redis` (node-redis) | 5.11.0 | Node.js 18+, TypeScript 5.x — compatible with Express 5 |
| `helmet` | 8.1.0 | Express 4.x and 5.x |
| `express-rate-limit` | 7.x | Express 4.x and 5.x |
| `rate-limit-redis` | latest | Requires `redis` v4+ or `ioredis` |
| Supabase Postgres | — | `postgres` (postgres.js) 3.4.x already installed — direct compatible |

---

## Environment Variables Added (v1.1)

| Variable | Where Set | Consumer |
|----------|-----------|----------|
| `DATABASE_URL` | Railway service env | Backend (`packages/db/src/runtime-config.ts:221`) |
| `REDIS_URL` | Railway service env | Backend (new Redis client) |
| `VITE_API_URL` | Vercel dashboard | Frontend (`import.meta.env.VITE_API_URL`) |
| `BETTER_AUTH_SECRET` | Railway service env | BetterAuth (already needed, ensure it's set) |
| `BETTER_AUTH_URL` | Railway service env | BetterAuth base URL for callbacks |

---

## Installation Summary

```bash
# In server/ — add these packages
pnpm --filter @paperclipai/server add redis helmet express-rate-limit rate-limit-redis

# Frontend — no new packages
# Vercel — add ui/vercel.json (config file only)
# Railway — no changes to Dockerfile required
```

---

## Sources

- [Railway Dockerfile docs](https://docs.railway.com/builds/dockerfiles) — Dockerfile detection, build caching, ARG behavior
- [Railway Variables docs](https://docs.railway.com/variables) — PORT injection, service-to-service references
- [Railway Express guide](https://docs.railway.com/guides/express) — DATABASE_URL pattern, health checks
- [Supabase: Connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres) — Direct vs pooler, port differences, IPv4/IPv6 — HIGH confidence
- [Drizzle ORM + Supabase](https://orm.drizzle.team/docs/connect-supabase) — `prepare: false` requirement for transaction mode — HIGH confidence
- [node-redis official docs](https://redis.io/docs/latest/develop/clients/nodejs/) — v5 API, createClient, connect() — HIGH confidence
- [Vercel Vite framework docs](https://vercel.com/docs/frameworks/frontend/vite) — VITE_ prefix, SPA rewrites — HIGH confidence
- [helmet npm](https://www.npmjs.com/package/helmet) — v8.1.0 latest — HIGH confidence
- [express-rate-limit npm](https://www.npmjs.com/package/express-rate-limit) — v7.x latest — HIGH confidence
- [Upstash vs Railway Redis comparison](https://www.buildmvpfast.com/compare/upstash-vs-redis-cloud) — serverless vs persistent tradeoffs — MEDIUM confidence (third-party)

---
*Stack research for: v1.1 Deployment & SaaS Readiness (Railway + Supabase + Redis + API Gateway)*
*Researched: 2026-04-04*
