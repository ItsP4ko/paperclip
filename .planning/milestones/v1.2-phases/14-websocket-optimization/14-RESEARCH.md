# Phase 14: WebSocket Optimization - Research

**Researched:** 2026-04-05
**Domain:** WebSocket reliability, dead-connection detection, perMessageDeflate, cache recovery
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WS-01 | Client detects dead/silent WebSocket connections within 25 seconds and reconnects automatically | Application-level heartbeat pattern; browser WS does not expose ping/pong to JS; server ping alone is insufficient for silent NAT drops |
| WS-02 | Server disables `perMessageDeflate` compression (overhead exceeds benefit for small JSON event payloads) | ws@8.19.0 already defaults `perMessageDeflate: false`; requires explicit declaration in constructor call + widened type interface |
| WS-03 | Client invalidates relevant cache queries after a WebSocket reconnect to recover missed real-time events | `onopen` handler in LiveUpdatesProvider must call broad cache invalidation when `reconnectAttempt > 0` |
</phase_requirements>

## Summary

This phase addresses three independent WebSocket reliability improvements. Two are primarily client-side changes in `LiveUpdatesProvider.tsx`; one is a minimal server-side annotation.

**WS-01 — Dead connection detection** is the most substantive change. The current server-side ping/pong (30-second interval) detects dead connections server-to-client but does not help the browser detect a silently-dead connection. Browsers respond to server pings automatically at the TCP level, but they do not expose WebSocket ping/pong frames to JavaScript. A silently-dead connection (NAT timeout, network drop with no TCP RST) can leave the browser's WebSocket in `OPEN` state indefinitely — `onclose` never fires and the reconnect loop never starts. The fix is an application-level heartbeat: the client sends a text-frame ping periodically and tracks the time since the last received message; if no message arrives within the deadline, the client forcibly closes the socket and reconnects.

**WS-02 — perMessageDeflate disabled** is already the ws@8.19.0 default when using `noServer: true`. The code path `new WebSocketServer({ noServer: true })` inherits `perMessageDeflate: false` from the library defaults. The change needed is: (a) widen the `WsServer` constructor type to accept `{ noServer: boolean; perMessageDeflate: boolean }`, and (b) pass `perMessageDeflate: false` explicitly so the requirement is traceable in code and not left as an implicit default.

**WS-03 — Cache recovery after reconnect** requires a focused invalidation sweep in `LiveUpdatesProvider.tsx` inside the `onopen` handler when `reconnectAttempt > 0`. The current code only suppresses toasts on reconnect; it does not invalidate stale cache entries. Events missed during the disconnect window are silently lost. The fix is to invalidate issue lists and issue details on reconnect.

**Primary recommendation:** Implement a client-side application heartbeat (15-second interval, 20-second deadline) to satisfy WS-01 within the 25-second budget. Add explicit `perMessageDeflate: false` to the server constructor for WS-02. Add a targeted `invalidateOnReconnect` call in `onopen` for WS-03.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ws | 8.19.0 (already in project) | Server-side WebSocket implementation | Already in use; no change needed |
| browser WebSocket API | native | Client-side WebSocket | Already in use |
| @tanstack/react-query | already in project | Cache invalidation on reconnect | Already in use |

No new dependencies. All three requirements are satisfied by changes to existing code.

**Installation:** No new packages needed.

## Architecture Patterns

### Current State

```
server/src/realtime/live-events-ws.ts
  setupLiveEventsWebSocketServer()
    WebSocketServer({ noServer: true })          ← perMessageDeflate: false by default
    pingInterval = setInterval(30_000)            ← server-side liveness check only
    socket.on("pong") → aliveByClient.set(true)   ← tracks server→client direction only

ui/src/context/LiveUpdatesProvider.tsx
  LiveUpdatesProvider
    onopen  → suppress toasts on reconnect       ← no cache invalidation
    onclose → scheduleReconnect() (exponential)  ← reconnect works but only on TCP close
    NO client heartbeat                           ← gap for WS-01
    NO cache invalidation on reconnect            ← gap for WS-03
```

### Pattern 1: Application-Level Client Heartbeat (WS-01)

**What:** Client sends a short text message on a regular interval and tracks time-since-last-receive. If no message arrives within a deadline, the socket is considered dead and forcibly closed.

**When to use:** Any scenario where the browser's native `onclose` cannot be relied upon (NAT timeouts, mobile network transitions, proxy silence).

