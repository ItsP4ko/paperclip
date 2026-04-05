# Architecture Research

**Domain:** Performance & Mobile Auth — v1.2 integration into existing Paperclip stack
**Researched:** 2026-04-05
**Confidence:** HIGH (existing codebase fully inspected; official docs and live issues consulted)

---

## System Overview (v1.1 Baseline — What We Are Extending)

```
[Browser: Vercel CDN — React 19 + Vite + TanStack Query]
    |  credentials: "include"  (cross-origin fetch, all requests)
    |  WebSocket wss://backend.host/api/companies/:id/events/ws
    |
    v
[Easypanel VPS — Express 5 + BetterAuth + ws@8]
    |-- CORS: allowedHostnames, credentials: true
    |-- BetterAuth: SameSite=None; Secure=true (HTTPS only)
    |-- WS: in-process node EventEmitter → ws broadcast per company
    |-- Redis: optional (rate limiting, no query-layer caching yet)
    |
    v
[Supabase PostgreSQL — Drizzle ORM, session-mode pooler port 5432]
```

**Frontend state:** TanStack Query with `staleTime: 30_000`, `refetchOnWindowFocus: true`.
Global `QueryClient` in `main.tsx`. No per-query `staleTime` overrides today.

**Real-time path:** `publishLiveEvent()` → in-process `EventEmitter` → `subscribeCompanyLiveEvents()` → WS `socket.send()` → `LiveUpdatesProvider.handleLiveEvent()` → `queryClient.invalidateQueries()`.

**Optimistic updates today:** Only `IssueDetail` comments have `onMutate` + `setQueryData` + rollback. Status changes, assignments, and list mutations use plain `invalidateQueries` on `onSuccess`.

---

## Component Responsibilities

| Component | Responsibility | v1.2 Change |
|-----------|---------------|-------------|
| `main.tsx` QueryClient | Global cache config: `staleTime`, `gcTime` | Increase staleTime; add per-category overrides |
| `LiveUpdatesProvider.tsx` | WS connect/reconnect, `invalidateQueries` on events | Add `setQueryData` fast-path for known event shapes |
| `IssueDetail.tsx` mutations | Comment optimistic updates (already done) | Extend pattern to status changes and assignments |
| `IssueProperties.tsx` mutations | Status/assignee pickers call `invalidateQueries` only | Add `onMutate`/`onError` optimistic shell |
| `MyIssues.tsx` | Plain `useQuery` for `listAssignedToMe` | Wire to WS invalidation; fix empty render bug |
| `server/auth/better-auth.ts` | Cookie config: `SameSite=None; Secure=true` | Add Bearer plugin for mobile fallback |
| `server/realtime/live-events-ws.ts` | WS server: 30s ping/pong, reconnect on close | Reduce ping interval; add client-side app-level ping |
| `server/services/live-events.ts` | In-process EventEmitter pub/sub | No change needed; bottleneck is network, not emitter |
| `ui/src/api/auth.ts` | Cookie-only `credentials: "include"` fetches | Add Bearer token header path for mobile |

---

## Recommended Architecture for v1.2

### Pattern 1: Optimistic UI via TanStack Query `onMutate`

**What:** Before the mutation fires, snapshot current cache, apply predicted result with `setQueryData`, return snapshot as context. On `onError`, restore snapshot. On `onSettled`, call `invalidateQueries` to reconcile with server truth.

**When to use:** Any user-initiated mutation where the result is predictable from the input: status change, assignee change, label assignment, subtask creation, issue title edit.

**Trade-offs:** Adds ~10 lines per mutation. Rollback on error is automatic. The pattern already works in `IssueDetail.tsx` for comments — extend it, do not invent a new one.

