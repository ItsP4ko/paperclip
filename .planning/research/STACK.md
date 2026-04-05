# Stack Research: v1.2 Performance & Mobile Auth Fix

**Project:** Paperclip — v1.2 Performance & Mobile Auth Fix
**Researched:** 2026-04-05
**Scope:** Additive ONLY — what changes for optimistic UI, aggressive caching, WS optimization, and cross-origin mobile auth. Existing validated stack is NOT re-researched.
**Confidence:** HIGH (TanStack Query docs verified, BetterAuth official docs + active GitHub issues verified, Vercel rewrites docs verified)

---

## Orientation: What Exists vs What Changes

The existing stack handles data fetching correctly — the gaps are:

1. **Mutations do not optimistically update.** All `useMutation` calls use `onSuccess: invalidateQueries` pattern. User waits for a round-trip before seeing any change.
2. **QueryClient staleTime is 30 seconds** (`main.tsx:33`). This is fine for freshness but navigation to previously-visited pages still shows loading skeletons because `gcTime` is at default (5 min) but re-mounts re-fetch if data is stale.
3. **WebSocket reconnect latency** is compounded by `perMessageDeflate` (enabled by default in `ws`) adding CPU/serialization overhead per message on the server.
4. **Cross-origin auth on iOS Safari** — BetterAuth is already configured with `sameSite: "none"` and `secure: true` (see `server/src/auth/better-auth.ts:102-108`), but Safari ITP still blocks cookies when the API domain (`*.easypanel.host` or custom VPS domain) is different from the Vercel frontend domain. The Vercel reverse proxy approach eliminates the cross-origin dimension entirely.

---

## No New npm Packages Required

All four goals are achievable with configuration changes and code patterns using packages already installed. Zero new dependencies.

| Goal | Approach | New Package? |
|------|----------|-------------|
| Optimistic mutations | TanStack Query `useMutation` `onMutate` pattern | No — `@tanstack/react-query@^5.90.21` already installed |
| Aggressive caching | QueryClient `staleTime` / `gcTime` tuning | No |
| WS latency | Server-side `perMessageDeflate: false` on WebSocketServer | No — `ws@^8.19.0` already installed |
| Mobile auth fix | Vercel `vercel.json` proxy rewrite | No — config file only |

---

## Recommended Stack Changes

### 1. TanStack Query — Optimistic Mutations

**Current pattern (all mutations today):**
```typescript
const mutation = useMutation({
  mutationFn: (data) => issuesApi.updateStatus(issueId, data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
  },
});
```
User sees the old state until the server responds (network round-trip + server processing).

**Optimistic pattern (v1.2 target):**
```typescript
const mutation = useMutation({
  mutationFn: (data: { status: IssueStatus }) => issuesApi.updateStatus(issueId, data),
  onMutate: async (newData) => {
    // 1. Cancel any outgoing refetches to prevent them overwriting our optimistic update
    await queryClient.cancelQueries({ queryKey: queryKeys.issues.detail(issueId) });

    // 2. Snapshot the previous value for rollback
    const previousIssue = queryClient.getQueryData(queryKeys.issues.detail(issueId));

    // 3. Optimistically update the cache immediately
    queryClient.setQueryData(queryKeys.issues.detail(issueId), (old: Issue) => ({
      ...old,
      status: newData.status,
    }));

    // 4. Return context for potential rollback
    return { previousIssue };
  },
  onError: (_err, _newData, context) => {
    // Roll back on failure
    if (context?.previousIssue) {
      queryClient.setQueryData(queryKeys.issues.detail(issueId), context.previousIssue);
    }
  },
  onSettled: () => {
    // Always refetch after error or success to sync with server
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
  },
});
```

**Which mutations to make optimistic (priority order):**
1. Issue status changes — most frequent user action, most visible latency
2. Issue assignment/reassignment — visible in lists and detail view simultaneously
3. Issue title/field edits — high-frequency, user expects immediate feedback

**Approach for list mutations:**
When optimistically updating an issue that appears in a list, update both `queryKeys.issues.detail(id)` AND `queryKeys.issues.list(companyId)` in `onMutate`. Use `setQueryData` with an updater that maps over the list array.

```typescript
// Also update list cache
queryClient.setQueryData(queryKeys.issues.list(companyId), (old: Issue[]) =>
  old?.map((issue) => issue.id === issueId ? { ...issue, status: newData.status } : issue)
);
```

