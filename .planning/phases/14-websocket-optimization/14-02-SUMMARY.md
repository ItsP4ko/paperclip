---
phase: 14-websocket-optimization
plan: 02
subsystem: ui
tags: [websocket, react-query, heartbeat, cache-invalidation, reconnect]

# Dependency graph
requires:
  - phase: 13-websocket-auth
    provides: Bearer token WS auth so the connection can be established and the client can reconnect

provides:
  - Client-side application heartbeat (10s interval + 12s deadline) in LiveUpdatesProvider
  - Cache invalidation on reconnect via invalidateOnReconnect (issue lists, detail prefix, sidebar, dashboard)
  - Unit tests for invalidateOnReconnect behavior

affects:
  - Any future phase touching LiveUpdatesProvider.tsx or WebSocket connection lifecycle

# Tech tracking
tech-stack:
  added: []
  patterns:
    - scheduleHeartbeat/clearHeartbeat pattern: closure-scoped inside connect() so nextSocket is captured without leaking
    - Prefix-match invalidation: queryKey ["issues", "detail"] invalidates all detail queries without needing specific IDs
    - reconnectAttempt > 0 guard: initial connect skips cache invalidation, only reconnects trigger it

key-files:
  created: []
  modified:
    - ui/src/context/LiveUpdatesProvider.tsx
    - ui/src/context/LiveUpdatesProvider.test.ts

key-decisions:
  - "scheduleHeartbeat defined inside connect() not useEffect top-level — nextSocket must be captured in closure, clearHeartbeat can be at useEffect level"
  - "queryKey [issues, detail] prefix matching invalidates ALL issue detail queries on reconnect without iterating known IDs"
  - "invalidateOnReconnect skips agent, cost, heartbeat, and run queries — reconnect recovery targets only issue-visible data"
  - "reconnectAttempt > 0 guard ensures initial connection does not fire cache invalidation, only true reconnects do"

patterns-established:
  - "Heartbeat pattern: scheduleHeartbeat sets interval timer, on fire sends ping + sets deadline timer; any received message resets both"
  - "Cross-socket contamination guard: all timers check socket !== nextSocket before acting"

requirements-completed: [WS-01, WS-03]

# Metrics
duration: 3min
completed: 2026-04-06
---

# Phase 14 Plan 02: WebSocket Heartbeat and Reconnect Cache Invalidation Summary

**Client-side application-level heartbeat (10s interval + 12s deadline) with targeted cache invalidation on reconnect using TanStack Query prefix matching**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-06T01:39:45Z
- **Completed:** 2026-04-06T01:42:44Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `HEARTBEAT_INTERVAL_MS` (10s) and `HEARTBEAT_DEADLINE_MS` (12s) constants to LiveUpdatesProvider
- Implemented `scheduleHeartbeat`/`clearHeartbeat` inside `connect()` closure with full timer leak prevention (cleared on onclose, onmessage, and effect cleanup)
- Implemented `invalidateOnReconnect` function that invalidates all 5 issue list views, the `["issues", "detail"]` prefix (all detail queries), sidebarBadges, and dashboard — no agent/cost/heartbeat queries
- Wired cache invalidation into `onopen` gated by `reconnectAttempt > 0` so initial connect is not affected
- Added unit tests for reconnect cache invalidation: verifies correct query keys hit, verifies agents/costs/heartbeats are NOT invalidated
- All 13 tests pass (10 existing + 3 new)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add client heartbeat and invalidateOnReconnect to LiveUpdatesProvider** - `09215c69` (feat)
2. **Task 2: Add unit tests for heartbeat and reconnect invalidation** - `ae08d58c` (test)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `ui/src/context/LiveUpdatesProvider.tsx` - Added heartbeat constants, invalidateOnReconnect function, scheduleHeartbeat/clearHeartbeat, all socket lifecycle wiring, and updated __liveUpdatesTestUtils export
- `ui/src/context/LiveUpdatesProvider.test.ts` - Added two describe blocks: reconnect cache invalidation (2 tests) and heartbeat constants (1 test)

## Decisions Made

- `scheduleHeartbeat` defined inside `connect()` not at `useEffect` top-level — `nextSocket` must be in scope, and `clearHeartbeat` (which does not reference `nextSocket`) stays at useEffect level
- `queryKey: ["issues", "detail"]` prefix matching invalidates ALL issue detail queries on reconnect without needing a list of known IDs
- `invalidateOnReconnect` deliberately excludes agent, cost, heartbeat, and run queries — reconnect recovery targets only issue-visible stale data
- `reconnectAttempt > 0` guard ensures initial connection does not fire cache invalidation, only true reconnects trigger it

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- WS-01 satisfied: Client detects silently-dead connection within 22 seconds (10s + 12s), well within the 25s budget
- WS-03 satisfied: After reconnect, all issue list and detail caches are flushed so missed events are recovered by re-fetch
- No timer leaks: clearHeartbeat called in onclose, onmessage, and effect cleanup
- No cross-socket contamination: deadline timer checks `socket !== nextSocket` before calling close

---
*Phase: 14-websocket-optimization*
*Completed: 2026-04-06*
