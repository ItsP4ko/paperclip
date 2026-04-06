---
phase: 14-websocket-optimization
plan: "01"
subsystem: api
tags: [websocket, ws, perMessageDeflate, compression, vitest]

# Dependency graph
requires:
  - phase: 13-mobile-auth
    provides: Live events WS setup with bearer token auth (authorizeUpgrade + setupLiveEventsWebSocketServer)
provides:
  - Explicit perMessageDeflate: false in WebSocketServer constructor (WS-02 satisfied)
  - ESM named import of ws replacing createRequire CJS workaround
  - Unit test verifying WebSocketServer receives perMessageDeflate: false
affects:
  - 14-02 (any further WS optimization plans)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ESM named import from ws (wrapper.mjs) instead of createRequire — enables vitest mock interception"
    - "WebSocketServer typed via as unknown as cast to preserve minimal WsServer interface without importing @types/ws globally"

key-files:
  created: []
  modified:
    - server/src/realtime/live-events-ws.ts
    - server/src/__tests__/live-events-ws-user-session.test.ts

key-decisions:
  - "ESM import replaces createRequire for ws — vitest vi.mock cannot intercept createRequire-based require() calls; ESM import goes through vitest's module system enabling mock spy assertion"
  - "WebSocketServer cast via as unknown preserves existing minimal WsServer interface without coupling to @types/ws global types"

patterns-established:
  - "When vitest cannot mock a dependency due to createRequire bypassing the module system, convert to ESM named import — ws wrapper.mjs supports this in Node 24 / NodeNext resolution"

requirements-completed: [WS-02]

# Metrics
duration: 4min
completed: "2026-04-06"
---

# Phase 14 Plan 01: Explicit perMessageDeflate: false in WebSocketServer Constructor Summary

**perMessageDeflate: false explicitly declared in WebSocketServer constructor with ESM import and verified by unit test**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-06T01:39:29Z
- **Completed:** 2026-04-06T01:44:15Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Widened WebSocketServer constructor type to accept `perMessageDeflate?: boolean`
- Passed `perMessageDeflate: false` explicitly in `setupLiveEventsWebSocketServer` constructor call
- Replaced `createRequire`/`require("ws")` with ESM named import to enable vitest mock interception
- Added `setupLiveEventsWebSocketServer options` describe block with test asserting constructor receives `{ noServer: true, perMessageDeflate: false }`
- All 6 tests in the suite pass (5 existing + 1 new)

## Task Commits

Each task was committed atomically:

1. **Task 1: Widen WS constructor type and pass perMessageDeflate: false** - `35c812fe` (feat)
2. **Task 2: Add unit test verifying perMessageDeflate constructor argument** - `0aff2209` (test)

**Plan metadata:** _(docs commit below)_

## Files Created/Modified

- `server/src/realtime/live-events-ws.ts` — Replaced `createRequire`/`require("ws")` with `import { WebSocket as WsWebSocket, WebSocketServer as WsWebSocketServer } from "ws"`, widened constructor type with `perMessageDeflate?: boolean`, passed `perMessageDeflate: false` explicitly
- `server/src/__tests__/live-events-ws-user-session.test.ts` — Added `describe("setupLiveEventsWebSocketServer options")` block with constructor argument assertion

## Decisions Made

- **ESM import over createRequire:** vitest's `vi.mock("ws")` intercepts ESM imports through its module system but does NOT intercept `createRequire`-based `require()` calls. Switching to `import { WebSocket as WsWebSocket, WebSocketServer as WsWebSocketServer } from "ws"` was required for the unit test to work. The `ws` package has had an ESM wrapper (`wrapper.mjs`) since ws@7 and it works correctly with `NodeNext` module resolution.

- **`as unknown as` cast pattern:** The existing code used a cast to a minimal `WsServer` interface rather than importing full `@types/ws` types. This was preserved to avoid coupling the module to external type definitions. The cast `WsWebSocketServer as unknown as new (opts: ...) => WsServer` maintains the same structural contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Converted ws import from createRequire to ESM named import**
- **Found during:** Task 2 (unit test for perMessageDeflate)
- **Issue:** vitest's `vi.mock("ws")` mock factory is not intercepted by `createRequire(import.meta.url)("ws")` — the test spy showed 0 calls despite `setupLiveEventsWebSocketServer` being called. This made the planned test assertion impossible to satisfy without changing the import mechanism.
- **Fix:** Removed `import { createRequire } from "node:module"` and the `const require = createRequire(...)` pattern. Added `import { WebSocket as WsWebSocket, WebSocketServer as WsWebSocketServer } from "ws"` with aliased names. Extracted to local constants with `as unknown as` casts to preserve the existing minimal interface types.
- **Files modified:** `server/src/realtime/live-events-ws.ts`
- **Verification:** TypeScript compiles cleanly (`tsc --noEmit` exits 0). All 6 tests pass.
- **Committed in:** `0aff2209` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix was necessary to make the unit test assertion functional. The production behavior (`perMessageDeflate: false` passed to constructor) is identical — only the module loading mechanism changed, and the change is an improvement (cleaner ESM-native import).

## Issues Encountered

- vitest mock interception of `createRequire` — `vi.mock("ws")` does not intercept CJS `require()` calls made via `createRequire`. This is a known vitest limitation. Switching to ESM import resolved the issue completely.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- WS-02 requirement satisfied with explicit `perMessageDeflate: false` and traceable unit test
- Ready for Plan 14-02 (next websocket optimization plan)
- The ESM import approach means any future `vi.mock("ws")` in tests will work correctly

---
*Phase: 14-websocket-optimization*
*Completed: 2026-04-06*

## Self-Check: PASSED

- `server/src/realtime/live-events-ws.ts` — FOUND
- `server/src/__tests__/live-events-ws-user-session.test.ts` — FOUND
- `.planning/phases/14-websocket-optimization/14-01-SUMMARY.md` — FOUND
- Commit `35c812fe` (Task 1) — FOUND
- Commit `0aff2209` (Task 2) — FOUND
