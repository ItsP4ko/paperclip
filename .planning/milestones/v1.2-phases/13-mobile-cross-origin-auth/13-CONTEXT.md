# Phase 13: Mobile Cross-Origin Auth - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Make login and authenticated sessions work on iOS Safari and Android Chrome, including real-time WebSocket updates. Fix the Vercel nested SPA route 404. This phase does NOT add new auth methods, change the user model, or touch non-auth API behavior.

</domain>

<decisions>
## Implementation Decisions

### Bearer token strategy
- Add BetterAuth's `bearer` plugin to enable session token auth via `Authorization: Bearer <session_id>` in addition to cookies
- Token is stored in `localStorage` after login — survives mobile tab suspension/OS kill
- REST API calls use dual mode: if `localStorage` has a token, send `Authorization: Bearer` header; otherwise fall back to `credentials: "include"` (cookie). Backward-compatible — existing desktop sessions keep working without re-login
- WebSocket auth passes the bearer token as a URL query param: `?token=session_id` (standard WS auth pattern — accepted trade-off)
- On any 401 response (token expired or revoked): clear the localStorage token and redirect to `/login`. No silent refresh.

### Vercel SPA routing
- Status unknown (not tested in production against current vercel.json)
- Plan must include a manual test step: navigate directly to `/PAC/dashboard` on the live Vercel URL
- If rewrite is insufficient: switch `vercel.json` from `rewrites` to `routes` with `{ "handle": "filesystem" }` before the catch-all `/(.*) → /index.html`
- The chosen approach: always apply the `routes` + `filesystem handle` pattern proactively (don't wait for the test to fail)

### Domain setup
- Not discussed — user did not flag this as a gray area. Implementation proceeds with bearer strategy as the primary cross-origin fix (not subdomain cookie scoping). If a custom domain is configured later, cookie scoping is additive and doesn't conflict.

### Claude's Discretion
- Exact `localStorage` key name for the session token
- Whether to use a React context or a simple module-level store for the token
- Order of bearer vs cookie attempts in the fetch wrapper (bearer first is standard)
- BetterAuth bearer plugin configuration details (session expiry, etc.)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Auth implementation
- `server/src/auth/better-auth.ts` — BetterAuth instance creation, cookie config (`sameSite: none`, `secure`), `resolveBetterAuthSessionFromHeaders`
- `server/src/middleware/auth.ts` — `actorMiddleware`, how bearer vs cookie resolution is sequenced today
- `server/src/realtime/live-events-ws.ts` — WS `authorizeUpgrade` function, `resolveSessionFromHeaders` wiring (already in place, just needs the frontend to send the token)

### Frontend auth
- `ui/src/api/auth.ts` — `authApi`, `authPost`, current `credentials: "include"` fetch pattern
- `ui/src/lib/api-base.ts` — `API_BASE`, `getWsHost` — where bearer header injection should be centralized
- `ui/src/context/LiveUpdatesProvider.tsx` — WS connection creation (line 796–797), where `?token=` query param must be appended

### Vercel deployment
- `vercel.json` — current `rewrites` config to be replaced with `routes` + `filesystem handle` for SPA routing

### Requirements
- `.planning/REQUIREMENTS.md` §MAUTH-01 through MAUTH-05 — full requirement text and acceptance criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `resolveBetterAuthSessionFromHeaders` (server/src/auth/better-auth.ts): Already accepts `Headers` object — WS upgrade path can call this directly with a synthesized `Authorization: Bearer` header constructed from the query param token
- `authorizeUpgrade` (server/src/realtime/live-events-ws.ts): Already tries `parseBearerToken(req.headers.authorization)` then falls back to query param `url.searchParams.get("token")` — the query-param path already exists in the code
- `headersFromIncomingMessage` (live-events-ws.ts): Already converts `IncomingMessage` headers to `Headers` for session resolution

### Established Patterns
- All REST API calls go through `authPost` or direct `fetch` in `ui/src/api/` — centralize bearer injection in a shared fetch wrapper or in `api-base.ts`
- BetterAuth session token = the `session.id` field returned by `authApi.getSession()` — no separate token endpoint needed
- `actorMiddleware` in `auth.ts` already checks for bearer header before falling back to session cookies — adding the bearer plugin makes the server honor `Authorization: Bearer <session_id>` for user sessions, not just agent API keys

### Integration Points
- `ui/src/api/auth.ts` `authApi.signIn()` — where token should be written to `localStorage` after successful login
- `ui/src/api/auth.ts` `authApi.signOut()` — where token should be cleared from `localStorage`
- Any `fetch` call with `credentials: "include"` — should be updated to also send bearer header if token is in localStorage
- `LiveUpdatesProvider.tsx` line 796: WS URL construction — append `?token=<localStorage token>` before connecting

</code_context>

<specifics>
## Specific Ideas

- WS query-param token path (`url.searchParams.get("token")`) already exists in `authorizeUpgrade` — it's currently used for agent API keys but the logic works for session tokens too once the bearer plugin validates session IDs
- The fetch wrapper for dual-mode auth should be transparent: callers don't need to know whether it's sending a cookie or a header

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope.

</deferred>

---

*Phase: 13-mobile-cross-origin-auth*
*Context gathered: 2026-04-05*
