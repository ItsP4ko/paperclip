# Project Research Summary

**Project:** Paperclip — v1.2 Performance & Mobile Auth Fix
**Domain:** SaaS task management — optimistic UI, aggressive caching, WebSocket optimization, cross-origin mobile auth
**Researched:** 2026-04-05
**Confidence:** HIGH

## Executive Summary

Paperclip v1.2 is a targeted performance and compatibility milestone layered onto an already-deployed SaaS stack. The core challenge is not introducing new technology — it is correctly wiring four independent optimization patterns (optimistic mutations, cache tuning, WebSocket keepalive, mobile auth) into a codebase that partially implements each one. All four goals are achievable with zero new npm dependencies by using capabilities already present in TanStack Query v5, `ws`, BetterAuth, and Vercel. The recommended implementation order is: WS compression fix first (single-line, immediately measurable), cache tuning second (zero risk), mobile auth third (highest integration complexity), and optimistic mutations last (most UI state to coordinate).

The principal risk is the interaction between the new optimistic update layer and the existing WebSocket-driven invalidation in `LiveUpdatesProvider`. The WS handler currently calls `invalidateActivityQueries` unconditionally on every `activity.logged` event — this fires a background refetch that can race with and overwrite in-flight optimistic values. This must be addressed with an `isMutating` guard before shipping any optimistic mutation. A secondary risk is applying a global `staleTime` increase without auditing per-query requirements: the "My Tasks" empty-state bug (a known v1.1 regression) must be diagnosed and fixed before any caching changes are applied, or the caching change will mask the root cause and make the bug harder to reproduce.

The mobile auth fix has two credible strategies: Strategy A (BetterAuth bearer plugin, code-only) and Strategy B (Vercel reverse proxy, config-only). Strategy B is cleaner for HTTP requests but cannot proxy WebSocket upgrades, leaving the WS connection still cross-origin and requiring a token fallback anyway. Strategy A solves both HTTP and WS in one pass and is the self-contained choice. Custom domain (`api.paperclipai.com` same eTLD+1 as `app.paperclipai.com`) eliminates the problem entirely at the infrastructure level and should be the long-term target, but the bearer plugin unblocks mobile users now without DNS propagation delays.

---

## Key Findings

### Recommended Stack

No new packages are required. All four v1.2 goals use APIs already available in the installed versions of `@tanstack/react-query@^5.90.21`, `ws@^8.19.0`, `better-auth@1.4.18`, and Vercel's config layer. The `main.tsx` QueryClient configuration needs two value changes (`staleTime`, `gcTime`). The WebSocket server needs one option added (`perMessageDeflate: false`). BetterAuth needs one plugin added (`bearer()`). The Vercel proxy approach requires editing `vercel.json` — but must address the WS auth gap separately.

**Core technologies:**
- `@tanstack/react-query v5`: Optimistic mutations via `onMutate`/`onError`/`onSettled` + `cancelQueries` before `setQueryData` — already installed, pattern already partially used in `IssueDetail.tsx`
- `ws v8`: Disable `perMessageDeflate` on `WebSocketServer` — small JSON payloads gain latency improvement with zero bandwidth cost at Paperclip's scale
- `better-auth`: Add `bearer()` plugin — enables `Set-Auth-Token` response header after sign-in, which clients use as `Authorization: Bearer` fallback when cookies are blocked
- Vercel `vercel.json` rewrites: Proxy `/api/:path*` to the Easypanel backend — makes API calls same-origin, eliminating Safari ITP for HTTP; does NOT proxy WebSocket upgrades

**Critical version note:** TanStack Query `gcTime` must be set explicitly when `staleTime` is raised above the `gcTime` default (5 min). Setting `staleTime: 5min` with `gcTime: 5min` means entries expire from memory the moment they go stale, defeating the navigation cache benefit. The correct pairing is `staleTime: 5min` + `gcTime: 15min`.

