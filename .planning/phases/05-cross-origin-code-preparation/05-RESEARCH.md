# Phase 5: Cross-Origin Code Preparation - Research

**Researched:** 2026-04-04
**Domain:** Cross-origin browser security — Vite SPA env injection, WebSocket URL derivation, Express CORS, BetterAuth cookie config
**Confidence:** HIGH (all findings verified against installed source code and official documentation)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Env var naming & structure**
- Single env var: `VITE_API_URL` (matches roadmap naming)
- Value is the full backend origin: `https://backend.railway.app`
- Both REST API calls and WebSocket URLs derive from this one var — no separate WS env var
- When unset, code falls back to relative paths and `window.location.host` (local dev mode)
- No build-time validation of the URL format — silent fallback only

**Backend env vars**
- Keep existing naming as-is: `PAPERCLIP_ALLOWED_HOSTNAMES`, `PAPERCLIP_AUTH_PUBLIC_BASE_URL`, `BETTER_AUTH_SECRET`
- These vars already exist in `server/src/config.ts` — just wire them for cross-origin use

**Local development workflow**
- Zero config: local dev must work exactly as today with no `.env` file required
- Vite proxy continues to handle `/api` routing in dev mode
- `VITE_API_URL` unset = local mode, set = cross-origin mode

**Auth secret handling**
- Remove the `"paperclip-dev-secret"` fallback in authenticated mode — server must crash on startup if `BETTER_AUTH_SECRET` is unset and `PAPERCLIP_DEPLOYMENT_MODE=authenticated`
- Local dev (`local_trusted` mode) is unaffected — it doesn't use BetterAuth at all

**CORS middleware**
- Add Express `cors` package to `app.ts` with `credentials: true`
- Allowed origins scoped to `PAPERCLIP_ALLOWED_HOSTNAMES`
- Handles OPTIONS preflight requests automatically

**Vercel project configuration**
- Claude's discretion on format (vercel.json vs vercel.ts) — pick what's simplest for a Vite SPA with one rewrite rule
- Default `pnpm build` command — no custom build steps
- SPA rewrite: all routes fall through to `index.html` for client-side routing

**Health endpoint**
- Current `GET /api/health` response is sufficient for Railway readiness checks
- No database connectivity check needed — just a 200 confirming the container is up

### Claude's Discretion
- Vercel config format choice (vercel.json vs vercel.ts)
- Exact CORS middleware configuration details
- Cookie config field names in BetterAuth (`cookieOptions` vs `defaultCookieAttributes` — verify against installed version)
- Whether to create a `.env.example` file documenting the new env vars

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEPLOY-01 | Frontend deployed to Vercel as SPA with correct rewrite rules (no 404 on direct navigation) | `vercel.json` SPA rewrite pattern confirmed; planner creates `ui/vercel.json` |
| DEPLOY-02 | All API calls in frontend use configurable `VITE_API_URL` instead of relative paths | `client.ts` and `auth.ts` exact lines identified; fallback pattern confirmed |
| DEPLOY-03 | WebSocket URLs in frontend point to backend host, not CDN host (3 files) | All 3 WS URL construction sites confirmed at exact lines; fix pattern documented |
| DEPLOY-04 | Frontend build succeeds on Vercel with correct environment variables | Vite `VITE_` prefix convention confirmed; build-time injection pattern documented |
| DEPLOY-06 | Health check endpoint (`GET /health`) responds correctly for Railway container readiness | Existing `healthRoutes()` returns 200; no code change needed |
| DEPLOY-08 | Backend reads `PORT` from environment (Railway overrides at runtime) | `config.ts` line 231 confirmed: `Number(process.env.PORT) || ... || 3100` |
| AUTH-01 | CORS middleware configured to allow Vercel frontend origin with credentials | `cors` package not present; insertion point and pattern documented |
| AUTH-02 | BetterAuth cookies set to `SameSite=None; Secure` for cross-origin auth | BetterAuth 1.4.18 field confirmed: `advanced.defaultCookieAttributes` |
| AUTH-03 | `PAPERCLIP_ALLOWED_HOSTNAMES` includes Vercel domain so boardMutationGuard accepts requests | Guard uses `x-forwarded-host`/`host` — CORS allowed origin handles this; `PAPERCLIP_ALLOWED_HOSTNAMES` feeds `deriveAuthTrustedOrigins`, not the guard directly |
| AUTH-04 | `BETTER_AUTH_SECRET` set to a secure random value (no fallback to hardcoded dev secret) | Fallback at `better-auth.ts` line 70 identified; index.ts lines 478-484 already throw when unset in authenticated mode |
</phase_requirements>

