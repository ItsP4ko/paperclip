---
phase: 15-auth-hardening
plan: "01"
subsystem: auth
tags: [tdd, rate-limiting, logging, security]
dependency_graph:
  requires: []
  provides: [login-rate-limit-test-stubs, ws-token-redaction-test-stubs]
  affects: [server/src/__tests__]
tech_stack:
  added: []
  patterns: [TDD RED phase, vitest hoisted mocks, supertest integration tests]
key_files:
  created:
    - server/src/__tests__/login-rate-limit.test.ts
    - server/src/__tests__/ws-token-redaction.test.ts
  modified: []
decisions:
  - "Test for sanitizeLogUrl imports from logger.ts (not a separate file) — consistent with plan spec"
  - "login-rate-limit.test.ts uses app.all() for rate limiter mounting — matches spec exactly"
metrics:
  duration: "74s"
  completed: "2026-04-06"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
---

# Phase 15 Plan 01: Auth-Hardening TDD RED Phase Summary

**One-liner:** Failing test stubs for login rate limiter (AUTH-01) and WS token URL redaction (AUTH-05) using vitest hoisted mocks and supertest.

## What Was Built

Two TDD RED-phase test files that import not-yet-existing implementations and fail on execution, enabling Plan 02 to follow RED-to-GREEN.

**login-rate-limit.test.ts** — 5 test cases covering:
1. Returns 200 for requests under the threshold
2. Returns 429 after exceeding 10 attempts from same IP (with correct error message)
3. Constructs RedisStore with `rl:login:` prefix when redisClient provided
4. Does NOT construct RedisStore when redisClient is undefined
5. Does not affect other auth routes (get-session still returns 200 after sign-in is exhausted)

**ws-token-redaction.test.ts** — 7 test cases covering:
1. Strips `?token=` from URL with only a token param
2. Strips `token=` while preserving other query params
3. Strips `token=` when it appears after another param
4. Returns URL unchanged when no token param exists
5. Returns URL unchanged when no query string exists
6. Handles empty string input
7. Handles undefined input

## Verification

- login-rate-limit.test.ts: `ERR_MODULE_NOT_FOUND` for `../middleware/login-rate-limit.js` — confirmed RED
- ws-token-redaction.test.ts: 7 tests fail with `sanitizeLogUrl is not a function` — confirmed RED
- Existing tests (rate-limit.test.ts, log-redaction.test.ts): 10 tests all pass — no regressions

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 | e5ca9957 | test(15-01): add failing test stubs for createLoginRateLimiter |
| 2 | 3fe31506 | test(15-01): add failing test stubs for sanitizeLogUrl |

## Self-Check: PASSED

- [x] server/src/__tests__/login-rate-limit.test.ts — FOUND
- [x] server/src/__tests__/ws-token-redaction.test.ts — FOUND
- [x] e5ca9957 — FOUND
- [x] 3fe31506 — FOUND
