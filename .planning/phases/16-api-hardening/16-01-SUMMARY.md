---
phase: 16-api-hardening
plan: "01"
subsystem: server-middleware
tags: [validation, error-handling, security, csrf, tdd]
dependency_graph:
  requires: []
  provides: [validateQuery-middleware, hardened-5xx-error-path, csrf-documentation]
  affects: [server/src/middleware/validate.ts, server/src/middleware/error-handler.ts, server/src/middleware/auth.ts]
tech_stack:
  added: []
  patterns: [tdd-red-green, zod-schema-coercion, express-middleware-factory]
key_files:
  created:
    - server/src/__tests__/validate-middleware.test.ts
  modified:
    - server/src/middleware/validate.ts
    - server/src/middleware/error-handler.ts
    - server/src/__tests__/error-handler.test.ts
    - server/src/middleware/auth.ts
decisions:
  - "validateQuery uses schema.parse(req.query) cast to typeof req.query — consistent with validate() body pattern"
  - "Passthrough test uses z.object(...).passthrough() explicitly — Zod strips unknown keys by default"
  - "HttpError >= 500 scrub applied via inline conditional (not a separate helper) — minimal diff to existing handler"
  - "CSRF comment placed between boardAuthService import and hashToken function — logical grouping with auth concerns"
metrics:
  duration: "4m1s"
  completed_date: "2026-04-06"
  tasks_completed: 2
  files_modified: 5
requirements: [API-03, API-04]
---

# Phase 16 Plan 01: Validate Middleware + Error Handler Hardening Summary

**One-liner:** validateQuery() middleware with Zod coercion support, HttpError 5xx message scrubbing, and CSRF non-implementation documentation with OWASP reference.

## What Was Built

### Task 1: validateQuery middleware (TDD)

Added `validateQuery()` export to `server/src/middleware/validate.ts`. The function mirrors `validate()` but operates on `req.query` instead of `req.body`, using `schema.parse(req.query) as typeof req.query` to allow Zod coercion (e.g. `z.coerce.number()` converting `"50"` to `50`).

Created `server/src/__tests__/validate-middleware.test.ts` with 5 tests covering:
- `validate()` happy path: sets req.body to parsed result, calls next()
- `validate()` error path: throws ZodError on invalid body
- `validateQuery()` coercion: `"50"` string becomes number `50`
- `validateQuery()` error path: throws ZodError on invalid query
- `validateQuery()` passthrough: unknown keys survive with `.passthrough()` schema

TDD red/green cycle followed: tests ran as RED (3/5 failing for validateQuery) before implementation, then GREEN (5/5) after adding the function.

### Task 2: Error handler hardening + CSRF comment

**error-handler.ts:** Changed the HttpError branch to check `err.status >= 500` before responding. 5xx responses now always return `{ error: "Internal server error" }` instead of `err.message`, preventing internal details (e.g. DB connection strings, stack traces) from leaking to clients. The `attachErrorContext` call above still logs the real message via pino.

**error-handler.test.ts:** Updated the pre-existing `"attaches HttpError instances for 500 responses"` test to assert `{ error: "Internal server error" }` (was asserting `{ error: "db exploded" }`). Added 3 new tests:
- `"HttpError 500 returns generic message, not err.message"` — confirms scrubbing
- `"500 response body contains no stack trace or file paths"` — asserts JSON doesn't contain `/Users/`, `at Object.`, `.ts:`, `.js:`
- `"HttpError 4xx still returns err.message and details"` — confirms 422 still leaks message/details (intentional for client UX)

**auth.ts:** Inserted CSRF non-implementation comment block between the `boardAuthService` import and `hashToken` function. Documents bearer-token architecture as CSRF-immune by design with OWASP reference URL.

## Test Results

```
server/src/__tests__/validate-middleware.test.ts — 5/5 passed
server/src/__tests__/error-handler.test.ts      — 5/5 passed (3 new + 2 existing)
```

Full suite: 2 pre-existing failures in `relaycontrol` package (unrelated to this plan — both fail without our changes: `http.test.ts` has a string mismatch in CLI error message, `company-import-export-e2e.test.ts` fails due to missing `pnpm` binary in test runner environment).

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1    | 60cf8bdb | feat(16-01): add validateQuery middleware and test coverage |
| 2    | d3bac4a5 | feat(16-01): harden 5xx error path, extend tests, add CSRF comment |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Passthrough test used default Zod schema without .passthrough()**
- **Found during:** Task 1 GREEN phase
- **Issue:** Test for "unknown query params passthrough" failed because `z.object({...})` strips unknown keys by default — `agentId` was dropped before assertion
- **Fix:** Added `.passthrough()` to the test schema: `z.object({ limit: z.coerce.number().optional() }).passthrough()`
- **Files modified:** `server/src/__tests__/validate-middleware.test.ts`
- **Commit:** 60cf8bdb

### Out-of-Scope Discoveries

Two pre-existing test failures in `relaycontrol` package (not caused by this plan):
- `src/__tests__/http.test.ts` — CLI error message mismatch ("Relay Control API" vs "Paperclip API")
- `src/__tests__/company-import-export-e2e.test.ts` — E2E test requires `pnpm` binary in PATH

These are logged here. No action taken — out of scope per deviation boundary rules.

## Self-Check: PASSED

All expected files present. Both task commits verified in git log.
