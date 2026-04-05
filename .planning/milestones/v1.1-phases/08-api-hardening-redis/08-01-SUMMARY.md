---
phase: 08-api-hardening-redis
plan: 01
subsystem: api
tags: [helmet, redis, node-redis, security-headers, middleware, express]

# Dependency graph
requires:
  - phase: 07-end-to-end-verification
    provides: Clean E2E baseline before hardening changes
provides:
  - Helmet security headers middleware (HSTS, X-Frame-Options DENY, X-Content-Type-Options, CSP default-src none)
  - Redis client singleton factory with error handling and reconnect strategy
  - redisUrl config field from REDIS_URL env var
  - securityHeaders export in middleware barrel
  - redisClient passed into createApp opts for Plan 02 downstream use
affects:
  - 08-02 (rate-limit-redis — depends on redisClient in createApp opts)

# Tech tracking
tech-stack:
  added: [helmet@8.1.0, express-rate-limit@8.3.2, rate-limit-redis@4.3.1, redis@5.11.0]
  patterns:
    - Redis client initialized in index.ts before createApp, injected via opts (same pattern as db, storageService, betterAuthHandler)
    - Graceful startup: Redis connection failure logs error and continues without Redis rather than crashing
    - Graceful shutdown: Redis disconnect called before process.exit in SIGINT/SIGTERM handler

key-files:
  created:
    - server/src/middleware/security-headers.ts
    - server/src/services/redis-client.ts
    - server/src/__tests__/security-headers.test.ts
    - server/src/__tests__/redis-client.test.ts
  modified:
    - server/src/middleware/index.ts
    - server/src/config.ts
    - server/src/app.ts
    - server/src/index.ts
    - server/package.json
    - pnpm-lock.yaml

key-decisions:
  - "helmet frameguard action explicitly set to deny — helmet default is SAMEORIGIN, plan requires DENY"
  - "All four Phase 02 packages installed in Plan 01 to avoid a second install step (helmet, express-rate-limit, rate-limit-redis, redis)"
  - "securityHeaders mounted after CORS and before express.json so CORS preflight responses still get CORS headers but all routes get security headers"

patterns-established:
  - "Redis client singleton: createRedisClient(url) in services/redis-client.ts — error listener + reconnect cap + disableOfflineQueue"
  - "Config env var pattern: REDIS_URL -> config.redisUrl (string | undefined)"
  - "Graceful degradation: if REDIS_URL absent or connection fails at startup, server continues without Redis"

requirements-completed: [HARD-02, REDIS-01, REDIS-02]

# Metrics
duration: 4min
completed: 2026-04-05
---

# Phase 08 Plan 01: API Hardening — Security Headers & Redis Client Summary

**Helmet security headers (HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff, CSP default-src none) wired into Express, plus node-redis v5 client singleton with error handling, reconnect capping, and config integration**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-05T14:52:14Z
- **Completed:** 2026-04-05T14:57:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Created `security-headers.ts` helmet middleware with API-appropriate defaults and explicit X-Frame-Options DENY
- Created `redis-client.ts` singleton factory with mandatory error listener (prevents process crash), 2000ms reconnect cap, and disableOfflineQueue
- Extended `Config` interface with `redisUrl: string | undefined` read from `REDIS_URL` env var
- Wired securityHeaders into `app.ts` after CORS, before express.json; redisClient initialized in `index.ts` before createApp with graceful startup fallback
- Added graceful Redis disconnect in SIGINT/SIGTERM shutdown handler
- 10 unit tests: 4 header assertions + 6 Redis client/config assertions — all pass; full suite (111 test files, 611 tests) stays green

## Task Commits

Each task was committed atomically:

1. **Task 1: Create helmet security-headers middleware, Redis client singleton, and config wiring** - `3ff07702` (feat)
2. **Task 2: Wire helmet and Redis client into app.ts and index.ts startup** - `7d66bbad` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified
- `server/src/middleware/security-headers.ts` - Helmet middleware with CSP default-src none, frameguard DENY, HSTS maxAge 31536000
- `server/src/services/redis-client.ts` - createRedisClient factory: error listener, reconnect cap, disableOfflineQueue, pino logging
- `server/src/__tests__/security-headers.test.ts` - 4 header assertion tests via supertest
- `server/src/__tests__/redis-client.test.ts` - 6 tests: createClient args, error handler, reconnect strategy, disableOfflineQueue, config integration
- `server/src/middleware/index.ts` - Added securityHeaders barrel export
- `server/src/config.ts` - Added redisUrl: string | undefined to Config interface and loadConfig()
- `server/src/app.ts` - Imported securityHeaders and RedisClientType; added redisClient? to opts; mounted securityHeaders after CORS
- `server/src/index.ts` - Imported createRedisClient; initialize redisClient before createApp; pass redisClient to createApp; disconnect on shutdown
- `server/package.json` - Added helmet, express-rate-limit, rate-limit-redis, redis dependencies
- `pnpm-lock.yaml` - Updated lockfile

## Decisions Made
- Installed all four Phase 08 packages (helmet, express-rate-limit, rate-limit-redis, redis) in Plan 01 to avoid a second install step in Plan 02.
- `securityHeaders` mounted after CORS so CORS preflight responses still get CORS headers while all other responses get security headers.
- `disableOfflineQueue: true` set on Redis client to prevent stale commands replaying on reconnect.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Helmet default X-Frame-Options is SAMEORIGIN, not DENY**
- **Found during:** Task 1 (RED→GREEN phase)
- **Issue:** helmet() default sets `x-frame-options: SAMEORIGIN` but plan spec requires `DENY`; test failed with `expected 'SAMEORIGIN' to be 'DENY'`
- **Fix:** Added explicit `frameguard: { action: "deny" }` option to helmet() configuration in security-headers.ts
- **Files modified:** server/src/middleware/security-headers.ts
- **Verification:** Test `sets x-frame-options header to DENY` passes
- **Committed in:** 3ff07702 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Auto-fix was necessary for correctness — the spec explicitly requires DENY. No scope creep.

## Issues Encountered
- `vitest run -x` (bail-on-first-failure flag) is not supported in this project's vitest version (3.2.4 throws "Unknown option -x"). Used `vitest run` without the flag throughout.

## User Setup Required
**External services require manual configuration:**
- Provision a Redis instance (Railway addon or Easypanel Redis container)
- Set `REDIS_URL=redis://default:<password>@<hostname>:6379` in the backend service environment variables
- If `REDIS_URL` is absent, the server starts normally and skips all Redis features

## Next Phase Readiness
- `redisClient` is available in `createApp` opts — Plan 02 can immediately use it for `createRateLimiter(opts.redisClient)` and Redis caching
- No blockers for Plan 02

---
*Phase: 08-api-hardening-redis*
*Completed: 2026-04-05*