**Integration point — IssueProperties.tsx:**
```typescript
const updateStatus = useMutation({
  mutationFn: (status: IssueStatus) => issuesApi.update(issue.id, { status }),
  onMutate: async (status) => {
    await queryClient.cancelQueries({ queryKey: queryKeys.issues.detail(issue.id) });
    const previous = queryClient.getQueryData<Issue>(queryKeys.issues.detail(issue.id));
    if (previous) {
      queryClient.setQueryData(queryKeys.issues.detail(issue.id), { ...previous, status });
      // Also update the list cache so sidebar/list stays coherent
      queryClient.setQueryData<Issue[]>(
        queryKeys.issues.list(selectedCompanyId),
        (list) => list?.map((i) => i.id === issue.id ? { ...i, status } : i),
      );
    }
    return { previous };
  },
  onError: (_err, _vars, ctx) => {
    if (ctx?.previous) queryClient.setQueryData(queryKeys.issues.detail(issue.id), ctx.previous);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issue.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId) });
  },
});
```

**Important:** Always cancel in-flight queries before `setQueryData` to prevent race where server response overwrites the optimistic value.

---

### Pattern 2: Aggressive Client-Side Caching

**What:** Raise `staleTime` from 30s to values calibrated per data type. Data served from cache is instant; background refetch only triggers when stale.

**When to use:** Lists that WS already keeps fresh (issues, agents, projects). Currently `staleTime: 30_000` globally means every navigation refetches unless visited within 30s.

**Trade-offs:** Higher staleTime = more stale data risk if WS drops. Mitigated because `invalidateQueries` in `LiveUpdatesProvider` forces refetch on any mutation event. The WS-driven invalidation is the safety valve; staleTime controls the happy path.

**Integration point — `main.tsx` QueryClient:**
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,   // 5 min default — WS keeps lists fresh
      gcTime: 15 * 60 * 1000,     // 15 min GC — survive multi-tab navigation
      refetchOnWindowFocus: true, // keep for user-facing correctness
    },
  },
});
```

**Per-query overrides** (in individual `useQuery` calls) for data that should stay very fresh:
- `queryKeys.sidebarBadges`: `staleTime: 0` — badge count must be real-time
- `queryKeys.issues.activeRun`: `staleTime: 0` — live run state must track agent
- `queryKeys.health`: keep existing `refetchInterval` logic

**gcTime must be >= staleTime** to ensure cache entry survives until stale period ends. Current `gcTime` default is 5 min (TanStack default) — must raise it to 15+ min to match 5 min staleTime.

---

### Pattern 3: WebSocket Reconnect + Latency Optimization

**What v1.1 does:** `LiveUpdatesProvider` reconnects with exponential backoff (1s → 15s max). Server pings every 30s. No application-level heartbeat. Initial connect is deferred 0ms (setTimeout) to avoid React StrictMode noise.

**Root cause of live latency:** The in-process EventEmitter is not the bottleneck. The likely cause is: (a) TCP re-establishment after Docker container networking interrupts, (b) the 30s server ping interval — if the TCP connection goes silent, NAT/proxies on the VPS path may drop it before the 30s ping fires.

**Changes:**

On the server (`live-events-ws.ts`), reduce ping interval from 30s to 15s:
```typescript
const pingInterval = setInterval(() => {
  for (const socket of wss.clients) {
    if (!aliveByClient.get(socket)) { socket.terminate(); continue; }
    aliveByClient.set(socket, false);
    socket.ping();
  }
}, 15_000); // was 30_000
```

On the client (`LiveUpdatesProvider.tsx`), add an application-level ping every 25s (browsers cannot send native WS ping frames — only servers can). This keeps the TCP path warm from the client side:
```typescript
// Inside nextSocket.onopen handler:
const appPingInterval = window.setInterval(() => {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "__ping" }));
  }
}, 25_000);
// Clear in cleanup
```

The server should silently ignore `{ type: "__ping" }` messages (no handler change needed; the existing `onmessage` is not implemented server-side — WS is receive-only on the server).

**Reconnect timing:** Current backoff `1000 * 2^(attempt-1)` capped at 15s is correct. No change needed. The `RECONNECT_SUPPRESS_MS: 2000` toast suppression after reconnect is also correct.

---

### Pattern 4: Mobile Cross-Origin Auth Fix

**Root cause:** Safari iOS and Chrome Android block `SameSite=None` cookies when the response sets them from a different registrable domain (e.g., Vercel frontend at `paperclip.vercel.app` + Easypanel backend at `api.easypanel.host`). This is Safari ITP + third-party cookie blocking. `Partitioned` (CHIPS) does not solve this — it creates a separate cookie jar per top-level site, which breaks session sharing, not just tracking.

**Two strategies — choose one:**

#### Strategy A (Preferred): Bearer Token Fallback via BetterAuth Bearer Plugin

BetterAuth ships a first-party `bearer` plugin. Enable it on the server. After sign-in, extract the session token from the `Set-Auth-Token` response header, store it in `localStorage`, and send it as `Authorization: Bearer <token>` on subsequent requests.

**Server change (`better-auth.ts`):**
```typescript
import { bearer } from "better-auth/plugins";
// Add to authConfig:
plugins: [bearer()],
```

**Client change (`auth.ts`):** After `signInEmail` success, read the response header:
```typescript
// In signInEmail:
const token = res.headers.get("Set-Auth-Token");
if (token) localStorage.setItem("bearer_token", token);
```
Then in the API client (`client.ts`), add the Authorization header when the token is present:
```typescript
const token = localStorage.getItem("bearer_token");
if (token) headers["Authorization"] = `Bearer ${token}`;
```

**WS auth (`LiveUpdatesProvider.tsx`):** Pass token as query param (already supported by `live-events-ws.ts`):
```typescript
const token = localStorage.getItem("bearer_token");
const url = token
  ? `${wsBase}?token=${encodeURIComponent(token)}`
  : wsBase;
