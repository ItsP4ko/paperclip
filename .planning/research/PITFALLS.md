# Pitfalls Research

**Domain:** Adding optimistic UI, aggressive caching, WebSocket optimization, and mobile cross-origin auth to an existing deployed task management app (Paperclip v1.2)
**Researched:** 2026-04-05
**Confidence:** HIGH (code-verified against live codebase + community sources + official docs)

---

## Critical Pitfalls

Mistakes in this tier cause complete feature failure, silently broken behavior, or user-visible data corruption.

---

### Pitfall 1: Optimistic update succeeds visually but WS-driven invalidation reverts it before server responds

**What goes wrong:**
`LiveUpdatesProvider.tsx` calls `invalidateActivityQueries()` every time an `activity.logged` WS event arrives. If the current user mutates an issue (status change, reassignment) and the server publishes the `activity.logged` event before the mutation's `onSettled` fires client-side, the TanStack Query invalidation triggers a background refetch. That refetch can complete and write server data into the cache while the optimistic value is still showing. The optimistic value is overwritten, creating a flash where the status briefly reverts to the pre-mutation value.

**Why it happens:**
The `invalidateActivityQueries` function in `LiveUpdatesProvider.tsx` (lines 480–564) fires unconditionally on every `activity.logged` event for the current company — it does not check whether a mutation for that entity is currently in-flight. TanStack Query's `invalidateQueries` marks the query stale and triggers an immediate background refetch if the query is currently mounted. If that refetch resolves before the mutation's `onSettled` fires, the stale server data overwrites the optimistic cache value.

**How to avoid:**
Gate invalidation on `queryClient.isMutating()`. In `onMutate`, give the mutation a stable key (e.g. `mutationKey: ['issues', 'update', issueId]`). In `LiveUpdatesProvider`, before calling `invalidateActivityQueries`, check:

```ts
if (queryClient.isMutating({ mutationKey: ['issues', 'update'] }) > 0) return;
```

Alternatively, in each mutation's `onSettled`, call `invalidateQueries` explicitly and cancel automatic WS-driven invalidation for those query keys during the mutation window.

Also: always call `queryClient.cancelQueries(queryKeys.issues.detail(id))` in `onMutate` to abort any in-flight fetches before writing the optimistic value.

**Warning signs:**
- Status badge briefly flashes back to old value after clicking a status button, then settles on the new value
- Network tab shows a GET for the issue detail completing between the PATCH request and its response
- Only happens on deployed environment (higher network latency), not localhost

**Phase to address:**
Phase 1 (Optimistic UI mutations) — this is the most common failure mode for optimistic updates in the existing architecture and must be solved before shipping any optimistic mutation.

---

### Pitfall 2: Aggressive staleTime hides mutations to lists that share the same query key root

**What goes wrong:**
The plan is to increase `staleTime` globally (currently 30s) to make navigation feel instant. The issue list query (`queryKeys.issues.list(companyId)`) and the "assigned to me" query (`queryKeys.issues.listAssignedToMe(companyId)`) are separate keys. When a status mutation fires and `onSettled` invalidates `queryKeys.issues.detail(issueId)`, it does NOT automatically invalidate the list query. With a long staleTime the list remains in cache and shows stale data until the WS event arrives and calls `invalidateActivityQueries`.

If the WS connection is slow (the known v1.1 latency issue) or temporarily disconnected, the list will show the old status for seconds or minutes after the user changed it via the detail view.

**Why it happens:**
TanStack Query's cache is key-granular. Invalidating a detail query does not cascade to list queries unless explicitly programmed. Increasing staleTime extends the window in which stale lists are served from cache. The existing WS-based invalidation is the only mechanism that bridges this gap — and it has known latency.

**How to avoid:**
In each mutation's `onSettled`, invalidate both the detail and all affected list variants:

```ts
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.issues.listAssignedToMe(companyId) });
  // ... other list variants the mutation can affect
}
```