---

## Summary

Phase 5 is a surgical code-change phase — no cloud infrastructure is touched. All changes address the mismatch between a same-origin monolith (where Express serves the UI and relative `/api` paths work) and a split deployment (where the frontend is a static Vercel SPA and the backend is a Railway Express container on a different domain).

There are six distinct change areas: (1) Frontend env var injection and API base URL, (2) WebSocket URL derivation in three files, (3) `vercel.json` for SPA routing, (4) Express CORS middleware addition, (5) BetterAuth cookie SameSite attribute, and (6) removal of the `BETTER_AUTH_SECRET` hardcoded dev fallback in `better-auth.ts`. The server already validates that `BETTER_AUTH_SECRET` is set in `index.ts` when `deploymentMode=authenticated`; the remaining task is to remove the silent fallback inside `createBetterAuthInstance()` itself.

All six changes are code-only and locally verifiable. The phase succeeds when a build with `VITE_API_URL` set produces no hardcoded host references, the server refuses to start without `BETTER_AUTH_SECRET` in authenticated mode, and CORS preflight returns the correct headers.

**Primary recommendation:** Make all changes in a single ordered sequence — env constant first, then callers, then server-side auth/CORS — so each change is independently testable before the next.

---

## Standard Stack

### Core (existing — no new packages needed for frontend)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vite | 6.1.x (installed) | Build-time env injection via `import.meta.env.VITE_*` | Already in `ui/` — `VITE_` prefix is the required convention for browser-exposed vars |
| Express 5 | 5.1.x (installed) | HTTP server hosting all routes including auth | Already in use |
| BetterAuth | 1.4.18 (installed) | Session management, cookie issuance | Already in use |

### New Dependency (server only)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `cors` | latest (^2.x) | Express CORS middleware — handles OPTIONS preflight automatically | Industry standard; not currently in `server/package.json` |
| `@types/cors` | latest | TypeScript types for cors | Needed since server uses TypeScript |

**Note:** `cors` is NOT currently installed. Confirmed by reading `server/package.json` — no `cors` entry in dependencies or devDependencies.

**Installation:**
```bash
pnpm --filter @paperclipai/server add cors
pnpm --filter @paperclipai/server add -D @types/cors
```

**Version verification:**
```bash
npm view cors version
npm view @types/cors version
```

### What NOT to Add

| Avoid | Why |
|-------|-----|
| Separate `VITE_WS_URL` env var | User decision: derive WS host from `VITE_API_URL` via `new URL()` |
| `helmet` | Out of scope for Phase 5 — Phase 8 hardening |
| `express-rate-limit` | Out of scope for Phase 5 — Phase 8 hardening |
| Build-time URL validation | User decision: silent fallback, no validation |

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
ui/
└── vercel.json          # NEW — SPA fallback rewrite rule

server/src/
├── app.ts               # MODIFIED — cors() inserted before express.json()
└── auth/
    └── better-auth.ts   # MODIFIED — defaultCookieAttributes + remove secret fallback

ui/src/
├── lib/
│   └── api-base.ts      # NEW — single export: API_BASE and WS host helper
├── api/
│   ├── client.ts        # MODIFIED — import API_BASE, replace const BASE
│   └── auth.ts          # MODIFIED — replace literal /api/auth strings
└── context/
    └── LiveUpdatesProvider.tsx          # MODIFIED — WS URL from VITE_API_URL
ui/src/components/transcript/
    └── useLiveRunTranscripts.ts         # MODIFIED — WS URL from VITE_API_URL
