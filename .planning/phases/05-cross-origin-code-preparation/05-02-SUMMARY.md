---
phase: 05-cross-origin-code-preparation
plan: 02
subsystem: frontend
tags: [api-base, websocket, vercel, cross-origin, vite]
dependency_graph:
  requires: []
  provides: [api-base-module, ws-host-helper, vercel-spa-rewrite]
  affects: [ui/src/api/client.ts, ui/src/api/auth.ts, ui/src/context/LiveUpdatesProvider.tsx, ui/src/components/transcript/useLiveRunTranscripts.ts, ui/src/pages/AgentDetail.tsx]
tech_stack:
  added: []
  patterns: [centralized-env-url, tdd-red-green]
key_files:
  created:
    - ui/src/lib/api-base.ts
    - ui/src/lib/api-base.test.ts
    - ui/vercel.json
  modified:
    - ui/src/api/client.ts
    - ui/src/api/auth.ts
    - ui/src/context/LiveUpdatesProvider.tsx
    - ui/src/components/transcript/useLiveRunTranscripts.ts
    - ui/src/pages/AgentDetail.tsx
decisions:
  - "Build command is tsc -b && vite build — pre-existing TS error in IssueProperties.tsx blocks full tsc; verified vite bundling succeeds separately and error is unrelated to this plan's changes"
  - "Test files use relative imports (./api-base) not @/ aliases — matches existing test pattern in the codebase"
metrics:
  duration_seconds: 338
  completed_date: "2026-04-04"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 5
---

# Phase 05 Plan 02: Cross-Origin Code Preparation — API Base Module Summary

**One-liner:** Centralized VITE_API_URL → API_BASE + getWsHost() module replacing all hardcoded /api paths and window.location.host in WebSocket URLs, with vercel.json SPA rewrite.

## What Was Built

### api-base.ts module (TDD)

Created `ui/src/lib/api-base.ts` with two exports:

- `API_BASE`: constant derived from `VITE_API_URL` env var — produces `https://backend.railway.app/api` when set, falls back to `/api` for local dev
- `getWsHost()`: function that extracts the hostname:port from `VITE_API_URL` when set, falls back to `window.location.host` for same-origin dev mode

6 tests written first (RED), then implementation (GREEN). All 175 UI tests pass after changes.

### REST caller updates

- `ui/src/api/client.ts`: removed `const BASE = "/api"`, now imports `API_BASE` and uses it
- `ui/src/api/auth.ts`: added import, replaced two hardcoded `/api/auth...` fetch URLs with `${API_BASE}/auth...`

### WebSocket URL updates

All three WebSocket connection setup locations now call `getWsHost()` instead of `window.location.host`:

- `ui/src/context/LiveUpdatesProvider.tsx` (line 776)
- `ui/src/components/transcript/useLiveRunTranscripts.ts` (line 189)
- `ui/src/pages/AgentDetail.tsx` (line 3567)

### Vercel SPA rewrite

Created `ui/vercel.json` with single SPA rewrite rule so direct navigation to any client route returns `index.html`.

## Requirement Coverage

- DEPLOY-01: `ui/vercel.json` created with `"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]`
- DEPLOY-02: `client.ts` and `auth.ts` use `API_BASE` — no hardcoded `/api` relative fetch paths
- DEPLOY-03: All 3 WebSocket files use `getWsHost()` — no `window.location.host` in WS URL construction
- DEPLOY-04: Vite build succeeds with `VITE_API_URL=https://test.railway.app` — `test.railway.app` inlined in bundle

## Commits

| Hash | Description |
|------|-------------|
| 0518fb32 | test(05-02): add failing tests for API_BASE and getWsHost |
| fbc17d32 | feat(05-02): create api-base module and update REST callers |
| 8e58a867 | feat(05-02): update WebSocket URLs to use getWsHost() and add vercel.json |

## Deviations from Plan

### Pre-existing TS error (out of scope)

**Found during:** Task 2 verification (smoke test build)
**Issue:** `tsc -b && vite build` fails on `src/components/IssueProperties.tsx(227,14)` — `AssigneeSelection` not assignable to `Record<string, unknown>`. This error exists on the baseline commit (pre-dates this plan's changes).
**Action:** Confirmed pre-existing via `git stash` test. Ran `vite build` directly to confirm bundling succeeds. Logged to deferred items.
**Files modified:** None (out of scope)

### Relative import in test file (minor deviation from plan template)

**Found during:** Task 1 TDD RED phase
**Issue:** Plan template used `@/lib/api-base` import in test, but vitest node environment and existing test pattern in codebase use relative imports.
**Fix:** Used `./api-base` relative import — consistent with all other test files in `ui/src/lib/`.

## Self-Check: PASSED

All created files exist, all 3 commits verified, all 8 acceptance criteria pass.
