---
phase: 02-task-work-surface
plan: 01
subsystem: ui
tags: [react, typescript, vitest, tdd, assignee, dialog, shadcn]

# Dependency graph
requires: []
provides:
  - resolveAssigneePatch utility exported from ui/src/lib/assignees.ts
  - Reassignment warning dialog in IssueProperties.tsx gating AI-to-human reassignment
affects:
  - 02-task-work-surface
  - Any component that patches assignee fields

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Atomic assignee patch: always send both assigneeAgentId and assigneeUserId null-coerced in every PATCH"
    - "Interceptor pattern: handleAssigneeChange wraps onUpdate to gate dangerous reassignments"
    - "TDD red-green cycle for pure utility functions"

key-files:
  created:
    - "ui/src/lib/assignees.test.ts (extended with resolveAssigneePatch and parseAssigneeValue describe blocks)"
  modified:
    - "ui/src/lib/assignees.ts"
    - "ui/src/components/IssueProperties.tsx"

key-decisions:
  - "resolveAssigneePatch is a semantic alias of parseAssigneeValue — same logic, clearer name for PATCH call sites"
  - "Warning dialog fires only when all three conditions hold: issue has assigneeAgentId set, status is in_progress, and new target is a human user"
  - "confirmReassign delegates entirely to resolveAssigneePatch to guarantee both assignee fields are always sent together"

patterns-established:
  - "Pattern 1: Use resolveAssigneePatch at every assignee PATCH call site to prevent 422 only-one-assignee errors"
  - "Pattern 2: Intercept UI callbacks with a gate function before propagating to onUpdate for destructive operations"

requirements-completed: [ACTN-04, ACTN-05, ASGN-03]

# Metrics
duration: 5min
completed: 2026-04-03
---

# Phase 02 Plan 01: Assignee Patch Utility and Reassignment Warning Dialog Summary

**resolveAssigneePatch utility with TDD tests plus IssueProperties reassignment warning dialog that gates AI-to-human reassignment with shadcn Dialog confirmation**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-03T20:19:03Z
- **Completed:** 2026-04-03T20:22:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Exported `resolveAssigneePatch` from `assignees.ts` — null-safe atomic patch utility preventing the 422 "only one assignee" error
- Added 8 new tests (6 for `resolveAssigneePatch`, 2 `parseAssigneeValue` regression) using TDD red-green cycle; all 16 tests in the file pass
- Added `handleAssigneeChange` interceptor and `confirmReassign` to `IssueProperties.tsx` with shadcn Dialog showing "Interrupt AI task?" warning before human reassignment of an active AI run

## Task Commits

Each task was committed atomically:

1. **Task 1: Add resolveAssigneePatch utility with TDD tests** - `2893eab9` (feat)
2. **Task 2: Add reassignment warning dialog to IssueProperties** - `178d10e2` (feat)

**Plan metadata:** (see final commit below)

_Note: Task 1 followed full TDD red-green cycle: tests committed failing, then function added to make them pass._

## Files Created/Modified
- `ui/src/lib/assignees.ts` - Added `export function resolveAssigneePatch` (13 lines)
- `ui/src/lib/assignees.test.ts` - Added `describe("resolveAssigneePatch")` (6 cases) and `describe("parseAssigneeValue")` (2 regression cases)
- `ui/src/components/IssueProperties.tsx` - Added imports, `pendingReassign` state, `handleAssigneeChange` / `confirmReassign` helpers, Dialog JSX; replaced 4 assignee `onUpdate` calls with `handleAssigneeChange`

## Decisions Made
- `resolveAssigneePatch` is a semantic alias of `parseAssigneeValue` — same null-coercion logic, more descriptive name for PATCH call sites so readers understand the intent without reading the implementation
- Warning dialog fires only when three conditions are simultaneously true: `issue.assigneeAgentId` is set, `issue.status === "in_progress"`, and the new target has `assigneeUserId != null` with `assigneeAgentId === null` — this avoids false positives for unassign or agent-to-agent reassignments
- Wrapped the return value in a React fragment to house the Dialog alongside the existing `<div>` without introducing an extra DOM wrapper

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `pnpm` is not in the shell PATH; used `node_modules/.bin/vitest` directly from the monorepo root to run tests. The `company-import-export-e2e.test.ts` (CLI package) fails for the same reason in all test runs — this is a pre-existing infrastructure issue unrelated to this plan.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `resolveAssigneePatch` is ready for use in any PATCH call site across the codebase
- The reassignment warning dialog is live in `IssueProperties`; no backend changes required for this plan
- Next plans in Phase 02 can safely import `resolveAssigneePatch` from `@/lib/assignees`

---
*Phase: 02-task-work-surface*
*Completed: 2026-04-03*

## Self-Check: PASSED

- FOUND: ui/src/lib/assignees.ts
- FOUND: ui/src/lib/assignees.test.ts
- FOUND: ui/src/components/IssueProperties.tsx
- FOUND: .planning/phases/02-task-work-surface/02-01-SUMMARY.md
- FOUND: commit 2893eab9 (feat(02-01): add resolveAssigneePatch utility with TDD tests)
- FOUND: commit 178d10e2 (feat(02-01): add reassignment warning dialog to IssueProperties)