ui/src/pages/
    └── AgentDetail.tsx                  # MODIFIED — WS URL from VITE_API_URL
```

### Pattern 1: Centralized API Base Constant

**What:** Single file exports the API base string and a WebSocket host helper. All callers import from this file — no scattered `import.meta.env` references.

**When to use:** Any project where multiple files need to derive the same env-based URL.

**Example:**
```typescript
// ui/src/lib/api-base.ts
// VITE_API_URL is undefined in local dev (unset) — falls back to "" so relative paths work
const API_ORIGIN = import.meta.env.VITE_API_URL ?? "";

// For REST: prepend to "/api/..." paths
export const API_BASE = API_ORIGIN + "/api";

// For WebSocket: extract host from VITE_API_URL, or fall back to window.location.host
export function getWsHost(): string {
  if (import.meta.env.VITE_API_URL) {
    return new URL(import.meta.env.VITE_API_URL).host;
  }
  return window.location.host;
}
```

**Usage in client.ts (current line 1):**
```typescript
// Before:
const BASE = "/api";

// After:
import { API_BASE } from "@/lib/api-base";
const BASE = API_BASE;
```

**Usage in auth.ts (lines 28 and 48):**
```typescript
// Before (line 28):
const res = await fetch(`/api/auth${path}`, { ... });

// After:
import { API_BASE } from "@/lib/api-base";
const res = await fetch(`${API_BASE}/auth${path}`, { ... });

// Before (line 48):
const res = await fetch("/api/auth/get-session", { ... });

// After:
const res = await fetch(`${API_BASE}/auth/get-session`, { ... });
```

### Pattern 2: WebSocket URL from VITE_API_URL

**What:** Replace `window.location.host` with `getWsHost()` in all three WebSocket connection sites.

**When to use:** Any WS connection that must reach a host different from the page origin.

**Example (identical pattern in all 3 files):**
```typescript
// Before (lines 775-776 in LiveUpdatesProvider.tsx):
const protocol = window.location.protocol === "https:" ? "wss" : "ws";
const url = `${protocol}://${window.location.host}/api/companies/${...}/events/ws`;

// After:
import { getWsHost } from "@/lib/api-base";
const protocol = window.location.protocol === "https:" ? "wss" : "ws";
const url = `${protocol}://${getWsHost()}/api/companies/${...}/events/ws`;
```

**Three files to update — exact locations:**

| File | Line | Pattern |
|------|------|---------|
| `ui/src/context/LiveUpdatesProvider.tsx` | 776 | `${window.location.host}` |
| `ui/src/components/transcript/useLiveRunTranscripts.ts` | 189 | `${window.location.host}` |
| `ui/src/pages/AgentDetail.tsx` | 3567 | `${window.location.host}` |

**Local dev behavior:** When `VITE_API_URL` is unset, `getWsHost()` returns `window.location.host` — identical to current behavior. The Vite proxy in `vite.config.ts` already has `ws: true` for WebSocket proxying in dev.

### Pattern 3: Vercel SPA Rewrite

**What:** `vercel.json` in `ui/` tells Vercel to serve `index.html` for all routes. Without this, direct navigation to any path other than `/` returns 404 because the path doesn't match a physical file.

**Format choice (Claude's discretion): `vercel.json`** — simplest, no TypeScript compilation required for a single rule.

**Example:**
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

**File location:** `ui/vercel.json` — Vercel detects it when the project root is `ui/`.

**What NOT to add:** Do not add `/api/:path*` rewrites to proxy Railway through Vercel. Direct cross-origin calls avoid cookie routing confusion and latency. The rewrite rule is only for SPA client-side routing fallback.

### Pattern 4: Express CORS Middleware

**What:** `cors()` inserted as the first middleware in `createApp()`, before `express.json()`. The CORS preflight `OPTIONS` response must be returned before any other middleware processes the request.

**When to use:** Any Express server receiving cross-origin requests with `credentials: "include"`.

**Example:**
```typescript
// server/src/app.ts — top of createApp(), before app.use(express.json())
import cors from "cors";

