---
phase: 01-identity-membership-my-tasks-foundation
plan: 03
subsystem: api
tags: [drizzle-orm, express, typescript, vitest, sidebar, badges, issues]

# Dependency graph
requires:
  - phase: 01-identity-membership-my-tasks-foundation
    provides: "SidebarNavItem reads badges?.myTasks (Plan 01), issues table with assigneeUserId column (schema)"
provides:
  - "SidebarBadges interface includes myTasks: number field in shared types"
  - "sidebarBadgeService passes myTasks through from extra parameter"
  - "sidebar-badges route computes myTasks count for board actors via issues table query"
  - "sidebar-badges.test.ts validates myTasks field presence and guard behavior"
affects:
  - ui-sidebar-my-tasks-badge
  - 02-my-tasks-ui

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Actor-gated count query: if req.actor.type === 'board' && req.actor.userId, run db query; else default to 0"
    - "Service extra param passthrough: optional fields in extra? object default to 0 if not provided"

key-files:
  created:
    - server/src/__tests__/sidebar-badges.test.ts
  modified:
    - packages/shared/src/types/sidebar-badges.ts
    - server/src/services/sidebar-badges.ts
    - server/src/routes/sidebar-badges.ts

key-decisions:
  - "myTasks is NOT added to inbox sum — it is a separate counter on the My Tasks nav item, not an inbox component"
  - "myTasksCount guarded by req.actor.type === 'board' && req.actor.userId — agents always get 0"
  - "Test uses chainable mock db (thenable chain) instead of full db mock to handle drizzle query chains in route"

patterns-established:
  - "Chainable mock db pattern: select/from/where chain with .then() for route-level db query tests"

requirements-completed: [TASKS-04]

# Metrics
duration: 4min
completed: 2026-04-03
---

# Phase 01 Plan 03: Sidebar Badges myTasks Count Summary

**myTasks badge count wired end-to-end: issues table query for board actors, passthrough in service, SidebarBadges type updated**

## Performance

- **Duration:** 3m 59s
- **Started:** 2026-04-03T19:06:22Z
- **Completed:** 2026-04-03T19:10:21Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added `myTasks: number` field to `SidebarBadges` shared type (completing the contract for `badges?.myTasks` already read in Sidebar.tsx)
- Updated `sidebarBadgeService` to accept and pass through `myTasks` from the `extra` parameter with default 0
- Added `myTasksCount` query to the sidebar-badges route: counts non-done/non-cancelled issues assigned to current board user
- Created `sidebar-badges.test.ts` with 3 tests covering myTasks field type, board actor passthrough, and agent actor 0-guard

## Task Commits

Each task was committed atomically:

1. **Task 1: Add myTasks field to SidebarBadges type and update service** - `26eb6307` (feat)
2. **Task 2: Write sidebar-badges test (TDD) and add myTasks count query to route** - `11ac4825` (feat)

**Plan metadata:** _(to be added in final commit)_

_Note: Task 2 was a TDD task — RED phase confirmed 2 failing tests before route changes; GREEN phase confirmed all 3 tests pass after route update._

## Files Created/Modified
- `packages/shared/src/types/sidebar-badges.ts` - Added `myTasks: number` to SidebarBadges interface
- `server/src/services/sidebar-badges.ts` - Added `myTasks?: number` to extra param; returns `myTasks: extra?.myTasks ?? 0`
- `server/src/routes/sidebar-badges.ts` - Added issues import, inArray/not from drizzle-orm, myTasksCount query with board actor guard, passes myTasks to svc.get
- `server/src/__tests__/sidebar-badges.test.ts` - New: 3 unit tests for myTasks field presence, board actor passthrough, agent actor 0-guard

## Decisions Made
- myTasks is not added to the inbox sum — it is a separate badge on the My Tasks nav item, not an inbox notification counter
- myTasksCount is only computed for board actors with a userId; agent actors always receive 0 (mirrors the canApproveJoins pattern)
- Test used a chainable mock db (thenable select/from/where chain) to handle drizzle query chains directly in the route handler without full db mocking

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Initial test for agent actor used wrong actor shape (missing companyId field), causing 403 from assertCompanyAccess. Fixed by providing agent actor with `companyId` (singular, not `companyIds`) to match the authz check.
- Tests returned 500 for board actor cases because the route calls db.select() directly but the db was passed as `{}`. Fixed by creating a chainable mock db with thenable support.

Both issues were test infrastructure problems resolved within Task 2 execution. No planned code was changed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 01 Plan 03 completes Phase 01 (identity-membership-my-tasks-foundation). All 3 plans complete.
- The sidebar My Tasks badge now has its backend count source. Sidebar.tsx already reads `badges?.myTasks` (shipped in Plan 01) and will show the pill once the API returns a non-zero value.
- Phase 02 (my-tasks-ui) can proceed to build the My Tasks page/route.

---
*Phase: 01-identity-membership-my-tasks-foundation*
*Completed: 2026-04-03*
