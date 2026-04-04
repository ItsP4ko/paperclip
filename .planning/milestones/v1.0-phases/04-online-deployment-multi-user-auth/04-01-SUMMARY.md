---
phase: 04-online-deployment-multi-user-auth
plan: 01
subsystem: auth
tags: [invite, auto-approval, transaction, membership, grants, access-control]

# Dependency graph
requires:
  - phase: 03-owner-team-visibility
    provides: companyMemberships, setPrincipalGrants patterns
provides:
  - resolveHumanJoinStatus exported helper for invite auto-approval
  - Human invite accept atomically creates membership + grants in single db.transaction
  - join.auto_approved activity log action differentiates human auto-approvals
affects: [04-02-invite-landing-ui, future-join-flows]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "resolveHumanJoinStatus pure function for testable invite status logic"
    - "Inline approval inside db.transaction for atomic joinRequest + membership + grants"
    - "join.auto_approved activity log action for human invite auto-approvals"

key-files:
  created:
    - server/src/__tests__/invite-auto-approve.test.ts
  modified:
    - server/src/routes/access.ts

key-decisions:
  - "Auto-approval is mode-agnostic: runs in both local_trusted and authenticated modes per CONTEXT.md locked decision"
  - "userId resolved as req.actor.userId for authenticated mode, local-board fallback for isLocalImplicit (local_trusted)"
  - "resolveHumanJoinStatus exported as pure function to enable lightweight unit testing without DB mocks"

patterns-established:
  - "Pattern: Extract status-determination logic to pure exported helper for testability without DB mocking"
  - "Pattern: shouldAutoApprove computed before transaction, consumed inside transaction block"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03]

# Metrics
duration: 3min
completed: 2026-04-04
---

# Phase 04 Plan 01: Inline auto-approval for human invite accepts

**Human invite-accept handler atomically inserts joinRequest with status=approved and immediately creates membership + grants in the same db.transaction, bypassing the pending_approval queue entirely.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-04T05:44:20Z
- **Completed:** 2026-04-04T05:47:24Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Added `resolveHumanJoinStatus` pure exported helper that returns `{status, shouldAutoApprove}` based on requestType
- Modified invite-accept transaction to insert joinRequest with dynamic status (approved for human, pending_approval for agent)
- Auto-approval block inside transaction: ensureMembership + setPrincipalGrants + update joinRequest row atomically
- Activity log records `join.auto_approved` for human auto-approvals (vs `join.requested` for agents)
- All 107 server test files pass with no regressions

## Task Commits

Each task was committed atomically (TDD: RED then GREEN):

1. **Task 1 RED: failing tests** - `6bf14d49` (test)
2. **Task 1 GREEN: production implementation** - `68e7622b` (feat)

## Files Created/Modified

- `server/src/__tests__/invite-auto-approve.test.ts` - Unit tests for resolveHumanJoinStatus (human → approved, agent → pending_approval)
- `server/src/routes/access.ts` - Added resolveHumanJoinStatus export; modified transaction to use dynamic status and run auto-approval for humans

## Decisions Made

- **auto-approval is mode-agnostic**: runs in both `local_trusted` and `authenticated` modes per CONTEXT.md locked decision — no `deploymentMode` check added
- **userId resolution**: `req.actor.userId` for authenticated board actors, `"local-board"` fallback via `isLocalImplicit(req)` for local_trusted mode — same pattern as the existing manual approve handler
- **resolveHumanJoinStatus exported**: pure function enables unit tests without any DB mocking; extracted to match existing test pattern in `invite-accept-replay.test.ts`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Server auto-approval logic complete; plan 04-02 (InviteLanding UI) can now read `status === "approved"` from the response and navigate immediately to `/`
- Existing manual approve handler for agents (POST /companies/:id/join-requests/:requestId/approve) unchanged and still required for agent join approvals

---
*Phase: 04-online-deployment-multi-user-auth*
*Completed: 2026-04-04*

## Self-Check: PASSED

- `server/src/__tests__/invite-auto-approve.test.ts` — FOUND
- `.planning/phases/04-online-deployment-multi-user-auth/04-01-SUMMARY.md` — FOUND
- Commit `6bf14d49` (test RED) — FOUND
- Commit `68e7622b` (feat GREEN) — FOUND
