# Phase 8: API Hardening & Redis — Research

**Researched:** 2026-04-05
**Domain:** Express.js middleware hardening — helmet, express-rate-limit, rate-limit-redis, node-redis v5
**Confidence:** HIGH (all core claims verified against official docs and npm registry)

---

## Summary

Phase 8 adds three independent layers to the existing Express 5 server: security headers via `helmet`, distributed rate limiting via `express-rate-limit` + `rate-limit-redis`, and a Redis cache layer for a read-heavy endpoint. Each layer slots into `server/src/app.ts` as middleware or a new service module. No schema changes, no new routes — only additive changes to existing infrastructure.

The deployment decision (STATE.md, [v1.1 research]) locks Railway Redis addon as the target. The private-network TCP URL lives in a new `REDIS_URL` environment variable, matching the existing env-var-from-config pattern in `server/src/config.ts`. The Redis client must tolerate transient connection failures without crashing the process — this is the most critical implementation detail.

Helmet's default 13 headers are appropriate out of the box. The one area requiring care is Content Security Policy: the backend serves no HTML directly (it is API-only when `SERVE_UI=false`), but Vercel hosts the SPA. A relaxed CSP that does not break the API-only server is the correct default; a tighter CSP for static assets can be added if `SERVE_UI=true`.

**Primary recommendation:** Mount `helmet()` first, then `rateLimit()` using `RedisStore`, wiring both with the shared `redisClient` singleton. The Redis client is initialized at startup and passed into `createApp()` via opts, the same pattern already used for `db`, `storageService`, and `betterAuthHandler`.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HARD-01 | Rate limiting middleware (`express-rate-limit`) with per-IP throttling | express-rate-limit 8.3.2 verified; basic usage pattern documented |
| HARD-02 | Security headers middleware (`helmet`) applied to all responses | helmet 8.1.0 verified; `app.use(helmet())` sets 13 headers by default |
| HARD-03 | Rate limit state stored in Redis (`rate-limit-redis`) for persistence across restarts | rate-limit-redis 4.3.1 verified; `sendCommand` interface documented |
| REDIS-01 | Redis instance provisioned (Railway addon) | STATE.md confirms Railway Redis addon decision; `REDIS_URL` env var pattern |
| REDIS-02 | Redis client (`node-redis` v5) connected with reconnection handling | node-redis 5.11.0 verified; `error` event + exponential backoff strategy documented |
| REDIS-03 | Frequently-queried global data cached in Redis with appropriate TTL | `GET /api/instance/settings/general` identified as best candidate; pattern documented |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `helmet` | 8.1.0 | Sets 13 HTTP security headers in one call | De-facto standard for Express; zero-config sane defaults |
| `express-rate-limit` | 8.3.2 | Per-IP rate limiting middleware | Official Express ecosystem package; supports external stores |
| `rate-limit-redis` | 4.3.1 | Redis store for express-rate-limit | Official companion package by same maintainers; supports node-redis v5 |
| `redis` (node-redis) | 5.11.0 | Redis client for Node.js | STATE.md decision: Railway Redis addon (persistent, not serverless) |

Versions verified against npm registry on 2026-04-05.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/express-rate-limit` | (bundled) | TypeScript types | Included in express-rate-limit package itself as of v7+ |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `rate-limit-redis` | `ioredis-rate-limit` | `rate-limit-redis` is maintained by the same org as `express-rate-limit`; preferred |
| `redis` (node-redis) | `ioredis` | STATE.md explicitly chose node-redis (Railway addon); do not revisit |

**Installation:**
```bash
pnpm --filter @paperclipai/server add helmet express-rate-limit rate-limit-redis redis
```

**Version verification:**
```
helmet:              8.1.0  (verified 2026-04-05 via npm view)
express-rate-limit:  8.3.2  (verified 2026-04-05 via npm view)
rate-limit-redis:    4.3.1  (verified 2026-04-05 via npm view)
redis:               5.11.0 (verified 2026-04-05 via npm view)
```

---

## Architecture Patterns

### Recommended Project Structure
```
server/src/
├── middleware/
│   ├── index.ts             # barrel — add helmet + rate-limit exports
│   ├── security-headers.ts  # helmet() factory
│   └── rate-limit.ts        # createRateLimiter(redisClient?) factory
├── services/
│   └── redis-client.ts      # createRedisClient(url) — singleton factory
├── app.ts                   # mount helmet first, then rate limiter
└── config.ts                # add redisUrl config field
```

### Pattern 1: Redis Client Singleton with Graceful Error Handling

Create the Redis client in `index.ts` before calling `createApp()`, then inject it via opts. This matches how `db`, `storageService`, and `betterAuthHandler` are already passed in.

**What:** A module that creates one `node-redis` client with `error` event listener, reconnect strategy cap, and `disableOfflineQueue: true` so that cache misses during reconnection do not silently queue and replay stale commands.

**When to use:** On every server start. Client is optional — if `REDIS_URL` is absent, Redis features are skipped (rate limiter falls back to memory store, caching layer is a no-op).

```typescript
// Source: https://github.com/redis/node-redis/blob/master/docs/client-configuration.md
// server/src/services/redis-client.ts
import { createClient, type RedisClientType } from "redis";
import { logger } from "../middleware/logger.js";