Do not rely on WS invalidation as the only mechanism for list freshness after a local mutation. WS invalidation is appropriate for other users' changes; the local user's own mutations should drive their own invalidation synchronously.

**Warning signs:**
- User changes status on a detail page, navigates back to the list — list still shows old status until WS event arrives
- "My Tasks" badge count updates correctly (from WS) but the list items show stale data
- Only reproducible when staleTime is > 0

**Phase to address:**
Phase 2 (Aggressive caching) — define the invalidation strategy before tuning staleTime; never increase staleTime without auditing which list queries a mutation affects.

---

### Pitfall 3: Concurrent rapid mutations (e.g. clicking status multiple times) create window of inconsistency even with cancelQueries

**What goes wrong:**
The TanStack Query `cancelQueries` in `onMutate` only cancels the most-recently-started fetch for that query key. If a user clicks a status button twice quickly (mutation A fires, then mutation B fires while A is still in-flight), mutation B's `onMutate` will find nothing to cancel because A's query has already been cancelled and A's server request is in-flight. When mutation A settles and calls `invalidateQueries`, the background refetch triggered by that invalidation can race with mutation B's optimistic value and overwrite it.

**Why it happens:**
`cancelQueries` operates on queries (fetches), not on mutations. It cannot cancel or coordinate with sibling mutations. This is a documented TanStack Query limitation described in the library's official guidance on concurrent optimistic updates.

**How to avoid:**
Use `queryClient.isMutating()` to gate `invalidateQueries` in `onSettled`:

```ts
onSettled: (_data, _err, variables) => {
  const key = ['issues', 'update', variables.issueId];
  // Only invalidate if this is the last mutation for this entity
  if (queryClient.isMutating({ mutationKey: key }) === 1) {
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(variables.issueId) });
  }
}
```

`isMutating` returns the count including the current mutation, so `=== 1` means "I am the only in-flight mutation for this key."

Use distinct, scoped `mutationKey` arrays per entity (not per mutation type) so the check is accurate.

**Warning signs:**
- Status button double-click causes visible flash: status A → status B → status A briefly → status B
- Only visible at network latency > 50ms (i.e., on live deployment, not localhost)
- Reproducible by rapidly clicking the same dropdown option twice

**Phase to address:**
Phase 1 (Optimistic UI mutations) — implement `isMutating` guard from the first optimistic mutation shipped.

---

### Pitfall 4: iOS Safari + cross-origin cookies — SameSite=None already in production but CHIPS (partitioned) attribute causes silent session loss

**What goes wrong:**
The existing `better-auth.ts` already sets `sameSite: "none"` and `secure: true` for HTTPS deployments (lines 103–107 of `better-auth.ts`). This fixed desktop Chrome/Firefox. On iOS Safari, third-party cookie blocking is enforced by default regardless of SameSite attribute. If the backend (`api.paperclipai.com`) and frontend (`app.paperclipai.com`) are on different subdomains of the same root domain, the solution is to enable `crossSubDomainCookies` in better-auth and set the cookie domain to the root domain. If they are on completely different registrable domains (different eTLD+1), no cookie configuration will work — Safari will block them.

**Why it happens:**
Safari has enforced full third-party cookie blocking (ITP — Intelligent Tracking Prevention) since iOS 14. Unlike Chrome, Safari does not respect `SameSite=None` as a signal that a cookie is intentionally cross-site; it enforces first-party classification based on the registrable domain (eTLD+1). An `onrender.com`-hosted backend treated as a "public suffix" receives no cookie from a Vercel-hosted frontend even with `SameSite=None; Secure`.

**How to avoid:**
The registrable domains must share the same eTLD+1 (e.g. both under `paperclipai.com`). Configure better-auth with:

```ts
crossSubDomainCookies: {
  enabled: true,
  domain: ".paperclipai.com", // root domain, note leading dot
},
advanced: {
  defaultCookieAttributes: {
    sameSite: "none",
    secure: true,
  },
},
```

