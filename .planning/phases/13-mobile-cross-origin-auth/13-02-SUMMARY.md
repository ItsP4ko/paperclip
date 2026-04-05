---
phase: 13-mobile-cross-origin-auth
plan: 02
subsystem: auth
tags: [bearer-token, localStorage, websocket, vercel, spa-routing, mobile, cross-origin]

# Dependency graph
requires:
  - phase: 13-01
    provides: server-side bearer() plugin, actorMiddleware bearer session support, WS token auth via query param
provides:
  - getBearerHeaders() and handle401() helpers in api-base.ts
  - Token capture on sign-in/sign-up from set-auth-token response header
  - Bearer header injection on all REST API calls (client.ts, health.ts, auth.ts getSession)
  - 401 redirect to /login with localStorage token clear (client.ts, auth.ts getSession)
  - Token clear on sign-out (auth.ts signOut)
  - WS URL ?token=<encodeURIComponent(token)> injection in LiveUpdatesProvider
  - Vercel SPA routing fix via routes + filesystem handle (replaces rewrites)
affects: [mobile-auth, websocket, vercel-deploy, ios-safari, android-chrome]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "localStorage key paperclip_session_token for cross-origin bearer token storage"
    - "getBearerHeaders() spreads into all fetch() headers objects"
    - "handle401() centralizes clear-token + redirect-to-/login on any 401"
    - "WS token appended as ?token=encodeURIComponent(stored) query param"
    - "Vercel routes array with filesystem handle for SPA catch-all"

key-files:
  created: []
  modified:
    - ui/src/lib/api-base.ts
    - ui/src/api/auth.ts
    - ui/src/api/client.ts
    - ui/src/api/health.ts
    - ui/src/context/LiveUpdatesProvider.tsx
    - vercel.json

key-decisions:
  - "getBearerHeaders/handle401 added to api-base.ts as the single source of truth for bearer token logic"
  - "signOut does NOT call handle401() — post-sign-out redirect is handled by UI router, not 401 logic"
  - "InstanceGeneralSettings.tsx fetch calls excluded from bearer injection — instance admin calls require cookie auth from same-origin context"
  - "encodeURIComponent() mandatory for WS token param — BetterAuth signed tokens contain . + = URL-special chars"
  - "vercel.json rewrites replaced with routes + filesystem handle — rewrites cannot coexist with routes and filesystem handle is required for static asset serving"

patterns-established:
  - "Pattern 1: All authenticated fetch calls spread getBearerHeaders() into their headers object"
  - "Pattern 2: 401 responses always call handle401() which atomically clears token and redirects to /login"
  - "Pattern 3: Token capture happens in authPost() immediately after successful response — covers both sign-in and sign-up"
  - "Pattern 4: WS token query param uses encodeURIComponent to safely encode signed tokens with special chars"

requirements-completed: [MAUTH-01, MAUTH-02, MAUTH-04, MAUTH-05]

# Metrics
duration: 15min
completed: 2026-04-05
---

# Phase 13 Plan 02: Mobile Cross-Origin Auth — Frontend Bearer Token Wiring Summary

**Frontend bearer token capture, injection on all REST/WS calls, 401 redirect, and Vercel SPA routing fix using localStorage key paperclip_session_token**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-05T23:05:00Z
- **Completed:** 2026-04-05T23:20:00Z
- **Tasks:** 2 auto tasks completed (Task 3 is a human-verify checkpoint)
- **Files modified:** 6

## Accomplishments
- Added `getBearerHeaders()` and `handle401()` helpers to `api-base.ts` as the single source of truth for bearer token logic across the frontend
- Wired bearer token capture in `authPost()` (auth.ts) from `set-auth-token` response header on sign-in/sign-up, with token stored in localStorage under `paperclip_session_token`
- Injected bearer headers into all authenticated REST calls: `getSession()` in auth.ts, `request()` in client.ts, and `healthApi.get()` in health.ts; 401 responses in client.ts and auth.ts call `handle401()` (clear token + redirect to /login)
- Appended `?token=encodeURIComponent(stored)` to WS URL in LiveUpdatesProvider.tsx when token exists in localStorage — enables mobile WebSocket auth without cookies
- Replaced `vercel.json` `rewrites` with `routes` + `filesystem` handle so nested SPA routes like `/PAC/dashboard` load correctly instead of 404

## Task Commits

1. **Task 1: Add getBearerHeaders/handle401 helpers + wire bearer injection into all frontend API calls** - `3edd79f3` (feat)
2. **Task 2: Append bearer token to WebSocket URL + fix Vercel SPA routing** - `ddba711c` (feat)

*Task 3 (manual mobile verification) is a human-verify checkpoint — not committed.*

## Files Created/Modified
- `ui/src/lib/api-base.ts` - Added `getBearerHeaders()` and `handle401()` exports
- `ui/src/api/auth.ts` - Token capture in authPost, bearer header in getSession, 401 handle, token clear on signOut
- `ui/src/api/client.ts` - Bearer header injection in request(), 401 handle; removed redundant `const BASE = API_BASE`
- `ui/src/api/health.ts` - Bearer header injection in health check fetch
- `ui/src/context/LiveUpdatesProvider.tsx` - WS URL now includes ?token=encodeURIComponent(stored) when token in localStorage
- `vercel.json` - Replaced rewrites with routes + filesystem handle for SPA routing

## Decisions Made
- `handle401()` is NOT called from `signOut()` — signOut is intentional, the UI router handles the post-sign-out redirect. `handle401()` is only for unexpected 401 responses during normal API usage.
- `InstanceGeneralSettings.tsx` fetch calls excluded from bearer injection — those are instance-admin-only calls requiring cookie auth in same-origin context; mobile users don't access them.
- `encodeURIComponent()` mandatory for WS token because BetterAuth signed session tokens contain `.`, `+`, `=` characters that corrupt URL query string parsing.
- `vercel.json` `rewrites` entirely replaced (cannot coexist with `routes`); the two-entry `routes` array handles static assets via `filesystem` and falls through to `index.html` for all other paths.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
- Pre-existing UI test failures (2 test files) not caused by our changes: one CLI e2e test requires a live `pnpm relaycontrol` process, and one HTTP test requires a live server. Both were failing before this plan executed.
- TypeScript type-check passed with no errors after all modifications.

## User Setup Required
None - no external service configuration required. Frontend changes take effect on next Vercel deploy. Mobile auth verification (Task 3 checkpoint) requires pushing to master and testing on real iOS/Android devices.

## Next Phase Readiness
- Complete bearer auth stack is now wired end-to-end: server adds bearer plugin (Plan 01) + frontend captures/sends tokens (Plan 02)
- Manual mobile verification (Task 3) is required to confirm iOS Safari and Android Chrome can authenticate and maintain sessions
- Real-time WS updates on mobile sessions require verification that `?token=` param is accepted by the server-side WS auth handler from Plan 01

---
*Phase: 13-mobile-cross-origin-auth*
*Completed: 2026-04-05*