**Confidence: HIGH** — Pattern verified against TanStack Query v5 official docs. The app's existing `queryKeys` structure maps cleanly to this pattern. No type changes needed.

---

### 2. QueryClient — Aggressive Caching Configuration

**Current configuration (`ui/src/main.tsx`):**
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,         // 30 seconds
      refetchOnWindowFocus: true, // default behavior
      // gcTime not set — defaults to 5 minutes
    },
  },
});
```

**Recommended v1.2 configuration:**
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,          // 1 minute — data is fresh for longer
      gcTime: 10 * 60_000,        // 10 minutes in memory — navigation feels instant
      refetchOnWindowFocus: true,  // keep for real-time feel when returning to tab
      refetchOnReconnect: true,    // sync after mobile network interruptions
    },
  },
});
```

**Rationale for each change:**

- `staleTime: 60_000` — Doubles the fresh window. Since WS invalidation handles real-time updates, background refetch at 30s is conservative. With WS active, stale data is invalidated immediately when the server changes it; the timer only matters for non-WS paths.
- `gcTime: 10 * 60_000` — Keeps inactive queries in memory 10 minutes (up from 5-minute default). Navigation to previously visited pages returns data instantly from cache with background refresh, eliminating loading skeletons on revisit.
- `refetchOnWindowFocus: true` — Keep enabled. Critical for mobile users who background/foreground the app.
- `refetchOnReconnect: true` — Explicit for clarity; ensures mobile reconnect after sleep/network change triggers sync.

**Note:** Per-query overrides for rapidly-changing data (e.g., live runs, heartbeat state) should stay at `staleTime: 0` or short values. The global default targets stable data like issue lists, agent details, and org structure.

**Confidence: HIGH** — Verified against TanStack Query v5 important-defaults docs.

---

### 3. WebSocket Server — Disable perMessageDeflate

**Current server configuration (`server/src/realtime/live-events-ws.ts:186`):**
```typescript
const wss = new WebSocketServer({ noServer: true });
```
`perMessageDeflate` is enabled by default in `ws`. This adds per-message zlib compression/decompression overhead on every event sent to every connected client.

**Why this causes latency:** Paperclip's live events are small JSON payloads (< 1KB). Compressing small payloads adds CPU overhead without meaningful bandwidth savings, and increases time-to-first-byte per message. On a shared VPS (Easypanel), this CPU tax shows as latency spikes.

**Recommended change:**
```typescript
const wss = new WebSocketServer({
  noServer: true,
  perMessageDeflate: false,  // Disable compression for low-latency small payloads
});
```

**Impact:** Disabling perMessageDeflate removes zlib compression/decompression from every message path. For event payloads under 1KB (all current live events), this is strictly beneficial. Bandwidth increase is negligible for JSON events at Paperclip's scale.

**Ping interval** — Current 30-second ping interval (`live-events-ws.ts:190-199`) is correct for production. Do not reduce it; shorter intervals waste server resources and create mobile battery drain without latency benefit. The latency issue is per-message overhead, not connection detection speed.

**Confidence: MEDIUM** — perMessageDeflate overhead impact verified from ws GitHub issues #756 and #1502. Improvement magnitude depends on server CPU available on the Easypanel VPS; test before/after with the deployment.

---

### 4. Cross-Origin Mobile Auth — Vercel Reverse Proxy

**Root cause:** iOS Safari's Intelligent Tracking Prevention (ITP) blocks cookies from a domain it classifies as a tracker. When the frontend is on `*.vercel.app` (or custom Vercel domain) and the backend is on a separate VPS domain, every auth request is cross-origin. Safari blocks the session cookie from being set or sent, even with `SameSite=None; Secure` — because ITP overrides SameSite.

**Current state:** BetterAuth is already configured with `sameSite: "none"` and `secure: true`. This works in Chrome and Firefox but not iOS Safari (or Chrome-on-iOS, which uses the same WebKit engine).

**The fix: Vercel reverse proxy for auth routes**

Add a `vercel.json` in the `ui/` directory that proxies `/api/*` requests to the backend. From Safari's perspective, both the page and the API are now the same origin — the cookie is first-party, ITP does not apply.

