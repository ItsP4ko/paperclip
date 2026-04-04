---
phase: 02-task-work-surface
plan: 03
subsystem: api, ui
tags: [permissions, member-gate, express, react, vitest, tdd]

# Dependency graph
requires:
  - phase: 02-task-work-surface
    provides: "HumanActionBar, assignee patch utility, IssuesList filter infrastructure"
provides:
  - "PERM-01/PERM-02: server-side member permission gate in PATCH /issues/:id"
  - "TASKS-03: 'Assigned to me' toggle pill in IssuesList filter toolbar"
  - "Integration tests for permission gate (5 test cases)"
affects: [future permission logic, IssuesList filter extensions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Permission gate pattern: local_implicit / isInstanceAdmin early exit, then getMembership check, then isOwner check"
    - "TDD RED→GREEN: test file committed before implementation; UUID IDs required in route tests to avoid router.param normalizer"

key-files:
  created:
    - server/src/__tests__/issue-member-permission.test.ts
  modified:
    - server/src/routes/issues.ts
    - ui/src/components/IssuesList.tsx

key-decisions:
  - "Test IDs must be UUIDs in issue route tests — router.param normalizer fires for any string matching [A-Z]+-\\d+ and calls svc.getByIdentifier which must be mocked"
  - "Permission gate placed after assertCompanyAccess, before assigneeWillChange — gate fires on all field mutations, not just assignee changes"
  - "'Assigned to me' pill placed as standalone row below main toolbar (outside popover) — always visible without opening Filter panel"

patterns-established:
  - "Pattern: route-level permission gate uses access.getMembership(companyId, 'user', userId) — same service used by assertCanAssignTasks"
  - "Pattern: local_implicit / isInstanceAdmin bypass comes before any DB call — matches authz.ts assertCompanyAccess pattern"

requirements-completed: [PERM-01, PERM-02, TASKS-03]

# Metrics
duration: 11min
completed: 2026-04-03
---

# Phase 02 Plan 03: Member Permission Gate and Assigned-to-me Filter Summary

**Server-side member permission gate (PERM-01/PERM-02) blocks non-owner members from mutating other users' tasks, with TDD integration tests; standalone 'Assigned to me' toggle pill added to IssuesList toolbar**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-03T23:27:27Z
- **Completed:** 2026-04-03T23:38:33Z
- **Tasks:** 2 (Task 1 TDD: 3 commits; Task 2: 1 commit)
- **Files modified:** 3

## Accomplishments

- Permission gate in `PATCH /issues/:id` blocks non-owner board members from mutating tasks assigned to other users, returning 403 with "Members can only mutate their own tasks"
- Owners, `local_implicit` actors, and `isInstanceAdmin` actors bypass the gate entirely without a getMembership DB call
- 5 integration tests via TDD (RED→GREEN) cover all gate paths: 403 for non-owner, 200 for own task, 200 for owner, 200 for local_implicit bypass, 200 for agent (gate skipped)
- "Assigned to me" pill renders in IssuesList filter toolbar with correct active/inactive styling, `aria-pressed` for accessibility, toggles `__me` in `viewState.assignees` on click

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing permission gate tests** - `98bd434c` (test)
2. **Task 1 GREEN: Permission gate implementation** - `e20db94f` (feat)
3. **Task 2: "Assigned to me" toggle pill** - `0f667b2f` (feat)

## Files Created/Modified

- `server/src/__tests__/issue-member-permission.test.ts` - 5 integration tests for PERM-01/PERM-02 gate covering all actor types and ownership scenarios
- `server/src/routes/issues.ts` - Permission gate block inserted after `assertCompanyAccess`, before `assigneeWillChange` logic (lines 1042-1058)
- `ui/src/components/IssuesList.tsx` - "Assigned to me" pill added as standalone row below main toolbar, visible when `currentUserId` is truthy

## Decisions Made

- Test issue IDs must be UUIDs (e.g. `11111111-1111-4111-8111-111111111111`) — the `router.param("id", ...)` normalizer at line 261 runs `getByIdentifier` for any ID matching `[A-Z]+-\d+` (e.g. `"issue-1"` matches), causing 500 if `getByIdentifier` is not mocked
- The `"Assigned to me"` pill is placed as a secondary row OUTSIDE the Filter popover (visible always) rather than inside it — makes the most common personal filter one-click accessible

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test IDs to use UUIDs to avoid router.param normalizer crash**
- **Found during:** Task 1 (TDD RED phase)
- **Issue:** Test used `"issue-1"` as the issue ID; the `router.param("id", ...)` normalizer at line 261 matches `[A-Z]+-\d+` pattern on this string and calls `svc.getByIdentifier` which was not mocked, causing 500
- **Fix:** Changed all test issue IDs to RFC 4122 UUIDs (`11111111-1111-4111-8111-111111111111`) and added `getByIdentifier: vi.fn()` to the mock
- **Files modified:** `server/src/__tests__/issue-member-permission.test.ts`
- **Committed in:** `98bd434c` (part of RED phase commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Required to make tests work at all; no scope creep.

## Issues Encountered

- Initial TDD RED phase produced 500 errors (not 403/200 as expected) due to the `router.param` normalizer calling an unmocked `getByIdentifier` function. Diagnosed via a temporary debug test that captured the thrown error message.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PERM-01/PERM-02 permission gate is live in the PATCH handler; production auth will replace the bypass when real sessions are enforced
- TASKS-03 "Assigned to me" pill is functional; the `__me` sentinel filtering was already implemented in `applyFilters` at line 104
- Phase 02 is now fully complete (all 3 plans done)

---
*Phase: 02-task-work-surface*
*Completed: 2026-04-03*