**Why not rely on server ping:** The `ws` server sends WebSocket Ping frames, and browsers respond with Pong frames automatically at the protocol level. However, this happens inside the browser's networking stack — JavaScript never sees these Ping/Pong frames. If the TCP connection is silently dead (NAT drop), the browser's TCP stack may not detect the dead connection for minutes (OS-dependent TCP keepalive, if enabled at all). The browser's WebSocket `readyState` stays `OPEN` and `onclose` never fires.

**Design for 25-second detection window:**

```typescript
// Source: MDN WebSocket API, ws library documentation
const HEARTBEAT_INTERVAL_MS = 15_000;   // send application ping every 15s
const HEARTBEAT_DEADLINE_MS = 20_000;   // if no msg in 20s after ping, declare dead

// In the connect() function, after nextSocket.onopen:
let heartbeatTimer: number | null = null;
let deadlineTimer: number | null = null;
let lastReceivedAt = Date.now();

const clearHeartbeat = () => {
  if (heartbeatTimer !== null) { window.clearTimeout(heartbeatTimer); heartbeatTimer = null; }
  if (deadlineTimer !== null) { window.clearTimeout(deadlineTimer); deadlineTimer = null; }
};

const scheduleHeartbeat = () => {
  heartbeatTimer = window.setTimeout(() => {
    if (closed || socket !== nextSocket) return;
    if (nextSocket.readyState !== SOCKET_OPEN) return;
    nextSocket.send(JSON.stringify({ type: "ping" }));
    deadlineTimer = window.setTimeout(() => {
      if (closed || socket !== nextSocket) return;
      // Dead connection — terminate and let onclose drive reconnect
      nextSocket.close(1000, "heartbeat_timeout");
    }, HEARTBEAT_DEADLINE_MS);
  }, HEARTBEAT_INTERVAL_MS);
};

// In onopen: start first heartbeat
nextSocket.onopen = () => {
  scheduleHeartbeat();
  // ... existing reconnect suppression logic
};

// In onmessage: reset heartbeat on ANY received message
nextSocket.onmessage = (message) => {
  clearHeartbeat();
  scheduleHeartbeat();
  // ... existing message handling
};

// In onclose: clear heartbeat
nextSocket.onclose = () => {
  clearHeartbeat();
  // ... existing reconnect logic
};
```

**Server-side:** The server currently ignores non-Pong frames. The client ping is a text frame `{"type":"ping"}`. The server can either echo it or simply ignore it (the client resets its deadline timer on *any* received message, so a server-sourced data push also resets the timer). No server change is strictly required for WS-01 — the deadline fires only if no message of any kind arrives within 20 seconds of the last ping send.

**Timeline math:**
- Heartbeat fires every 15s after last message
- Deadline fires 20s after the heartbeat ping is sent
- Worst case: dead connection detected at 15s + 20s = 35s — misses the 25s requirement

**Corrected timeline math (use tighter values):**
- HEARTBEAT_INTERVAL_MS = 10_000
- HEARTBEAT_DEADLINE_MS = 12_000
- Worst case: 10s + 12s = 22s — within the 25s budget with margin

These values are the recommended implementation.

### Pattern 2: Explicit perMessageDeflate: false (WS-02)

**What:** Pass `perMessageDeflate: false` explicitly when constructing `WebSocketServer`.

**Why it matters:** While `ws@8.19.0` defaults this to `false`, the TypeScript interface in `live-events-ws.ts` only accepts `{ noServer: boolean }`. The option must be added to the type definition, and the explicit value makes the requirement traceable.

**Current code:**
```typescript
// Source: server/src/realtime/live-events-ws.ts line 38-41
const { WebSocket, WebSocketServer } = require("ws") as {
  WebSocket: { OPEN: number };
  WebSocketServer: new (opts: { noServer: boolean }) => WsServer;
};
// ...
const wss = new WebSocketServer({ noServer: true });
```

**Required change — widen the constructor type and pass the option:**
```typescript
const { WebSocket, WebSocketServer } = require("ws") as {
  WebSocket: { OPEN: number };
  WebSocketServer: new (opts: { noServer: boolean; perMessageDeflate?: boolean }) => WsServer;
};
// ...
const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
```

**Verified:** ws@8.19.0 source confirms `perMessageDeflate` defaults to `false` in the constructor spread (line 70 of `websocket-server.js`). The explicit declaration is for traceability only.

### Pattern 3: Cache Invalidation on Reconnect (WS-03)

**What:** When `onopen` fires after a disconnect (detected by `reconnectAttempt > 0`), invalidate all issue-related queries so the user sees current server state rather than stale cached data from before the disconnect.

