---
phase: 04-online-deployment-multi-user-auth
plan: "02"
subsystem: ui
tags: [react, react-router, tanstack-query, tdd, vitest]

# Dependency graph
requires:
  - phase: 04-online-deployment-multi-user-auth
    provides: "Backend auto-approval for human invite accepts (plan 01)"
provides:
  - "InviteLanding dynamic 'Join [CompanyName]' button label for human joins"
  - "Auto-navigate to '/' on server-approved status after query invalidation"
  - "resolvePostAcceptAction pure helper exported and unit tested"
  - "InviteLanding.test.tsx with 5 unit tests for navigation routing logic"
affects:
  - 04-online-deployment-multi-user-auth
  - invite-flow
  - auth

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD: extract routing decision logic into exported pure function for testability"
    - "Invalidation-before-navigation: await both invalidateQueries before navigate() to prevent stale data"
    - "navigate('/', { replace: true }) pattern consistent with Auth.tsx to prevent back-button regression"

key-files:
  created:
    - ui/src/pages/InviteLanding.test.tsx
  modified:
    - ui/src/pages/InviteLanding.tsx

key-decisions:
  - "resolvePostAcceptAction exported as pure function so navigation decision logic is independently testable without mounting the full component"
  - "status='approved' is the only condition triggering navigate-home — bootstrap and pending_approval continue to show result cards"
  - "Query invalidation (auth.session + companies.all) awaited before navigate('/') to prevent root route seeing stale session/company data"

patterns-established:
  - "Pattern 1: Extract onSuccess routing decision to exported pure function, test it in isolation, wire back via helper call"
  - "Pattern 2: Always await query invalidation before navigate() in onSuccess handlers"

requirements-completed: [AUTH-01]

# Metrics
duration: 4min
completed: 2026-04-04
---

# Phase 4 Plan 02: InviteLanding Navigation Summary

**Human invite button shows 'Join [CompanyName]' and auto-navigates to '/' on approved status via resolvePostAcceptAction helper with full unit test coverage**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-04T05:44:00Z
- **Completed:** 2026-04-04T05:47:48Z
- **Tasks:** 2 (TDD: 1 RED commit + 1 GREEN commit)
- **Files modified:** 2

## Accomplishments

- Created `InviteLanding.test.tsx` with 5 unit tests covering all navigation decision branches
- Exported `resolvePostAcceptAction` pure helper from `InviteLanding.tsx` for testable routing logic
- Human join button now shows `Join [CompanyName]` (or `Join` fallback) instead of generic "Submit join request"
- `onSuccess` handler navigates immediately to `/` with `replace: true` when `payload.status === 'approved'`, after awaiting both query invalidations
- Agent and bootstrap paths remain unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Create InviteLanding.test.tsx (RED)** - `24f09226` (test)
2. **Task 2: Update InviteLanding.tsx (GREEN)** - `6267fc36` (feat)

**Plan metadata:** (final docs commit below)

_Note: TDD tasks have two commits — test (RED) then implementation (GREEN)_

## Files Created/Modified

- `ui/src/pages/InviteLanding.test.tsx` - 5 unit tests for resolvePostAcceptAction covering approved/pending/bootstrap/null/undefined
- `ui/src/pages/InviteLanding.tsx` - Added useNavigate import, resolvePostAcceptAction export, navigate call in onSuccess, dynamic button label

## Decisions Made

- Used exported pure function (`resolvePostAcceptAction`) rather than testing the full React component — avoids complex mock setup while giving high-confidence coverage of the routing decision
- `status === 'approved'` check takes precedence over `bootstrapAccepted` check in the helper (approved would only appear on human join responses, not bootstrap, so ordering is safe)
- Pre-existing TypeScript error in `IssueProperties.tsx` (unrelated to this plan) logged as out-of-scope; `InviteLanding.tsx` introduces no new TypeScript errors

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `pnpm` not available on system PATH; used `./node_modules/.bin/vitest` directly to run tests. Functionally identical.
- Pre-existing TypeScript error in `src/components/IssueProperties.tsx` caused `tsc --noEmit` to exit non-zero. Confirmed pre-existing via git stash verification — out of scope for this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- AUTH-01 user-facing side is complete: humans see clear "Join" CTA and land inside the app immediately after joining
- Backend auto-approval (plan 01) + frontend navigation (plan 02) together complete the full human invite flow
- No blockers for remaining phase 04 plans

---
*Phase: 04-online-deployment-multi-user-auth*
*Completed: 2026-04-04*