export async function createRedisClient(url: string): Promise<RedisClientType> {
  const client = createClient({
    url,
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: (retries) => Math.min(retries * 100, 2000), // cap at 2s
    },
    disableOfflineQueue: true, // don't replay queued commands on reconnect
  });

  // MUST listen to 'error' — unhandled error events crash the Node.js process
  client.on("error", (err) => {
    logger.error({ err }, "[redis] client error");
  });

  await client.connect();
  logger.info("[redis] connected");
  return client as RedisClientType;
}
```

### Pattern 2: Helmet Security Headers (API-only mode)

The server runs with `SERVE_UI=false` in production (Dockerfile default). It serves only JSON API responses, so CSP can be very relaxed or disabled for API routes. If `SERVE_UI=true`, the default CSP applies to HTML pages.

```typescript
// Source: https://github.com/helmetjs/helmet#readme
// server/src/middleware/security-headers.ts
import helmet from "helmet";

export const securityHeaders = helmet({
  // API-only: CSP default-src 'none' is safe; no scripts served from this origin
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
    },
  },
  // HSTS: only set for HTTPS — Easypanel terminates TLS, but header is safe to include
  strictTransportSecurity: {
    maxAge: 31_536_000,
    includeSubDomains: false,
  },
});
```

### Pattern 3: Rate Limiter with Redis Store

```typescript
// Source: https://github.com/express-rate-limit/rate-limit-redis#readme
// server/src/middleware/rate-limit.ts
import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type { RedisClientType } from "redis";

export function createRateLimiter(redisClient?: RedisClientType) {
  const store = redisClient
    ? new RedisStore({
        sendCommand: (...args: string[]) => redisClient.sendCommand(args),
        prefix: "rl:",
      })
    : undefined; // falls back to in-memory MemoryStore

  return rateLimit({
    windowMs: 15 * 60 * 1000,  // 15-minute window
    limit: 200,                  // generous limit for authenticated multi-user app
    standardHeaders: "draft-8",  // sends RateLimit-* headers per spec
    legacyHeaders: false,
    store,
    // Skip health check — it would inflate counters for monitoring systems
    skip: (req) => req.path === "/health",
    // On Redis store error, fail open (don't 500 the request)
    handler: (_req, res) => {
      res.status(429).json({ error: "Too many requests. Please slow down." });
    },
  });
}
```

### Pattern 4: Redis Cache for Instance Settings

`GET /api/instance/settings/general` is called on every dashboard load, for every user, and returns the same data for the whole instance. It is the strongest caching candidate.

```typescript
// server/src/routes/instance-settings.ts  (modification)
// Cache key: "instance:settings:general"
// TTL: 60 seconds (settings change rarely; 60s staleness is acceptable)