const allowedOrigins = (process.env.PAPERCLIP_ALLOWED_HOSTNAMES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .flatMap((h) => [`https://${h}`, `http://${h}`]);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow no-origin requests (curl, same-origin, mobile)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);
```

**Key constraint:** `credentials: true` is incompatible with `origin: "*"`. The allowed origin must be explicit. `PAPERCLIP_ALLOWED_HOSTNAMES` already contains the right set — config.ts line 174 parses it.

**Existing infrastructure reuse:** `config.ts` already parses `PAPERCLIP_ALLOWED_HOSTNAMES` into `config.allowedHostnames[]`. However, CORS middleware in `createApp()` receives opts (which includes `allowedHostnames`), so the implementation can use `opts.allowedHostnames` directly rather than re-reading the env var.

### Pattern 5: BetterAuth Cookie SameSite=None

**What:** Override `advanced.defaultCookieAttributes` to set `sameSite: "none"` and `secure: true`. Without this, BetterAuth issues `SameSite=Lax` (the default for HTTPS), which browsers drop on cross-site fetch requests.

**Confirmed field name:** `advanced.defaultCookieAttributes` — verified directly in BetterAuth 1.4.18 source at `better-auth/dist/cookies/index.mjs`: `options.advanced?.defaultCookieAttributes` is the key used in `createCookieGetter()`.

**Example:**
```typescript
// server/src/auth/better-auth.ts — inside createBetterAuthInstance()
// Current code at line 94:
...(isHttpOnly ? { advanced: { useSecureCookies: false } } : {}),

// Replace with:
...(isHttpOnly
  ? { advanced: { useSecureCookies: false } }
  : {
      advanced: {
        defaultCookieAttributes: {
          sameSite: "none" as const,
          secure: true,
        },
      },
    }),
```

**Constraint:** `SameSite=None` requires `secure: true`. Both Vercel (HTTPS) and Railway (HTTPS) satisfy this. Local dev uses `isHttpOnly=true` (http://localhost), so the branch remains `useSecureCookies: false` — local dev is unaffected.

### Pattern 6: Remove Hardcoded Secret Fallback

**What:** Remove `"paperclip-dev-secret"` from the `createBetterAuthInstance()` fallback chain.

**Current code (better-auth.ts line 70):**
```typescript
const secret = process.env.BETTER_AUTH_SECRET ?? process.env.PAPERCLIP_AGENT_JWT_SECRET ?? "paperclip-dev-secret";
```

**Why the index.ts guard is not sufficient:** `index.ts` lines 478-484 already throw when `BETTER_AUTH_SECRET` is unset in authenticated mode. But `createBetterAuthInstance()` is also exported and could be called independently. The silent fallback in the function itself is a defence-in-depth gap.

**Replacement:**
```typescript
const secret = process.env.BETTER_AUTH_SECRET?.trim() ?? process.env.PAPERCLIP_AGENT_JWT_SECRET?.trim();
if (!secret) {
  throw new Error(
    "createBetterAuthInstance: BETTER_AUTH_SECRET must be set in authenticated mode",
  );
}
```

**Local dev safety:** `local_trusted` mode never calls `createBetterAuthInstance()` — the import is inside the `if (config.deploymentMode === "authenticated")` block in `index.ts` line 470. Zero impact on local dev.

### Anti-Patterns to Avoid

- **Wildcard CORS origin:** `origin: "*"` is incompatible with `credentials: true`. The browser will reject the response silently.
- **Adding `/api` proxy rewrite to `vercel.json`:** This routes API calls through Vercel, adds latency, and breaks BetterAuth cookie semantics.
- **Separate `VITE_WS_URL` env var:** User decision is to derive from `VITE_API_URL` — one var, not two.
- **Scattering `import.meta.env.VITE_API_URL` across files:** Single source via `api-base.ts` is the correct pattern.
- **Modifying `vite.config.ts`:** The dev proxy already works (`ws: true` is set). No changes needed.
- **Setting `SameSite=None` without `secure: true`:** Browsers reject `SameSite=None` cookies unless `Secure` is also set.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CORS headers and preflight | Custom `OPTIONS` handler, manual header setting | `cors` npm package | Handles all CORS edge cases: preflight, method allowlists, credential headers, Vary headers |
| SPA route fallback | Custom Vercel serverless function | `vercel.json` rewrites array | One-line config; serverless functions have cold start cost |
| Env var injection into browser bundle | Runtime env endpoint, window globals | Vite `import.meta.env.VITE_*` | Build-time injection is the correct SPA pattern; no server needed |

**Key insight:** Cross-origin browser security has many hidden edge cases. `SameSite=None` must pair with `Secure`. CORS `credentials: true` must pair with explicit (not wildcard) origin. These constraints are enforced by browsers silently — wrong config produces no server error, only a broken browser.

---

## Common Pitfalls

### Pitfall 1: `boardMutationGuard` still rejects cross-origin mutations (AUTH-03)

**What goes wrong:** `board-mutation-guard.ts` derives trusted origins from the `host` and `x-forwarded-host` headers of the incoming request (the backend's own hostname). Requests from `app.vercel.app` arrive with `Origin: https://app.vercel.app` — which does not match `backend.railway.app`. All POST/PATCH/DELETE return 403.

