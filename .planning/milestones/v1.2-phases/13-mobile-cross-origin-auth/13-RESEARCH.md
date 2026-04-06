# Phase 13: Mobile Cross-Origin Auth - Research

**Researched:** 2026-04-05
**Domain:** BetterAuth bearer plugin, cross-origin session auth, WebSocket auth, Vercel SPA routing
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Bearer token strategy:** Add BetterAuth's `bearer` plugin to enable session token auth via `Authorization: Bearer <session_id>` in addition to cookies. Token stored in `localStorage` after login. REST API calls use dual mode: if `localStorage` has a token, send `Authorization: Bearer` header; otherwise fall back to `credentials: "include"`. Backward-compatible.
- **WebSocket auth:** Bearer token passed as URL query param `?token=session_id`. Standard WS auth pattern — accepted trade-off.
- **401 handling:** On any 401 response (token expired or revoked): clear the localStorage token and redirect to `/login`. No silent refresh.
- **Vercel SPA routing:** Always apply the proactive fix — replace `rewrites` with `routes` + `{ "handle": "filesystem" }` before the catch-all. Do not wait for test to fail.

### Claude's Discretion
- Exact `localStorage` key name for the session token
- Whether to use a React context or a simple module-level store for the token
- Order of bearer vs cookie attempts in the fetch wrapper (bearer first is standard)
- BetterAuth bearer plugin configuration details (session expiry, etc.)

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MAUTH-01 | User on iOS Safari can log in and maintain an authenticated session | Bearer token strategy in localStorage bypasses Safari ITP third-party cookie blocking; bearer plugin on server validates session |
| MAUTH-02 | User on Android Chrome can log in and maintain an authenticated session | Same bearer token flow covers Android Chrome |
| MAUTH-03 | Frontend and backend served under same root custom domain (or bearer strategy as primary fix) | CONTEXT.md: domain setup not locked; bearer strategy is the primary fix; sameSite cookie config already in place |
| MAUTH-04 | WebSocket connections authenticate user sessions | `authorizeUpgrade` already has query-param token path but only resolves it as agent API key — must add session resolution for user tokens |
| MAUTH-05 | Nested SPA routes load correctly on Vercel without 404 | Replace `rewrites` with `routes` + `filesystem` handle in `vercel.json` per CONTEXT.md decision |
</phase_requirements>

---

## Summary

This phase fixes mobile auth by adding the BetterAuth `bearer` plugin to the server and adding a complementary token-storage + injection layer to the frontend. The root cause of iOS Safari failures is third-party cookie blocking (ITP): when the frontend (Vercel) and backend (Easypanel VPS) are on different domains, Safari refuses to send or store cookies marked `sameSite: none`, making cookie-based sessions impossible. The bearer token strategy stores the session token in `localStorage` (which survives tab suspension, OS kill, and cross-origin restrictions) and sends it as an `Authorization: Bearer` header on every authenticated request, completely bypassing the cookie problem.

The BetterAuth `bearer` plugin (v1.4.18, already installed) intercepts `auth.api.getSession` calls before they execute, takes the signed session token from the `Authorization: Bearer` header, verifies its HMAC signature, and re-injects it as a cookie into the request headers. This means the existing `resolveBetterAuthSessionFromHeaders` function already supports bearer auth once the plugin is added to the BetterAuth instance — no new session resolution logic is needed. The server-side gap is in `actorMiddleware`: it currently skips `resolveSession` entirely when any `Authorization: Bearer` header is present, routing the token directly to agent/board API key lookup. The fix is to attempt `resolveSession` first for bearer tokens, then fall through to API key resolution on failure.

The WebSocket path already has query-param token support in `authorizeUpgrade`, but it only tries to match the token against agent API keys. The fix is to add a session resolution attempt when the agent API key lookup fails. The Vercel SPA routing issue (MAUTH-05) is addressed by the proactive decision to replace `rewrites` with `routes` + `filesystem` handle in `vercel.json`.

