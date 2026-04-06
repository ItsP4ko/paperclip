---
phase: 15-auth-hardening
plan: "03"
subsystem: ui
tags: [react, better-auth, session-management, tanstack-query, tailwind]

# Dependency graph
requires:
  - phase: 15-auth-hardening/15-01
    provides: BetterAuth session endpoints (list-sessions, revoke-session, revoke-other-sessions) available at /api/auth/*
provides:
  - Session management UI at /account (AccountSettings page)
  - authApi.listSessions(), revokeSession(token), revokeOtherSessions(), getCurrentSessionToken()
  - Sidebar user email/name links to /account
affects: [16-xss-protection, 18-audit-logs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Current session identified by comparing localStorage bearer token against session.token from listSessions (NOT via getSession synthetic ID)"
    - "Session revoke passes token field (not id field) to /api/auth/revoke-session"
    - "UA string parsed inline with regex (no ua-parser-js dependency)"

key-files:
  created:
    - ui/src/pages/AccountSettings.tsx
  modified:
    - ui/src/api/auth.ts
    - ui/src/App.tsx
    - ui/src/components/Sidebar.tsx

key-decisions:
  - "Current session identified via localStorage bearer token match against session.token (not via getSession which returns synthetic paperclip:<source>:<userId> ID)"
  - "Route /account placed at top-level outside :companyPrefix to avoid prefix collision"
  - "UA parsing done inline with regex — no external dependency added"

patterns-established:
  - "SessionEntry.token (not .id) is the correct field for revoke-session API calls"
  - "getCurrentSessionToken() reads localStorage paperclip_session_token for bearer token comparison"

requirements-completed: [AUTH-02, AUTH-03, AUTH-04]

# Metrics
duration: checkpoint-verified
completed: 2026-04-06
---

# Phase 15 Plan 03: Session Management UI Summary

**Account Settings page with active session list, per-session revoke, and revoke-all-others — current session identified by localStorage bearer token match against BetterAuth listSessions token field**

## Performance

- **Duration:** checkpoint-verified (human verification passed)
- **Started:** 2026-04-06
- **Completed:** 2026-04-06
- **Tasks:** 2 auto tasks + 1 checkpoint (passed)
- **Files modified:** 4

## Accomplishments

- `authApi` extended with `listSessions()`, `revokeSession(token)`, `revokeOtherSessions()`, and `getCurrentSessionToken()` — all wired to BetterAuth native endpoints with bearer headers
- `AccountSettings` page renders active sessions with device/browser (UA regex parsed), IP address, creation date; current session shows green "Current session" badge and no Revoke button; individual Revoke and "Revoke all other sessions" buttons with confirmation dialogs
- Route `/account` added at top-level in `App.tsx` (outside `:companyPrefix`) so navigation from sidebar works regardless of workspace context; sidebar user name/email is now a clickable link to `/account`

## Task Commits

Each task was committed atomically:

1. **Task 1a: Add session API methods to auth.ts** - `4a4907d5` (feat)
2. **Task 1b: Create AccountSettings page, route, and sidebar link** - `7b1135e9` (feat)
3. **Routing fix: move /account route to top-level** - `576bd3e7` (fix)

## Files Created/Modified

- `ui/src/api/auth.ts` — added `SessionEntry` type, `listSessions`, `revokeSession`, `revokeOtherSessions`, `getCurrentSessionToken`
- `ui/src/pages/AccountSettings.tsx` — new Account Settings page with full session management UI
- `ui/src/App.tsx` — `/account` route added at top-level outside `:companyPrefix` under CloudAccessGate
- `ui/src/components/Sidebar.tsx` — user name/email at bottom-left now links to `/account`

## Decisions Made

- **Current session identification via bearer token match:** The custom `GET /api/auth/get-session` handler returns a synthetic `paperclip:<source>:<userId>` ID that never matches real BetterAuth session UUIDs from `listSessions`. Identification is done by reading `localStorage.getItem("paperclip_session_token")` and comparing against `session.token` from the list — this is the actual bearer token value that BetterAuth stores per session.
- **Route placement outside :companyPrefix:** Initial implementation placed the `/account` route inside the company-prefixed router, breaking navigation from sidebar (which links to bare `/account`). Fixed by moving the route to top-level.
- **No ua-parser-js dependency:** User-agent parsing is done inline with a small regex in AccountSettings.tsx — avoids an external dependency for a cosmetic display feature.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Route /account placed incorrectly inside :companyPrefix**
- **Found during:** Task 1b (Create AccountSettings page, route, and sidebar link) — discovered during human verification (Task 2 checkpoint)
- **Issue:** Route was nested inside the company-prefixed router so navigating to `/account` from the sidebar (which uses a bare path) failed
- **Fix:** Moved the `/account` route to the top-level `App.tsx` router, outside `:companyPrefix`, alongside other top-level routes like `/login`
- **Files modified:** `ui/src/App.tsx`
- **Verification:** Human verified — clicking sidebar user email navigates to `/account` correctly
- **Committed in:** `576bd3e7`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary routing fix — core navigation would have been broken without it. No scope creep.

## Issues Encountered

None beyond the routing fix documented above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 15 (Auth Hardening) all 3 plans complete: test stubs (15-01), login rate limiter + log sanitization (15-02), session management UI (15-03)
- Ready to proceed to Phase 16 (XSS Protection) or Phase 17 (CSP)
- No blockers

---
*Phase: 15-auth-hardening*
*Completed: 2026-04-06*
