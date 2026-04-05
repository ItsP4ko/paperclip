# Phase 5: Cross-Origin Code Preparation - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

All code-level changes required for cross-origin operation are in place and verifiable before any cloud infrastructure is touched. Frontend can talk to a separately-hosted backend. No cloud provisioning happens in this phase — only code changes and config files.

</domain>

<decisions>
## Implementation Decisions

### Env var naming & structure
- Single env var: `VITE_API_URL` (matches roadmap naming)
- Value is the full backend origin: `https://backend.railway.app`
- Both REST API calls and WebSocket URLs derive from this one var — no separate WS env var
- When unset, code falls back to relative paths and `window.location.host` (local dev mode)
- No build-time validation of the URL format — silent fallback only

### Backend env vars
- Keep existing naming as-is: `PAPERCLIP_ALLOWED_HOSTNAMES`, `PAPERCLIP_AUTH_PUBLIC_BASE_URL`, `BETTER_AUTH_SECRET`
- These vars already exist in `server/src/config.ts` — just wire them for cross-origin use

### Local development workflow
- Zero config: local dev must work exactly as today with no `.env` file required
- Vite proxy continues to handle `/api` routing in dev mode
- `VITE_API_URL` unset = local mode, set = cross-origin mode

### Auth secret handling
- Remove the `"paperclip-dev-secret"` fallback in authenticated mode — server must crash on startup if `BETTER_AUTH_SECRET` is unset and `PAPERCLIP_DEPLOYMENT_MODE=authenticated`
- Local dev (`local_trusted` mode) is unaffected — it doesn't use BetterAuth at all

### CORS middleware
- Add Express `cors` package to `app.ts` with `credentials: true`
- Allowed origins scoped to `PAPERCLIP_ALLOWED_HOSTNAMES`
- Handles OPTIONS preflight requests automatically

### Vercel project configuration
- Claude's discretion on format (vercel.json vs vercel.ts) — pick what's simplest for a Vite SPA with one rewrite rule
- Default `pnpm build` command — no custom build steps
- SPA rewrite: all routes fall through to `index.html` for client-side routing

### Health endpoint
- Current `GET /api/health` response is sufficient for Railway readiness checks
- No database connectivity check needed — just a 200 confirming the container is up

### Claude's Discretion
- Vercel config format choice (vercel.json vs vercel.ts)
- Exact CORS middleware configuration details
- Cookie config field names in BetterAuth (`cookieOptions` vs `defaultCookieAttributes` — verify against installed version)
- Whether to create a `.env.example` file documenting the new env vars

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Cross-origin pitfalls & mitigations
- `.planning/research/PITFALLS.md` — All 8 pitfalls identified with exact code locations, fix patterns, and verification steps. Phase 5 covers pitfalls 1-4, 6, and 8.

### Architecture & deployment research
- `.planning/research/ARCHITECTURE.md` — Deployment architecture decisions (Vercel + Railway + Supabase topology)
- `.planning/research/STACK.md` — Stack choices and compatibility notes
- `.planning/research/FEATURES.md` — Feature mapping to deployment tiers

### Project-level docs
- `.planning/PROJECT.md` — Core constraints (maintain existing stack, no new frameworks)
- `.planning/REQUIREMENTS.md` — Requirements DEPLOY-01 through DEPLOY-04, DEPLOY-06, DEPLOY-08, AUTH-01 through AUTH-04 map to this phase
- `.planning/ROADMAP.md` — Phase 5 success criteria (5 concrete checks)

### Key source files to modify
- `ui/src/api/client.ts` — `const BASE = "/api"` (line 1) — needs VITE_API_URL prefix
- `ui/src/api/auth.ts` — Hardcoded `/api/auth` paths (lines 28, 48) — same treatment
- `ui/src/context/LiveUpdatesProvider.tsx` — `window.location.host` for WS (line 776)
- `ui/src/components/transcript/useLiveRunTranscripts.ts` — `window.location.host` for WS (line 189)
- `ui/src/pages/AgentDetail.tsx` — `window.location.host` for WS (line 3567)
- `server/src/auth/better-auth.ts` — Cookie config and secret fallback (lines 70, 94)
- `server/src/app.ts` — No CORS middleware currently; needs cors() added
- `server/src/config.ts` — Already reads `PAPERCLIP_ALLOWED_HOSTNAMES` and `SERVE_UI`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/src/config.ts`: Already parses `PAPERCLIP_ALLOWED_HOSTNAMES` into an array — CORS middleware can reuse this
- `server/src/auth/better-auth.ts`: `deriveAuthTrustedOrigins()` already builds trusted origin list from config — same source for CORS origins
- `server/src/middleware/board-mutation-guard.ts`: Already checks origins against allowed hostnames — no code change needed, just env var config
- `ui/src/api/client.ts`: Central `request()` function with `credentials: "include"` — single place to update BASE url

### Established Patterns
- All API calls go through `ui/src/api/client.ts` `request()` — changing BASE there fixes all REST calls
- Auth calls in `ui/src/api/auth.ts` use literal `/api/auth` strings — need individual updates
- WebSocket URL construction follows identical pattern in all 3 files: `${protocol}://${window.location.host}/api/companies/...`
- Config reads env vars in `server/src/config.ts` and passes them through `createApp()` opts

### Integration Points
- `server/src/app.ts` `createApp()` — CORS middleware inserts before route mounting
- `server/src/index.ts` — Startup validation for BETTER_AUTH_SECRET (line 479-482, already partially exists)
- Vercel config file goes in `ui/` directory root (frontend package)
- Vite proxy config in `ui/vite.config.ts` — must continue to work for local dev

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The PITFALLS.md research provides exact code patterns for each fix.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-cross-origin-code-preparation*
*Context gathered: 2026-04-04*