**Primary recommendation:** Add `bearer()` to the BetterAuth instance plugins array, fix `actorMiddleware` to try `resolveSession` on bearer tokens before falling back to agent key lookup, fix `authorizeUpgrade` similarly, update the frontend `authApi` to capture and store `set-auth-token` from sign-in responses, and inject the token on all authenticated requests.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-auth | 1.4.18 (installed) | Server-side bearer plugin and session resolution | Already in codebase; bearer plugin ships with package |
| localStorage | Browser built-in | Token persistence across tab suspension/OS kill | Survives mobile browser OS kill; bypasses cross-origin cookie restrictions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| No additional libraries needed | — | All auth logic uses existing BetterAuth and fetch | Phase uses only existing dependencies |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| localStorage token | sessionStorage | sessionStorage is cleared when tab is closed — bad for mobile; localStorage survives OS app kill |
| Bearer token in Authorization header | Bearer token in X-Custom-Header | Standard `Authorization: Bearer` is what BetterAuth bearer plugin expects |
| Bearer first, cookie fallback | Cookie first, bearer fallback | Bearer first is conventional; removes a round-trip failure for mobile users |

**Installation:**
```bash
# No new packages required — bearer is part of better-auth 1.4.18
```

**Version verification:** `better-auth` is at `1.4.18`. The `bearer` plugin is confirmed present at `server/node_modules/better-auth/dist/plugins/bearer/`.

---

## Architecture Patterns

### Recommended Project Structure

No new files or directories needed. All changes are modifications to existing files:

```
server/src/
├── auth/better-auth.ts       # Add bearer() plugin to createBetterAuthInstance
├── middleware/auth.ts        # Fix actorMiddleware bearer token fallthrough
└── realtime/live-events-ws.ts  # Fix authorizeUpgrade session resolution for token path

ui/src/
├── api/auth.ts               # Capture set-auth-token header, write/clear localStorage
└── lib/api-base.ts           # OR: centralized bearer injection helper
    context/
    └── LiveUpdatesProvider.tsx  # Append ?token=<localStorage token> to WS URL

vercel.json                   # Replace rewrites with routes + filesystem handle
```

### Pattern 1: BetterAuth Bearer Plugin Wiring

**What:** Add `bearer()` to the `plugins` array of `betterAuth({...})` in `createBetterAuthInstance`. This enables the HMAC-verified bearer-to-cookie conversion in BetterAuth's `before` hook for `getSession` calls.

**When to use:** Always in `authenticated` mode.

**Example:**
```typescript
// Source: server/node_modules/better-auth/dist/plugins/bearer/index.d.mts
// Source: https://better-auth.com/docs/plugins/bearer
import { bearer } from "better-auth/plugins";

const auth = betterAuth({
  // ...existing config...
  plugins: [bearer()],
});
```

After this change, `resolveBetterAuthSessionFromHeaders(auth, headersWithBearerToken)` will correctly resolve a user session when headers contain `Authorization: Bearer <signed_token>`.

### Pattern 2: Bearer Token — How BetterAuth Signs and Verifies It

**What:** The `set-auth-token` response header returned after sign-in is the **signed session cookie value** — the same value BetterAuth sets in the `better-auth.session_token` cookie. It is HMAC-SHA256 signed using the BetterAuth secret. The bearer plugin's `before` hook:
1. Extracts the token from `Authorization: Bearer <token>`
2. Verifies the HMAC signature against `c.context.secret`
3. If valid, appends the token as a cookie to the request headers before `getSession` runs

**Token format:** The token looks like `<base64url_session_id>.<base64url_hmac_signature>` (a dotted pair). The client should treat it as opaque and store/send as-is.

**How the client gets the token:** The `set-auth-token` response header is emitted by BetterAuth's `after` hook when:
1. The bearer plugin is active AND
2. A sign-in response sets the `better-auth.session_token` cookie (any successful sign-in)

The bearer plugin's after hook also sets `Access-Control-Expose-Headers: set-auth-token` so the header is readable from cross-origin responses.