**What NOT to add:** `socket.io` (unnecessary abstraction over `ws`), `@tanstack/query-persist-client` (localStorage persistence adds stale-data bugs), `swr` (duplicates TanStack Query), `ioredis` (maintenance mode), JWT bearer tokens as primary auth (XSS-vulnerable localStorage), SSE replacing WebSocket (no improvement for the actual latency problem).

### Expected Features

**Must have (table stakes — v1.2 launch blockers):**
- Optimistic status change — most frequent action; the 300-800ms round-trip wait is visibly broken by modern standards
- My Tasks page renders correctly — a known v1.1 regression; empty state despite having tasks destroys trust in the view
- `staleTime` on issue lists (2-5 min) — eliminates loading spinner on most navigations without code complexity
- Mobile login fix — iOS Safari and Android Chrome users currently cannot log in on the cross-origin deployed stack
- WebSocket heartbeat (ping/pong, 25s client interval) — detects dead connections; current 30s server-only ping does not cover silent NAT/proxy drops from the client side

**Should have (v1.2 polish — add once core features are stable):**
- Optimistic assignment change — same code pattern as status; ships naturally as a second iteration
- Rollback error toast — silent revert is a UX failure; `useToast`/`pushToast` infrastructure already exists
- `gcTime: 10-15 min` on issue detail — back-navigation feels instant
- Narrow WS invalidation (`setQueryData` instead of `invalidateQueries` for known payload shapes) — reduces post-WS refetch traffic by ~80% for issue updates

**Defer to v1.3+:**
- Hover-prefetch on issue list rows — low value, not fixing anything broken
- Optimistic comment submission — `OptimisticIssueComment` infrastructure exists; wire through `useMutation` properly in a future milestone
- Background sync on reconnect (targeted state-sync vs. broad invalidation)
- PWA shell caching — independent from API caching; a separate Vite plugin integration

### Architecture Approach

The v1.2 architecture is entirely additive. The existing layered structure (Vercel/React → Easypanel/Express → Supabase/PG, with an in-process EventEmitter WS broadcast) is unchanged. Eight existing files are modified and one new utility file is created (`ui/src/lib/auth-token.ts` to encapsulate bearer token read/write/clear). The key architectural constraint is that optimistic cache writes and WS-driven cache invalidations operate on the same TanStack Query store — they must be coordinated, not treated as independent systems.

**Major components and their v1.2 changes:**
1. `main.tsx` QueryClient — raise `staleTime` to 5 min and `gcTime` to 15 min; add per-query overrides for real-time data (`staleTime: 0` for `sidebarBadges`, `activeRun`, session)
2. `IssueProperties.tsx` mutations — add `onMutate`/`onError` optimistic shell for status and assignee pickers; update both `issues.detail(id)` and `issues.list(companyId)` in `onMutate`
3. `LiveUpdatesProvider.tsx` — add `isMutating` guard before WS-triggered `invalidateActivityQueries`; add app-level 25s `__ping` interval; add `setQueryData` fast-path for `issue.updated` events with known full payload; trigger broad `invalidateQueries` on reconnect when `reconnectAttempt > 0`
4. `live-events-ws.ts` (server) — disable `perMessageDeflate`; reduce server ping to 15s; extend WS upgrade auth to validate user Bearer tokens (not only agent API keys)
5. `better-auth.ts` (server) — add `bearer()` plugin
6. `auth.ts` + `client.ts` (client) — extract `Set-Auth-Token` header post sign-in; inject `Authorization: Bearer` header when localStorage token present
7. `MyIssues.tsx` — fix empty-state bug (add `enabled: !!userId` guard; verify `assigneeUserId=me` server filter)
8. `auth-token.ts` (new) — single source of truth for bearer token storage; required before any other auth changes

**Build order constraint:** `auth-token.ts` → server bearer plugin → client token extraction → WS bearer auth → caching config → optimistic mutations → WS fast-path → MyIssues bug fix → WS ping interval.

### Critical Pitfalls