**Scope — what to invalidate:**
Invalidate issue lists and detail queries because those are the views users have open that could be stale. Do NOT invalidate everything (avoid performance hit on reconnect). Use the existing `queryKeys.issues.list` and `queryKeys.issues.detail` prefix pattern.

Since specific open issue IDs are not known at reconnect time (the reconnect happens in a generic provider), the correct approach is a broad prefix invalidation on the `issues` query key:

```typescript
// Source: ui/src/lib/queryKeys.ts + TanStack Query v5 docs
// In onopen, when reconnectAttempt > 0:
function invalidateOnReconnect(queryClient: QueryClient, companyId: string) {
  // Issue lists — user may have missed create/update/delete events
  queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.issues.listAssignedToMe(companyId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.issues.listMineByMe(companyId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.issues.listTouchedByMe(companyId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.issues.listUnreadTouchedByMe(companyId) });
  // Issue detail — any open detail could be stale
  // Use prefix ["issues", "detail"] to catch all open details without knowing IDs
  queryClient.invalidateQueries({ queryKey: ["issues", "detail"] });
  // Sidebar badges
  queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(companyId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(companyId) });
}
```

**Why prefix invalidation for detail:** `queryKeys.issues.detail(id)` returns `["issues", "detail", id]`. TanStack Query's `invalidateQueries` with `queryKey: ["issues", "detail"]` matches all detail queries as a prefix. This is the correct pattern when specific IDs are not known at invalidation time (HIGH confidence — verified against TanStack Query v5 docs).

**Integration point in LiveUpdatesProvider.tsx:**
```typescript
nextSocket.onopen = () => {
  if (closed || socket !== nextSocket) {
    closeSocketQuietly(nextSocket, "stale_connection");
    return;
  }
  if (reconnectAttempt > 0) {
    gateRef.current.suppressUntil = Date.now() + RECONNECT_SUPPRESS_MS;
    // NEW: invalidate stale cache after disconnect window
    invalidateOnReconnect(queryClient, liveCompanyId);
  }
  reconnectAttempt = 0;
};
```

The `queryClient` and `liveCompanyId` are already in scope inside the `useEffect` closure.

### Anti-Patterns to Avoid

- **Using `socket.terminate()` instead of `socket.close()` on the client:** The browser WebSocket API does not have `terminate()`. Use `close(code, reason)` to trigger the `onclose` handler and drive the reconnect loop.
- **Clearing reconnectAttempt before checking it:** `reconnectAttempt` must be read before it is reset to 0 in `onopen` to decide whether to call `invalidateOnReconnect`. Read first, then reset.
- **Full cache wipe on reconnect:** Invalidating all queries (e.g., `queryClient.invalidateQueries()` with no key) would cause a waterfall of background fetches. Scope invalidation to issue keys only.
- **Heartbeat timer leak:** The heartbeat timer must be cleared in the cleanup returned by `useEffect` and in `onclose`. If the socket closes while a heartbeat timer is pending, the deadline callback must not fire against a dead reference.
- **Server echo requirement:** The current architecture does not require the server to echo the client's `{"type":"ping"}` message. The server can ignore it. The client resets its deadline timer on ANY incoming message from the server (existing real-time events, or eventually a server pong). Do not add server-side ping-echo logic — it adds complexity for no benefit.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Connection quality monitoring | Custom EWMA/latency tracker | Simple last-received timestamp | Phase goal is dead-connection detection, not performance metrics |
| Missed-event replay | Event log + sequence numbers | Broad cache invalidation on reconnect | Sequence IDs require backend persistence; invalidation achieves same UX outcome |
| Connection state management library | Third-party WS manager (reconnecting-websocket etc.) | Extend existing LiveUpdatesProvider | Project already has working reconnect logic; adding a library adds bundle weight |

**Key insight:** The required reconnect detection, cache recovery, and `perMessageDeflate` annotation are all achievable with < 60 lines of changes across two files. No new dependencies.

## Common Pitfalls

### Pitfall 1: Heartbeat Timer Not Cleared on Effect Cleanup
**What goes wrong:** If the `useEffect` cleanup runs (e.g., component unmount, `liveCompanyId` change) while a heartbeat or deadline timer is pending, the callbacks fire after `closed = true` but could still reference the old `socket` variable.
**Why it happens:** `window.setTimeout` callbacks capture closures. If `closed` is checked correctly, this is harmless — but the timer itself leaks memory until it fires.
**How to avoid:** Add `clearHeartbeat()` to the effect cleanup function alongside `window.clearTimeout(connectTimer)` and `clearReconnect()`.
**Warning signs:** Console errors about calling `close()` on already-closed sockets in development.