If custom domains are not available, the fallback is to use a reverse proxy so the frontend and backend appear to be on the same origin (e.g., Vercel rewrites `/api/*` to the backend). This makes the session cookie first-party from the browser's perspective.

Do NOT use platform default subdomains (e.g., `yourapp.onrender.com`, `yourapp.railway.app`) as the production auth domain — these are public suffix domains and Safari will treat them as third-party even for sub-subdomains.

**Warning signs:**
- Login succeeds on desktop but immediately shows logged-out state on iOS Safari
- `document.cookie` is empty on iOS despite successful login network call
- Disabling "Prevent cross-site tracking" in Safari settings fixes the problem (confirms ITP as the cause)
- Chrome on iOS works (Chrome on iOS uses WebKit but has its own tracking protection behavior)

**Phase to address:**
Phase 3 (Mobile cross-origin auth fix) — verify the custom domain setup with a real iOS device before marking the phase complete. Simulators do not enforce ITP the same way real devices do.

---

### Pitfall 5: WebSocket live-events service uses in-process EventEmitter — events are lost if the server is restarted mid-session, with no reconnect-triggered catch-up

**What goes wrong:**
`live-events.ts` uses a Node.js `EventEmitter` (`emitter.emit(companyId, event)`) with an incrementing in-memory `nextEventId`. When `LiveUpdatesProvider.tsx` reconnects after a disconnect (e.g. server restart during Easypanel deploy, brief network drop), it creates a new WebSocket connection from scratch with no concept of "last received event ID." All events emitted during the disconnect window are lost and the UI is never notified. The user sees no error — the connection silently recovers but is now behind.

**Why it happens:**
The current WS architecture is fire-and-forget. There is no server-side event buffer, no client-side "last event ID" parameter, and no reconnect-triggered refetch of all invalidatable queries. `LiveUpdatesProvider.tsx` reconnects but does not re-validate the cache state after reconnection.

**How to avoid:**
On reconnect (`onopen` handler), immediately invalidate all active queries for the current company to force a fresh fetch. This is the cheapest and most reliable recovery:

```ts
nextSocket.onopen = () => {
  if (reconnectAttempt > 0) {
    // Reconnect: we may have missed events; invalidate all company queries
    queryClient.invalidateQueries({ queryKey: ['issues', liveCompanyId] });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(liveCompanyId) });
    // ... other high-priority keys
    gateRef.current.suppressUntil = Date.now() + RECONNECT_SUPPRESS_MS;
  }
  reconnectAttempt = 0;
};
```

This is already where `RECONNECT_SUPPRESS_MS` is applied for toast suppression — the invalidation logic belongs in the same block.

**Warning signs:**
- User leaves tab for 30 seconds (server restarted), comes back — status on list is stale, no toast notification
- WS Network tab shows a gap in frames then resumes — but no fresh GET requests follow the reconnect
- Reproducible by killing the backend process and restarting while the frontend is open

**Phase to address:**
Phase 4 (WebSocket optimization) — pair reconnect invalidation with the WS latency work. Also relevant to Phase 2 (caching) — aggressive caching makes the missed-event problem worse because stale data stays in cache longer.

---

### Pitfall 6: Increasing staleTime globally breaks features that rely on background refetch for correctness (e.g. "My Tasks" badge count)

**What goes wrong:**
The "My Tasks" page currently shows an empty list despite the sidebar badge count being correct. The badge uses `queryKeys.sidebarBadges(companyId)` and the list uses `queryKeys.issues.listAssignedToMe(companyId)`. If `staleTime` is increased globally to, say, 5 minutes, and the badge is fetched on one polling cycle but the list is from a stale cache, the badge and the list will be inconsistent for 5 minutes. More critically, if the existing bug (list renders empty) is caused by a timing issue in initial data hydration, increasing staleTime will make the bug harder to reproduce and harder to debug because it suppresses background refetches.

**Why it happens:**
Global `staleTime` tuning is a blunt instrument. Different queries have different freshness requirements. Some queries (health check, session) must always be fresh. Others (issues list) can tolerate minutes of staleness. Applying a single `staleTime` to everything without auditing each query category causes collateral damage.