**Code confirmed:** `trustedOriginsForRequest()` in `board-mutation-guard.ts` line 19-28 only adds `http://${host}` and `https://${host}` based on the request's own host header. It has no knowledge of external frontends.

**How to avoid:** Set `PAPERCLIP_ALLOWED_HOSTNAMES=app.vercel.app` in Railway. The `config.ts` parser (lines 174-199) splits this on commas, lowercases, and passes to `allowedHostnames[]`. The guard does NOT read this array — but setting it correctly feeds `deriveAuthTrustedOrigins()` for BetterAuth. For the mutation guard itself, CORS must be in place AND the CORS allowed origin must match what the browser sends as `Origin`. Since CORS passes the request through (allowing it), and the guard only checks `Origin`/`Referer`... wait: **read the guard code carefully.**

**Correct understanding:** The mutation guard checks `Origin` header against trusted origins derived from the request's own `host`. It does NOT use `PAPERCLIP_ALLOWED_HOSTNAMES`. So even with CORS configured, the guard will still 403 cross-origin browser mutations because `app.vercel.app` will not match `backend.railway.app`.

**Resolution:** The CORS middleware must be placed BEFORE the `boardMutationGuard`. After `cors()` allows the request, the guard needs to also trust the Vercel origin. **This requires the guard to be updated or a new trusted-origins hook to be added.** The simplest fix: pass `allowedHostnames` into `boardMutationGuard()` as options, or add `app.vercel.app` origins to the guard's trusted set.

