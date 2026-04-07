---
phase: 02-task-work-surface
plan: "02"
subsystem: ui
tags: [react, tanstack-query, mutation, lucide-react, tdd, vitest]

requires: []
provides:
  - HumanActionBar section in IssueDetail with status change, file attach, and subtask creation controls
  - Conditional render gated on issue.assigneeUserId === currentUserId
  - 3 vitest tests confirming conditional render behavior
affects: [02-task-work-surface, future-phases-using-IssueDetail]

tech-stack:
  added: []
  patterns:
    - "Separate named mutations (updateStatus, humanBarUploadAttachment, createSubtask) alongside the existing general updateIssue mutation for clarity"
    - "TDD harness component pattern: test the conditional logic via a small HumanActionBarHarness without mocking the full IssueDetail provider tree"
    - "humanBarFileInputRef as a second hidden file input ref — avoids colliding with the existing fileInputRef used for the drag-and-drop upload zone"

key-files:
  created:
    - ui/src/components/__tests__/HumanActionBar.test.tsx
  modified:
    - ui/src/pages/IssueDetail.tsx

key-decisions:
  - "Used issue.companyId directly (not selectedCompanyId) for humanBarUploadAttachment and createSubtask — per plan spec; issue is always loaded before HumanActionBar renders"
  - "Introduced humanBarFileInputRef (separate from fileInputRef) to avoid conflicting with the existing full-feature upload zone and its markdown/multi-file handling"
  - "updateStatus mutation is distinct from updateIssue — named clearly so the HumanActionBar intent is self-documenting in code"

patterns-established:
  - "HumanActionBar guard: {issue.assigneeUserId === currentUserId && currentUserId && ( ... )} — zero render when agent-assigned or different user"
  - "Inline error rendering via uploadError and subtaskError state, displayed below the action bar"

requirements-completed: [ACTN-01, ACTN-02, ACTN-03]

duration: 6min
completed: 2026-04-03
---

# Phase 02 Plan 02: Human Action Bar Summary

**HumanActionBar added to IssueDetail with StatusIcon picker, hidden file input for attachment upload (issue.companyId), and inline subtask creation (parentId + status: "todo"), gated on assigneeUserId === currentUserId**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-03T23:18:00Z
- **Completed:** 2026-04-03T23:24:18Z
- **Tasks:** 1 (TDD: test commit + feat commit)
- **Files modified:** 2

## Accomplishments

- 3 vitest tests confirming conditional render: shows for assigned user, hidden for different user, hidden for agent-assigned issue
- HumanActionBar JSX section in IssueDetail rendered only when `issue.assigneeUserId === currentUserId && currentUserId`
- Status change via `updateStatus` mutation wired to `StatusIcon` with `showLabel`
- File attach via `humanBarUploadAttachment` mutation using `issue.companyId`, triggered via a dedicated hidden `<input type="file">`
- Add subtask via `createSubtask` mutation using `issue.companyId` and `parentId: issueId!, status: "todo"`
- Inline error states for upload failures and subtask creation failures
- All 866 existing tests still pass

## Task Commits

1. **RED - HumanActionBar.test.tsx** - `16044c68` (test)
2. **GREEN - IssueDetail.tsx HumanActionBar section** - `8699aae5` (feat)

## Files Created/Modified

- `ui/src/components/__tests__/HumanActionBar.test.tsx` - 3 conditional-render unit tests using a harness component
- `ui/src/pages/IssueDetail.tsx` - Added imports, state vars, 3 mutations, HumanActionBar JSX block

## Decisions Made

- Used `issue.companyId` directly (not `selectedCompanyId`) for both the upload and subtask mutations — the issue is always loaded before HumanActionBar renders, so this is safe and aligns with plan spec
- Added `humanBarFileInputRef` as a second hidden file input ref to avoid conflicting with the existing `fileInputRef` used for drag-and-drop uploads (which also handles markdown import and multi-file)
- `updateStatus` is a named mutation distinct from `updateIssue` for clarity in intent; both ultimately call `issuesApi.update`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The test harness approach (self-contained `HumanActionBarHarness` in the test file) worked cleanly — no provider mocking needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- HumanActionBar is live in IssueDetail and gated correctly on assignee identity
- All three ACTN requirements (status change, file attach, subtask creation) are wired to existing API methods
- Ready for 02-03 (next plan in phase 02-task-work-surface)

---
*Phase: 02-task-work-surface*
*Completed: 2026-04-03*
