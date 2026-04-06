---
phase: 13-mobile-cross-origin-auth
plan: 02
subsystem: auth
tags: [bearer-token, localStorage, websocket, vercel, spa-routing, mobile, cross-origin, ios-safari]

# Dependency graph
requires:
  - phase: 13-01
    provides: server-side bearer() plugin, actorMiddleware bearer session support, WS token auth via query param
provides:
  - getBearerHeaders() and handle401() helpers in api-base.ts as single source of truth for bearer token logic
  - Token capture on sign-in/sign-up from set-auth-token response header into localStorage
  - Bearer header injection on all REST API calls (client.ts, health.ts, auth.ts getSession)
  - 401 redirect to /auth with localStorage token clear (client.ts, auth.ts getSession)
  - Token clear on sign-out (auth.ts signOut)
  - WS URL ?token=<encodeURIComponent(token)> injection in LiveUpdatesProvider
  - Vercel SPA routing fix via routes + filesystem handle (replaces rewrites)
  - Sign-out button in sidebar footer UI
affects: [mobile-auth, websocket, vercel-deploy, ios-safari, android-chrome]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "localStorage key paperclip_session_token for cross-origin bearer token storage"
    - "getBearerHeaders() spreads into all fetch() headers objects"
    - "handle401() centralizes clear-token + redirect-to-/auth on any 401"
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
    - ui/src/components/Sidebar.tsx

key-decisions:
  - "getBearerHeaders/handle401 added to api-base.ts as the single source of truth for bearer token logic"
  - "signOut does NOT call handle401() — post-sign-out redirect is handled by UI router, not 401 logic"
  - "InstanceGeneralSettings.tsx fetch calls excluded from bearer injection — instance admin calls require cookie auth from same-origin context"
  - "encodeURIComponent() mandatory for WS token param — BetterAuth signed tokens contain . + = URL-special chars"
  - "vercel.json rewrites replaced with routes + filesystem handle — rewrites cannot coexist with routes and filesystem handle is required for static asset serving"
  - "handle401() redirects to /auth (not /login) — the app's actual auth route; fixed post-checkpoint"
  - "Token capture reads set-auth-token header before consuming response body — order matters as headers become inaccessible after json() in some environments"

patterns-established:
  - "Pattern 1: All authenticated fetch calls spread getBearerHeaders() into their headers object"
  - "Pattern 2: 401 responses always call handle401() which atomically clears token and redirects to /auth"
  - "Pattern 3: Token capture happens in authPost() immediately after successful response — covers both sign-in and sign-up"
  - "Pattern 4: WS token query param uses encodeURIComponent to safely encode signed tokens with special chars"

requirements-completed: [MAUTH-01, MAUTH-02, MAUTH-04, MAUTH-05]

# Metrics
duration: 45min
completed: 2026-04-05
---

# Phase 13 Plan 02: Mobile Cross-Origin Auth — Frontend Bearer Token Wiring Summary

**Bearer token capture, injection into all REST/WS calls, and Vercel SPA routing fix — verified working on iOS Safari with session persistence across browser close/reopen**

## Performance

- **Duration:** ~45 min (including human verification and post-checkpoint fixes)
- **Started:** 2026-04-05T22:30:00Z
- **Completed:** 2026-04-05T23:30:00Z
- **Tasks:** 3 (2 auto + 1 human-verify — all complete)
- **Files modified:** 7

## Accomplishments

- Added `getBearerHeaders()` and `handle401()` helpers to `api-base.ts` as the single source of truth for bearer token logic across the frontend
- Wired bearer token capture in `authPost()` from `set-auth-token` response header on sign-in/sign-up, stored in localStorage under `paperclip_session_token`
- Injected bearer headers into all authenticated REST calls: `getSession()` in auth.ts, `request()` in client.ts, `healthApi.get()` in health.ts; 401 responses call `handle401()` (clear token + redirect to /auth)
- Appended `?token=encodeURIComponent(stored)` to WS URL in LiveUpdatesProvider.tsx — enables mobile WebSocket auth without cookies
- Replaced `vercel.json` `rewrites` with `routes` + `filesystem` handle so nested SPA routes like `/PAC/dashboard` load correctly instead of 404
- Added sign-out button to sidebar footer (discovered missing during verification)
- User verified on real iPhone (iOS Safari): login, cross-page navigation, session persistence after browser close/reopen, and sign-out all pass

## Task Commits

1. **Task 1: Add getBearerHeaders/handle401 helpers + wire bearer injection into all frontend API calls** - `3edd79f3` (feat)
2. **Task 2: Append bearer token to WebSocket URL + fix Vercel SPA routing** - `ddba711c` (feat)
3. **Task 3: Manual mobile verification** - PASSED (human-approved, no code commit)