1. **WS invalidation races optimistic update** — `invalidateActivityQueries` fires unconditionally on every `activity.logged` event, triggering a background refetch that can overwrite an in-flight optimistic value. Fix: gate WS-triggered invalidation with `queryClient.isMutating({ mutationKey: ['issues', 'update'] }) > 0`. Always `await queryClient.cancelQueries(queryKey)` in `onMutate` before `setQueryData`. Address in Phase 1 before any optimistic mutation ships.

2. **Concurrent rapid mutations cause visible flash** — `cancelQueries` only cancels fetches, not sibling mutations. Double-clicking a status button creates a race where `onSettled` from mutation A triggers a refetch that overwrites mutation B's optimistic value. Fix: in `onSettled`, check `queryClient.isMutating({ mutationKey }) === 1` before calling `invalidateQueries` — only the last in-flight mutation for that entity should trigger the reconcile refetch.

3. **Global staleTime increase breaks "My Tasks" and badge count** — raising `staleTime` globally is a blunt instrument. The My Tasks empty-state bug must be fixed first; increasing staleTime before the bug is fixed will suppress the background refetch that currently masks it. Use per-query staleTime overrides, never a single global value for all queries.

4. **iOS Safari ITP blocks cookies regardless of `SameSite=None`** — Safari enforces first-party classification at the eTLD+1 level; `SameSite=None; Secure` already set in production still fails on iOS if frontend and backend are on different registrable domains. Test on a real iPhone with default privacy settings — iOS Simulator does NOT enforce ITP. Public suffix platform domains cannot be made first-party; custom domain is required for a permanent fix.

5. **WS reconnect misses events emitted during disconnect window** — in-process EventEmitter has no event buffer and no "last event ID." After reconnect, the frontend is silently behind. Fix: in the `onopen` handler when `reconnectAttempt > 0`, immediately call `invalidateQueries` for all high-priority company keys. This is the same location as the toast suppression logic (`RECONNECT_SUPPRESS_MS`).

6. **Optimistic rollback must be tested on the error path** — happy-path CI passes but rollback code is untested. Always implement full three-callback pattern (`onMutate` snapshot, `onError` rollback + toast, `onSettled` invalidate) and write an error-path test by mocking the API call to reject.

---

## Implications for Roadmap

Based on combined research, the natural phase structure follows the dependency graph and risk profile of each change. Features that are preconditions for other features come first; higher-risk integration changes come after simpler changes are verified in production.

### Phase 1: Optimistic UI Mutations

**Rationale:** This is the highest-visibility user-facing change and has the most complex interaction with the existing WS invalidation system. It must be implemented first so the WS-race pitfall is solved at the foundation before Phase 2's caching changes extend the window where races can occur. The My Tasks bug fix is a prerequisite for Phase 2's caching verification and belongs here.

**Delivers:** Status changes and assignment changes reflect immediately in the UI; rollback with error toast on failure; concurrent mutation flicker eliminated; My Tasks page renders correctly.

**Addresses:** Optimistic status change (P1), optimistic assignment change (P2), rollback error toast (P2), My Tasks page empty-state bug (P1).

**Avoids:** Pitfall 1 (WS race), Pitfall 3 (concurrent mutations), Pitfall 7 (incomplete rollback).

**Key work:**
- Add `isMutating` guard to `LiveUpdatesProvider`'s `invalidateActivityQueries`
- Add `onMutate`/`onError`/`onSettled` to `IssueProperties.tsx` status and assignee mutations; update both detail and list caches in `onMutate`
- Fix `MyIssues.tsx` empty-state bug (session-aware `enabled` guard + query key audit)
- Write error-path test for each optimistic mutation

### Phase 2: Aggressive Caching

**Rationale:** Cannot be done safely until Phase 1 is complete. The My Tasks bug must be verified fixed before staleTime is changed — the staleTime change would suppress the background refetch that currently makes the bug intermittent, making it harder to confirm the fix. The `isMutating` guard must be in place or higher staleTime will extend the WS race window. Once Phase 1 is stable, cache tuning is low-risk and high-reward.

