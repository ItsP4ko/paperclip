---
phase: 03-owner-team-visibility
plan: "03"
subsystem: ui
tags: [react, tanstack-query, lucide-react, workload, org-chart]

# Dependency graph
requires:
  - phase: 03-owner-team-visibility
    provides: "accessApi.listMembers and CompanyMember type, queryKeys.access.members from Plan 01"
provides:
  - "Org page Team Members section showing human members with open issue counts"
  - "AI Agents section heading wrapping existing OrgTree for visual parity"
  - "MemberWorkloadRow component with per-member live workload query"
affects: [03-owner-team-visibility]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-row query pattern: each MemberWorkloadRow issues its own useQuery for workload counts rather than batching — simple and correct for small teams"
    - "Graceful permission degradation: members query fails silently for non-owners, section simply does not render"

key-files:
  created: []
  modified:
    - ui/src/pages/Org.tsx

key-decisions:
  - "MemberWorkloadRow uses inline useQuery per row rather than a bulk fetch — avoids N+1 concern at small scale and keeps component self-contained"
  - "Breadcrumb updated from 'Org Chart' to 'Team' to reflect the expanded scope of the page"
  - "EmptyState message updated to reference both agents and humans since the page now covers both"

patterns-established:
  - "AI Agents and Team Members sections use identical visual structure (icon + heading + bordered card) for consistent owner dashboard aesthetics"

requirements-completed: [TEAM-01, TEAM-02]

# Metrics
duration: 2min
completed: 2026-04-04
---

# Phase 03 Plan 03: Owner Team Visibility - Org Page Team Members Summary

**Org page now shows AI Agents and Team Members sections side-by-side, each with per-member open issue counts drawn live from issuesApi**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-04T00:45:19Z
- **Completed:** 2026-04-04T00:47:03Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `MemberWorkloadRow` component that fetches open issue count per human member via `issuesApi.list({ assigneeUserId })`
- Added `members` query using `accessApi.listMembers` filtered to `principalType === "user" && status === "active"`
- Wrapped existing OrgTree in an "AI Agents" section with visual heading to match new "Team Members" section
- Updated EmptyState to account for both sections being empty before showing the no-team message
- Updated breadcrumb from "Org Chart" to "Team"

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Team Members section with workload counts to Org.tsx** - `fc6f77c0` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `ui/src/pages/Org.tsx` - Added MemberWorkloadRow component, members query, AI Agents + Team Members sections, updated EmptyState and breadcrumb

## Decisions Made
- Per-row query pattern (each MemberWorkloadRow fetches its own issues) — simple, correct for small teams, self-contained component
- No owner gate on the members query — server-side permission check handles access; section gracefully absent for non-owners
- Breadcrumb changed to "Team" since the page now covers humans and AI agents equally

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None — all acceptance criteria met on first write. 164 tests pass with no regressions.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 03 is now complete: all three plans shipped (API list endpoint, frontend API + query keys, Org page UI)
- Owners can navigate to /org and immediately see their full team — AI agents with status and human members with workload counts
- No blockers for subsequent phases

---
*Phase: 03-owner-team-visibility*
*Completed: 2026-04-04*