```

**Caveat:** Bearer tokens in localStorage are readable by JS — no XSS protection. Acceptable for this SaaS context but note in PITFALLS. Use `httpOnly` cookie path when cookies work; Bearer only as mobile fallback.

**Detection logic:** Try cookie auth first. If `getSession` returns null on first load (mobile Safari), fall back to Bearer token from localStorage. This is an `||` fallback, not a forced switch.

#### Strategy B (Infrastructure): Reverse Proxy via Vercel Rewrites

Add to `vercel.json`:
```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://your-easypanel-host/api/:path*" }
  ]
}
```

This makes all API calls same-origin (`paperclip.vercel.app/api/...` → rewritten to backend). Cookies become first-party. No code change in the app.

**Caveat:** WebSocket upgrades cannot be proxied by Vercel rewrites (Vercel Edge Network does not proxy WebSocket). WS would still need cross-origin connection. Strategy A solves WS too; Strategy B does not.

**Recommendation: Strategy A (Bearer plugin)** is the self-contained fix. Strategy B requires a fallback for WS anyway. If the team later consolidates to a single domain, removing the Bearer fallback is a one-line delete.

---

## Data Flow Changes

### Optimistic Status Change Flow (New)

```
User clicks status picker
    |
IssueProperties → updateStatus.mutate(newStatus)
    |
onMutate:
  cancelQueries(issues.detail)
  setQueryData(issues.detail, { ...prev, status: newStatus })  ← instant UI
  setQueryData(issues.list, map over list to update)           ← sidebar stays in sync
    |
    ↓ (HTTP PATCH /issues/:id)
    |
onSettled:
  invalidateQueries(issues.detail)  ← server truth overwrites optimistic
  invalidateQueries(issues.list)
```

### WS Event → Cache Update Flow (Optimized for Real-Time)

Current path: WS event → `invalidateQueries` → HTTP refetch → UI update (2 round trips).

Optimized path for known shapes (issue.updated with status field in payload):
```
WS event: { type: "activity.logged", payload: { entityType: "issue", entityId, details: { status } } }
    |
LiveUpdatesProvider.handleLiveEvent
    |
If details.status present:
  setQueryData(issues.detail(entityId), prev => ({ ...prev, status: details.status }))
  setQueryData(issues.list, map over list to update in place)
  — THEN ALSO —
  invalidateQueries (background reconcile, still needed)
```

This cuts perceived latency from "WS fires → HTTP round trip → render" to "WS fires → render" (immediate).

**Caution:** Only apply `setQueryData` from WS for fields the server guarantees are complete in the payload. The `issue.updated` activity log already includes `details.status`, `details.assigneeAgentId`, `details.assigneeUserId` — these are safe. Do not guess at fields not in the payload.

### Mobile Auth Flow (New)

```
Mobile Safari: sign in attempt
    |
authApi.signInEmail() → POST /api/auth/sign-in/email
    |
