---
plan: 15-02
phase: 15
status: complete
tasks_completed: 2
commits:
  - 060f0cd1
  - 8a28facb
---

# 15-02 Summary — Backend: Login Rate Limiter + WS Token Log Redaction

## What Was Built

**Task 1 — Login rate limiter (AUTH-01)**
- Created `server/src/middleware/login-rate-limit.ts` — `createLoginRateLimiter()` factory using `express-rate-limit` (10 req / 15 min per IP, hard 429)
- Uses `RedisStore` from `rate-limit-redis` when `redisClient` is provided; falls back to in-memory store otherwise
- Mounted in `server/src/app.ts` BEFORE the BetterAuth handler (`app.all("/api/auth/*authPath")`) at the `/api/auth/sign-in/email` route
- Added `app.set("trust proxy", 1)` for correct `req.ip` resolution behind Easypanel/Nginx

**Task 2 — WS token log redaction (AUTH-05)**
- Added `sanitizeLogUrl(url: string): string` helper to `server/src/middleware/logger.ts`
- Strips `?token=` (and `&token=`) from URLs while preserving other query params
- Applied to `customSuccessMessage`, `customErrorMessage` callbacks in pinoHttp config
- Added `serializers.req` wrapper to sanitize the structured JSON `req.url` field (prevents Pitfall 4: raw token in JSON log output)

## Test Results

12/12 tests pass:
- `login-rate-limit.test.ts`: 5 tests (200 under threshold, 429 after 10 attempts, Redis store used, memory fallback, other routes unaffected)
- `ws-token-redaction.test.ts`: 7 tests (token stripped, other params preserved, unchanged without token, empty string, undefined input)

## Key Decisions

- Hard 429 (not progressive delay) — aligns with phase success criterion; `express-slow-down` not installed
- Rate limit mounted on `/api/auth/sign-in/email` specifically, not the entire `/api/auth/*` wildcard (preserves unaffected routes per AUTH-01 test)
- `trust proxy` required for IP detection behind reverse proxy