**Delivers:** Navigation between previously-visited list and detail pages is instant (no loading skeleton); revisiting an issue list within 5 minutes shows cached data without a spinner.

**Addresses:** `staleTime` increase on issue lists, `gcTime` increase on issue detail, per-query overrides for real-time data.

**Avoids:** Pitfall 2 (stale list after mutation), Pitfall 6 (global staleTime breaks features).

**Key work:**
- Audit every `useQuery` call and assign per-query `staleTime` category (Infinity / 5min / 30s / 0)
- Set `staleTime: 5min` + `gcTime: 15min` in `main.tsx` QueryClient
- Set `staleTime: 0` overrides for `sidebarBadges`, `activeRun`, health check, session
- Verify "My Tasks" renders correctly after staleTime change (regression gate)

### Phase 3: Mobile Cross-Origin Auth Fix

**Rationale:** Independent of Phases 1 and 2 in terms of code, but scheduled third because it has the highest integration risk (server change + client change + WS auth extension) and requires a real iOS device for verification. Shipping caching and optimistic updates first gives the team a stable baseline to verify mobile auth against.

**Delivers:** iOS Safari and Android Chrome users can log in and maintain session on the cross-origin deployed stack; WS connection authenticated on mobile.

**Addresses:** Mobile login fix (P1).

**Avoids:** Pitfall 4 (iOS Safari ITP silent session loss).

**Key work:**
- Create `ui/src/lib/auth-token.ts` (bearer token encapsulation)
- Add `bearer()` plugin to `server/src/auth/better-auth.ts`
- Extract `Set-Auth-Token` header in `ui/src/api/auth.ts` after sign-in
- Inject `Authorization: Bearer` header in `ui/src/api/client.ts` when token present
- Extend WS upgrade auth in `live-events-ws.ts` to validate user Bearer tokens (critical gap — currently validates only agent API keys)
- Verify on real iPhone with default Safari privacy settings (Simulator is insufficient)
- Document custom domain as permanent fix path

### Phase 4: WebSocket Optimization

**Rationale:** The WS latency fix (`perMessageDeflate: false`) is a single-line server change and could ship at any time — but scheduling it last means it is verified independently without noise from other changes. The reconnect invalidation and narrow WS invalidation fast-path belong here.

**Delivers:** Reduced per-message WS latency; dead connections detected within 30s; cache consistency restored after reconnect; ~80% reduction in post-WS refetch traffic for issue updates.

**Addresses:** WS heartbeat (P1), reconnect event catch-up, narrow WS invalidation `setQueryData` fast-path (P2), `perMessageDeflate: false` (server config).

**Avoids:** Pitfall 5 (missed events after reconnect).

**Key work:**
- `perMessageDeflate: false` on `WebSocketServer` in `live-events-ws.ts`
- Reduce server ping interval from 30s to 15s
- Add app-level 25s `__ping` client message in `LiveUpdatesProvider.tsx`
- Add `invalidateQueries` block for all company keys in `onopen` when `reconnectAttempt > 0`
- Audit `publishLiveEvent` payload completeness, then add `setQueryData` fast-path for `issue.updated` events with full payload
- Verify before/after WS message latency on Easypanel deployment

### Phase Ordering Rationale

- Phase 1 must precede Phase 2: The `isMutating` guard prevents the WS race that becomes more problematic with longer staleTime. The My Tasks bug must be fixed and confirmed before staleTime changes can be safely assessed.
- Phase 2 before Phase 3: Provides a stable, verified caching baseline. Mobile auth introduces a new auth code path — testing it against a known-good cache state reduces debug surface.
- Phase 3 before Phase 4: WS auth extension (Phase 3) and WS latency fix (Phase 4) both touch `live-events-ws.ts`. Keeping them in separate phases avoids concurrent edits to the same file and ensures the auth change is independently verified before the server restart required by the latency fix.
- Phase 4 partial parallelism: `perMessageDeflate: false` and the ping interval change are server-side config changes independent of bearer plugin work. They can ship as a hotfix to Phase 3 if WS latency is actively blocking users during mobile auth testing.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 3 (WS user Bearer token auth):** The `live-events-ws.ts` WS upgrade path validates tokens only against `agentApiKeys` — extending it to validate user session tokens requires careful reading of how BetterAuth resolves sessions from `Authorization` headers. The critical gap: the current path does not call `resolveBetterAuthSessionFromHeaders` for user tokens at all. This needs an implementation-time audit of the WS auth handler before coding begins.

