# Phase 15: Auth Hardening - Research

**Researched:** 2026-04-06
**Domain:** Authentication security — rate limiting, session management, log redaction
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | Login endpoint has per-IP rate limit (progressive delay, no hard lockout) with Redis — mounted before BetterAuth handler | `express-rate-limit` v8 already installed; `rate-limit-redis` store already wired; mount order in `app.ts` confirmed |
| AUTH-02 | User can see list of active sessions (device, browser, IP, date) in Account Settings | BetterAuth `/api/auth/list-sessions` endpoint exists and returns full session objects including `ipAddress`, `userAgent`, `createdAt` |
| AUTH-03 | User can revoke a specific session from Account Settings | BetterAuth `/api/auth/revoke-session` endpoint accepts `{ token }` body; token IS returned by `listSessions` (verified in source) |
| AUTH-04 | User can revoke all sessions except the current one with a single button | BetterAuth `/api/auth/revoke-other-sessions` endpoint exists natively — no custom implementation needed |
| AUTH-05 | WS session token (`?token=`) is redacted from pino HTTP access logs | `pinoHttp` supports `serializers` option (inherits from `pino.LoggerOptions`); `customSuccessMessage` + `customErrorMessage` include `req.url` which exposes `?token=` |
</phase_requirements>

---

## Summary

Phase 15 hardens authentication on three axes: (1) rate limiting the login endpoint, (2) session management UI, and (3) WS token log redaction.

**Rate limiting (AUTH-01):** The project already has `express-rate-limit@8.3.2` and `rate-limit-redis@4.3.1` installed and wired via `createRateLimiter()`. A dedicated login rate limiter needs to be created and mounted at `app.all("/api/auth/sign-in/*", ...)` BEFORE the BetterAuth handler in `app.ts`. The existing global limiter is not suitable (1000 req/15 min, not keyed to sign-in failures).

**Session management (AUTH-02/03/04):** BetterAuth 1.4.18 already exposes `GET /api/auth/list-sessions`, `POST /api/auth/revoke-session` (by token), and `POST /api/auth/revoke-other-sessions`. Contrary to a prior note in STATE.md, the `token` field IS returned by `listSessions` — verified in source. No Drizzle direct-delete workaround is needed; the native endpoints work. Since `cookieCache` is NOT enabled (Paperclip uses Drizzle DB adapter, and cookieCache is only auto-enabled in DB-less mode), session revocation is immediately effective. A new Account Settings page/tab is needed in the UI.

**Log redaction (AUTH-05):** `pinoHttp` is configured via `customSuccessMessage` and `customErrorMessage` that log `req.url` directly. WS upgrade requests pass through the HTTP logger before the WS handshake, so `?token=<value>` appears in plaintext. The fix is to add a `serializers.req` function or modify the two message callbacks to strip `?token=` from the URL before logging.