**Alternative fix (simpler):** Check the CORS middleware approach — if CORS allows the request via the OPTIONS preflight, the actual `POST` still hits the guard. The guard will check `Origin: https://app.vercel.app` and find it not in the trusted set (which only has the backend's own host). So CORS alone does not fix the guard.

**Recommended approach for Phase 5:** Modify `boardMutationGuard()` to accept an optional `allowedOrigins: string[]` parameter and include those origins in `trustedOriginsForRequest`. The `createApp()` already receives `allowedHostnames` in `opts` — pass them through.

**Warning signs:** GET requests succeed; all POST/PATCH/DELETE return 403 with body `"Board mutation requires trusted browser origin"`.

### Pitfall 2: Session cookies blocked (SameSite=Lax default)

**What goes wrong:** BetterAuth sets `SameSite=Lax` by default for HTTPS. The browser drops these cookies on cross-site `fetch` with `credentials: "include"`. Sign-in POST returns 200 but every subsequent request appears unauthenticated.

**Code confirmed:** `createBetterAuthInstance()` in `better-auth.ts` lines 94-95 only sets `useSecureCookies: false` for HTTP-only deployments. The HTTPS branch has no cookie override, meaning BetterAuth's default `SameSite=Lax` applies.

**How to avoid:** Add `advanced.defaultCookieAttributes` override as documented in Pattern 5.

**Warning signs:** Sign-in returns 200; `GET /api/auth/get-session` returns 401 or null; session cookie visible in DevTools but disappears on next cross-origin request.

### Pitfall 3: WebSocket connects to Vercel (not Railway)

**What goes wrong:** All three WS files use `window.location.host`. When the frontend is at `app.vercel.app`, the WS connects to `wss://app.vercel.app/api/...` — Vercel cannot handle WebSocket connections. Live updates silently stop working.

**Code confirmed:** Lines 776, 189, 3567 in the three files all use `${window.location.host}`.

**Warning signs:** REST calls succeed; live events and transcript streaming stop working in production; Network tab (WS filter) shows connection attempt to Vercel host with status 1006.

### Pitfall 4: `VITE_API_URL` not set before Vercel build

**What goes wrong:** Vite bakes env vars at build time. If `VITE_API_URL` is not set in the Vercel dashboard before the first build, the built JS contains `undefined` for the base URL — all API calls get relative paths which resolve against Vercel (404).

**How to avoid:** Set `VITE_API_URL` in Vercel dashboard Environment Variables BEFORE triggering the first deploy. This is an operational step, not a code step, but must be documented in the plan.

### Pitfall 5: `cors` middleware placed after `express.json()`

**What goes wrong:** Preflight OPTIONS requests have no body. If `express.json()` runs first and encounters a Content-Type mismatch or JSON parse error on the OPTIONS, the middleware chain breaks before `cors()` can respond.

**How to avoid:** `cors()` must be the first `app.use()` in `createApp()` — before `express.json()`, before `httpLogger`, before everything else.

---

## Code Examples

Verified patterns from reading installed BetterAuth 1.4.18 source and project source files:

### BetterAuth cookie override (field name verified)

```typescript
// verified: options.advanced?.defaultCookieAttributes used in
// better-auth 1.4.18 dist/cookies/index.mjs createCookieGetter()
const authConfig = {
  // ... existing fields ...
  ...(isHttpOnly
    ? { advanced: { useSecureCookies: false } }
    : {
        advanced: {
          defaultCookieAttributes: {
            sameSite: "none" as const,
            secure: true,
          },
        },
      }),
};
```

### CORS middleware with allowedHostnames from opts

```typescript
// server/src/app.ts — first app.use() in createApp()
import cors from "cors";

const allowedOrigins = opts.allowedHostnames.flatMap((h) => [
  `https://${h}`,
  `http://${h}`,
]);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);
```

### boardMutationGuard update to accept external origins

```typescript
// server/src/middleware/board-mutation-guard.ts
export function boardMutationGuard(
  opts: { allowedOrigins?: string[] } = {},
): RequestHandler {
  return (req, res, next) => {
    // ... existing method/actor checks ...
    if (!isTrustedBoardMutationRequest(req, opts.allowedOrigins ?? [])) {
      res.status(403).json({ error: "Board mutation requires trusted browser origin" });
      return;
    }
    next();
  };
}

