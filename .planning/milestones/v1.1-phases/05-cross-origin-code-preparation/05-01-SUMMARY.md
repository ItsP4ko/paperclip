---
phase: 05-cross-origin-code-preparation
plan: "01"
subsystem: server
tags: [cors, better-auth, cookies, cross-origin, board-mutation-guard]
dependency_graph:
  requires: []
  provides:
    - CORS middleware configured in Express for cross-origin credentialed requests
    - BetterAuth SameSite=None; Secure cookie config for HTTPS deployments
    - boardMutationGuard accepts external origins via allowedOrigins parameter
    - createBetterAuthInstance throws on missing BETTER_AUTH_SECRET
  affects:
    - server/src/app.ts
    - server/src/auth/better-auth.ts
    - server/src/middleware/board-mutation-guard.ts
tech_stack:
  added:
    - cors@^2.8.6 — Express CORS middleware (handles OPTIONS preflight automatically)
    - "@types/cors@^2.8.19" — TypeScript types for cors
  patterns:
    - CORS middleware as first app.use() before express.json() for correct preflight handling
    - BetterAuth advanced.defaultCookieAttributes override for SameSite=None on HTTPS
    - boardMutationGuard opts parameter pattern for backward-compatible external origin support
key_files:
  created:
    - server/src/__tests__/cors-middleware.test.ts
    - server/src/__tests__/better-auth-cookies.test.ts
  modified:
    - server/src/app.ts
    - server/src/auth/better-auth.ts
    - server/src/middleware/board-mutation-guard.ts
    - server/src/__tests__/board-mutation-guard.test.ts
    - server/package.json
decisions:
  - "cors package chosen over hand-rolled CORS headers — handles all edge cases including Vary headers and OPTIONS preflight"
  - "CORS uses opts.allowedHostnames (already parsed from PAPERCLIP_ALLOWED_HOSTNAMES) rather than re-reading env var"
  - "boardMutationGuard gets allowedOrigins derived from same opts.allowedHostnames to avoid divergence"
  - "BetterAuth cookie test uses vi.mock() at module level + vi.clearAllMocks() in beforeEach to avoid call accumulation across tests"
metrics:
  duration_minutes: 7
  tasks_completed: 2
  files_created: 2
  files_modified: 5
  completed_date: "2026-04-04"
---

# Phase 05 Plan 01: Cross-Origin Server Wiring Summary

**One-liner:** Express CORS middleware (cors@2.8.x with credentials: true), BetterAuth SameSite=None; Secure cookies, secret throw-on-missing, and boardMutationGuard external origin support — all verified by 18 new tests.

## What Was Built

The Express backend is now fully configured for cross-origin operation from a Vercel-hosted frontend to a Railway-hosted backend:

1. **CORS middleware** (`server/src/app.ts`): `cors()` inserted as the first `app.use()` call before `express.json()`. Uses `opts.allowedHostnames` to derive allowed origins (`https://${h}` and `http://${h}` for each hostname). Returns `Access-Control-Allow-Origin` and `Access-Control-Allow-Credentials: true` for listed origins; rejects unlisted origins. Allows no-origin requests (curl, same-origin, mobile).

2. **BetterAuth cookie config** (`server/src/auth/better-auth.ts`): HTTPS deployments now emit `SameSite=None; Secure` via `advanced.defaultCookieAttributes` override. HTTP deployments (local dev) continue to use `useSecureCookies: false`. The `"paperclip-dev-secret"` hardcoded fallback is removed; `createBetterAuthInstance` throws immediately if neither `BETTER_AUTH_SECRET` nor `PAPERCLIP_AGENT_JWT_SECRET` is set.

3. **boardMutationGuard external origins** (`server/src/middleware/board-mutation-guard.ts`): Signature updated from `boardMutationGuard()` to `boardMutationGuard(opts: { allowedOrigins?: string[] } = {})`. External origins are merged into the trusted set in `trustedOriginsForRequest`. Call site in `app.ts` passes `opts.allowedHostnames.flatMap(...)` so the Vercel frontend origin is trusted.

## Requirements Satisfied

| ID | Description | Status |
|----|-------------|--------|
| AUTH-01 | CORS middleware allows credentialed requests from PAPERCLIP_ALLOWED_HOSTNAMES origins | DONE — cors-middleware.test.ts |
| AUTH-02 | BetterAuth cookies emit SameSite=None; Secure for HTTPS | DONE — better-auth-cookies.test.ts |
| AUTH-03 | boardMutationGuard accepts mutations from allowedOrigins | DONE — board-mutation-guard.test.ts |
| AUTH-04 | No hardcoded secret fallback; throws when secret missing | DONE — better-auth-cookies.test.ts |
| DEPLOY-06 | Health endpoint test passes (existing) | CONFIRMED — health.test.ts passes |
| DEPLOY-08 | PORT env var reading tested (existing) | CONFIRMED — paperclip-env.test.ts passes |

## Test Results

- `server/src/__tests__/cors-middleware.test.ts`: 4 tests pass
- `server/src/__tests__/board-mutation-guard.test.ts`: 11 tests pass (9 existing + 2 new)
- `server/src/__tests__/better-auth-cookies.test.ts`: 3 tests pass
- Full server test suite: **109 test files, 601 tests pass, 1 skipped, 0 failures**

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written. The `vi.clearAllMocks()` pattern (instead of `vi.resetModules()`) was selected in the cookie test to avoid module-cache issues with Vitest mock accumulation across tests — this is a test implementation detail within the plan's scope.

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 9301a665 | test | Add failing tests (RED) for CORS, cookie config, secret validation + cors package install |
| 7bf254b9 | feat | Implement CORS, BetterAuth cookies, secret validation, mutation guard (GREEN, 18 tests pass) |

## Self-Check: PASSED

All created files verified on disk. All commits verified in git history.