**Primary recommendation:** Use native BetterAuth endpoints for session list/revoke; add a separate login-specific rate limiter with Redis; strip `?token=` via a URL sanitizer in the pino serializer.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `express-rate-limit` | 8.3.2 | Per-IP rate limiting for login | Already installed; proven Express middleware |
| `rate-limit-redis` | 4.3.1 | Redis-backed store for rate limiter | Already installed; survives server restart |
| `better-auth` | 1.4.18 | Auth framework — session list/revoke native APIs | Already the auth system; v1.4.18 has all required session endpoints |
| `pino-http` | 10.5.0 | HTTP request logger | Already installed; `serializers` option for URL redaction |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tanstack/react-query` | (already installed) | Fetching session list in UI | Consistent with rest of UI data-fetching |
| `ua-parser-js` | Not installed | Parse `userAgent` into readable device/browser | Optional — `userAgent` string can be displayed as-is initially |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native BetterAuth endpoints | Custom Drizzle queries | State.md originally suggested Drizzle workaround; source inspection proves native endpoints work |
| pino serializer for URL redaction | Regex in customSuccessMessage | Both work; serializer is cleaner and applies to the structured log object, not just the message string |
| express-rate-limit hard 429 | express-slow-down progressive delay | `express-slow-down` not installed; requirements say "progressive delay" but success criteria says "rate-limited" with 429 — simpler to implement with existing `express-rate-limit` |

**Installation:** No new packages needed. All required packages already installed.

---

## Architecture Patterns

### Recommended Project Structure
```
server/src/
├── middleware/
│   ├── rate-limit.ts              # existing global limiter (unchanged)
│   └── login-rate-limit.ts        # NEW: login-specific limiter
├── auth/
│   └── better-auth.ts             # existing (unchanged)
├── app.ts                         # mount login limiter BEFORE betterAuthHandler
├── middleware/
│   └── logger.ts                  # add URL sanitizer serializer / update customSuccessMessage
server/src/__tests__/
│   └── login-rate-limit.test.ts   # NEW: tests for login limiter
│   └── ws-token-redaction.test.ts # NEW: test for ?token= redaction
ui/src/
├── pages/
│   └── AccountSettings.tsx        # NEW: session list + revoke UI
├── api/
│   └── auth.ts                    # extend with listSessions, revokeSession, revokeOtherSessions
└── App.tsx                        # add /account route
```

### Pattern 1: Login Rate Limiter (AUTH-01)

**What:** A dedicated `express-rate-limit` instance mounted at `/api/auth/sign-in/email` BEFORE the BetterAuth handler.

**When to use:** Applied only to the sign-in endpoint, not the entire `/api/auth/*` namespace.

**Critical:** Mount order in `app.ts` is:
1. `app.all("/api/auth/sign-in/email", createLoginRateLimiter(opts.redisClient))` — NEW, BEFORE BetterAuth
2. `app.all("/api/auth/*authPath", opts.betterAuthHandler)` — existing

```typescript
// server/src/middleware/login-rate-limit.ts
import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type { RedisClientType } from "redis";

export function createLoginRateLimiter(redisClient?: RedisClientType) {
  const store = redisClient
    ? new RedisStore({
        sendCommand: (...args: string[]) => redisClient.sendCommand(args),
        prefix: "rl:login:",
      })
    : undefined;

  return rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    store,
    keyGenerator: (req) => req.ip ?? "unknown",
    handler: (_req, res) => {
      res.status(429).json({
        error: "Too many login attempts. Please wait 15 minutes before trying again.",
      });
    },
  });
}
```

```typescript
// app.ts — mount order (BEFORE betterAuthHandler)
if (opts.betterAuthHandler) {
  app.all("/api/auth/sign-in/email", createLoginRateLimiter(opts.redisClient));  // NEW first
  app.all("/api/auth/*authPath", opts.betterAuthHandler);
}
```

### Pattern 2: Session List and Revoke via Native BetterAuth Endpoints (AUTH-02/03/04)

**What:** Use BetterAuth's built-in session endpoints — no custom server routes needed.

**Key discovery:** `listSessions` DOES return the `token` field. The `parseSessionOutput` function in BetterAuth only strips fields where `returned: false` in the schema. The `token` field in the session table has no such flag — it is returned.

**BetterAuth session endpoints (already mounted via `opts.betterAuthHandler`):**
- `GET /api/auth/list-sessions` — requires valid session cookie/bearer; returns array of `{ id, token, ipAddress, userAgent, createdAt, expiresAt, userId }`
- `POST /api/auth/revoke-session` — body: `{ token: string }` — deletes session row; requires current session
- `POST /api/auth/revoke-other-sessions` — no body — deletes all sessions except current; requires current session

**UI API layer additions:**
```typescript
// ui/src/api/auth.ts additions
export type SessionEntry = {
  id: string;
  token: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
};

listSessions: async (): Promise<SessionEntry[]> => {
  const res = await fetch(`${API_BASE}/auth/list-sessions`, {
    credentials: "include",
    headers: { Accept: "application/json", ...getBearerHeaders() },
  });
  if (!res.ok) throw new Error(`Failed to list sessions (${res.status})`);
  return res.json();
},

revokeSession: async (token: string): Promise<void> => {
  const res = await fetch(`${API_BASE}/auth/revoke-session`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getBearerHeaders() },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error(`Failed to revoke session (${res.status})`);
},

revokeOtherSessions: async (): Promise<void> => {
  const res = await fetch(`${API_BASE}/auth/revoke-other-sessions`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getBearerHeaders() },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Failed to revoke other sessions (${res.status})`);
},
```

### Pattern 3: WS Token Redaction in Pino Logs (AUTH-05)

**What:** Strip the `?token=<value>` query param from all logged URLs in pino-http.

**Root cause:** `pinoHttp` logs `req.url` in `customSuccessMessage` and `customErrorMessage`. WS upgrade requests hit the HTTP server with the URL `/api/companies/:id/events/ws?token=<signed_session_token>` before the WebSocket handshake. This URL appears verbatim in access logs.

**Fix:** Add a `sanitizeUrl` helper and apply it in both message callbacks. Alternatively, use `pino`'s `serializers` to wrap the req serializer.

```typescript
// server/src/middleware/logger.ts — addition
function sanitizeLogUrl(url: string): string {
  try {
    // Strip ?token= and &token= from query params
    const hasQuery = url.includes("?");
    if (!hasQuery) return url;
    const [base, query] = url.split("?", 2);
    const params = new URLSearchParams(query);
    if (!params.has("token")) return url;
    params.delete("token");
    const remaining = params.toString();
    return remaining ? `${base}?${remaining}` : base!;
  } catch {
    return url;
  }
}

export const httpLogger = pinoHttp({
  logger,
  customLogLevel(_req, res, err) { ... },
  customSuccessMessage(req, res) {
    return `${req.method} ${sanitizeLogUrl(req.url)} ${res.statusCode}`;
  },
  customErrorMessage(req, res, err) {
    const ctx = (res as any).__errorContext;
    const errMsg = ctx?.error?.message || err?.message || (res as any).err?.message || "unknown error";
    return `${req.method} ${sanitizeLogUrl(req.url)} ${res.statusCode} — ${errMsg}`;
  },
  // ... rest unchanged
});
```

### Anti-Patterns to Avoid

- **Registering the login rate limiter AFTER `betterAuthHandler`:** Express routing is order-dependent. If `app.all("/api/auth/*authPath", betterAuthHandler)` is registered before the login limiter, the limiter is a silent no-op because BetterAuth captures the request first. Mount order is critical.
- **Using `revokeSession` with the session `id`:** The BetterAuth `/revoke-session` endpoint takes `{ token }` (the session token value), NOT the session `id`. These are different fields. Passing the `id` results in a silent no-op (the `findSession(token)` call returns null).
- **Relying on Drizzle direct-delete for revoke:** The STATE.md had a note suggesting the native `revokeSession` endpoint was broken. Source inspection confirms it works correctly — no workaround needed.
- **Applying the login rate limiter to all auth routes:** Applying it to `/api/auth/*` would block session refresh, logout, and other auth operations — only `/api/auth/sign-in/email` should be rate-limited.
- **URL redaction via pino `redact` option:** Pino's `redact` option works on object keys/paths (e.g., `req.headers.authorization`), not on query-param substrings within a URL string. Use the `sanitizeLogUrl` approach instead.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session list, revoke | Custom Drizzle queries for sessions API | BetterAuth `listSessions` / `revokeSession` / `revokeOtherSessions` | Native endpoints handle auth checks, cookie invalidation, and consistency automatically |
| Redis-backed rate limiting | Custom Redis counters | `express-rate-limit` + `rate-limit-redis` | Both already installed; handles window reset, header injection, Express integration |
| IP-based key generation | Manual `req.ip` extraction with proxy parsing | `express-rate-limit`'s built-in `keyGenerator` defaulting to `req.ip` | Rate limiter already handles trust proxy settings |

**Key insight:** BetterAuth 1.4.18 already has fully-featured session management endpoints. The entire AUTH-02/03/04 surface is a UI-only task — no new backend routes needed.

---

## Common Pitfalls

### Pitfall 1: Mount Order — Login Limiter After BetterAuth Handler
**What goes wrong:** The rate limiter is registered but never fires.
**Why it happens:** `app.all("/api/auth/*authPath", betterAuthHandler)` matches first; the login limiter never sees the request.
**How to avoid:** Mount `app.all("/api/auth/sign-in/email", createLoginRateLimiter(...))` on a line BEFORE the BetterAuth handler registration.
**Warning signs:** Test shows 200 responses even after 11 rapid sign-in attempts.

### Pitfall 2: Passing Session ID vs Token to revokeSession
**What goes wrong:** Revoke call silently succeeds (returns `{ status: true }`) but the session remains active.
**Why it happens:** `/revoke-session` calls `findSession(token)` where `token` is the body value. The session `id` is a UUID, the session `token` is the signed cookie value — they are different fields. `findSession` looks up by the token column.
**How to avoid:** The `listSessions` response includes both `id` and `token`. Pass `token` (not `id`) to the revoke endpoint.
**Warning signs:** Revoke returns 200 but the session still appears in the list on next fetch.

### Pitfall 3: cookieCache Not Configured = Revocation is Immediate
**What goes wrong:** Implementation adds complexity for eventual consistency that doesn't exist.
**Why it happens:** STATE.md notes a "60s cookie-cache TTL" but the current BetterAuth config in `better-auth.ts` has NO `cookieCache` configuration. CookieCache only auto-enables in DB-less mode; Paperclip uses Drizzle.
**How to avoid:** No cookieCache delay to handle. Revocation via `/revoke-session` deletes the session row immediately; `getSession` will return null on next call.
**Warning signs:** Overengineering eventual-consistency workarounds.

### Pitfall 4: WS Token Exposed in Both Log Message AND Structured Log Object
**What goes wrong:** Redacting `req.url` in the message string but not in the structured `req` object.
**Why it happens:** `pinoHttp` logs both a message (via `customSuccessMessage`) AND a structured `req` object (via its default serializer). The structured object also contains `req.url`.
**How to avoid:** Use a `serializers.req` wrapper in the `pinoHttp` config to also sanitize the URL in the structured object, OR use `pino`'s `redact` option on `req.url` path and rely solely on the sanitizer in message callbacks for the message string. Using both the message callback sanitizer AND a serializer wrapper is the most complete fix.
**Warning signs:** Log message is clean but the JSON log file still contains the raw token in the `req.url` field.

### Pitfall 5: Rate Limiter Key Uses Wrong IP Field
**What goes wrong:** All requests appear to come from `127.0.0.1` (proxy IP), defeating per-IP limiting.
**Why it happens:** Behind a load balancer, `req.ip` returns the proxy's IP unless Express `trust proxy` is configured.
**How to avoid:** Check if Paperclip's Express app sets `app.set("trust proxy", ...)`. If deployed on Easypanel behind Nginx, trust proxy is needed. Set `app.set("trust proxy", 1)` in `app.ts` if not already set.
**Warning signs:** Rate limiter key is always the same value regardless of client IP.

---

## Code Examples

### Login Rate Limiter Complete Implementation

```typescript
// Source: express-rate-limit v8 docs + existing rate-limit.ts pattern
// server/src/middleware/login-rate-limit.ts
import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type { RedisClientType } from "redis";

export function createLoginRateLimiter(redisClient?: RedisClientType) {
  const store = redisClient
    ? new RedisStore({
        sendCommand: (...args: string[]) => redisClient.sendCommand(args),
        prefix: "rl:login:",  // distinct prefix from global "rl:"
      })
    : undefined;

  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    store,
    keyGenerator: (req) => req.ip ?? "unknown",
    handler: (_req, res) => {
      res
        .status(429)
        .json({ error: "Too many login attempts. Please wait 15 minutes before trying again." });
    },
  });
}
```

### app.ts Mount Order

```typescript
// Source: app.ts existing structure — critical ordering
// app.ts — BEFORE betterAuthHandler
if (opts.betterAuthHandler) {
  if (opts.redisClient) {
    app.all("/api/auth/sign-in/email", createLoginRateLimiter(opts.redisClient));
  } else {
    // Graceful degradation: in-memory limiter (resets on restart but still blocks bursts)
    app.all("/api/auth/sign-in/email", createLoginRateLimiter());
  }
  app.all("/api/auth/*authPath", opts.betterAuthHandler);  // unchanged
}
```

Note: The success criteria says "the limit survives a server restart because state is stored in Redis". This means the Redis client must be passed — but we should still gracefully mount the in-memory fallback (consistent with the project's established Redis-optional pattern from v1.1).

### URL Sanitizer for pino

```typescript
// Source: pinoHttp docs + MDN URLSearchParams
function sanitizeLogUrl(url: string | undefined): string {
  if (!url) return "";
  if (!url.includes("token=")) return url;
  try {
    const qIdx = url.indexOf("?");
    if (qIdx === -1) return url;
    const base = url.slice(0, qIdx);
    const params = new URLSearchParams(url.slice(qIdx + 1));
    params.delete("token");
    const remaining = params.toString();
    return remaining ? `${base}?${remaining}` : base;
  } catch {
    return url.replace(/([?&])token=[^&]*/g, "");  // fallback regex
  }
}
```

### Account Settings Page — Session List UI Pattern

```typescript
// ui/src/pages/AccountSettings.tsx — skeleton
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi } from "../api/auth";

