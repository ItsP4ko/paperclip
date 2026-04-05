# Feature Research

**Domain:** Performance & Mobile Auth — Optimistic UI, Aggressive Caching, WebSocket Optimization, Cross-Origin Mobile Auth Fix
**Researched:** 2026-04-05
**Confidence:** HIGH (TanStack Query patterns, WS reconnection), HIGH (better-auth bearer plugin), MEDIUM (iOS Safari cross-origin specifics)

---

## Context: What This Milestone Is

v1.1 shipped a fully deployed SaaS stack. v1.2 targets perceived performance and mobile compatibility:

- **Optimistic UI** — status changes and assignment mutations reflect immediately in the UI; server processes in background; rollback on failure
- **Aggressive client caching** — list and detail data cached with meaningful staleTime so navigation re-visits feel instant (no loading spinner)
- **WebSocket optimization** — reduce real-time latency on the live deployment; add heartbeat/ping-pong to detect dead connections faster; narrow invalidation scope to avoid full-refetch floods
- **Mobile auth fix** — iOS Safari and Android Chrome users can log in and maintain session across requests on the cross-origin deployed stack

**What already exists:**
- TanStack Query v5 is already the data layer throughout the app
- `queryKeys` factory is well-structured and covers all entity types
- `LiveUpdatesProvider` handles WebSocket connect/reconnect with exponential backoff
- `optimistic-issue-comments.ts` has a partial optimistic comment pattern (not mutations via TanStack Query `useMutation`)
- Current WS reconnect: exponential backoff (1s to 15s cap), no application-level heartbeat, no ping-pong
- Current invalidation: `invalidateActivityQueries` and `invalidateHeartbeatQueries` broadcast-invalidate many query keys on every WS event — this triggers many simultaneous refetches

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in any modern web task app. Missing these = product feels broken or outdated.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Status change reflects before server response | Every modern task tool (Linear, Notion, GitHub) does this; waiting 300-800ms for a status badge to flip feels broken | MEDIUM | `useMutation` + `onMutate` snapshot + cache update + `onError` rollback + `onSettled` invalidation. Targets: `queryKeys.issues.detail(id)` and `queryKeys.issues.list(companyId)`. Already have the query key structure. |
| Assignment change reflects before server response | Same expectation — assigning a task to yourself should feel instant | MEDIUM | Same TanStack Query optimistic mutation pattern. The `applyOptimisticIssueCommentUpdate` function in `optimistic-issue-comments.ts` already handles reassignment on the issue object — reuse that logic inside a `useMutation` `onMutate`. |
| Revisiting an issue list within 2 minutes shows cached data instantly | Users navigate back and forth between lists and detail pages constantly; a spinner on every navigation kills flow | LOW | Set `staleTime: 2 * 60 * 1000` (2 minutes) globally or on issue list queries. Default staleTime is 0 — every navigation triggers a refetch. With 2-minute staleTime, cache hit returns instantly; background refetch still happens when stale. |
| My Tasks page renders correctly (no empty state despite having tasks) | This is a known v1.1 bug. Users expect their "My Tasks" view to show their tasks | LOW | Query key is `queryKeys.issues.listAssignedToMe(companyId)`. Likely cause: query fires before session resolves (no `enabled` guard), or stale cache with wrong user context. Fix: add `enabled: !!userId` guard and ensure correct query key includes userId. |
| WebSocket connection recovers from dead connections within 30 seconds | Real-time updates are a core UX promise. If the WS silently dies, users see stale data indefinitely | MEDIUM | Current code has reconnect on `onclose` but no heartbeat to detect dead connections that don't close. Add application-level ping/pong: client sends `{"type":"ping"}` every 25 seconds, server must respond `{"type":"pong"}`, client reconnects if no pong in 5 seconds. |
| Mobile users can log in and stay logged in | The app is deployed. Users will try it on phones. iOS Safari blocking cookies breaks auth entirely | HIGH | Current stack: BetterAuth + SameSite cookies. iOS Safari blocks cross-site cookies. Solutions in priority order: (1) custom domain so frontend/backend are same-root domain, (2) enable better-auth bearer plugin as fallback for environments where cookies fail, (3) SameSite=None; Secure with `partitioned: false` in BetterAuth config. |

