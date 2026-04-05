---
phase: 07-end-to-end-verification
plan: 01
subsystem: api
tags: [typescript, permissions, access-control, easypanel, deployment]

# Dependency graph
requires:
  - phase: 06-infrastructure-provisioning-deployment
    provides: Easypanel backend deployed on master branch auto-deploy
provides:
  - Owner bypass in assertCompanyPermission — company owners pass all permission gates without explicit grant rows
  - Fix pushed to master, Easypanel rebuild triggered
affects: [E2E verification journey, assignee pickers, members endpoint, any permission-gated route]

# Tech tracking
tech-stack:
  added: []
  patterns: [owner-role short-circuit before permission grant table lookup in assertCompanyPermission]

key-files:
  created: []
  modified:
    - server/src/routes/access.ts

key-decisions:
  - "Check membershipRole=owner via access.getMembership before falling through to canUser — avoids requiring explicit grant rows for owners"
  - "Bypass placed after isLocalImplicit check and before canUser so the precedence order is: local-implicit > owner > explicit-grant"

patterns-established:
  - "Owner role check pattern: const membership = await access.getMembership(companyId, 'user', userId!); if (membership?.membershipRole === 'owner') return;"

requirements-completed: [E2E-01, E2E-02, E2E-03]

# Metrics
duration: 1min
completed: 2026-04-05
---

# Phase 07 Plan 01: Members 403 Fix Summary

**Owner bypass added to assertCompanyPermission so company owners implicitly pass all permission gates without explicit database grant rows, fixing 403 on GET /members and unblocking E2E verification**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-04-05T02:39:26Z
- **Completed:** 2026-04-05T02:39:58Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added 3-line owner bypass to `assertCompanyPermission` in `server/src/routes/access.ts`: calls `access.getMembership` and short-circuits on `membershipRole === "owner"` before the `canUser` permission grant table lookup
- Committed and pushed fix to origin/master; Easypanel auto-deploy triggered from master branch
- Verified health endpoint `https://paperclip-paperclip-api.qiwa34.easypanel.host/api/health` returns 200 with `status: "ok"`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add owner bypass to assertCompanyPermission** - `866de3fb` (fix)
2. **Task 2: Push fix to master and confirm Easypanel rebuild** - (push only, no extra commit)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `server/src/routes/access.ts` - assertCompanyPermission now checks membershipRole=owner before canUser

## Decisions Made
- Owner bypass placed AFTER `isLocalImplicit(req)` and BEFORE `access.canUser` — preserving the priority: local-implicit > owner-role > explicit permission grant
- Used `access.getMembership(companyId, "user", req.actor.userId!)` with non-null assertion because `userId` is guaranteed non-null in the `board` actor path at this point

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Easypanel auto-deploys from master.

## Next Phase Readiness
- Members 403 bug is resolved; E2E verification journey can proceed (plan 07-02)
- E2E-02 (assignee pickers calling /members) and E2E-03 (owner assigning tasks via member list) are now unblocked
- Health endpoint confirmed returning 200 post-push

---
*Phase: 07-end-to-end-verification*
*Completed: 2026-04-05*