```json
// ui/vercel.json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://YOUR_BACKEND_HOST/api/:path*"
    }
  ]
}
```

**Important:** The existing `vercel.json` in `ui/` is:
```json
{"rewrites": [{"source": "/(.*)", "destination": "/index.html"}]}
```
This SPA catch-all rewrite MUST be the last rule. The specific `/api/:path*` rewrite must come first, otherwise all API calls get redirected to `index.html`.

**Correct order:**
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://YOUR_BACKEND_HOST/api/:path*"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

**Frontend API base URL change required:** The frontend currently calls the backend directly using `VITE_API_URL`. With the proxy in place, frontend API calls must use relative paths (`/api/...`) instead of the absolute backend URL. This means:
- `VITE_API_URL` changes from `https://backend.host` to `` (empty string / same origin)
- Or `ui/src/lib/api-base.ts` must detect when running on production Vercel and use relative paths

**CORS implications:** When using the proxy, the browser sends same-origin requests to Vercel, not cross-origin requests to the backend. The backend still receives the forwarded request from Vercel's edge with correct headers. The `Access-Control-Allow-Origin` and `trustedOrigins` config in BetterAuth remains valid — it just applies to the Vercel origin now.

**WebSocket path:** The WebSocket connection (`wss://HOST/api/companies/.../events/ws`) uses the raw backend host directly from `getWsHost()`, NOT through the Vercel proxy. Vercel's edge network does not support WebSocket proxying via rewrites. The WS connection must continue to target the backend host directly. Auth for WS is handled via session cookie sent in the upgrade request (already implemented in `live-events-ws.ts`) or via query-string token fallback. With the proxy approach, the session cookie is set on the Vercel domain — the WS upgrade to a different host will NOT send it automatically. See "WS Auth with Proxy" below.

**WS Auth with Proxy (important):**
The WS upgrade goes to the raw backend host. But the session cookie will be set on the Vercel frontend domain (same-origin via proxy). The backend WS auth code (`live-events-ws.ts:119-153`) already supports session-based auth by resolving the session from headers — but the cookie won't be sent to the WS host since it belongs to the Vercel domain.

Resolution: The WS auth code has a fallback to query-string token (`?token=...`). The frontend must pass the session token as a query parameter when establishing the WS connection. Check `authApi.getSession()` — if it returns a session token/ID, use that as the query param. Alternatively, use the `bearer` plugin from BetterAuth to exchange a session for a bearer token that can be passed in the WS URL.

**Confidence: HIGH for proxy approach** — Vercel rewrites docs confirm the feature. BetterAuth docs confirm this is their recommended fix for Safari ITP. Confirmed in GitHub issue #4038 where the same-domain deployment resolved cookie issues. **MEDIUM for WS auth detail** — the WS token passthrough needs implementation-time verification against the specific session model.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `socket.io` | Adds ~80KB to the bundle, unnecessary abstraction over `ws`; the existing ws implementation is custom-tuned | Keep `ws` on the server, native `WebSocket` on the client |
| `@tanstack/query-persist-client` | Persists cache to localStorage between page loads. Adds complexity and stale-data bugs — the WS invalidation approach already solves the "instant navigation" problem in a simpler way | Increase `gcTime` instead |
| `swr` | Duplicate of TanStack Query; would require migrating all existing queries | TanStack Query already installed and wired |
| `better-auth` bearer plugin for main auth | Using localStorage tokens as the primary auth mechanism has XSS implications; the proxy approach is the correct fix for the cookie problem | Vercel reverse proxy (proxy approach) |
| `ioredis` | Maintenance mode | `redis` (node-redis v5) already installed |
| Second `cors` package | Would conflict with BetterAuth's CORS handling | BetterAuth handles CORS |
| Polling fallback for WS | Adds complexity; the existing reconnect/backoff logic is sufficient | Fix the underlying WS latency with `perMessageDeflate: false` |

---

## Integration Points

### Optimistic Updates + WS Invalidation Interaction

The `LiveUpdatesProvider` calls `queryClient.invalidateQueries` when WS events arrive. With optimistic updates, there is a race condition:

1. User changes issue status (optimistic update applies immediately)
2. Backend processes the change and emits a WS event
3. `LiveUpdatesProvider` invalidates the issue query
4. TanStack Query refetches — server response now confirms the change