### Pitfall 2: Heartbeat Fires Before onopen
**What goes wrong:** If the heartbeat is scheduled in `connect()` instead of `onopen`, it could fire before the socket finishes the handshake.
**Why it happens:** Timer started too early in the socket lifecycle.
**How to avoid:** Schedule the first heartbeat only inside `nextSocket.onopen`. Reset in `onmessage`.

### Pitfall 3: Deadline Fires on a Replaced Socket
**What goes wrong:** After a reconnect, the deadline from the old socket fires and calls `close()` on the new socket.
**Why it happens:** Captured socket reference in closure is the old socket but `socket` ref was reassigned.
**How to avoid:** Check `socket !== nextSocket` at the start of the deadline callback before calling `close()`. The pattern is already established in the existing `onopen` check.

### Pitfall 4: invalidateOnReconnect Called on Initial Connect
**What goes wrong:** A full cache invalidation fires on the initial page load connection, causing unnecessary re-fetches.
**Why it happens:** Checking `reconnectAttempt > 0` inside `onopen` uses the value after `reconnectAttempt += 1` in `scheduleReconnect` — but on initial connect `reconnectAttempt` starts at 0 and is never incremented before `onopen`.
**How to avoid:** The existing code already handles this correctly: `scheduleReconnect()` increments the counter, but the first connection goes directly through `connect()` without calling `scheduleReconnect()`. On first connect, `reconnectAttempt === 0` when `onopen` fires. Only confirm this invariant holds in test.

### Pitfall 5: perMessageDeflate Already Off — Test Still Needed
**What goes wrong:** Because `perMessageDeflate` is already `false` by default, the WS-02 change is purely documentary. A test that asserts `perMessageDeflate: false` was passed to the constructor must use the mock to capture constructor arguments.
**Why it happens:** The existing test mocks `WebSocketServer` with `vi.fn()` but does not capture the options argument.
**How to avoid:** Extend `live-events-ws-user-session.test.ts` or add a new test that captures the options passed to the `WebSocketServer` constructor and asserts `perMessageDeflate === false`.

## Code Examples

Verified patterns from official sources:

### TanStack Query prefix invalidation (WS-03)
```typescript
// Source: TanStack Query v5 docs — invalidateQueries with partial key match
// A shorter key acts as prefix: ["issues", "detail"] matches ["issues", "detail", "any-id"]
queryClient.invalidateQueries({ queryKey: ["issues", "detail"] });
```

### ws@8.19.0 perMessageDeflate default (WS-02)
```javascript
// Source: ws@8.19.0/lib/websocket-server.js line 65-82
options = {
  // ...
  perMessageDeflate: false,   // ← default; spread means explicit false is identical
  // ...
  ...options                  // ← caller options override
};
```