**How to avoid:**
Do NOT change the global `staleTime` in `main.tsx`. Instead, set `staleTime` per-query at the `useQuery` call site based on the data's sensitivity:

- `staleTime: Infinity` — static reference data (instance settings, agent list on stable orgs)
- `staleTime: 5 * 60_000` — semi-stable data (project list, issue detail after user viewed it)
- `staleTime: 30_000` (keep current default) — live data (issue lists, sidebar badges)
- `staleTime: 0` (override to always-fresh) — session, health check

Fix the "My Tasks" empty list bug separately before tuning any staleTime values — it must be working correctly before you can tell if a staleTime change breaks it.

**Warning signs:**
- Sidebar badge shows "3 tasks" but My Tasks page shows empty list after increasing staleTime
- Navigating away and back refreshes the list (confirms the issue is staleTime suppressing the mount refetch)
- Issue status changes made on a detail page are not reflected in the list for minutes

**Phase to address:**
Phase 2 (Aggressive caching) — audit every `useQuery` call before assigning staleTime; the My Tasks bug must be resolved in Phase 1 or the caching phase cannot be safely verified.

---

### Pitfall 7: Optimistic rollback leaves UI in inconsistent state when the rollback logic mirrors fields the server never returns

**What goes wrong:**
`applyOptimisticIssueCommentUpdate` (in `optimistic-issue-comments.ts`) only patches `status` and `assigneeAgentId`/`assigneeUserId` on the local issue copy. If the PATCH `/issues/:id` endpoint returns more derived fields (e.g. `updatedAt`, `updatedByUserId`, field computed from triggers) that the optimistic copy does not set, the rollback snapshot (captured in `onMutate`) will contain the pre-mutation values of those fields. After rollback, `setQueryData(context.previousData)` restores the correct snapshot, but any subsequent fetch will return the server-authoritative version — which may include partial writes from the failed mutation depending on when the server errored.

The more subtle failure: if `onError` calls `setQueryData(context.previousData)` but the component reading that data has already re-rendered with a different server-authoritative fetch (from WS invalidation), the rollback silently no-ops without user feedback.

**Why it happens:**
Optimistic updates require the client to anticipate exactly what the server would have done. Any field the server computes (timestamps, computed columns, derived aggregates) is not in the client model. The rollback correctly restores the pre-mutation state, but developers sometimes skip the rollback entirely or write it incorrectly because the happy path never exercises it.

**How to avoid:**
Always implement the full three-callback pattern: `onMutate` (snapshot + optimistic write), `onError` (rollback from snapshot), `onSettled` (invalidate regardless). Never skip `onError`. Confirm rollback works by testing the error path (mock `issuesApi.update` to reject):

```ts
onMutate: async (variables) => {
  await queryClient.cancelQueries({ queryKey: queryKeys.issues.detail(issueId) });
  const snapshot = queryClient.getQueryData(queryKeys.issues.detail(issueId));
  queryClient.setQueryData(queryKeys.issues.detail(issueId), (old) => ({
    ...old,
    status: variables.status, // only the fields being changed
  }));
  return { snapshot };
},
onError: (_err, _variables, context) => {
  if (context?.snapshot) {
    queryClient.setQueryData(queryKeys.issues.detail(issueId), context.snapshot);
  }
},
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) });
},
```

Show a toast on `onError` — silent rollback is a UX failure.

**Warning signs:**
- Issue status reverts correctly on network error, but no error message is shown to the user
- After rollback, the status flickers between old and new before settling
- Error tests pass but the rollback snapshot is stale (captured before a concurrent mutation)