**Post-checkpoint fixes (during and after verification):**
- `81881c16` - fix(13): fix bearer token capture and 401 redirect route
- `85a9e764` - feat(ui): add sign-out button to sidebar footer

## Files Created/Modified

- `ui/src/lib/api-base.ts` - Added `getBearerHeaders()` and `handle401()` exports
- `ui/src/api/auth.ts` - Token capture in authPost, bearer header in getSession, 401 handle, token clear on signOut
- `ui/src/api/client.ts` - Bearer header injection in request(), 401 handle; removed redundant `const BASE = API_BASE`
- `ui/src/api/health.ts` - Bearer header injection in health check fetch
- `ui/src/context/LiveUpdatesProvider.tsx` - WS URL now includes ?token=encodeURIComponent(stored) when token in localStorage
- `vercel.json` - Replaced rewrites with routes + filesystem handle for SPA routing
- `ui/src/components/Sidebar.tsx` - Added sign-out button to sidebar footer

## Decisions Made

- `handle401()` is NOT called from `signOut()` — signOut is intentional, the UI router handles the post-sign-out redirect. `handle401()` is only for unexpected 401 responses during normal API usage.
- `InstanceGeneralSettings.tsx` fetch calls excluded from bearer injection — those are instance-admin-only calls requiring cookie auth in same-origin context; mobile users don't access them.
- `encodeURIComponent()` mandatory for WS token because BetterAuth signed session tokens contain `.`, `+`, `=` characters that corrupt URL query string parsing.
- `vercel.json` `rewrites` entirely replaced (cannot coexist with `routes`); the two-entry `routes` array handles static assets via `filesystem` and falls through to `index.html` for all other paths.
- `handle401()` redirects to `/auth` not `/login` — the app's actual auth route. Original plan said `/login` but the real route was discovered during verification.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed bearer token capture timing and 401 redirect route**
- **Found during:** Task 3 (human verification on iOS Safari)
- **Issue:** Token capture was failing because the set-auth-token header was not being read correctly; additionally `handle401()` was redirecting to `/login` but the app uses `/auth` as its auth route; CORS `exposedHeaders` on the backend was not including `set-auth-token` so browsers stripped it
- **Fix:** Fixed token capture to correctly read the set-auth-token header before body consumption; changed redirect target from `/login` to `/auth`; updated backend CORS config to expose `set-auth-token` header
- **Files modified:** `ui/src/api/auth.ts`, `ui/src/lib/api-base.ts`, backend CORS config
- **Verification:** iOS Safari login flow confirmed working end-to-end with token stored in localStorage and session persisting after browser close
- **Committed in:** `81881c16`

**2. [Rule 2 - Missing Critical] Added sign-out button to sidebar UI**
- **Found during:** Task 3 (human verification)
- **Issue:** No sign-out UI existed in the app — impossible to verify the sign-out flow, and users on mobile had no way to sign out
- **Fix:** Added sign-out button to sidebar footer
- **Files modified:** `ui/src/components/Sidebar.tsx`
- **Verification:** Sign-out confirmed working — token cleared, user redirected to auth page
- **Committed in:** `85a9e764`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical UI element)
**Impact on plan:** Both fixes were essential for correctness and verification. The bug fix resolved the core auth failure on iOS Safari. No scope creep.

## Issues Encountered

- Bearer token capture initially failed silently — no error thrown, just no token stored. Root cause: CORS `exposedHeaders` not including `set-auth-token` so the browser stripped the header before JS could read it.
- The app uses `/auth` as its auth route, not `/login` — `handle401()` was redirecting to the wrong path causing a 404 instead of the login page.
- Pre-existing UI test failures (2 test files) not caused by our changes: one CLI e2e test requires a live `pnpm relaycontrol` process, and one HTTP test requires a live server. Both were failing before this plan.

## Verification Results

| Check | Result |
|-------|--------|
| Vercel SPA routing (direct URL nav) | PASSED |
| iOS Safari sign-in | PASSED |
| iOS Safari session persistence (browser close/reopen) | PASSED |
| Sign-out | PASSED |
| Android Chrome | Not tested (iOS confirmed, Android deferred) |

## User Setup Required

None — no external service configuration required. Changes deployed to Vercel and Easypanel automatically.

## Next Phase Readiness

- Mobile auth is complete end-to-end: server-side bearer plugin (Plan 01) + frontend token capture/injection (Plan 02) + verified on real iOS Safari
- All four requirements MAUTH-01, MAUTH-02, MAUTH-04, MAUTH-05 are verified
- Phase 13 is complete — both plans done and user-verified
- No blockers for future phases

---
*Phase: 13-mobile-cross-origin-auth*
*Completed: 2026-04-05*