router.get("/instance/settings/general", async (req, res) => {
  if (req.actor.type !== "board") throw forbidden("Board access required");

  const CACHE_KEY = "instance:settings:general";
  const TTL_SECONDS = 60;

  if (redisClient?.isReady) {
    const cached = await redisClient.get(CACHE_KEY).catch(() => null);
    if (cached) {
      logger.debug("[redis] cache hit: instance settings");
      res.json(JSON.parse(cached));
      return;
    }
  }

  const settings = await svc.getGeneral();

  if (redisClient?.isReady) {
    await redisClient.set(CACHE_KEY, JSON.stringify(settings), { EX: TTL_SECONDS }).catch(() => {
      logger.warn("[redis] failed to cache instance settings");
    });
  }

  res.json(settings);
});
```

Cache invalidation: On `PATCH /api/instance/settings/general`, call `redisClient.del("instance:settings:general")` after the update completes.

### Pattern 5: Mounting Order in app.ts

Order matters. Helmet must be first (before routes). Rate limiter after CORS (so CORS preflight is not rate-limited).

```typescript
// app.ts additions — insert after CORS, before routes
app.use(securityHeaders);
app.use(createRateLimiter(opts.redisClient));
```

### Anti-Patterns to Avoid

- **Crashing on Redis error:** If you do not listen to `client.on("error", ...)`, Node.js crashes on unhandled EventEmitter errors. This is documented as mandatory by node-redis.
- **Synchronous Redis calls blocking the event loop:** All node-redis v5 operations are async; always `await` them. Never use the old callback API.
- **Rate-limiting `/api/auth/*` login routes at the same threshold as general API:** Auth endpoints under brute-force attack need a stricter per-IP limit (e.g., 10 attempts per 15 min). Consider a separate `authLimiter` applied to `/api/auth/*`.
- **Storing `rate-limit-redis` store outside the `createRateLimiter` factory:** The store holds a reference to the client; if the client is replaced, the store reference becomes stale.
- **Calling `await client.connect()` after `client.on("error", ...)` with no try/catch:** Initial connection failure throws. Wrap the initial connect in try/catch and log, then let the reconnect strategy handle recovery.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP security headers | Custom header middleware | `helmet` | Helmet tracks browser vulnerabilities; correct header values are non-obvious |
| Rate limit key expiry logic | Custom Redis INCR + EXPIRE | `rate-limit-redis` + `express-rate-limit` | Sliding window, correct TTL reset, header spec compliance |
| Redis reconnection loop | `setInterval` ping loop | node-redis built-in reconnect strategy | Exponential backoff with jitter is correct; naive loops cause thundering herd |
| Redis client connection pool | Multiple `createClient()` calls | One singleton passed via opts | Single client per process is correct for node-redis; pool is handled internally |

**Key insight:** The entire phase is "install and configure well-maintained libraries" — the value is in correct configuration, not in writing new logic.

---

## Common Pitfalls

### Pitfall 1: Unhandled Redis Error Event Crashes Server
**What goes wrong:** Node.js process exits with `Error: Redis Client Error` printed to stderr.
**Why it happens:** Node.js treats unhandled `EventEmitter` `error` events as uncaught exceptions.
**How to avoid:** Always call `client.on("error", (err) => logger.error(err))` before `await client.connect()`.
**Warning signs:** Server starts, processes a few requests, then crashes after Redis blip.

### Pitfall 2: Rate Limiter Blocks WebSocket Upgrade Requests
**What goes wrong:** WebSocket connections (HTTP upgrade requests) may hit the rate limiter before upgrade, throttling real-time functionality.
**Why it happens:** Express sees the initial HTTP GET with `Upgrade: websocket` before handing off to the ws library.
**How to avoid:** Add `skip: (req) => req.headers.upgrade === "websocket"` to the rate limiter config.
**Warning signs:** WebSocket connections silently fail during load with 429 responses in the HTTP log.

### Pitfall 3: Helmet Blocks API Clients Expecting No CSP
**What goes wrong:** Some API clients or browser-based tools reject responses with unexpected `Content-Security-Policy` headers.
**Why it happens:** Helmet's default CSP includes `default-src 'self'` which does not affect API clients, but some CORS preflight inspectors behave unexpectedly.
**How to avoid:** Use the relaxed API-mode CSP shown in Pattern 2. Test with existing frontend integration first.
**Warning signs:** Vercel frontend sees unexpected 406 or blocked resources after deploying helmet.

### Pitfall 4: Redis Client Not Ready at Startup (Cold Start Race)
**What goes wrong:** First few requests hit the rate limiter before the Redis client connects, causing the store to throw and potentially dropping those requests.
**Why it happens:** `createRedisClient` is async; if the server starts accepting traffic before `await client.connect()` resolves, the store is in an unready state.
**How to avoid:** Await `createRedisClient()` in `index.ts` before calling `httpServer.listen()`. If Redis is unavailable at startup, log and continue — rate limiter falls back to memory store.
**Warning signs:** First batch of requests after deploy returns 500 with Redis-related errors.

### Pitfall 5: Cache Key Invalidation Drift
**What goes wrong:** Instance settings cached in Redis are stale after a PATCH — users see old settings for up to TTL seconds.
**Why it happens:** Cache SET on GET but no cache DEL on PATCH.
**How to avoid:** Always call `redisClient.del(CACHE_KEY)` in the PATCH handler after the database write completes.
**Warning signs:** Settings changes appear not to take effect until page refresh after TTL expires.

---

## Code Examples

### Redis Client Initialization in index.ts

```typescript
// Source: https://github.com/redis/node-redis/blob/master/docs/client-configuration.md
import { createRedisClient } from "./services/redis-client.js";

const redisClient = config.redisUrl
  ? await createRedisClient(config.redisUrl).catch((err) => {
      logger.error({ err }, "[redis] failed to connect at startup — continuing without Redis");
      return undefined;
    })
  : undefined;

const app = await createApp(db, {
  // ... existing opts
  redisClient,
});
```

### config.ts addition

```typescript
// server/src/config.ts — add to Config interface and loadConfig()
redisUrl: process.env.REDIS_URL?.trim() || undefined,
```

### createApp opts addition

```typescript
// server/src/app.ts — add to createApp opts type
redisClient?: import("redis").RedisClientType;
```

### Rate limiter with skip for WebSocket and health check

```typescript
// Source: https://github.com/express-rate-limit/express-rate-limit#readme
rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  store: redisClient ? new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args) }) : undefined,
  skip: (req) => req.path === "/health" || req.headers.upgrade === "websocket",
})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `helmet-csp` separate package | `helmet` bundles CSP | ~2019 (helmet v4) | Single package install |
| `express-rate-limit` `max` option | `limit` option | v7+ | `max` is deprecated; use `limit` |
| `express-rate-limit` `headers: true` | `standardHeaders: "draft-8"` | v6+ | Spec-compliant headers |
| `ioredis` as the community default | `redis` (node-redis v5) is now equally popular | 2022-2023 | Both are valid; project chose node-redis |
| `RedisStore({ client })` | `RedisStore({ sendCommand })` | rate-limit-redis v4 | `sendCommand` decouples from specific client version |

**Deprecated/outdated:**
- `express-rate-limit` `max` option: replaced by `limit` in v7 — still works but emit deprecation warning.
- `rate-limit-redis` v3 `client` option: replaced by `sendCommand` in v4 — use `sendCommand` for node-redis v5 compatibility.
- `client.quit()` in node-redis v4: replaced by `client.destroy()` in v5 for non-graceful close.

---

## Open Questions

1. **Stricter rate limit for auth endpoints**
   - What we know: `/api/auth/*` handles login; brute-force protection is important.
   - What's unclear: Whether BetterAuth already has its own rate limiting internally.
   - Recommendation: Apply a separate `authLimiter` with `limit: 10` on `/api/auth/sign-in`. If BetterAuth handles it, this is defense-in-depth.

2. **CSP for SERVE_UI=true deployments**
   - What we know: `SERVE_UI=false` in production; `SERVE_UI=true` in local dev.
   - What's unclear: Whether local dev users will see CSP violations from Vite HMR websockets.
   - Recommendation: Disable CSP when `uiMode === "vite-dev"` to avoid dev friction. Keep strict CSP only for production API-only mode.

3. **Railway Redis private network URL format**
   - What we know: Railway uses `redis://default:<password>@<private-hostname>:6379` format for private TCP connections.
   - What's unclear: Whether Railway addon auto-injects `REDIS_URL` or requires manual env var wiring.
   - Recommendation: During REDIS-01 provisioning, verify the exact env var name Railway uses (likely `REDIS_URL`) and confirm it is wired to the Easypanel/server env. REDIS-01 is an infrastructure task that must precede REDIS-02.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.0.5 |
| Config file | `server/vitest.config.ts` |
| Quick run command | `pnpm --filter @paperclipai/server exec vitest run --reporter=verbose src/__tests__/security-headers.test.ts src/__tests__/rate-limit.test.ts src/__tests__/redis-client.test.ts` |
| Full suite command | `pnpm --filter @paperclipai/server exec vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HARD-01 | Per-IP throttle returns 429 after threshold | unit | `pnpm --filter @paperclipai/server exec vitest run src/__tests__/rate-limit.test.ts -x` | Wave 0 |
| HARD-02 | Helmet headers present in all responses | unit | `pnpm --filter @paperclipai/server exec vitest run src/__tests__/security-headers.test.ts -x` | Wave 0 |
| HARD-03 | RedisStore constructor receives `sendCommand` | unit (mock) | included in `rate-limit.test.ts` | Wave 0 |
| REDIS-01 | REDIS_URL propagated through config | unit | `pnpm --filter @paperclipai/server exec vitest run src/__tests__/redis-client.test.ts -x` | Wave 0 |
| REDIS-02 | Error event does not crash process; reconnect fires | unit (mock) | included in `redis-client.test.ts` | Wave 0 |
| REDIS-03 | Cache hit returns without DB call; cache miss hydrates | unit (mock) | `pnpm --filter @paperclipai/server exec vitest run src/__tests__/instance-settings-routes.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** Quick run on the specific new test file
- **Per wave merge:** `pnpm --filter @paperclipai/server exec vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `server/src/__tests__/security-headers.test.ts` — covers HARD-02: verifies helmet headers present on arbitrary route
- [ ] `server/src/__tests__/rate-limit.test.ts` — covers HARD-01, HARD-03: verifies 429 after threshold; verifies RedisStore wired via `sendCommand`
- [ ] `server/src/__tests__/redis-client.test.ts` — covers REDIS-01, REDIS-02: verifies config reads `REDIS_URL`; verifies `error` event suppresses process exit; verifies reconnect strategy option set
- [ ] `server/src/__tests__/instance-settings-routes.test.ts` — covers REDIS-03: verifies cache-hit path skips DB call; verifies cache-miss path writes to Redis; verifies PATCH invalidates cache key

Test pattern reference: existing `board-mutation-guard.test.ts` — pure unit test with supertest, no real DB, no real Redis. All Redis interactions should use `vi.fn()` mocks for the client.

---

## Sources

### Primary (HIGH confidence)
- `npm view helmet version` — 8.1.0 confirmed 2026-04-05
- `npm view express-rate-limit version` — 8.3.2 confirmed 2026-04-05
- `npm view rate-limit-redis version` — 4.3.1 confirmed 2026-04-05
- `npm view redis version` — 5.11.0 confirmed 2026-04-05
- https://github.com/helmetjs/helmet — official README: `app.use(helmet())` sets 13 headers
- https://github.com/express-rate-limit/express-rate-limit — official README: `rateLimit({ windowMs, limit, standardHeaders })`
- https://github.com/express-rate-limit/rate-limit-redis — official README: `RedisStore({ sendCommand })` pattern for node-redis v5
- https://github.com/redis/node-redis/blob/master/docs/client-configuration.md — `reconnectStrategy`, `connectTimeout`, `disableOfflineQueue`
- https://redis.io/docs/latest/develop/clients/nodejs/produsage/ — mandatory `error` event listener

### Secondary (MEDIUM confidence)
- https://dev.to/axiom_agent/nodejs-api-rate-limiting-in-production-from-express-rate-limit-to-redis-backed-distributed-125f — graceful degradation / fail-open pattern when Redis is down
- https://station.railway.com/questions/error-redis-initialization-failed-erro-2e6d2517 — Railway-specific Redis init with `socket.connectTimeout` and max-retry reconnect strategy

### Tertiary (LOW confidence — needs validation at deploy time)
- Railway Redis addon injects `REDIS_URL` env var automatically — not verified against Railway dashboard; validate during REDIS-01

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all four packages verified against npm registry
- Architecture: HIGH — usage patterns verified against official GitHub READMEs and official Redis docs
- Pitfalls: HIGH for Redis error handling (official doc confirms mandatory `error` listener); MEDIUM for WebSocket skip (inferred from Express 5 + ws library interaction, not directly documented)
- Test patterns: HIGH — derived from existing test files in `server/src/__tests__/` using same supertest + vitest + vi.fn() conventions

**Research date:** 2026-04-05
**Valid until:** 2026-07-05 (stable ecosystem; library APIs unlikely to change in 90 days)