**Phase to address:**
Phase 1 (Optimistic UI mutations) — write error tests alongside the happy-path implementation.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Increase global `staleTime` in `main.tsx` | One-line change, instant perceived performance | Masks bugs in data consistency; breaks features relying on background refetch for correctness | Never — use per-query staleTime instead |
| Skip `isMutating` guard and rely on WS invalidation for consistency after concurrent mutations | Simpler mutation code | Visible flash / revert on live deployment with high latency | Never for status/assignment mutations that users repeat rapidly |
| Add reconnect invalidation only for issues, not other entity types | Faster to implement | Dashboard, sidebar badges, org view remain stale after reconnect | Acceptable for v1.2 if only issues are tested; must be broadened before multi-user testing |
| Fix mobile auth by prompting user to disable Safari tracking | Zero dev work | Poor UX; users do not understand what "tracking prevention" means | Never in production |
| Use `localStorage` fallback for session state on mobile | Unblocks mobile login | Session token exposed to XSS; bypasses HTTPS-only cookie protections | Never — use proper cookie configuration or reverse proxy |
| Only implement optimistic updates for status, not assignment | Reduces scope | Assignment UI still feels slow; creates inconsistent UX within the same feature area | Acceptable for first iteration if assignment is covered in a follow-up task within the same milestone |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| TanStack Query + `invalidateActivityQueries` (WS) | `invalidateQueries` fires during in-flight mutation, overwrites optimistic value | Gate WS-triggered invalidation with `queryClient.isMutating()` check |
| TanStack Query + multiple list query keys | Invalidating only the detail after a mutation; lists stay stale | Enumerate all list variants in `onSettled` invalidation |
| Better Auth + iOS Safari | Setting `SameSite=None` without matching eTLD+1 | Both frontend and backend must share the same root domain; use custom domain, not platform default subdomain |
| Better Auth + iOS Safari | Testing on iOS Simulator | Simulator does not enforce ITP; always verify on a real device |
| Better Auth + iOS Safari | Setting `crossSubDomainCookies` without `domain` pointing to root | Cookie domain must be `.example.com` (leading dot) to cover all subdomains |
| Express WS + Easypanel | Assuming the connection is direct; may have an nginx proxy in front | Verify `proxy_read_timeout` on the nginx config (Easypanel default may be 60s) — long-lived WS connections get silently killed |
| WS in-process EventEmitter + server restart | Reconnect silently succeeds but misses events from restart window | Trigger `invalidateQueries` for all company keys on reconnect (when `reconnectAttempt > 0`) |
| Redis cache + optimistic writes | Caching API responses that are now stale due to optimistic mutations | Redis cache is server-side; it is invalidated on server writes. Client-side TQ cache is separate. Do not confuse the two layers |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `onSettled` invalidates all issues list queries unconditionally | Every mutation causes full list refetch; visible loading spinners after every click | Use `setQueryData` to update the list item in-place instead of invalidating the whole list | As soon as lists contain > 20 items and network latency > 50ms |
| WS event triggers broad `invalidateActivityQueries` on every activity | N simultaneous agents all writing = N × K query invalidations per WS event | The existing code already batches by type; do not add more keys to the invalidation fan-out | When multiple agents are active on the same company (>3 simultaneous agents) |
| `refetchOnWindowFocus: true` (current default) + long staleTime = tab refocus floods network | User switches tabs; every stale query fires simultaneously | Set `refetchOnWindowFocus: false` for queries that are WS-driven (they are refreshed by events, not focus) | Any staleTime > 60s with `refetchOnWindowFocus: true` |
| WS reconnect exponential backoff up to 15s (current max) | After deploy restart, UI is unresponsive to live events for up to 15s | Current max is acceptable; do not increase it. Consider a post-reconnect targeted invalidation to compensate | Always (by design) — mitigated by the reconnect invalidation pattern |
| Redis rate limiter adding latency to every API request | Every mutation feels slower than expected despite client-side optimism | Rate limiter should be checked: ensure it uses local memory counter for non-Redis fallback path, not a blocking Redis call | On Easypanel VPS without persistent Redis connection (Redis disconnects silently) |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Using `SameSite=None; Secure` without verifying HTTPS on both ends | Browser silently drops cookie if backend is HTTP | Always confirm backend URL starts with `https://` in production before enabling `SameSite=None` |
| Optimistic writes reflecting data the user should not be able to set | User can manipulate client state beyond their permissions | Optimistic logic should mirror server authorization rules — only apply optimistic updates for fields the current user can legitimately change |
| Passing session token as WS query param (`?token=...`) in cleartext in logs | Token visible in nginx/Easypanel access logs | Current WS auth already handles browser sessions via cookie; do not add query param tokens for human users |
| Cross-Site WebSocket Hijacking (CSWSH) via `SameSite=None` cookies | Malicious site can open WS connection authenticated as the logged-in user | Current `live-events-ws.ts` validates session via `resolveSessionFromHeaders` on upgrade; ensure `Origin` header is validated against `allowedHostnames` (already handled via `boardMutationGuard` equivalent for WS) |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent optimistic rollback (no toast on error) | User believes mutation succeeded; discovers stale data later | Always show an error toast in `onError` with an actionable message ("Status change failed — try again") |
| Optimistic update for assignment shows the new assignee name before the assignee list is in cache | Assignee name shows as UUID or "Unknown" until cache loads | Pre-fetch assignee data (agents + members) before enabling assignment mutations; or resolve name from local cache synchronously |
| WS reconnect suppresses toasts for 2s (`RECONNECT_SUPPRESS_MS`) but does not show a "reconnecting" indicator | User does not know they missed real-time updates | Add a subtle "Reconnecting..." banner or indicator during reconnect attempts (when `reconnectAttempt > 0`) |
| Status dropdown closes immediately on click (optimistic) but server rejects the change | User sees the old status restored with no explanation | Keep dropdown open until mutation settles, or show an inline error state on the status badge |
| Increasing staleTime makes "first load after inactivity" feel fast but "return to list after mutation" feel wrong | User changes something, goes back, sees wrong state | Use per-query staleTime; never suppress background refetch for queries that show mutable data the user just changed |

