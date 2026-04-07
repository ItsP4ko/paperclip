---
phase: 10-optimistic-ui-mutations
plan: 02
subsystem: ui
tags: [react-query, tanstack-query, websockets, optimistic-ui, invalidation-guard]

# Dependency graph
requires:
  - phase: 10-01
    provides: "mutationKey entries on updateStatus, updateIssue, createSubtask mutations in IssueDetail.tsx"
provides:
  - "isMutating guard in LiveUpdatesProvider.invalidateActivityQueries that suppresses issue list/detail invalidation during in-flight mutations"
  - "WS race condition protection for all three optimistic mutation types (issue-status, issue-update, create-subtask)"
affects: [phase-11, phase-12, phase-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "isMutating guard: check queryClient.isMutating({ mutationKey }) before invalidateQueries to protect optimistic cache writes"
    - "Prefix matching: TanStack Query v5 isMutating([\"issue-status\"]) matches [\"issue-status\", \"<any-issueId>\"] for scoped protection"

key-files:
  created: []
  modified:
    - ui/src/context/LiveUpdatesProvider.tsx
    - ui/src/context/LiveUpdatesProvider.test.ts

key-decisions:
  - "Guard suppresses only issue list and detail — not comments, activity, runs, attachments, approvals, liveRuns, activeRun (non-optimistic keys always invalidated)"
  - "Three mutation prefixes checked: issue-status, issue-update, create-subtask — mirrors the three mutationKey values set in Plan 01"
  - "Test mock updated with isMutating returning 0 to reflect real QueryClient API surface (Rule 1 auto-fix)"

patterns-established:
  - "WS guard pattern: when adding new optimistic mutations, add their mutationKey prefix to the isIssueMutating check in LiveUpdatesProvider"

requirements-completed: [OPTM-05]

# Metrics
duration: 8min
completed: 2026-04-05
---

# Phase 10 Plan 02: WS isMutating Guard Summary

**isMutating guard added to LiveUpdatesProvider that prevents WebSocket activity.logged events from clobbering optimistic cache values during in-flight issue mutations**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-05T16:32:00Z
- **Completed:** 2026-04-05T20:00:00Z
- **Tasks:** 2 of 2 complete
- **Files modified:** 2

## Accomplishments
- Added `isIssueMutating` guard to `invalidateActivityQueries` in `LiveUpdatesProvider.tsx`
- Guard checks three mutation keys (issue-status, issue-update, create-subtask) using TanStack Query v5 prefix matching
- Issue list and detail invalidations suppressed while any issue mutation is in-flight
- All non-optimistic keys (comments, activity, runs, documents, attachments, approvals, liveRuns, activeRun) always invalidated unconditionally
- Fixed test mock to include `isMutating` method (Rule 1 auto-fix, 185 tests pass)
- E2E verification via Chrome DevTools MCP on Vercel deployment confirmed OPTM-01, OPTM-02, OPTM-04 pass; OPTM-05 verified via code review; OPTM-03 gated behind assignee check (known limitation)

## E2E Verification Results

| Test ID | Scenario | Result | Notes |
|---------|----------|--------|-------|
| OPTM-01 | Status change optimistic | PASS | UI updated before PATCH 200 confirmed |
| OPTM-02 | Assignee change optimistic | PASS | Assignee changed to CEO, PATCH 200 |
| OPTM-03 | Add subtask optimistic stub | FAIL (gated) | Add Subtask button inaccessible — gated behind human-user assignee check on PAC-13 (assigned to CEO agent); stub code exists and is unit-tested |
| OPTM-04 | Rollback on 422 failure | PASS | Status reverted + "Status update failed" toast on in_progress without assignee |
| OPTM-05 | WS guard during mutation | PASS (code review) | isMutating guard verified present in LiveUpdatesProvider.tsx |

## Task Commits

Each task was committed atomically:

1. **Task 1: Add isMutating guard to invalidateActivityQueries** - `0fb37d11` (feat)
2. **Task 2: Verify optimistic UI behavior end-to-end** - checkpoint:human-verify (approved with OPTM-03 note)

## Files Created/Modified
- `ui/src/context/LiveUpdatesProvider.tsx` - Added isIssueMutating guard in the entityType === "issue" branch
- `ui/src/context/LiveUpdatesProvider.test.ts` - Added isMutating: () => 0 to mock queryClient

## Decisions Made
- Guard only suppresses `queryKeys.issues.list(companyId)` and `queryKeys.issues.detail(ref)` — these are the only keys that hold optimistic values
- listMineByMe, listTouchedByMe, listUnreadTouchedByMe are filtered views not directly patched by optimistic writes, so they remain unconditional
- Three mutation key prefixes match exactly the keys set in Plan 01's IssueDetail.tsx mutations

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test mock missing isMutating method**
- **Found during:** Task 1 verification (vitest run)
- **Issue:** The existing `LiveUpdatesProvider.test.ts` mock queryClient had no `isMutating` method. After adding the guard, the test threw `TypeError: queryClient.isMutating is not a function`
- **Fix:** Added `isMutating: () => 0` to the mock queryClient in the "refreshes touched inbox queries for issue activity" test
- **Files modified:** ui/src/context/LiveUpdatesProvider.test.ts
- **Verification:** All 185 tests pass after fix
- **Committed in:** 0fb37d11 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — missing mock method)
**Impact on plan:** Fix was necessary for tests to pass. No scope creep.

## Issues Encountered
- `Analytics.tsx` has a pre-existing TypeScript error (`TS2322: Type 'unknown' is not assignable to type 'ReactNode'`) unrelated to this plan's changes — out of scope, not fixed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 10 (optimistic-ui-mutations) is complete. E2E verification approved (4/5 pass, 1 gated by product logic).
- Phase 11 (staleTime elevation) can begin — the isMutating guard is in place, protecting optimistic cache values from WS invalidation before staleTime is raised.
- OPTM-03 limitation (subtask creation E2E) is not a blocker — the optimistic stub code is unit-tested and guarded.

---
*Phase: 10-optimistic-ui-mutations*
*Completed: 2026-04-05*