**Example — capturing token after sign-in:**
```typescript
// Source: https://better-auth.com/docs/plugins/bearer
// ui/src/api/auth.ts — in signInEmail / signUpEmail
async function authPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}/auth${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) { /* existing error handling */ }

  // Capture bearer token if present (mobile / cross-origin flows)
  const token = res.headers.get("set-auth-token");
  if (token) {
    localStorage.setItem("paperclip_session_token", token);
  }
  return payload;
}
```

### Pattern 3: actorMiddleware — Bearer Token Session Fallthrough

**What:** The critical server-side fix. Currently `actorMiddleware` only tries `resolveSession` (cookie path) when there is NO `Authorization: Bearer` header. When a bearer header is present, it only tries agent/board API key resolution. The fix: when a bearer header is present in `authenticated` mode, first attempt `resolveSession` with the original request (BetterAuth bearer plugin will handle the header conversion); if that succeeds, set `req.actor` as board/user. If it fails (returns null), fall through to agent API key resolution as before.

**Example:**
```typescript
// Source: server/src/middleware/auth.ts — actorMiddleware
// After extracting authHeader and confirming it starts with "bearer ":

const token = authHeader.slice("bearer ".length).trim();
if (!token) { next(); return; }

// NEW: try BetterAuth session resolution first for bearer tokens in authenticated mode
if (opts.deploymentMode === "authenticated" && opts.resolveSession) {
  let session: BetterAuthSessionResult | null = null;
  try {
    session = await opts.resolveSession(req);  // bearer plugin on auth instance handles this
  } catch { /* log and continue */ }
  if (session?.user?.id) {
    const userId = session.user.id;
    // ...same DB lookups as the no-bearer path...
    req.actor = { type: "board", userId, ..., source: "bearer_session" };
    next();
    return;
  }
}

// Fall through: try board API key, then agent API key, then agent JWT (existing logic)
const boardKey = await boardAuth.findBoardApiKeyByToken(token);
// ...
```

### Pattern 4: WebSocket — Session Token Resolution for Query Param

**What:** `authorizeUpgrade` already reads the query param token. When a token is present, it currently ONLY tries agent API key lookup. The fix: after agent API key lookup fails, attempt BetterAuth session resolution by constructing synthetic headers with `Authorization: Bearer <token>` and calling `opts.resolveSessionFromHeaders`.

**Example:**
```typescript
// Source: server/src/realtime/live-events-ws.ts — authorizeUpgrade
// After: if (!key || key.companyId !== companyId) { return null; }
// Replace with:

if (!key || key.companyId !== companyId) {
  // Not an agent key — try user session (bearer token = signed BetterAuth session cookie)
  if (opts.deploymentMode === "authenticated" && opts.resolveSessionFromHeaders) {
    const syntheticHeaders = new Headers();
    syntheticHeaders.set("authorization", `Bearer ${token}`);
    const session = await opts.resolveSessionFromHeaders(syntheticHeaders);
    const userId = session?.user?.id;
    if (!userId) return null;

    const [roleRow, memberships] = await Promise.all([ /* same DB lookups as no-token path */ ]);
    const hasCompanyMembership = memberships.some((row) => row.companyId === companyId);
    if (!roleRow && !hasCompanyMembership) return null;

    return { companyId, actorType: "board", actorId: userId };
  }
  return null;
}
```

### Pattern 5: Frontend — Bearer Injection in getSession and Fetch Calls

**What:** All API calls that currently use `credentials: "include"` need to also send `Authorization: Bearer <token>` when a token is in localStorage. This is the primary fix for cross-origin mobile flows.

