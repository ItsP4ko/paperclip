---
phase: 01-identity-membership-my-tasks-foundation
plan: 02
subsystem: api, ui
tags: [drizzle, left-join, react, tanstack-query, invite, members]

# Dependency graph
requires:
  - phase: 01-identity-membership-my-tasks-foundation
    provides: access service factory pattern and createCompanyInvite API
provides:
  - listMembers returns userDisplayName and userEmail via LEFT JOIN on authUsers
  - CompanySettings human invite section with generate + copy flow
affects: [members-list consumers, CompanySettings, IDENT-01, IDENT-02, IDENT-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "LEFT JOIN authUsers on principalType=user + principalId — null for non-user principals"
    - "useMutation pattern for invite generation with inline error state"

key-files:
  created:
    - server/src/__tests__/access-list-members.test.ts
  modified:
    - server/src/services/access.ts
    - ui/src/pages/CompanySettings.tsx

key-decisions:
  - "listMembers explicit select block preserves all companyMemberships columns and adds userDisplayName/userEmail"
  - "Human invite card placed inside existing Invites space-y-4 section after OpenClaw card, not as a new section"

patterns-established:
  - "accessService LEFT JOIN pattern: join on principalType literal + principalId to authUsers.id"
  - "Invite generation UI: state vars + useMutation + error/URL display + clipboard copy with 2s delight"

requirements-completed: [IDENT-01, IDENT-02, IDENT-04]

# Metrics
duration: 6min
completed: 2026-04-03
---

# Phase 01 Plan 02: Members API User Identity + Human Invite Link Summary

**listMembers LEFT JOIN to authUsers returning userDisplayName/userEmail, plus Human Invite Link generator in CompanySettings**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-03T18:57:57Z
- **Completed:** 2026-04-03T19:03:58Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Extended `accessService.listMembers` with explicit SELECT and LEFT JOIN to `authUsers`, returning `userDisplayName` and `userEmail` for human members and `null` for agent/board principals
- Added unit test (3 cases) asserting query shape, null for non-user rows, and leftJoin call presence
- Added Human Invite section to CompanySettings inside the existing Invites container: generates a `allowedJoinTypes: "human"` invite via `createCompanyInvite`, displays the URL in a read-only input, and provides a copy button with 2-second "Copied" delight state

## Task Commits

Each task was committed atomically:

1. **Task 1: listMembers LEFT JOIN + unit test** - `9dbecb2c` (feat + test via TDD)
2. **Task 2: Human invite section in CompanySettings** - `916aace0` (feat)

**Plan metadata:** (docs commit follows)

_Note: Task 1 used TDD — test written first (RED), then implementation (GREEN), single commit captures both._

## Files Created/Modified

- `server/src/__tests__/access-list-members.test.ts` - Unit test for listMembers query shape (3 tests)
- `server/src/services/access.ts` - Added `authUsers` import + LEFT JOIN in `listMembers`
- `ui/src/pages/CompanySettings.tsx` - Added human invite state, mutation, and JSX card

## Decisions Made

- Used explicit `.select({...})` in listMembers to enumerate all companyMemberships columns — ensures no columns are silently dropped vs the original `select()` wildcard, while adding the two new JOIN fields
- Human invite card placed inside the existing `<div className="space-y-4">` Invites section (after the OpenClaw card's closing div) rather than as a separate top-level section — matches plan spec and visual consistency
- TDD commits collapsed to a single task commit (RED test + GREEN impl) since they are tightly coupled and the test file was new

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `pnpm vitest run --project server` and `--project ui` both failed with "No projects matched" — root vitest config defines projects by directory path, not package name. Resolved by running `vitest run server/src/...` and `vitest run ui/src` directly. No code changes needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- listMembers now returns user identity fields — Plan 03 can display member names and emails in the members list UI
- Human invite generation is live — owner can generate and share invite links immediately
- InviteLandingPage already handles human join flow (IDENT-02) — no backend changes needed

---
*Phase: 01-identity-membership-my-tasks-foundation*
*Completed: 2026-04-03*

## Self-Check: PASSED

- server/src/services/access.ts: FOUND
- server/src/__tests__/access-list-members.test.ts: FOUND
- ui/src/pages/CompanySettings.tsx: FOUND
- .planning/phases/01-identity-membership-my-tasks-foundation/01-02-SUMMARY.md: FOUND
- commit 9dbecb2c: FOUND
- commit 916aace0: FOUND