Response header: Set-Auth-Token: <session_token>
    |
Store: localStorage.setItem("bearer_token", token)
    |
All subsequent fetch: Authorization: Bearer <token>
    |
WS connect: wss://...?token=<token>
    |
Server: live-events-ws.ts parseBearerToken() || query param token
        → authorizeUpgrade() validates against agentApiKeys
        ← Wait: this is wrong for user tokens (currently only agent keys)
```

**Critical gap:** The WS upgrade authorization in `live-events-ws.ts` validates bearer tokens only against `agentApiKeys`. User session tokens from BetterAuth Bearer plugin are not validated here. The WS auth path must be extended to also call `resolveBetterAuthSessionFromHeaders` when the token is present but not found in `agentApiKeys`.

---

## New vs. Modified — Build Order

### Modified Files

| File | Change Type | What Changes |
|------|------------|--------------|
| `ui/src/main.tsx` | Config | Raise `staleTime` to 5 min, `gcTime` to 15 min |
| `ui/src/components/IssueProperties.tsx` | Extend mutation | Add `onMutate`/`onError` to status + assignee mutations |
| `ui/src/context/LiveUpdatesProvider.tsx` | Optimize | `setQueryData` fast-path for known WS payload shapes; app-level ping |
| `ui/src/pages/MyIssues.tsx` | Fix bug | Verify `assigneeUserId=me` filter returns results; add WS invalidation key |
| `server/src/realtime/live-events-ws.ts` | Optimize | Reduce ping from 30s to 15s; extend WS auth to validate user Bearer tokens |
| `server/src/auth/better-auth.ts` | Extend | Add `bearer` plugin to `authConfig` |
| `ui/src/api/auth.ts` | Extend | Extract `Set-Auth-Token` header after sign-in; store in localStorage |
| `ui/src/api/client.ts` | Extend | Send `Authorization: Bearer` header when localStorage token present |

### New Files

| File | Purpose |
|------|---------|
| `ui/src/lib/auth-token.ts` | Encapsulate Bearer token read/write/clear from localStorage; single source of truth |

### Build Order (Dependencies First)

1. **`auth-token.ts`** — No deps. Foundation for all auth changes.
2. **`better-auth.ts` (server)** — Add Bearer plugin. Required before client-side token extraction works.
3. **`auth.ts` + `client.ts` (client)** — Extract token, inject header. Depends on server accepting Bearer.
4. **`live-events-ws.ts` WS auth** — Extend user Bearer token validation. Depends on server Bearer plugin.
5. **`main.tsx` QueryClient** — Raise staleTime/gcTime. Zero dependencies. Can do anytime.
6. **`IssueProperties.tsx` optimistic mutations** — Add onMutate. Depends on nothing new.
7. **`LiveUpdatesProvider.tsx` fast-path** — `setQueryData` in WS handler. Depends on understanding which event payloads carry which fields (audit in WS events before coding).
8. **`MyIssues.tsx` bug fix** — Fix empty render. Check server-side `assigneeUserId=me` filter handling.
9. **`live-events-ws.ts` ping interval** — Reduce to 15s. Simple, test in isolation.

---

## Integration Points Summary

### TanStack Query Integration

| Surface | Current | v1.2 Change |
|---------|---------|-------------|
| `QueryClient` config | `staleTime: 30s`, `gcTime: 5min` (default) | `staleTime: 5min`, `gcTime: 15min` |
| Status mutation | `invalidateQueries` on success | `setQueryData` in `onMutate`, rollback in `onError` |
| Assignment mutation | `invalidateQueries` on success | Same optimistic pattern as status |
| WS event handler | `invalidateQueries` for all events | Add `setQueryData` for events with known field payloads |
| `sidebarBadges` query | `staleTime: 30s` (inherited) | Override to `staleTime: 0` — must be real-time |

### WebSocket Integration

| Surface | Current | v1.2 Change |
|---------|---------|-------------|
| Server ping interval | 30s | 15s |
| Client keepalive | None (relies on server ping) | App-level 25s `{ type: "__ping" }` message |
| WS auth | Cookie session OR agent API key | Add user Bearer token path for mobile |
| Reconnect | Exponential backoff, works correctly | No change |

### BetterAuth Integration

| Surface | Current | v1.2 Change |
|---------|---------|-------------|
| Cookie config | `SameSite=None; Secure=true` (HTTPS only) | No change — keep this |
| Bearer plugin | Not installed | Add `bearer` plugin |
| Sign-in response | No token in response | Return `Set-Auth-Token` header after sign-in |
| `getSession` | Cookie-only | Check Bearer header too (automatic when plugin enabled) |

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Replacing Cookies with Tokens Globally

**What people do:** Switch the entire app from cookie auth to localStorage tokens to fix mobile.
**Why it's wrong:** Cookies are `httpOnly` — XSS-safe. `localStorage` tokens are readable by any JS on the page. For desktop browsers where cookies work, this reduces security for no gain.
**Do this instead:** Keep cookie auth as primary. Add Bearer token as a fallback that activates only when cookies fail (session returns null).

### Anti-Pattern 2: Setting `staleTime: Infinity` for Lists

**What people do:** Set infinite staleTime to make lists always load instantly.
**Why it's wrong:** If WS disconnects, the cache will never be invalidated and users see stale data. With live features, you depend on WS-driven invalidation, not time-based staleness.
**Do this instead:** Set `staleTime: 5min` and rely on `LiveUpdatesProvider`'s `invalidateQueries` as the primary freshness mechanism. The staleTime is a fallback for when WS is healthy.

### Anti-Pattern 3: Optimistic Update Without `cancelQueries`

**What people do:** Call `setQueryData` in `onMutate` without first cancelling in-flight queries.
**Why it's wrong:** An in-flight `useQuery` refetch could complete after `onMutate` and overwrite the optimistic value with stale server data, creating a visible flash.
**Do this instead:** Always `await queryClient.cancelQueries(queryKey)` before `setQueryData` in `onMutate`.

### Anti-Pattern 4: Using `setQueryData` from WS Events for Partial Payloads

**What people do:** Merge WS event payload into cached issue with spread `{ ...cached, ...payload.details }`.
**Why it's wrong:** If the payload only has `status` but the cached object has `assigneeUserId`, a naive merge may work — but if the WS payload includes `null` for an unset field vs the field being absent, you can accidentally null out valid cache data.
**Do this instead:** Only update the specific fields present in the payload. Type-guard each field before applying it.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (< 100 users) | In-process EventEmitter for WS is fine; all changes in this doc apply |
| 1k+ users | In-process EventEmitter becomes a bottleneck if multiple server instances exist. Replace with Redis pub/sub as the event bus (Redis is already in the stack). Paperclip already imports Redis client — add a `redis.subscribe("live-events")` channel per company |
| 10k+ users | Separate WS service from REST API server; use dedicated WS infrastructure (e.g., Ably, Pusher, or self-hosted socket.io cluster) |

**For v1.2:** The in-process emitter is correct. Do not add Redis pub/sub in this milestone — it would complicate the WS auth changes. Flag it for v1.3.

---

## Sources

- [TanStack Query v5 Optimistic Updates Guide](https://tanstack.com/query/v5/docs/react/guides/optimistic-updates) — MEDIUM confidence (page returned 404 during fetch; summary from search results cross-checked with existing code patterns)
- [BetterAuth Bearer Plugin](https://better-auth.com/docs/plugins/bearer) — HIGH confidence (official docs fetched successfully)
- [BetterAuth Cookies Docs](https://better-auth.com/docs/concepts/cookies) — HIGH confidence (official docs fetched; confirms SameSite=None and proxy recommendations)
- [BetterAuth Safari Issue #2826](https://github.com/better-auth/better-auth/discussions/2826) — HIGH confidence (community discussion confirms Safari ITP blocks cross-domain session cookies)
- [WebKit ITP: Full Third-Party Cookie Blocking](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/) — HIGH confidence (official WebKit blog)
- [Existing codebase: `live-events-ws.ts`, `LiveUpdatesProvider.tsx`, `better-auth.ts`, `main.tsx`] — HIGH confidence (direct inspection)

---

*Architecture research for: Paperclip v1.2 — Performance & Mobile Auth Fix*
*Researched: 2026-04-05*