This is the **correct and desired behavior**. The optimistic update shows the new state immediately; the WS event triggers a background sync that confirms/corrects it. No special handling needed — `onSettled: invalidateQueries` already covers this.

### Proxy + Existing VITE_API_URL Variable

With the proxy, frontend API calls should route through `/api/...` (same origin). This requires updating how `ui/src/lib/api-base.ts` constructs the base URL. In production (Vercel), the base URL should be `/` (relative). In local development, `VITE_API_URL` still points to `http://localhost:PORT` for local backend.

Pattern:
```typescript
// api-base.ts
const isProduction = import.meta.env.PROD;
export const apiBase = isProduction ? '' : (import.meta.env.VITE_API_URL ?? '');
```

Or use `VITE_USE_PROXY=true` env var on Vercel to toggle.

---

## Version Compatibility

| Package | Current Version | Capability Used | Notes |
|---------|----------------|-----------------|-------|
| `@tanstack/react-query` | ^5.90.21 (latest ~5.96.2) | `onMutate`, `cancelQueries`, `setQueryData`, `gcTime` | All v5 stable API — no upgrade needed |
| `ws` | ^8.19.0 | `perMessageDeflate: false` option on `WebSocketServer` | Available since ws v6; well-documented |
| `better-auth` | 1.4.18 | Existing `sameSite: "none"` cookie config unchanged | No version change needed |
| Vercel | N/A (config only) | `rewrites` with external origin proxying | Works on all Vercel plans including Hobby |

---

## Environment Variables (No New Variables Required)

| Variable | Current Value | v1.2 Change |
|----------|--------------|-------------|
| `VITE_API_URL` | `https://backend.host` | Either remove (use relative `/`) or set to empty string when proxy is enabled |
| `BETTER_AUTH_SECRET` | Set in Easypanel | No change |
| `REDIS_URL` | Set in Easypanel | No change |
| `DATABASE_URL` | Set in Easypanel | No change |

---

## Implementation Order

The four changes are independent but should be shipped in this order to minimize debugging surface:

1. **WS `perMessageDeflate: false`** — Single-line server change, immediately measurable
2. **QueryClient `staleTime`/`gcTime` tuning** — Two-line change in `main.tsx`, zero risk
3. **Vercel proxy rewrite** — Verify WS auth fallback before deploying; test on mobile
4. **Optimistic mutations** — Add to issue status and assignment mutations first, verify rollback behavior

---

## Sources

- [TanStack Query v5 Optimistic Updates docs](https://tanstack.com/query/v5/docs/react/guides/optimistic-updates) — `onMutate`/`onError`/`onSettled` pattern — HIGH confidence
- [TanStack Query v5 Important Defaults](https://tanstack.com/query/v5/docs/react/guides/important-defaults) — `staleTime`, `gcTime` defaults — HIGH confidence
- [TanStack Query: Using WebSockets](https://tkdodo.eu/blog/using-web-sockets-with-react-query) — WS invalidation pattern with `staleTime: Infinity` — HIGH confidence
- [BetterAuth Cookies docs](https://better-auth.com/docs/concepts/cookies) — Cross-subdomain, reverse proxy for Safari ITP — HIGH confidence
- [BetterAuth GitHub Issue #4038](https://github.com/better-auth/better-auth/issues/4038) — Cross-domain cookie not set on production; resolved by same-domain deployment — HIGH confidence
- [BetterAuth GitHub Issue #3743](https://github.com/better-auth/better-auth/issues/3743) — Safari iOS Invalid Origin signOut bug — MEDIUM confidence (open issue, workarounds only)
- [Vercel Rewrites docs](https://vercel.com/docs/rewrites) — External origin proxy config, wildcard path forwarding — HIGH confidence
- [ws npm package](https://github.com/websockets/ws) — `perMessageDeflate` option, performance trade-offs — HIGH confidence
- [ws GitHub Issue #756](https://github.com/websockets/ws/issues/756) — perMessageDeflate performance discussion — MEDIUM confidence (older issue, conclusions still apply)
- [BetterAuth Bearer Plugin docs](https://better-auth.com/docs/plugins/bearer) — Bearer token for non-cookie contexts — HIGH confidence (relevant for WS auth fallback)

---
*Stack research for: v1.2 Performance & Mobile Auth Fix*
*Researched: 2026-04-05*