### Differentiators (Competitive Advantage)

Features that elevate the app beyond "it works" — not expected, but meaningfully better UX.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Optimistic status change with visual rollback toast | If a status change fails (network error, permission error), the badge snaps back AND a toast explains why — users understand what happened rather than seeing silent inconsistency | MEDIUM | `onError` handler shows a `pushToast` error toast + restores previous cache snapshot. The toast infrastructure already exists (`useToast`, `pushToast`). |
| Narrow WS invalidation (targeted setQueryData) | Instead of invalidating 8+ query keys on every activity event, apply the exact change to the affected query's cached data without a network round-trip | HIGH | When a WS `activity.logged` event arrives with `action: "issue.updated"` and a full issue payload in `details`, call `queryClient.setQueryData(queryKeys.issues.detail(id), updatedIssue)` instead of `invalidateQueries`. Reduces post-WS network traffic by ~80% for issue updates. Requires server to include the updated entity in the WS payload. |
| Hover-prefetch on issue list rows | Hovering an issue row for 200ms prefetches the issue detail — when the user clicks, the detail page is already in cache | MEDIUM | `queryClient.prefetchQuery(queryKeys.issues.detail(issueRef))` on `onMouseEnter` with a 200ms debounce. No server changes needed. Pattern is proven and standard with TanStack Query. |
| Persistent gcTime for detail pages | Navigating away from an issue detail and back within 10 minutes shows cached data instantly (no skeleton) | LOW | Set `gcTime: 10 * 60 * 1000` on issue detail queries. Default gcTime is 5 minutes. gcTime > staleTime means data stays in memory even after going stale — stale-while-revalidate pattern. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Optimistic updates on every mutation everywhere | "Make everything instant" — sounds comprehensive | Creates a maintenance burden and subtle bugs. Not every mutation is safe to optimistically apply: creating a subtask generates a server-assigned identifier and sort order; creating a comment involves AI processing flags; file uploads have size-dependent paths. Applying optimistic updates to complex server-computed outcomes causes flicker when the server response differs from the optimistic guess. | Limit optimistic updates to simple field mutations with predictable outcomes: status changes (enum flip), assignment changes (FK swap). Defer to standard mutation + invalidate for creates, deletes, and anything with server-computed fields. |
| Replacing invalidateQueries with setQueryData for all WS events | "Eliminate all refetches" — sounds faster | Requires the WS payload to carry the full entity shape every time. If the server sends a partial update or the payload shape diverges from the client's cached type, the cache gets corrupted silently. This is harder to debug than a refetch. | Use `setQueryData` only when the WS payload explicitly includes a full entity snapshot (explicitly designed for it). Use `invalidateQueries` with narrow scope for all other events — it's safe and correct by default. |
| Service Worker caching for API responses | "Cache API calls at the SW level for offline support" | Paperclip issues and agent state change constantly — caching API responses at the SW level can serve dangerously stale data. TanStack Query already provides the right caching model with freshness controls. Adding a SW cache layer creates two competing caching layers with unclear precedence. | Let TanStack Query be the caching layer. Service Workers are appropriate for static assets (already handled by Vercel CDN), not dynamic API data. |
| JWT bearer tokens everywhere (replacing session cookies) | "Avoid all cookie complexity by switching to JWTs" | BetterAuth's session model is already implemented throughout the codebase. Replacing it requires rewriting auth middleware, session lookup, and every `getSession()` call. JWTs also have their own problems: token invalidation requires a blacklist (another Redis dependency), and localStorage is XSS-vulnerable. | The mobile auth problem is specifically about cross-origin iOS Safari cookie behavior, not a fundamental flaw in session cookies. Fix the deployment topology (custom domain = same-root domain) or enable better-auth bearer plugin as a targeted override for mobile contexts — don't replace the auth system. |
| Server-Sent Events (SSE) replacing WebSockets | "SSE is simpler and handles proxies better" | The existing `LiveUpdatesProvider` is a mature WebSocket client with reconnection logic, toast suppression, and query invalidation integration. Rewriting it to SSE provides no user-visible improvement for the latency issue, which is likely proxy buffering or missing ping/pong, not a WebSocket vs SSE architectural problem. | Fix the WebSocket latency by diagnosing the actual cause: add heartbeat, check Nginx proxy buffering config on Easypanel (`proxy_buffering off`, `proxy_read_timeout 3600s`), add `Connection: Upgrade` headers if missing. |

