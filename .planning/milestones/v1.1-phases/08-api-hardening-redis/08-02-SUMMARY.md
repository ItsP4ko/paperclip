---
phase: 08-api-hardening-redis
plan: 02
subsystem: api
tags: [express-rate-limit, rate-limit-redis, redis-cache, middleware, instance-settings]

# Dependency graph
requires:
  - phase: 08-01
    provides: redisClient in createApp opts, packages installed
provides:
  - createRateLimiter factory with RedisStore when Redis available, in-memory fallback otherwise
  - Redis cache for GET /api/instance/settings/general (60s TTL)
  - Cache invalidation on PATCH /api/instance/settings/general
  - createRateLimiter export in middleware barrel
affects:
  - Production API: all routes rate-limited at 200 req/15min per IP
  - Production API: instance settings reads served from Redis cache

# Tech tracking
tech-stack:
  added: []
  patterns:
    - createRateLimiter(redisClient?, opts?) — RedisStore wired via sendCommand interface for node-redis v5
    - Redis cache pattern with isReady guard + .catch(() => null) fallback on read, .catch() on write
    - Cache invalidation via del() after DB write in PATCH handler

key-files:
  created:
    - server/src/middleware/rate-limit.ts
    - server/src/__tests__/rate-limit.test.ts
    - server/src/__tests__/instance-settings-cache.test.ts
  modified:
    - server/src/middleware/index.ts
    - server/src/app.ts
    - server/src/routes/instance-settings.ts

key-decisions:
  - "draft-8 standardHeaders sends combined RateLimit header, not separate ratelimit-limit — test updated to check ratelimit"
  - "MockRedisStore in tests must implement Store interface (increment/decrement/resetKey) to pass express-rate-limit validation"
  - "Cache invalidation placed before activity logging in PATCH handler to minimize stale-read window"

requirements-completed: [HARD-01, HARD-03, REDIS-03]

# Metrics
duration: 4min
completed: 2026-04-05
---

# Phase 08 Plan 02: Distributed Rate Limiting and Redis Caching Summary

**express-rate-limit with RedisStore wired via sendCommand, plus Redis GET/SET/DEL caching on instance settings with 60s TTL and immediate invalidation on PATCH**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-05T15:00:06Z
- **Completed:** 2026-04-05T15:04:35Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Created `rate-limit.ts` middleware with `createRateLimiter(redisClient?, opts?)` factory; RedisStore via `sendCommand` for node-redis v5 compatibility; in-memory fallback when Redis absent; /health and WebSocket upgrade skipped; 429 body `{ error: "Too many requests. Please slow down." }`
- Mounted `createRateLimiter(opts.redisClient)` in `app.ts` after `securityHeaders` and before `express.json()`
- Exported `createRateLimiter` from middleware barrel (`index.ts`)
- Updated `instanceSettingsRoutes(db, redisClient?)` to cache GET /api/instance/settings/general in Redis: cache hit skips DB call, cache miss writes result with `{ EX: 60 }`, PATCH invalidates key via `del()`
- Graceful error handling: `redisClient.get().catch(() => null)` on reads, `.catch()` with logger.warn on writes — never crashes
- Passed `opts.redisClient` to `instanceSettingsRoutes` in `app.ts`
- 6 rate-limit unit tests + 5 cache unit tests; full suite: 113 test files, 622 tests, 1 skipped — all green

## Task Commits

1. **Task 1: Rate-limit middleware with RedisStore and tests** — `4ebfe693` (feat)
2. **Task 2: Redis cache for instance settings GET/PATCH with invalidation** — `878999af` (feat)

## Files Created/Modified

- `server/src/middleware/rate-limit.ts` — createRateLimiter factory: RedisStore via sendCommand, skip /health + websocket, 429 handler, opts.limit override for tests
- `server/src/__tests__/rate-limit.test.ts` — 6 tests: 200 under threshold, 429 after limit, ratelimit header, /health skip, RedisStore wired, no-Redis fallback
- `server/src/__tests__/instance-settings-cache.test.ts` — 5 tests: cache hit, cache miss (set called with EX:60), cache invalidation (del called), Redis error fallback, no-Redis path
- `server/src/middleware/index.ts` — Added createRateLimiter barrel export
- `server/src/app.ts` — Added createRateLimiter import; mounted after securityHeaders; instanceSettingsRoutes now receives opts.redisClient
- `server/src/routes/instance-settings.ts` — Added RedisClientType param, CACHE_KEY/TTL_SECONDS constants, cache read/write/delete logic in GET and PATCH handlers

## Decisions Made

- `standardHeaders: "draft-8"` sends a combined `RateLimit` header (not `RateLimit-Limit` separately) — test checks for `ratelimit` (lowercased), which is the correct header name in this format.
- MockRedisStore in the rate-limit test must implement the Store interface (`increment`, `decrement`, `resetKey`) because `express-rate-limit` validates the store at construction time — the mock was updated accordingly.
- Cache invalidation (`del()`) placed immediately after `svc.updateGeneral()` and before activity logging to minimize the window where stale data could be returned.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] draft-8 header name is RateLimit (combined), not ratelimit-limit**
- **Found during:** Task 1 (GREEN phase — first test run)
- **Issue:** `standardHeaders: "draft-8"` emits `RateLimit` (combined header per IETF draft 8), not `RateLimit-Limit` as in older drafts. The initial test checked `ratelimit-limit` which was absent.
- **Fix:** Updated test 3 to check for `ratelimit` header (the combined draft-8 header, lowercased by supertest)
- **Files modified:** server/src/__tests__/rate-limit.test.ts
- **Commit:** 4ebfe693

**2. [Rule 1 - Bug] MockRedisStore failed express-rate-limit Store interface validation**
- **Found during:** Task 1 (GREEN phase — first test run)
- **Issue:** `rateLimit()` validates the store at construction time, requiring `increment`, `decrement`, and `resetKey` functions. The initial mock returned `{}` which threw `TypeError: An invalid store was passed`.
- **Fix:** Added `increment`, `decrement`, and `resetKey` vi.fn() methods to `mockRedisStoreInstance`
- **Files modified:** server/src/__tests__/rate-limit.test.ts
- **Commit:** 4ebfe693

---

**Total deviations:** 2 auto-fixed (2 bugs discovered during RED→GREEN phase)
**Impact on plan:** Both fixes corrected test accuracy. No scope creep. Middleware implementation matches plan spec exactly.

## Self-Check: PASSED

Files exist:
- FOUND: server/src/middleware/rate-limit.ts
- FOUND: server/src/__tests__/rate-limit.test.ts
- FOUND: server/src/__tests__/instance-settings-cache.test.ts

Commits exist:
- FOUND: 4ebfe693
- FOUND: 878999af