**Example — getSession:**
```typescript
// ui/src/api/auth.ts
getSession: async (): Promise<AuthSession | null> => {
  const token = localStorage.getItem("paperclip_session_token");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/auth/get-session`, {
    credentials: "include",
    headers,
  });
  if (res.status === 401) {
    // Clear stale token
    localStorage.removeItem("paperclip_session_token");
    return null;
  }
  // ...
}
```

**Example — generic fetch wrapper in api-base.ts:**
```typescript
// ui/src/lib/api-base.ts — new helper
export function getBearerHeaders(): Record<string, string> {
  const token = localStorage.getItem("paperclip_session_token");
  return token ? { "Authorization": `Bearer ${token}` } : {};
}
```

### Pattern 6: Frontend — WebSocket URL with Token

**What:** Append the bearer token as `?token=<value>` to the WS URL in `LiveUpdatesProvider.tsx`.

**Example:**
```typescript
// ui/src/context/LiveUpdatesProvider.tsx — line 796 area
const connect = () => {
  if (closed) return;
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const token = localStorage.getItem("paperclip_session_token");
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";
  const url = `${protocol}://${getWsHost()}/api/companies/${encodeURIComponent(liveCompanyId)}/events/ws${tokenParam}`;
  const nextSocket = new WebSocket(url);
  // ...
};
```

### Pattern 7: Vercel SPA Routing — routes + filesystem handle

**What:** The CONTEXT.md decision is to proactively replace `rewrites` with `routes` + `filesystem` handle to ensure nested SPA routes like `/PAC/dashboard` never 404.

**Note from Vercel docs:** `routes` is a legacy property intended for advanced use cases. However, it remains fully supported and is the correct mechanism when `handle: "filesystem"` is needed.

**Example:**
```json
// vercel.json
{
  "buildCommand": "pnpm --filter @paperclipai/ui build",
  "outputDirectory": "ui/dist",
  "framework": "vite",
  "routes": [
    { "handle": "filesystem" },
    { "src": "/(.*)", "dest": "/index.html" }
  ]
}
```

The `handle: "filesystem"` entry tells Vercel: first check if the path matches a real built file (JS, CSS, assets); if it does, serve it directly. If not, fall through to the next route, which rewrites everything to `/index.html` for client-side routing.

### Anti-Patterns to Avoid
- **Storing the raw session UUID in localStorage:** The bearer plugin requires the *signed* cookie value (`set-auth-token`), not the raw `session.id` string. `session.id` alone will fail HMAC verification.
- **Sending `getSession` without bearer header:** If the token is in localStorage but not injected into `getSession`, mobile users will get 401 on first load (no cookie + no bearer = unauthenticated).
- **Clearing localStorage token on sign-up success without re-capturing:** The sign-up flow also calls `authPost` and will receive `set-auth-token` — ensure `authPost` captures it in both sign-in and sign-up paths.
- **Not encoding the token in WS URL:** `encodeURIComponent` is necessary — the signed token may contain `+` and `.` which are meaningful in URLs.
- **Mixing `rewrites` and `routes` in vercel.json:** Vercel disallows using both simultaneously. When switching to `routes`, remove the `rewrites` key.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bearer token signing/verification | Custom HMAC token issuer | BetterAuth `bearer()` plugin | Plugin already handles signing, verification, and secure cookie injection using the same `secret` as the rest of auth |
| Session persistence across mobile tab kills | Custom token storage system | `localStorage` | Standard, built-in, reliable on all mobile browsers |
| Custom WS token auth | Custom WS auth middleware | Extend existing `authorizeUpgrade` + `resolveSessionFromHeaders` | Logic and DB queries are already implemented for the no-token path |

**Key insight:** The server-side bearer session resolution works entirely through the existing `resolveBetterAuthSessionFromHeaders` once the plugin is added. No new session validation code is needed — just route the bearer token to the right function instead of stopping at agent key lookup.

---

## Common Pitfalls

### Pitfall 1: Bearer Plugin Token Format — Signed Cookie Value Required
**What goes wrong:** Developer reads `session.id` from `authApi.getSession()` response and stores that raw UUID as the bearer token. Server returns 401 on every request because HMAC verification fails.
**Why it happens:** The BetterAuth bearer plugin validates tokens by checking the HMAC signature embedded in the `set-auth-token` header value. The raw `session.id` has no HMAC and will fail verification.
**How to avoid:** Only use the value from the `set-auth-token` response header (from sign-in or sign-up response). This is the signed cookie value, not the session ID.
**Warning signs:** `getSession` works fine on desktop (cookie) but returns 401 on mobile (bearer).

### Pitfall 2: actorMiddleware Short-Circuits on Bearer Header
**What goes wrong:** Bearer plugin is added to server, frontend sends `Authorization: Bearer <token>`, but `actorMiddleware` still returns `req.actor = { type: "none" }` for user sessions.
**Why it happens:** `actorMiddleware` currently only enters the `resolveSession` branch when there is NO bearer header. It exits the function after trying board/agent API key lookups, which fail for session tokens.
**How to avoid:** Modify `actorMiddleware` to attempt `resolveSession` FIRST when a bearer header is present in authenticated mode, before trying API key lookups.
**Warning signs:** 401 responses from non-auth API endpoints even though `getSession` returns a valid session.

### Pitfall 3: WS Token Not URL-Encoded
**What goes wrong:** WebSocket connection fails during handshake with 403.
**Why it happens:** The signed token contains `+`, `.`, or `=` characters that have special meaning in URL query strings. The server parses `url.searchParams.get("token")` which will decode the value — but if the token wasn't encoded, the server receives a corrupted token that fails HMAC verification.
**How to avoid:** Always `encodeURIComponent(token)` before appending to the WS URL.
**Warning signs:** WS upgrade succeeds for agents (whose tokens don't contain special characters) but fails for user sessions.

### Pitfall 4: Sign-Out Must Clear Both Cookie and localStorage Token
**What goes wrong:** User signs out, cookie is cleared on server, but localStorage token remains. On next page load, the app sends the revoked bearer token and gets 401s until the error handler clears it.
**Why it happens:** The sign-out flow was written before localStorage token storage existed.
**How to avoid:** In `authApi.signOut`, call `localStorage.removeItem("paperclip_session_token")` after the sign-out API call completes.
**Warning signs:** User signs out on mobile, navigates away, navigates back — app shows 401 flash before redirecting to login.

### Pitfall 5: CORS Blocks the set-auth-token Header
**What goes wrong:** Sign-in succeeds, but `res.headers.get("set-auth-token")` returns `null` in the client because the header is not in `Access-Control-Expose-Headers`.
**Why it happens:** Browsers block cross-origin response headers by default unless the server explicitly allows them in `Access-Control-Expose-Headers`.
**How to avoid:** The BetterAuth bearer plugin's `after` hook automatically sets `Access-Control-Expose-Headers: set-auth-token`. This only works if the plugin is added to the BetterAuth instance that handles the `/auth/sign-in/email` route. Verify that `betterAuthHandler` routes through the correct auth instance.
**Warning signs:** `set-auth-token` is present in the response when tested with curl, but `null` in browser fetch.

### Pitfall 6: Vercel rewrites + routes Cannot Coexist
**What goes wrong:** Vercel deployment fails or the routing fix doesn't apply.
**Why it happens:** Vercel forbids using `routes` alongside top-level `rewrites`, `headers`, or `redirects`. These are conflicting routing paradigms.
**How to avoid:** When switching to `routes` + `filesystem` handle, remove the `rewrites` key from `vercel.json` entirely.
**Warning signs:** Vercel build log shows a configuration error about incompatible properties.

---

## Code Examples

Verified patterns from official sources and code inspection:

### Bearer Plugin: Server Setup
```typescript
// Source: server/node_modules/better-auth/dist/plugins/bearer/index.d.mts (inspected)
// Source: https://better-auth.com/docs/plugins/bearer
import { bearer } from "better-auth/plugins";