---

## Feature Dependencies

```
[Optimistic status change]
    └──requires──> [useMutation with onMutate/onError/onSettled wired to existing queryKeys]
    └──requires──> [existing queryKeys.issues.detail and queryKeys.issues.list structure]
    └──enhances──> [My Tasks page fix] (optimistic update on My Tasks query key too)

[Optimistic assignment change]
    └──requires──> [same useMutation pattern as status change]
    └──reuses──> [applyOptimisticIssueCommentUpdate logic already in optimistic-issue-comments.ts]

[Aggressive caching (staleTime)]
    └──requires──> [nothing new — QueryClient configuration only]
    └──enhances──> [hover-prefetch] (prefetch populates cache that staleTime keeps fresh)

[My Tasks page fix]
    └──requires──> [session.user.id available before query fires (enabled guard)]
    └──depends-on──> [auth.session query resolving correctly]

[WebSocket heartbeat]
    └──requires──> [server-side handler for {"type":"ping"} → responds {"type":"pong"}]
    └──requires──> [client-side timer in LiveUpdatesProvider to send ping and await pong]
    └──depends-on──> [existing WebSocket infrastructure in LiveUpdatesProvider]

[Narrow WS invalidation (setQueryData)]
    └──requires──> [server sends full entity payload in WS event details field]
    └──depends-on──> [WebSocket heartbeat working correctly (dead connection detection)]

[Mobile auth fix — custom domain approach]
    └──requires──> [DNS CNAME for api.paperclip.ai → Easypanel backend]
    └──requires──> [BetterAuth BETTER_AUTH_URL updated to custom domain]
    └──requires──> [CORS updated to allow new frontend domain]
    └──highest-impact──> [resolves iOS Safari cookie blocking at the root]

[Mobile auth fix — bearer plugin fallback]
    └──requires──> [better-auth bearer plugin enabled server-side]
    └──requires──> [client detects cookie failure and falls back to Authorization header]
    └──complexity──> [more client-side auth plumbing; doesn't fix the cookie issue for non-bearer flows]
```

### Dependency Notes

- **Optimistic mutations require correct query key targeting:** The `queryKeys` structure already exists and is well-scoped. Optimistic updates must snapshot and update both `issues.detail(id)` and `issues.list(companyId)` (and `issues.listAssignedToMe`) since both surfaces show status/assignee.
- **My Tasks fix is independent of optimistic UI:** It's a query `enabled` guard / key correctness bug, not a caching strategy issue. It should be fixed in the same phase but requires no shared code.
- **Heartbeat before narrow invalidation:** Dead connection detection is required before optimizing invalidation granularity. If the socket silently dies and we've removed broad invalidation, users see stale data with no recovery path.
- **Mobile auth — custom domain is lowest-friction for users.** Bearer plugin approach works but requires client-side complexity. If the Easypanel deployment can get a custom domain, that removes the cross-origin problem for all browsers without code changes.

---

## MVP Definition

### v1.2 Launch With (minimum for "feels fast" goal)

These are the features required to meet the v1.2 goal of making every interaction feel instant and fixing mobile auth.

- [ ] **Optimistic status change** — status badge flips immediately on click, rolls back with toast on error
- [ ] **Optimistic assignment change** — assignee field updates immediately, rolls back on error
- [ ] **staleTime: 2 minutes on issue lists** — navigation between list pages feels instant on revisit
- [ ] **My Tasks page renders correctly** — the known empty-state bug fixed (session-aware query guard)
- [ ] **WebSocket heartbeat (ping/pong, 25s interval)** — dead connections detected and reconnected within 30 seconds
- [ ] **Mobile login fix** — iOS Safari and Android Chrome users can log in and stay logged in

### Add After Core Features Verified (v1.2 polish)