---

## "Looks Done But Isn't" Checklist

- [ ] **Optimistic status mutation:** Happy path works — verify error path: disconnect network, change status, reconnect — confirm rollback fires and error toast shows.
- [ ] **Optimistic assignment mutation:** Status change also reflected in list view (not just detail view) without page reload.
- [ ] **Concurrent mutations:** Rapidly click a status button three times — verify UI settles on the last clicked value, does not flash intermediate states.
- [ ] **My Tasks empty list bug:** The bug must be resolved and verified before aggressive caching is applied — confirm "My Tasks" renders items without a hard refresh.
- [ ] **Mobile login (iOS Safari):** Test on a real iPhone (not Simulator) with "Prevent cross-site tracking" enabled (Safari default) — confirm login persists across tab switches.
- [ ] **WS reconnect invalidation:** Kill the backend process, wait for reconnect (`reconnectAttempt > 0` fires), verify a GET fires for issues list immediately after reconnect.
- [ ] **staleTime per-query audit:** Confirm `staleTime: Infinity` is not applied to any query that shows mutable business data (issues, assignments, statuses).
- [ ] **Redis connection loss:** Stop Redis, perform a mutation — confirm the server falls back gracefully and the mutation still resolves (Redis is optional by design).

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Optimistic update races WS invalidation | LOW | Add `isMutating` guard to `invalidateActivityQueries`; deploy server-side is not needed, frontend-only change |
| Stale list after mutation (wrong staleTime) | LOW | Revert per-query staleTime change; add explicit list invalidation to `onSettled`; frontend redeploy only |
| Concurrent mutation flicker | LOW | Add `mutationKey` + `isMutating === 1` guard; frontend-only change |
| iOS Safari login broken (wrong domain config) | MEDIUM | Set up custom domain on both Vercel and Easypanel; update `BETTER_AUTH_TRUSTED_ORIGINS` and `crossSubDomainCookies`; may require DNS propagation wait |
| WS events missed after reconnect | LOW | Add `queryClient.invalidateQueries` block to `onopen` handler when `reconnectAttempt > 0`; frontend-only change |
| Silent rollback (no error toast) | LOW | Add `onError` toast to each mutation; frontend-only change |
| Global staleTime increase breaks "My Tasks" | LOW | Revert `main.tsx` staleTime change; audit and fix My Tasks bug independently |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| WS invalidation races optimistic update (Pitfall 1) | Phase 1: Optimistic UI | Change status, observe Network tab — no GET for issue detail fires before the PATCH resolves |
| Stale list after mutation (Pitfall 2) | Phase 2: Aggressive caching | Change status on detail, navigate to list — list shows new status immediately |
| Concurrent mutation flicker (Pitfall 3) | Phase 1: Optimistic UI | Double-click status — UI settles on last-clicked value, no intermediate flash |
| iOS Safari session loss (Pitfall 4) | Phase 3: Mobile auth fix | Real iPhone with default Safari privacy settings — login persists after background/foreground |
| WS reconnect missed events (Pitfall 5) | Phase 4: WS optimization | Kill backend, wait for reconnect, verify invalidation GET fires for issues list |
| Global staleTime breaks features (Pitfall 6) | Phase 2: Aggressive caching | Audit before applying; "My Tasks" renders items correctly after staleTime change |
| Optimistic rollback incomplete (Pitfall 7) | Phase 1: Optimistic UI | Simulate network error during mutation; confirm rollback fires, error toast shown |