export function AccountSettings() {
  const queryClient = useQueryClient();
  const { data: sessions, isLoading } = useQuery({
    queryKey: ["auth", "sessions"],
    queryFn: () => authApi.listSessions(),
  });
  const { data: currentSession } = useQuery({
    queryKey: ["auth", "session"],
    queryFn: () => authApi.getSession(),
  });

  const revokeMutation = useMutation({
    mutationFn: (token: string) => authApi.revokeSession(token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] }),
  });
  const revokeOthersMutation = useMutation({
    mutationFn: () => authApi.revokeOtherSessions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] }),
  });

  // ... render session list, revoke buttons
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No per-endpoint rate limiting | Global rate limiter on all routes | Already in place | Need login-specific tighter limit |
| STATE.md assumed `listSessions` returns `token: ""` | `listSessions` actually returns full `token` field (verified in source) | Verified 2026-04-06 | Revoke-by-token works natively — no Drizzle workaround needed |
| STATE.md assumed cookieCache = 60s delay for revocation | cookieCache NOT enabled (Drizzle mode = no cookieCache by default) | Verified 2026-04-06 | Revocation is immediate; no eventual-consistency handling needed |

**Deprecated/outdated:**
- STATE.md note: "BetterAuth `listSessions` returns `token: ""` (empty string)": INCORRECT. Source shows token is returned. Revoke-by-ID via Drizzle direct-delete is NOT needed.
- STATE.md note: "keep `cookieCache.maxAge` at 60s or below": NOT applicable. cookieCache is disabled (no config in `better-auth.ts`).