### Client heartbeat with deadline (WS-01)
```typescript
// Source: MDN WebSocket API + ws protocol RFC 6455 section 5.5
const HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_DEADLINE_MS = 12_000;

// Timers scoped to each connect() invocation to avoid cross-socket contamination
let heartbeatTimer: number | null = null;
let deadlineTimer: number | null = null;

const clearHeartbeat = () => {
  if (heartbeatTimer !== null) { window.clearTimeout(heartbeatTimer); heartbeatTimer = null; }
  if (deadlineTimer !== null) { window.clearTimeout(deadlineTimer); deadlineTimer = null; }
};

const scheduleHeartbeat = () => {
  clearHeartbeat();
  heartbeatTimer = window.setTimeout(() => {
    if (closed || socket !== nextSocket || nextSocket.readyState !== SOCKET_OPEN) return;
    nextSocket.send(JSON.stringify({ type: "ping" }));
    deadlineTimer = window.setTimeout(() => {
      if (closed || socket !== nextSocket) return;
      nextSocket.close(1000, "heartbeat_timeout");
    }, HEARTBEAT_DEADLINE_MS);
  }, HEARTBEAT_INTERVAL_MS);
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Server-only ping (passive browser) | Client application heartbeat | Phase 14 | Dead connections detected within 25s |
| Implicit perMessageDeflate off | Explicit perMessageDeflate: false | Phase 14 | Requirement traceable; no runtime change |
| No cache invalidation on reconnect | Targeted invalidation on reconnect | Phase 14 | Missed events not silently lost |

**Deprecated/outdated:**
- Relying solely on `onclose` for reconnect: does not fire for silently-dead connections caused by NAT timeouts or certain mobile network transitions.

## Open Questions

1. **Should the server echo client ping messages?**
   - What we know: Not required for the current design. The client resets its deadline timer on any incoming message (real events naturally arrive before the deadline in normal operation).
   - What's unclear: If the server is idle for >10s (no real events), the client will send a ping. The deadline fires 12s later if no response. Whether to add a server-side echo (`{"type":"pong"}`) for more predictable behavior.
   - Recommendation: Skip server echo in this phase. The existing server-side 30s ping/pong provides its own liveness signal. Add server echo only if testing shows false positives in production.

2. **Should `invalidateOnReconnect` also reset the isMutating guard window?**
   - What we know: The isMutating guard suppresses issue list/detail invalidation when an optimistic mutation is in flight.
   - What's unclear: If a mutation was in flight when the socket died, the optimistic value is already committed client-side; invalidating on reconnect is safe because `isMutating` will be `0` after the network drop (mutations would have timed out).
   - Recommendation: Call `invalidateOnReconnect` unconditionally in `onopen`; skip the isMutating check since the guard in `invalidateActivityQueries` already handles the normal flow.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.0.5 |
| Config file | ui/vite.config.ts (test.environment: "node"), server uses project-level vitest config |
| Quick run command (UI) | `pnpm --filter @paperclipai/ui vitest run ui/src/context/LiveUpdatesProvider.test.ts` |
| Quick run command (server) | `pnpm --filter @paperclipai/server vitest run server/src/__tests__/live-events-ws-user-session.test.ts` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WS-01 | heartbeat timer starts on `onopen`, clears on `onclose`, deadline calls `close()` | unit | `pnpm --filter @paperclipai/ui vitest run ui/src/context/LiveUpdatesProvider.test.ts` | Tests need to be added to existing file |
| WS-01 | `invalidateOnReconnect` not called on first connect (`reconnectAttempt === 0`) | unit | same file | Tests need to be added |
| WS-02 | `WebSocketServer` constructed with `perMessageDeflate: false` | unit | `pnpm --filter @paperclipai/server vitest run server/src/__tests__/live-events-ws-user-session.test.ts` | Test needs to be added to existing file |
| WS-03 | issue list and detail queries invalidated in `onopen` when `reconnectAttempt > 0` | unit | `pnpm --filter @paperclipai/ui vitest run ui/src/context/LiveUpdatesProvider.test.ts` | Tests need to be added |

### Sampling Rate
- **Per task commit:** Run the two affected test files (< 5 seconds combined)
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] New unit tests in `ui/src/context/LiveUpdatesProvider.test.ts` — covers WS-01 (heartbeat) and WS-03 (reconnect invalidation) using the existing `__liveUpdatesTestUtils` export pattern
- [ ] New unit test in `server/src/__tests__/live-events-ws-user-session.test.ts` or a new `live-events-ws-options.test.ts` — covers WS-02 (perMessageDeflate: false passed to constructor)

Note: The existing test infrastructure (vitest, mocked WS, `__liveUpdatesTestUtils`) already covers the module well. New tests extend existing files rather than requiring new framework setup.

## Sources

### Primary (HIGH confidence)
- ws@8.19.0 source — `node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/websocket-server.js` — verified `perMessageDeflate: false` default at line 70; verified constructor option spread behavior
- `server/src/realtime/live-events-ws.ts` — full read; current 30s ping interval, `noServer: true` constructor, WsServer type interface
- `ui/src/context/LiveUpdatesProvider.tsx` — full read; reconnect logic, onopen handler, absence of cache invalidation on reconnect, absence of client heartbeat
- `ui/src/lib/queryKeys.ts` — full read; confirmed `issues.list`, `issues.detail`, and related key shapes for invalidation scope

### Secondary (MEDIUM confidence)
- MDN WebSocket API — Browser WebSocket does not expose ping/pong to JavaScript; `onclose` not guaranteed for silent connection drops
- TanStack Query v5 docs — prefix-match invalidation with partial `queryKey` array

### Tertiary (LOW confidence)
- RFC 6455 section 5.5 — WebSocket Ping/Pong control frames handled by browser's networking stack, not JavaScript layer

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all changes use code already in the project; ws@8.18 default verified from source
- Architecture: HIGH — current implementation fully read; proposed changes are minimal and contained to two files
- Pitfalls: HIGH — derived directly from reading the implementation and timer scoping patterns

**Research date:** 2026-04-05
**Valid until:** 2026-05-05 (stable domain; ws library version locked in pnpm-lock.yaml)
