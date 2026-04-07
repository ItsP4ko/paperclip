---
phase: 13-mobile-cross-origin-auth
plan: 01
subsystem: auth
tags: [better-auth, bearer-token, mobile-auth, websocket, ios-safari, middleware]

# Dependency graph
requires: []
provides:
  - bearer() plugin active on BetterAuth instance enabling Authorization: Bearer header session resolution
  - actorMiddleware resolves user sessions from bearer tokens before falling through to agent key lookup
  - authorizeUpgrade resolves user sessions from query-param tokens when agent key lookup fails
  - source="bearer_session" distinguishes bearer auth from cookie auth in logs and actor metadata
affects: [13-02, mobile-auth-frontend, websocket-auth]

# Tech tracking
tech-stack:
  added: [better-auth/plugins (bearer plugin — already installed, now activated)]
  patterns:
    - Bearer-first session resolution before API key lookup in actorMiddleware
    - Synthetic Authorization header construction for WS bearer auth
    - TDD with vitest: failing test commit → green implementation commit

key-files:
  created:
    - server/src/__tests__/actor-middleware-bearer-session.test.ts
    - server/src/__tests__/live-events-ws-user-session.test.ts
  modified:
    - server/src/auth/better-auth.ts
    - server/src/middleware/auth.ts
    - server/src/realtime/live-events-ws.ts

key-decisions:
  - "bearer() plugin added unconditionally to BetterAuth — no conditional per-mode since it only activates when Authorization: Bearer header is present"
  - "authorizeUpgrade exported for unit testing — low risk since it only adds a named export"
  - "source='bearer_session' added to actor to distinguish bearer from cookie sessions in logs and metrics"

patterns-established:
  - "Bearer session check placed BEFORE agent key lookup in actorMiddleware — bearer first for mobile users, agent keys still work as fallback"
  - "Synthetic Headers object pattern for WS bearer auth — creates new Headers() with Authorization: Bearer <token> before calling resolveSessionFromHeaders"
  - "try/catch with logger.warn pattern for session resolution failures — graceful degradation to agent key lookup"

requirements-completed: [MAUTH-01, MAUTH-02, MAUTH-03, MAUTH-04]

# Metrics
duration: 4min
completed: 2026-04-05
---

# Phase 13 Plan 01: Mobile Auth — Server-Side Bearer Token Support Summary

**BetterAuth bearer() plugin activated and both actorMiddleware and authorizeUpgrade fixed to resolve user sessions from signed bearer tokens, enabling mobile browsers to authenticate without cookies**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-05T23:00:36Z
- **Completed:** 2026-04-05T23:04:29Z
- **Tasks:** 2
- **Files modified:** 5 (3 source, 2 test files)

## Accomplishments
- Added bearer() plugin to BetterAuth instance — enables HMAC-verified session token resolution from Authorization: Bearer headers
- Fixed actorMiddleware to attempt resolveSession before agent/board API key lookup when bearer header is present in authenticated mode
- Fixed authorizeUpgrade to attempt user session resolution via synthetic bearer headers when agent key lookup fails
- Exported authorizeUpgrade from live-events-ws.ts for direct unit testing
- All 10 new tests pass (5 per task), zero regressions across 183 existing test files

## Task Commits

Each task was committed atomically with TDD RED → GREEN pattern:

1. **Task 1 RED: actorMiddleware bearer session tests** - `154629dc` (test)
2. **Task 1 GREEN: bearer() plugin + actorMiddleware fix** - `9869b851` (feat)
3. **Task 2 RED: authorizeUpgrade user session tests** - `89ca1750` (test)
4. **Task 2 GREEN: authorizeUpgrade fix + export** - `fc956132` (feat)

## Files Created/Modified
- `server/src/auth/better-auth.ts` - Added `import { bearer } from "better-auth/plugins"` and `plugins: [bearer()]` to betterAuth() config object
- `server/src/middleware/auth.ts` - Added bearer session resolution block before boardAuth.findBoardApiKeyByToken; sets source="bearer_session" on success
- `server/src/realtime/live-events-ws.ts` - Exported authorizeUpgrade; replaced `return null` in agent key failure path with user session resolution via synthetic bearer headers
- `server/src/__tests__/actor-middleware-bearer-session.test.ts` - 5 unit tests covering bearer session, null fallthrough, error graceful degradation, local_trusted no-op, and bearer() plugin presence
- `server/src/__tests__/live-events-ws-user-session.test.ts` - 5 unit tests covering WS board context from session, null paths, membership check, agent key backward compat, and synthetic header verification

## Decisions Made
- bearer() plugin added unconditionally to BetterAuth plugins array — it only activates when an Authorization: Bearer header is present, so cookie-only flows are unaffected
- authorizeUpgrade exported for testing (Option A from plan) — low risk, only adds a named export
- source="bearer_session" added to differentiate bearer sessions from cookie sessions in logs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing test failures in `company-import-export-e2e.test.ts` (pnpm not in PATH during test) and `relaycontrol/http.test.ts` (message text mismatch) — both unrelated to this plan's changes, confirmed pre-existing

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Server-side bearer token auth complete for both REST API and WebSocket connections
- Ready for Plan 02: Frontend bearer token capture, storage, and injection
- When user signs in via email/password, BetterAuth will now emit `set-auth-token` response header (enabled by bearer plugin)
- Frontend needs to capture that header and send it on subsequent requests via `Authorization: Bearer` and WS `?token=` query param

---
*Phase: 13-mobile-cross-origin-auth*
*Completed: 2026-04-05*