---

## Open Questions

1. **Express trust proxy configuration**
   - What we know: Paperclip is deployed on Easypanel (VPS behind Nginx). Express needs `trust proxy` for `req.ip` to reflect the real client IP.
   - What's unclear: Is `app.set("trust proxy", 1)` currently configured in `app.ts`? (Grep found no explicit `trust proxy` setting.)
   - Recommendation: Check `app.ts` during planning/implementation. Add `app.set("trust proxy", 1)` if not present, or confirm the login rate limiter key falls back to a correct IP.

2. **`sanitizeLogUrl` coverage of `req.url` in pino structured object**
   - What we know: `customSuccessMessage` and `customErrorMessage` use `req.url` in the message string. The structured log's `req` object is separately serialized by pino-http's default req serializer.
   - What's unclear: Whether pino-http's default req serializer also logs `req.url` in the JSON output (it does — `req.url` appears in the serialized request object).
   - Recommendation: Apply the sanitizer to BOTH the message callbacks AND add a `serializers: { req: wrapReqSerializer }` in the pinoHttp config. Alternatively just sanitize the message callbacks and rely on the fact that structured log `req.url` is less critical than the readable message — document this decision.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `server/vitest.config.ts` |
| Quick run command | `pnpm --filter @paperclipai/server exec vitest run --reporter=verbose src/__tests__/login-rate-limit.test.ts src/__tests__/ws-token-redaction.test.ts` |
| Full suite command | `pnpm test:run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Login limiter returns 429 after 10 attempts from same IP | unit | `pnpm --filter @paperclipai/server exec vitest run src/__tests__/login-rate-limit.test.ts` | ❌ Wave 0 |
| AUTH-01 | Login limiter uses Redis store when Redis client provided | unit | same file | ❌ Wave 0 |
| AUTH-01 | Login limiter mounted BEFORE BetterAuth handler (mount order) | unit | same file | ❌ Wave 0 |
| AUTH-01 | Global rate limiter unchanged (still 1000 req/15min on other routes) | unit | `pnpm --filter @paperclipai/server exec vitest run src/__tests__/rate-limit.test.ts` | ✅ (existing) |
| AUTH-02 | `listSessions` returns sessions with ipAddress, userAgent, createdAt | integration | via BetterAuth native endpoint; no new test needed | ✅ (BetterAuth tested internally) |
| AUTH-03 | `revokeSession` invalidates the target session | integration | via BetterAuth; existing `better-auth-cookies.test.ts` | ✅ (partial) |
| AUTH-04 | `revokeOtherSessions` preserves current session | integration | via BetterAuth; no new test needed | ✅ (partial) |
| AUTH-05 | `?token=` is stripped from logged URL in message | unit | `pnpm --filter @paperclipai/server exec vitest run src/__tests__/ws-token-redaction.test.ts` | ❌ Wave 0 |
| AUTH-05 | URLs without `?token=` are unchanged | unit | same file | ❌ Wave 0 |
| AUTH-05 | Partial query strings (token + other params) handled correctly | unit | same file | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @paperclipai/server exec vitest run src/__tests__/login-rate-limit.test.ts src/__tests__/ws-token-redaction.test.ts`
- **Per wave merge:** `pnpm test:run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `server/src/__tests__/login-rate-limit.test.ts` — covers AUTH-01
- [ ] `server/src/__tests__/ws-token-redaction.test.ts` — covers AUTH-05

*(Existing `rate-limit.test.ts` covers the global rate limiter — no changes needed there)*

---

## Sources

### Primary (HIGH confidence)
- `server/src/auth/better-auth.ts` — BetterAuth instance creation, cookieCache not configured
- `server/src/app.ts` — mount order for betterAuthHandler and rate limiters
- `server/src/middleware/rate-limit.ts` — existing global rate limiter pattern
- `server/src/middleware/logger.ts` — pinoHttp config, `customSuccessMessage` / `customErrorMessage`
- `server/src/realtime/live-events-ws.ts` — WS upgrade flow, `?token=` query param usage
- `node_modules/better-auth@1.4.18/dist/api/routes/session.mjs` — `listSessions`, `revokeSession`, `revokeOtherSessions` source; token field IS returned
- `node_modules/@better-auth/core@1.4.18/dist/db/get-tables.mjs` — session token field has no `returned: false`
- `node_modules/@better-auth/core@1.4.18/dist/context/create-context.mjs` — cookieCache only auto-enabled when `!options.database`
- `node_modules/express-rate-limit@8.3.2/dist/index.d.ts` — Options type, no built-in progressive delay
- `packages/db/src/schema/auth.ts` — Drizzle session table schema (id, token, ipAddress, userAgent)
- `node_modules/pino-http@10.5.0/index.d.ts` — Options extends pino.LoggerOptions (serializers available)

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — prior research decisions; some corrected by source inspection
- `.planning/REQUIREMENTS.md` — requirement definitions

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already installed; no new dependencies for backend
- Architecture: HIGH — BetterAuth endpoints verified in source code; mount order confirmed in app.ts
- Pitfalls: HIGH — mount order and token-vs-id distinction verified against source; cookieCache state confirmed
- STATE.md corrections: HIGH — source inspection directly contradicts two prior claims (token returned, cookieCache off)

**Research date:** 2026-04-06
**Valid until:** 2026-05-06 (stable libraries; BetterAuth session API unlikely to change)