function trustedOriginsForRequest(req: Request, extraOrigins: string[]) {
  const origins = new Set([
    ...DEFAULT_DEV_ORIGINS.map((v) => v.toLowerCase()),
    ...extraOrigins.map((v) => v.toLowerCase()),
  ]);
  const forwardedHost = req.header("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || req.header("host")?.trim();
  if (host) {
    origins.add(`http://${host}`.toLowerCase());
    origins.add(`https://${host}`.toLowerCase());
  }
  return origins;
}
```

### vercel.json (simplest format)

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### DEPLOY-08: PORT reading (already correct)

```typescript
// server/src/config.ts line 231 — already reads PORT from env:
port: Number(process.env.PORT) || fileConfig?.server.port || 3100,
// No change needed — DEPLOY-08 is satisfied by existing code
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `SameSite=Lax` (same-origin monolith) | `SameSite=None; Secure` (cross-origin SPA) | When deploying frontend and backend to different domains | Required since Chrome 80 (2020) enforced SameSite=Lax as default |
| Relative `/api` paths | Env-based absolute URL | When splitting monolith | Relative paths break as soon as the page origin differs from the API origin |
| `window.location.host` for WS | Derive from `VITE_API_URL` | When splitting monolith | Vercel does not support WebSocket connections — WS must go directly to Railway |
| Wildcard CORS (`*`) | Explicit origin with credentials | Always | `credentials: true` is incompatible with `*` per the CORS spec |

**Deprecated/outdated:**
- `ioredis`: maintenance mode. Not applicable to Phase 5 (Redis is Phase 8), but noting for future reference. Use `redis` (node-redis v5) when Redis is added.
- `SameSite=Lax` for cross-origin cookie use: not deprecated, but insufficient for cross-origin authenticated requests. Correct value is `SameSite=None; Secure`.

---

## Open Questions

1. **`boardMutationGuard` fix scope**
   - What we know: The guard does not read `PAPERCLIP_ALLOWED_HOSTNAMES`; it only trusts the backend's own host headers. CORS alone will not fix 403s on mutations.
   - What's unclear: Whether to modify `boardMutationGuard()` to accept external origins (cleanest), or to wire the allowedHostnames through some other mechanism.
   - Recommendation: Modify `boardMutationGuard()` to accept `allowedOrigins?: string[]` and pass `opts.allowedHostnames.flatMap(h => ["https://"+h, "http://"+h])` from `createApp()`. The existing tests in `board-mutation-guard.test.ts` use the function directly and will need one update to pass the new optional param (backward-compatible since it defaults to `[]`).

2. **`.env.example` file (Claude's discretion)**
   - What we know: User left format to Claude's discretion.
   - Recommendation: YES — create `ui/.env.example` with `VITE_API_URL=https://your-backend.railway.app` and `server/.env.example` with the backend vars. This is low-cost and prevents future confusion.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.0.x |
| Config file (server) | `server/vitest.config.ts` — `environment: "node"` |
| Config file (ui) | `ui/vitest.config.ts` — `environment: "node"` |
| Quick run command (server) | `pnpm --filter @paperclipai/server test --run` |
| Quick run command (ui) | `pnpm --filter @paperclipai/ui test --run` |
| Full suite command | `pnpm --filter @paperclipai/server test --run && pnpm --filter @paperclipai/ui test --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEPLOY-02 | `API_BASE` constant uses `VITE_API_URL` when set, falls back to `""` when unset | unit | `pnpm --filter @paperclipai/ui test --run src/lib/api-base` | ❌ Wave 0 |
| DEPLOY-03 | `getWsHost()` returns URL host when `VITE_API_URL` set, `window.location.host` when unset | unit | `pnpm --filter @paperclipai/ui test --run src/lib/api-base` | ❌ Wave 0 |
| AUTH-01 | CORS middleware allows credentialed request from allowed origin; rejects unlisted origins | unit | `pnpm --filter @paperclipai/server test --run src/__tests__/cors-middleware` | ❌ Wave 0 |
| AUTH-02 | BetterAuth cookie config uses `defaultCookieAttributes.sameSite="none"` for HTTPS deployments | unit | `pnpm --filter @paperclipai/server test --run src/__tests__/better-auth-cookies` | ❌ Wave 0 |
| AUTH-03 | `boardMutationGuard` with `allowedOrigins` accepts cross-origin POST from listed host | unit | `pnpm --filter @paperclipai/server test --run src/__tests__/board-mutation-guard` | ✅ exists (needs new case) |
| AUTH-04 | `createBetterAuthInstance` throws if `BETTER_AUTH_SECRET` is not set | unit | `pnpm --filter @paperclipai/server test --run src/__tests__/better-auth-cookies` | ❌ Wave 0 |
| DEPLOY-01 | `vercel.json` rewrite rule present and correct | manual | Open `ui/vercel.json`, verify `rewrites` key | N/A — config file |
| DEPLOY-04 | Vite build succeeds with `VITE_API_URL` set | smoke | `VITE_API_URL=https://test.railway.app pnpm --filter @paperclipai/ui build` | N/A — build test |
| DEPLOY-06 | `GET /api/health` returns 200 | unit | `pnpm --filter @paperclipai/server test --run src/__tests__/health` | ✅ exists |
| DEPLOY-08 | `config.ts` reads `PORT` from env | unit (already passing) | `pnpm --filter @paperclipai/server test --run src/__tests__/paperclip-env` | ✅ exists |

### Sampling Rate

- **Per task commit:** Run the specific test file for the changed area
- **Per wave merge:** `pnpm --filter @paperclipai/server test --run && pnpm --filter @paperclipai/ui test --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `ui/src/lib/api-base.test.ts` — covers DEPLOY-02, DEPLOY-03 (`API_BASE` and `getWsHost()` with/without `VITE_API_URL`)
- [ ] `server/src/__tests__/cors-middleware.test.ts` — covers AUTH-01 (allowed origin passes, unlisted origin rejected, OPTIONS preflight returns correct headers)
- [ ] `server/src/__tests__/better-auth-cookies.test.ts` — covers AUTH-02 (`defaultCookieAttributes` for HTTPS) and AUTH-04 (throws without `BETTER_AUTH_SECRET`)
- [ ] `server/src/__tests__/board-mutation-guard.test.ts` — ✅ exists; add one case: POST with `allowedOrigins: ["https://app.vercel.app"]` and `Origin: https://app.vercel.app` is accepted

---

## Sources

### Primary (HIGH confidence)

- Direct code read: `ui/src/api/client.ts` — `const BASE = "/api"` confirmed at line 1
- Direct code read: `ui/src/api/auth.ts` — literal `/api/auth${path}` at line 28, `/api/auth/get-session` at line 48
- Direct code read: `ui/src/context/LiveUpdatesProvider.tsx` line 776 — `${window.location.host}`
- Direct code read: `ui/src/components/transcript/useLiveRunTranscripts.ts` line 189 — `${window.location.host}`
- Direct code read: `ui/src/pages/AgentDetail.tsx` line 3567 — `${window.location.host}`
- Direct code read: `server/src/auth/better-auth.ts` line 70 — `"paperclip-dev-secret"` fallback
- Direct code read: `server/src/app.ts` — no `cors` import or usage present
- Direct code read: `server/package.json` — `cors` not in dependencies
- Direct code read: `server/src/config.ts` line 231 — `Number(process.env.PORT) || ... || 3100`
- Direct code read: `server/src/index.ts` lines 478-484 — already throws when `BETTER_AUTH_SECRET` unset in authenticated mode
- Direct code read: `server/src/middleware/board-mutation-guard.ts` — confirmed `trustedOriginsForRequest()` only uses request's own `host` header; does NOT read `PAPERCLIP_ALLOWED_HOSTNAMES`
- BetterAuth 1.4.18 source (installed): `better-auth/dist/cookies/index.mjs` — confirmed `options.advanced?.defaultCookieAttributes` is the field name used in `createCookieGetter()`
- `.planning/research/PITFALLS.md` — code-verified pitfalls for WebSocket, API paths, cookies, boardMutationGuard
- `.planning/research/ARCHITECTURE.md` — CORS middleware pattern, BetterAuth cookie pattern, vercel.json pattern

### Secondary (MEDIUM confidence)

- `.planning/research/STACK.md` — verified `cors` package recommendation for Express CORS
- BetterAuth GitHub issues #2203, #7657 — cross-origin cookie and trusted origins behavior confirmed by community

### Tertiary (LOW confidence)

None — all claims in this document are verified against installed source or canonical planning docs.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against installed `server/package.json`, `better-auth` source, existing `vitest` configs
- Architecture: HIGH — all source files read directly; exact line numbers confirmed
- Pitfalls: HIGH — board-mutation-guard pitfall verified by reading guard source; all other pitfalls from code-verified PITFALLS.md
- BetterAuth field name: HIGH — verified by grepping installed `better-auth@1.4.18` dist source

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable library versions; BetterAuth minor version bumps could change field names)