Add once the above are working and stable. These enhance the experience but don't fix broken flows.

- [ ] **Rollback error toast** — show a specific error message when optimistic rollback occurs (not just silent revert)
- [ ] **gcTime: 10 minutes on issue detail** — navigating back to a detail page renders immediately
- [ ] **Narrow WS invalidation for issue.updated events** — replace 8-key invalidation flood with targeted setQueryData when server payload includes full issue
- [ ] **Hover-prefetch on issue rows** — 200ms hover delay prefetches the detail before click

### Future Consideration (v1.3+)

- [ ] **Prefetch on route hover** — prefetch issue lists when user hovers nav items (router loader integration)
- [ ] **Optimistic comment submission** — the `OptimisticIssueComment` infrastructure exists; wire it through useMutation properly
- [ ] **Background sync on reconnect** — after WS reconnects, trigger a targeted state-sync for the visible entity rather than relying on the next event
- [ ] **Progressive Web App (PWA) shell caching** — Vite PWA plugin for asset caching; independent of API caching

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Optimistic status change | HIGH — most frequent action in any task app | MEDIUM — useMutation + onMutate + rollback | P1 |
| My Tasks page empty-state bug | HIGH — broken feature from v1.1, users can't trust the view | LOW — query enabled guard + key audit | P1 |
| staleTime on issue lists | HIGH — eliminates spinner on most navigations | LOW — QueryClient config change | P1 |
| Mobile login fix | HIGH — users on iOS/Android can't log in at all | MEDIUM–HIGH — depends on approach (domain vs bearer) | P1 |
| WebSocket heartbeat | MEDIUM — addresses the known "WS is slow/laggy" complaint | MEDIUM — server + client ping/pong loop | P1 |
| Optimistic assignment change | MEDIUM — less frequent than status; same code pattern | LOW (reuses status change pattern) | P2 |
| Rollback error toast | MEDIUM — makes failures legible instead of silent | LOW — uses existing toast infrastructure | P2 |
| gcTime on issue detail | MEDIUM — improves back-navigation speed | LOW — QueryClient config | P2 |
| Narrow WS invalidation | MEDIUM — reduces post-WS refetch traffic | HIGH — requires server payload changes | P2 |
| Hover-prefetch on issue rows | LOW — nice-to-have, not fixing anything broken | LOW | P3 |

**Priority key:**
- P1: Required for v1.2 goal — "instant interactions + mobile auth works"
- P2: Should ship in v1.2 if implementation is clean; defer to v1.2.1 if it adds risk
- P3: Defer to v1.3

---

## Implementation Patterns (Verified)

### Optimistic Status Change (TanStack Query v5 pattern)

The canonical TanStack Query v5 optimistic mutation flow — verified against official docs:

```
onMutate:
  1. cancelQueries({ queryKey: issues.detail(id) })
  2. snapshot = getQueryData(issues.detail(id))
  3. setQueryData(issues.detail(id), { ...snapshot, status: newStatus })
  4. return { snapshot }

onError:
  1. setQueryData(issues.detail(id), context.snapshot)
  2. pushToast({ title: "Status change failed", tone: "error" })

onSettled:
  1. invalidateQueries({ queryKey: issues.detail(id) })
  2. invalidateQueries({ queryKey: issues.list(companyId) })
  3. invalidateQueries({ queryKey: issues.listAssignedToMe(companyId) })
```

Use `onSettled` not `onSuccess` for invalidation — runs regardless of outcome, ensuring eventual consistency even when rollback fires.

### WebSocket Heartbeat Pattern (25-second interval, verified against industry standards)

Production-recommended interval for a system behind a load balancer:

```
Client:
  - setInterval: every 25 seconds, send JSON.stringify({ type: "ping" })
  - set a 5-second timeout waiting for pong
  - if timeout fires without pong: closeSocket() → scheduleReconnect()
  - on message: if type === "pong", clear the pong timeout

Server (live-events.ts):
  - on message: if type === "ping", ws.send(JSON.stringify({ type: "pong" }))
```

The existing `LiveUpdatesProvider` handles `onmessage` — add pong detection there. The existing `scheduleReconnect` function handles reconnection.

