---
phase: 03-owner-team-visibility
plan: 02
subsystem: ui
tags: [react, assignee-picker, grouped-list, team-members, ai-agents]

# Dependency graph
requires:
  - phase: 03-01
    provides: accessApi.listMembers, CompanyMember type, queryKeys.access.members

provides:
  - InlineEntitySelector OptionGroup interface and groups prop (grouped dropdown rendering)
  - NewIssueDialog grouped assignee picker with Team Members and AI Agents sections
  - IssueProperties grouped assignee picker with Team Members and AI Agents headings

affects:
  - 03-03-verify
  - any future component using InlineEntitySelector that needs grouped options

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OptionGroup pattern: groups prop on selector components flatMaps options for keyboard nav/search while rendering labelled sections visually"
    - "useMemo for member-filtered assignee groups: exclude currentUserId from Team Members to avoid duplication with Me option"

key-files:
  created: []
  modified:
    - ui/src/components/InlineEntitySelector.tsx
    - ui/src/components/NewIssueDialog.tsx
    - ui/src/components/IssueProperties.tsx

key-decisions:
  - "InlineEntitySelector groups prop uses flatMap into allOptions to keep existing keyboard nav and search logic unchanged - only rendering path diverges"
  - "currentOption lookup extended to search group options when groups prop is active - required for trigger button to display selected grouped option"
  - "NewIssueDialog: exclude currentUserId from Team Members group (already shown as Me via currentUserAssigneeOption) to prevent duplicate entry"
  - "IssueProperties: exclude both currentUserId and issue.createdByUserId from Team Members loop - each has a dedicated button above the group list"
  - "IssueProperties uses inline JSX group for Team Members rather than InlineEntitySelector groups prop - component uses a custom popover picker pattern, not InlineEntitySelector"

patterns-established:
  - "OptionGroup: export interface from InlineEntitySelector for reuse across grouped picker use cases"
  - "Grouped picker: render None option first, then labelled group divs, each filtered by filteredIds set for consistent search behavior"

requirements-completed:
  - ASGN-01
  - ASGN-02

# Metrics
duration: 11min
completed: 2026-04-04
---

# Phase 03 Plan 02: Grouped Assignee Picker Summary

**InlineEntitySelector extended with OptionGroup groups prop; NewIssueDialog and IssueProperties now show human team members in a labelled "Team Members" section above AI agents in the assignee picker**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-04T00:31:52Z
- **Completed:** 2026-04-04T00:42:55Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- InlineEntitySelector exports `OptionGroup` interface and accepts optional `groups` prop, rendering group headings when provided while keeping flat rendering backward-compatible
- NewIssueDialog uses `accessApi.listMembers` to fetch active human members and groups them under "Team Members" (excluding current user to avoid duplication with the "Me" entry) alongside agents under "AI Agents"
- IssueProperties renders a "Team Members" section with human members (excluding current user and requester who each have dedicated buttons) and an "AI Agents" heading above the sorted agents list; search filters both groups

## Task Commits

1. **Task 1: Extend InlineEntitySelector with optional groups prop** - `74e93eb8` (feat)
2. **Task 2: Add grouped assignee picker to NewIssueDialog and IssueProperties** - `811055c9` (feat)

**Plan metadata:** `(pending)`

## Files Created/Modified

- `ui/src/components/InlineEntitySelector.tsx` - Added `OptionGroup` export, `groups` prop, updated `allOptions`/`currentOption` memos, extracted `renderOptionButton`, conditional grouped/flat rendering
- `ui/src/components/NewIssueDialog.tsx` - Added `accessApi.listMembers` query, replaced flat `assigneeOptions` memo with `assigneeGroups: OptionGroup[]`, switched InlineEntitySelector to `groups={assigneeGroups}`
- `ui/src/components/IssueProperties.tsx` - Added `accessApi.listMembers` query + `humanMembers` memo, inserted Team Members group heading and buttons in `assigneeContent`, inserted AI Agents heading before agent list

## Decisions Made

- `currentOption` lookup in InlineEntitySelector was extended to also search through group options when `groups` is active — without this, the trigger button would show blank when a grouped option is selected
- IssueProperties uses inline JSX (not InlineEntitySelector groups prop) for its assignee picker because it has a bespoke popover with custom button styles, dedicated "Assign to me"/"Assign to requester" buttons, and its own search input; adding the groups prop there would have required refactoring more than the plan scope
- Team Members group in NewIssueDialog: `currentUserAssigneeOption(currentUserId)` provides the "Me" entry; members query is additionally filtered to `principalId !== currentUserId` so the current user does not appear twice

## Deviations from Plan

None - plan executed exactly as written, with one small addition: extended `currentOption` lookup to cover grouped options (required for the trigger button to correctly display the selected value when groups is active — straightforward correctness fix, Rule 1).

## Issues Encountered

- `pnpm` was not on PATH; found and used the project-local `node_modules/.bin/vitest` directly for test runs. All 164 tests passed after both tasks.

## Next Phase Readiness

- InlineEntitySelector groups API is ready for reuse in any future grouped picker
- Phase 03 plan 03 (verification/QA checkpoint) can proceed — all code changes are committed and tests pass
- Manual verification still needed: open NewIssueDialog and IssueProperties, confirm "Team Members" and "AI Agents" headings appear, confirm selecting a human member assigns correctly

---
*Phase: 03-owner-team-visibility*
*Completed: 2026-04-04*