- **Phase 4 (narrow WS invalidation):** The `setQueryData` fast-path requires the server to include full entity snapshots in the `activity.logged` WS payload. `publishLiveEvent` in `server/src/services/live-events.ts` must be audited to determine which fields are currently in `details` — this is a server change if fields are missing, not just client-side work.

Phases with well-documented patterns (skip deeper research):

- **Phase 1 (optimistic mutations):** TanStack Query v5 official docs cover the pattern exhaustively. The existing `IssueDetail.tsx` comment optimistic pattern is the working template. The `isMutating` guard is documented by the TanStack maintainer. No research needed.
- **Phase 2 (caching config):** QueryClient `staleTime`/`gcTime` tuning is straightforward. Risk is organizational (audit per-query), not technical.
- **Phase 4 perMessageDeflate + ping interval:** Both are single-value config changes in well-documented APIs. No research needed.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technology choices verified against official docs and current installed versions. Zero new packages — lower uncertainty than a net-new dependency audit. Exact code patterns provided for all four changes. |
| Features | HIGH | Feature set well-defined by existing v1.1 gaps and user-reported pain points. P1/P2/P3 classification is defensible against real user impact. One moderate uncertainty: WS latency root cause may be Nginx proxy buffering on Easypanel rather than application code — verify before writing heartbeat code. |
| Architecture | HIGH | Architecture research done against live codebase inspection with specific file and line citations throughout. Component responsibilities, build order, and integration points are concrete. One critical gap identified: WS user Bearer token auth path does not exist yet. |
| Pitfalls | HIGH | All critical pitfalls are code-verified against specific lines in live files rather than inferred from documentation. The `isMutating` guard and concurrent mutation scenarios are confirmed from TkDodo (TanStack maintainer) blog post. |

**Overall confidence:** HIGH

### Gaps to Address

- **WS latency root cause verification:** Before writing application-level heartbeat code, check the Nginx proxy config on Easypanel for `proxy_buffering off` and `proxy_read_timeout 3600s`. The latency complaint may be a 2-line infra fix. If confirmed as Nginx, the heartbeat is still valuable for dead-connection detection but is not the latency fix. Verify Nginx config as the first step in Phase 4 planning.

- **WS user Bearer token auth (critical):** The `live-events-ws.ts` upgrade handler validates tokens only against `agentApiKeys`. The BetterAuth session resolution path for user-issued bearer tokens is not wired here. If not addressed, mobile users can log in (HTTP works via bearer token) but receive no real-time updates (WS upgrade fails). Treat this as a Phase 3 acceptance criteria gate, not a follow-up item.

- **iOS Safari ITP testing requires real device:** iOS Simulator does not enforce ITP. Phase 3 acceptance criteria must require verification on a real iPhone with default privacy settings enabled. Chrome on iOS uses WebKit but has different tracking protection behavior — test both.

- **`publishLiveEvent` payload completeness for narrow invalidation:** The `setQueryData` fast-path in Phase 4 depends on `activity.logged` events including full entity snapshots. Current investigation shows `details` carries partial data (status, assignee IDs) but not full `Issue` objects. Server-side payload expansion may be required before the fast-path can be safely implemented. Audit in Phase 4 planning before committing to `setQueryData` scope.

---

## Sources