### Mobile Auth — Approach Priority

1. **Custom domain (recommended):** `api.paperclip.ai` → Easypanel backend. Same root domain as `app.paperclip.ai` → Vercel frontend. Cookies with `domain: .paperclip.ai` are first-party on both. No code changes to auth. Requires DNS config + BetterAuth BETTER_AUTH_URL + CORS update.

2. **Bearer plugin fallback (if custom domain not available):** Enable `bearer()` plugin in BetterAuth server config. After sign-in, client reads token from response header and stores in `localStorage`. Outgoing requests include `Authorization: Bearer <token>`. better-auth docs explicitly warn this approach requires careful implementation to avoid security issues — limit to authenticated API calls only, never expose the token to untrusted code.

3. **SameSite=None with `partitioned: false`:** Set `partitioned: false` in BetterAuth cookie config. Requires HTTPS on both origins (already true). Known to fail on some iOS versions due to ITP regardless of SameSite attribute. This is the least reliable option.

---

## Known Gaps to Address in Implementation

- **WS latency root cause unknown:** The "WebSocket is slow" complaint may be proxy buffering (Nginx on Easypanel missing `proxy_buffering off` and `proxy_read_timeout 3600s`) rather than application code. Before writing heartbeat code, verify Nginx config on Easypanel — this may be a 2-line infra fix.
- **iOS Safari ITP behavior is moving:** Apple changes ITP behavior in iOS updates. The custom domain approach is the only approach that is stable across iOS versions because it eliminates cross-origin entirely.
- **Narrow WS invalidation requires server payload audit:** The `activity.logged` WS event currently sends `details` with partial data (enough for toast messages). Adding full entity snapshots to `details` for `setQueryData` use requires auditing what `publishLiveEvent` sends in `server/src/services/live-events.ts` — this is a server change, not just client-side.

---

## Sources

- [TanStack Query v5 Optimistic Updates — Official Docs](https://tanstack.com/query/v5/docs/framework/react/examples/optimistic-updates-cache) — onMutate/onError/onSettled pattern, use onSettled not onSuccess (HIGH confidence)
- [TanStack Query staleTime vs gcTime — Official Docs](https://tanstack.com/query/latest/docs/framework/react/guides/caching) — staleTime 0 default, gcTime 5 minutes default, stale-while-revalidate behavior (HIGH confidence)
- [TanStack Query Prefetching — Official Docs](https://tanstack.com/query/latest/docs/framework/react/guides/prefetching) — ensureQueryData, queryClient.prefetchQuery on hover (HIGH confidence)
- [Better Auth Bearer Plugin — Official Docs](https://better-auth.com/docs/plugins/bearer) — bearer() plugin setup, explicit warning about mobile-only use (HIGH confidence)
- [Better Auth Cross-Domain Cookie Issues — GitHub #4038](https://github.com/better-auth/better-auth/issues/4038) — partitioned: false fix, custom domain as correct solution, public suffix domains cause failures (MEDIUM confidence)
- [WebSocket Heartbeat Patterns — Ably Best Practices](https://ably.com/topic/websocket-architecture-best-practices) — 25-second heartbeat for load-balanced environments, exponential backoff + jitter (HIGH confidence)
- [Nginx WebSocket Proxy — nginx.org official](http://nginx.org/en/docs/http/websocket.html) — Upgrade header passthrough requirement, proxy_read_timeout for long-lived connections (HIGH confidence)
- [iOS Safari Cross-Site Cookie Behavior — better-auth discussion #2826](https://github.com/better-auth/better-auth/discussions/2826) — Safari ITP blocks cross-site cookies regardless of SameSite=None in some configurations (MEDIUM confidence)
- [React 19 useOptimistic hook — FreeCodeCamp](https://www.freecodecamp.org/news/how-to-use-the-optimistic-ui-pattern-with-the-useoptimistic-hook-in-react/) — React 19 native optimistic pattern; TanStack Query useMutation onMutate is preferred for apps already using TanStack Query (MEDIUM confidence)

---

*Feature research for: Paperclip v1.2 Performance & Mobile Auth*
*Researched: 2026-04-05*