export function createBetterAuthInstance(db: Db, config: Config, trustedOrigins?: string[]): BetterAuthInstance {
  // ... existing setup ...
  return betterAuth({
    // ... existing config ...
    plugins: [bearer()],
  });
}
```

### Bearer Plugin: How It Resolves Sessions
```typescript
// Source: server/node_modules/better-auth/dist/plugins/bearer/index.mjs (inspected)
// The before hook in the bearer plugin:
// 1. Gets token from Authorization: Bearer header
// 2. Verifies HMAC using BetterAuth secret
// 3. Appends token as cookie to request headers
// Result: auth.api.getSession({ headers }) returns the user session
// This means resolveBetterAuthSessionFromHeaders already handles bearer tokens
// once the plugin is added — no other server changes are needed for session resolution
```

### Frontend: Token Capture
```typescript
// Source: inspected ui/src/api/auth.ts + https://better-auth.com/docs/plugins/bearer
const res = await fetch(`${API_BASE}/auth/sign-in/email`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(input),
});
const token = res.headers.get("set-auth-token");
if (token) {
  localStorage.setItem("paperclip_session_token", token);
}
```

### Frontend: getSession with Bearer Header
```typescript
// Source: inspected ui/src/api/auth.ts pattern
const token = localStorage.getItem("paperclip_session_token");
const res = await fetch(`${API_BASE}/auth/get-session`, {
  credentials: "include",
  headers: {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
});
if (res.status === 401) {
  localStorage.removeItem("paperclip_session_token");
  return null;
}
```

### Vercel SPA Routing Fix
```json
// Source: Vercel docs (verified 2026-04-05) + CONTEXT.md decision
// vercel.json — replace rewrites with routes + filesystem handle
{
  "buildCommand": "pnpm --filter @paperclipai/ui build",
  "outputDirectory": "ui/dist",
  "framework": "vite",
  "routes": [
    { "handle": "filesystem" },
    { "src": "/(.*)", "dest": "/index.html" }
  ]
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cookie-only sessions | Bearer token + cookie fallback | Phase 13 (this phase) | Unblocks iOS Safari and Android Chrome |
| Agent-only WS bearer auth | User session WS bearer auth via query param | Phase 13 (this phase) | Mobile users receive real-time updates |
| `rewrites` catch-all | `routes` + `filesystem` handle | Phase 13 (this phase) | Nested SPA routes load directly on Vercel |

**Deprecated/outdated:**
- `"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]` — replaced by routes pattern per CONTEXT.md decision

---

## Open Questions

1. **MAUTH-03: Does the bearer strategy fully satisfy "same root custom domain" requirement?**
   - What we know: MAUTH-03 text says "Frontend and backend are served under the same root custom domain." CONTEXT.md says "domain setup not discussed — bearer strategy is the primary fix."
   - What's unclear: Whether MAUTH-03 acceptance requires actual domain consolidation or just that authentication works cross-origin.
   - Recommendation: Mark MAUTH-03 as satisfied when the bearer token flow enables stable mobile sessions regardless of origin. The requirement text describes the *intent* (resolving ITP), and bearer tokens achieve the same result without domain changes.

2. **Do all non-auth API fetch calls need bearer headers, or only auth/session calls?**
   - What we know: `actorMiddleware` is the gatekeeper for all API calls. Once it's fixed to try `resolveSession` on bearer tokens, any fetch call with `Authorization: Bearer` will be authenticated as a user session.
   - What's unclear: Whether the implementation should update every individual `fetch` call in `ui/src/api/` or centralize bearer injection in a shared helper.
   - Recommendation: Centralize in a `withBearerHeader()` helper in `api-base.ts` that all fetch calls import, rather than patching each file individually. This is a Claude's Discretion area.

3. **getSession endpoint in app.ts does not go through BetterAuth — will bearer work there?**
   - What we know: `app.ts` line 145 registers `/api/auth/get-session` as a custom Express route that reads from `req.actor` (already resolved by `actorMiddleware`). This bypasses BetterAuth entirely for the session endpoint.
   - What this means: Once `actorMiddleware` is fixed to handle bearer tokens for user sessions, the custom `get-session` route will work correctly. No changes needed to the route handler.
   - No open issue — this is a confirmation that the approach is sound.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (ui: `ui/vitest.config.ts`, server: `server/vitest.config.ts`) |
| Config file | `ui/vitest.config.ts` — environment: node; `server/vitest.config.ts` — environment: node |
| Quick run command | `pnpm --filter @paperclipai/ui vitest run` |
| Full suite command | `pnpm --filter @paperclipai/ui vitest run && pnpm --filter @paperclipai/server vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAUTH-01 | iOS Safari can log in and maintain session | manual-only | N/A — requires real iPhone with default privacy | ❌ manual test step |
| MAUTH-02 | Android Chrome can log in and maintain session | manual-only | N/A — requires real Android device | ❌ manual test step |
| MAUTH-03 | Bearer strategy resolves cross-origin auth | unit | `pnpm --filter @paperclipai/server vitest run` (new test) | ❌ Wave 0 |
| MAUTH-04 | WS upgrade accepts user session bearer token | unit | `pnpm --filter @paperclipai/server vitest run` (new test) | ❌ Wave 0 |
| MAUTH-05 | Nested SPA routes load without 404 | manual-only | N/A — requires live Vercel deployment | ❌ manual test step |

Notes on manual-only:
- MAUTH-01 and MAUTH-02 require a real mobile device with default browser privacy settings. iOS Simulator does not enforce ITP. Playwright does not simulate ITP. These are manual verification steps.
- MAUTH-05 requires a live Vercel deployment to verify. Local dev uses Vite proxy (same-origin), so the routing issue doesn't manifest locally.

### Sampling Rate
- **Per task commit:** `pnpm --filter @paperclipai/server vitest run`
- **Per wave merge:** `pnpm --filter @paperclipai/ui vitest run && pnpm --filter @paperclipai/server vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work` + manual mobile device test + manual Vercel nested route test

### Wave 0 Gaps
- [ ] `server/src/__tests__/live-events-ws-user-session.test.ts` — covers MAUTH-04: unit test for `authorizeUpgrade` accepting a signed BetterAuth session token via query param (mock `resolveSessionFromHeaders`)
- [ ] `server/src/__tests__/actor-middleware-bearer-session.test.ts` — covers MAUTH-03: unit test for `actorMiddleware` resolving a user session when `Authorization: Bearer` header is present (mock `resolveSession`)

---

## Sources

### Primary (HIGH confidence)
- `server/node_modules/better-auth/dist/plugins/bearer/index.mjs` — inspected bearer plugin implementation: HMAC signing flow, `set-auth-token` header emission, `before`/`after` hooks
- `server/node_modules/better-auth/dist/plugins/bearer/index.d.mts` — bearer plugin TypeScript types
- `server/src/realtime/live-events-ws.ts` — inspected: token-present path only resolves agent API keys, confirmed gap for user sessions
- `server/src/middleware/auth.ts` — inspected: bearer header presence skips `resolveSession`, confirmed gap
- `server/src/auth/better-auth.ts` — inspected: `resolveBetterAuthSessionFromHeaders` accepts Headers object; will work with bearer plugin once plugin is active
- `server/src/app.ts` — inspected: `/api/auth/get-session` uses `req.actor` (resolved by actorMiddleware), not BetterAuth directly

### Secondary (MEDIUM confidence)
- https://better-auth.com/docs/plugins/bearer — official BetterAuth bearer plugin docs (fetched 2026-04-05): confirmed `set-auth-token` header pattern, client token storage, `requireSignature` option
- https://vercel.com/docs/project-configuration/vercel-json — official Vercel docs (fetched 2026-04-05): confirmed `routes` with `handle: "filesystem"` pattern; confirmed `routes` and `rewrites` cannot coexist

### Tertiary (LOW confidence)
- https://community.vercel.com/t/rewrite-to-index-html-ignored-for-react-vite-spa-404-on-routes/8412 — Vercel community: `cleanUrls` conflict with rewrites; not applicable here (cleanUrls not set), but confirmed current `rewrites` config is standard

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — bearer plugin inspected at source, versions confirmed
- Architecture: HIGH — all patterns derived from inspected production code, not assumptions
- Pitfalls: HIGH — pitfalls derived from code inspection (actorMiddleware short-circuit, WS token path, sign-out gap)
- Vercel routing: MEDIUM — official docs confirm the pattern; actual behavior on live deployment is untested (CONTEXT.md: test step required)

**Research date:** 2026-04-05
**Valid until:** 2026-05-05 (BetterAuth is stable; bearer plugin API unlikely to change)