### Primary (HIGH confidence)
- [TanStack Query v5 Optimistic Updates — Official Docs](https://tanstack.com/query/v5/docs/react/guides/optimistic-updates) — `onMutate`/`onError`/`onSettled` pattern, `cancelQueries` before `setQueryData`
- [TanStack Query v5 Important Defaults](https://tanstack.com/query/v5/docs/react/guides/important-defaults) — `staleTime` (0 default), `gcTime` (5 min default), `refetchOnWindowFocus` behavior
- [TanStack Query Caching Guide](https://tanstack.com/query/latest/docs/framework/react/guides/caching) — `staleTime` vs `gcTime` interaction, stale-while-revalidate behavior
- [TanStack Query Prefetching — Official Docs](https://tanstack.com/query/latest/docs/framework/react/guides/prefetching) — `queryClient.prefetchQuery` on hover pattern
- [BetterAuth Bearer Plugin — Official Docs](https://better-auth.com/docs/plugins/bearer) — bearer() plugin setup, `Set-Auth-Token` response header, mobile fallback pattern
- [BetterAuth Cookies — Official Docs](https://better-auth.com/docs/concepts/cookies) — `crossSubDomainCookies`, `defaultCookieAttributes`, reverse proxy recommendations
- [Vercel Rewrites docs](https://vercel.com/docs/rewrites) — external origin proxy config, wildcard path forwarding, SPA catch-all ordering
- [ws npm package](https://github.com/websockets/ws) — `perMessageDeflate` option and performance trade-offs
- [WebKit ITP: Full Third-Party Cookie Blocking](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/) — confirmed ITP enforcement at eTLD+1 level
- [WebSocket Heartbeat Patterns — Ably Best Practices](https://ably.com/topic/websocket-architecture-best-practices) — 25s heartbeat interval for load-balanced environments
- [Nginx WebSocket Proxy — nginx.org official](http://nginx.org/en/docs/http/websocket.html) — Upgrade header passthrough, `proxy_read_timeout` for long-lived connections
- Codebase direct inspection: `live-events-ws.ts`, `LiveUpdatesProvider.tsx`, `better-auth.ts`, `main.tsx`, `optimistic-issue-comments.ts`, `queryKeys.ts`, `live-events.ts` — high confidence, lines cited throughout research files

### Secondary (MEDIUM confidence)
- [TkDodo — Concurrent Optimistic Updates in React Query](https://tkdodo.eu/blog/concurrent-optimistic-updates-in-react-query) — `isMutating` guard for concurrent mutation flicker (TanStack maintainer, authoritative)
- [TkDodo — Using WebSockets with React Query](https://tkdodo.eu/blog/using-web-sockets-with-react-query) — WS invalidation + `staleTime: Infinity` pattern
- [BetterAuth GitHub Issue #4038](https://github.com/better-auth/better-auth/issues/4038) — cross-domain cookie not set on production; custom domain as correct solution
- [BetterAuth GitHub Discussion #2826](https://github.com/better-auth/better-auth/discussions/2826) — Safari ITP blocking cross-site cookies; public suffix domain failure
- [ws GitHub Issue #756](https://github.com/websockets/ws/issues/756) — `perMessageDeflate` performance discussion (older, conclusions still applicable)
- [TanStack Query Discussion #7932](https://github.com/TanStack/query/discussions/7932) — race condition with concurrent optimistic updates
- [Better Auth Safari Issue #3743](https://github.com/better-auth/better-auth/issues/3743) — Safari iOS Invalid Origin signOut bug (open issue, workarounds only)

### Tertiary (LOW confidence)
- [Cross-Site WebSocket Hijacking 2025 — IncludeSecurity](https://blog.includesecurity.com/2025/04/cross-site-websocket-hijacking-exploitation-in-2025/) — CSWSH via `SameSite=None` cookies; noted for WS Origin validation awareness
- [React 19 useOptimistic hook — FreeCodeCamp](https://www.freecodecamp.org/news/how-to-use-the-optimistic-ui-pattern-with-the-useoptimistic-hook-in-react/) — React 19 native optimistic pattern; TanStack Query `useMutation onMutate` is preferred for apps already using TanStack Query

---
*Research completed: 2026-04-05*
*Ready for roadmap: yes*