---

## Sources

- Code-verified: `ui/src/context/LiveUpdatesProvider.tsx` — `invalidateActivityQueries` fires unconditionally on WS event, no `isMutating` guard (lines 480–564)
- Code-verified: `ui/src/lib/optimistic-issue-comments.ts` — existing optimistic comment pattern; status/assignment rollback in `applyOptimisticIssueCommentUpdate`
- Code-verified: `ui/src/main.tsx` line 33 — global `staleTime: 30_000` with no per-query overrides
- Code-verified: `ui/src/lib/queryKeys.ts` — separate keys for `list`, `listAssignedToMe`, `detail` with no shared invalidation group
- Code-verified: `server/src/realtime/live-events.ts` — in-process `EventEmitter` with no event buffer or last-ID tracking
- Code-verified: `server/src/realtime/live-events-ws.ts` lines 780–790 — reconnect resets `reconnectAttempt` but does not invalidate queries
- Code-verified: `server/src/auth/better-auth.ts` lines 99–108 — `sameSite: "none"` and `secure: true` already set for HTTPS; no `crossSubDomainCookies` yet
- [Concurrent Optimistic Updates in React Query](https://tkdodo.eu/blog/concurrent-optimistic-updates-in-react-query) — HIGH confidence, TkDodo (TanStack maintainer), documents the exact `isMutating` guard pattern
- [TanStack Query Optimistic Updates — official docs](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates) — HIGH confidence, official
- [TanStack Query race condition discussion #7932](https://github.com/TanStack/query/discussions/7932) — MEDIUM confidence, community + maintainer response
- [Better Auth Cookies — official docs](https://better-auth.com/docs/concepts/cookies) — HIGH confidence, documents `crossSubDomainCookies` and `defaultCookieAttributes`
- [Better Auth Safari cookies discussion #2826](https://github.com/better-auth/better-auth/discussions/2826) — MEDIUM confidence, community — root cause: public suffix domain on Render
- [Better Auth cross-domain issue #4038](https://github.com/better-auth/better-auth/issues/4038) — MEDIUM confidence, community issue
- [Safari ITP and SameSite=None — Apple Developer Forums](https://developer.apple.com/forums/thread/728137) — HIGH confidence, Apple forum, confirmed ITP enforcement behavior
- [Cross-Site WebSocket Hijacking 2025](https://blog.includesecurity.com/2025/04/cross-site-websocket-hijacking-exploitation-in-2025/) — MEDIUM confidence, security research

---
*Pitfalls research for: Paperclip v1.2 — optimistic UI, aggressive caching, WS optimization, mobile cross-origin auth*
*Researched: 2026-04-05*
