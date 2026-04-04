# Pitfalls Research

**Domain:** Monolith split — Express + React to Vercel (frontend) + Railway (backend) + Supabase + Redis + API Gateway
**Researched:** 2026-04-04
**Confidence:** HIGH (code-verified + community confirmation)

---

## Critical Pitfalls

Mistakes in this tier cause complete feature failure, silently broken behavior, or security incidents.

---

### Pitfall 1: WebSocket URL hardcoded to `window.location.host`

**What goes wrong:**
Three files build WebSocket URLs from `window.location.host`:

- `ui/src/context/LiveUpdatesProvider.tsx` line 776
- `ui/src/components/transcript/useLiveRunTranscripts.ts` line 189
- `ui/src/pages/AgentDetail.tsx` line 3567

```ts
// current code — breaks after split
const url = `${protocol}://${window.location.host}/api/companies/${...}/events/ws`;
```

When the frontend is at `app.vercel.app` and the backend is at `backend.railway.app`, this constructs `wss://app.vercel.app/api/...` — a URL pointing at Vercel. Vercel cannot handle WebSocket connections. Real-time updates (live events, transcript streaming, agent run status) silently stop working.

**Why it happens:**
In monolith mode the frontend and backend share the same host, so `window.location.host` is correct. Developers assume it will keep working after the split because the Vite dev proxy already handles everything locally.

**How to avoid:**
Before the split phase, introduce a `VITE_API_BASE_URL` env var and replace all three occurrences:

```ts
const backendHost = import.meta.env.VITE_API_BASE_URL
  ? new URL(import.meta.env.VITE_API_BASE_URL).host
  : window.location.host;
const protocol = window.location.protocol === "https:" ? "wss" : "ws";
const url = `${protocol}://${backendHost}/api/companies/${encodeURIComponent(liveCompanyId)}/events/ws`;
```

In Vercel, set `VITE_API_BASE_URL=https://your-backend.railway.app`. In local dev leave it unset — the Vite proxy (`/api → localhost:3100`) already handles routing.

Vercel does not support WebSockets at all. The WebSocket endpoint must live on Railway and the frontend must point to it explicitly.

**Warning signs:**
- Live events stop updating after deploy but REST API calls succeed
- Network tab (WS filter) shows connection attempt to Vercel URL, not Railway
- Works fine in local dev because Vite proxy handles the upgrade

**Phase to address:**
Phase 1 (Frontend split / Vercel deploy) — this is a hard blocker. Must be fixed before any deployment.

---

### Pitfall 2: API client uses relative path `/api` — breaks when frontend is on a different origin

**What goes wrong:**
`ui/src/api/client.ts` defines:

```ts
const BASE = "/api";
```

Every REST call in the app goes to a relative URL. When the frontend is served from `app.vercel.app` and the backend is on `backend.railway.app`, relative paths resolve against the Vercel CDN — which returns 404 for all API calls. Auth calls in `ui/src/api/auth.ts` also use `/api/auth/...` hardcoded as literals and need the same treatment.

**Why it happens:**
In monolith mode relative URLs work correctly because Express serves the UI. Nobody notices `const BASE = "/api"` is a problem until the split happens.

**How to avoid:**
Add `VITE_API_BASE_URL` to Vite and update the base:

```ts
// client.ts
const BASE = (import.meta.env.VITE_API_BASE_URL ?? "") + "/api";
```

Do the same for the literal strings in `auth.ts`. When `VITE_API_BASE_URL` is unset (local dev), the string is empty and relative paths work as before — Vite proxy handles them.

**Warning signs:**
- All API calls return 404 in production
- Auth login fails immediately with network error
- Browser Network tab shows `GET https://app.vercel.app/api/...` (Vercel host, not Railway)

**Phase to address:**
Phase 1 (Frontend split) — must be the first code change before deploying anything.

---

### Pitfall 3: BetterAuth cookies blocked cross-origin — session never persists

**What goes wrong:**
BetterAuth sets `SameSite=Lax` cookies by default. When the frontend (`app.vercel.app`) calls the backend (`backend.railway.app`) cross-origin with `credentials: "include"`, the browser blocks `SameSite=Lax` cookies on cross-origin requests. The user appears to sign in successfully (the POST returns 200) but every subsequent page load sees an unauthenticated session because the session cookie is never sent back.

**Why it happens:**
`SameSite=Lax` allows cookies on top-level navigations but not on cross-origin `fetch`/XHR with credentials. Since the frontend is on a completely different domain, `Lax` cookies are silently dropped on every API request.

**How to avoid:**
Two steps, both required:

1. Configure BetterAuth cookies in `server/src/auth/better-auth.ts`:
```ts
...(isHttpOnly ? { advanced: { useSecureCookies: false } } : {
  advanced: {
    cookieOptions: {
      sameSite: "none",
      secure: true,
    }
  }
})
```

2. Set environment variables on Railway:
```
BETTER_AUTH_TRUSTED_ORIGINS=https://your-app.vercel.app
PAPERCLIP_AUTH_BASE_URL_MODE=explicit
PAPERCLIP_AUTH_PUBLIC_BASE_URL=https://backend.railway.app
```

`SameSite=None` requires HTTPS on both sides — fine for Railway+Vercel production, but means the local dev proxy must remain for development.

**Warning signs:**
- Sign-in returns 200 but `GET /api/auth/get-session` immediately returns `null`
- Session cookie is visible in DevTools after login but disappears on next request
- `authApi.getSession()` always returns `null` in production, works in local dev

**Phase to address:**
Phase 1 (Deployment infrastructure) — must be configured alongside the API URL change.

---

### Pitfall 4: `boardMutationGuard` rejects all write operations from the Vercel frontend

**What goes wrong:**
`server/src/middleware/board-mutation-guard.ts` checks that POST/PATCH/DELETE requests from browser sessions have an `origin` or `referer` header matching the server's own host. After the split, every request from `app.vercel.app` arrives with `Origin: https://app.vercel.app` — which does not match `backend.railway.app`. The guard returns 403 for every mutation.

**Why it happens:**
The guard derives trusted origins from the request's `host` and `x-forwarded-host` headers (the backend's own hostname). It has no concept of an external frontend on a different domain.

**How to avoid:**
Add the Vercel frontend hostname (without scheme) to `PAPERCLIP_ALLOWED_HOSTNAMES`:

```
PAPERCLIP_ALLOWED_HOSTNAMES=your-app.vercel.app
```

The config parser splits this on commas and adds both `http://` and `https://` variants to `allowedHostnames`, which are then added to the trusted set in `trustedOriginsForRequest`. No code changes needed.

**Warning signs:**
- GET requests succeed; all POST/PATCH/DELETE return 403
- Error body: `"Board mutation requires trusted browser origin"`
- Only affects authenticated browser sessions — agent API key calls are unaffected

**Phase to address:**
Phase 1 (Deployment infrastructure) — same Railway environment variable pass as Pitfall 3.

---

### Pitfall 5: Supabase transaction pool mode breaks Drizzle prepared statements

**What goes wrong:**
Supabase's connection pooler (Supavisor) on port 6543 uses transaction pool mode. The `postgres-js` driver used by Drizzle sends prepared statements by default. Transaction pool mode does not support prepared statements — the database connection fails with a protocol-level error on every query.

**Why it happens:**
When copying a `DATABASE_URL` from the Supabase dashboard, developers naturally use the pooler URL (port 6543) because it's recommended. They don't know that `prepare: false` must be explicitly set in the `postgres-js` client config.

**How to avoid:**
In `packages/db/src/client.ts`, the `createDb` function currently calls `postgres(url)` without options. Must become:

```ts
export function createDb(url: string) {
  const sql = postgres(url, {
    prepare: false, // required for Supabase Supavisor transaction pool mode
  });
  return drizzlePg(sql, { schema });
}
```

Alternative for v1.1: use Supabase's direct connection URL (port 5432, no pooler). No `prepare: false` needed, but hits Postgres's connection limit (~25 concurrent connections). Acceptable at v1.1 testing scale; switch to pooler for production.

**Warning signs:**
- Queries throw `PreparedStatementAlreadyExists` or `query is not prepared` errors in Railway logs
- Works fine with embedded-postgres locally; breaks only with Supabase DATABASE_URL
- Errors appear on first query after deployment, not during startup validation

**Phase to address:**
Phase 2 (Supabase migration) — immediately when `DATABASE_URL` is switched to Supabase.

---

### Pitfall 6: Dockerfile builds the UI for Railway — ships stale UI if `SERVE_UI` is not explicitly disabled

**What goes wrong:**
The current Dockerfile runs `pnpm --filter @paperclipai/ui build` and the production image defaults to `SERVE_UI=true`. When the frontend is deployed to Vercel separately, the Railway image still serves its own bundled UI copy. Users hitting the Railway URL see the old UI from the Docker build — not the latest Vercel deploy.

**Why it happens:**
The Dockerfile was built for self-hosted monolith deployment where serving the UI makes sense. The `SERVE_UI=true` default is correct for that use case and incorrect for the split deployment.

**How to avoid:**
Set `SERVE_UI=false` in Railway environment variables. The config reads this env var and overrides the Dockerfile default. The `uiMode` will be `"none"` — the server runs as a pure API. No Dockerfile changes needed for v1.1.

Startup log confirmation: look for `Mode: none` in the UI mode line of the startup banner.

**Warning signs:**
- Users on the Railway URL see a different (older) version of the UI than Vercel shows
- Startup log shows `Mode: static` instead of `none`
- Railway builds take longer than expected (UI build runs even though it's not used)

**Phase to address:**
Phase 1 (Railway deployment) — set `SERVE_UI=false` in Railway environment variables before first deployment.

---

### Pitfall 7: API Gateway strips WebSocket `Upgrade` headers — live events break through the gateway

**What goes wrong:**
`Connection: Upgrade` and `Upgrade: websocket` are hop-by-hop headers that most HTTP proxies and API gateways strip by default. Without these headers, Railway never upgrades the connection from HTTP to WebSocket. The gateway silently proxies a regular HTTP request and the WebSocket handshake fails.

AWS API Gateway HTTP APIs do not support WebSocket proxying at all — they maintain the WebSocket connection client-side and forward messages over HTTP, which is incompatible with `live-events-ws.ts`'s architecture.

**Why it happens:**
API gateway documentation focuses on HTTP routing. WebSocket support requires explicit configuration and is often listed as a footnote or separate product.

**How to avoid:**
If using nginx:
```nginx
location /api/ {
  proxy_pass http://railway_backend;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 3600s;
}
```

Treat WebSocket passthrough as a hard filter criterion when evaluating gateway options. Test it before committing to any gateway. If a cloud API gateway (AWS, Cloudflare) is chosen, verify it supports raw TCP WebSocket proxying, not just the gateway's own WebSocket API.

**Warning signs:**
- HTTP API calls work through the gateway; WebSocket connections fail immediately (code 1006 abnormal closure)
- Railway logs show no WebSocket upgrade requests arriving
- Gateway access logs show connections closing at 400 or 200, never reaching 101

**Phase to address:**
Phase 3 (API Gateway) — validate WebSocket passthrough before selecting the gateway solution.

---

### Pitfall 8: `BETTER_AUTH_SECRET` left as the dev default in production

**What goes wrong:**
`server/src/auth/better-auth.ts` falls back to `"paperclip-dev-secret"` if `BETTER_AUTH_SECRET` is not set:

```ts
const secret = process.env.BETTER_AUTH_SECRET ?? process.env.PAPERCLIP_AGENT_JWT_SECRET ?? "paperclip-dev-secret";
```

If Railway is deployed without setting `BETTER_AUTH_SECRET`, session tokens are signed with a known public default. Anyone with the source code can forge valid session tokens.

**Why it happens:**
The fallback exists so local dev works without configuration. It's easy to forget to set the env var in the Railway dashboard.

**How to avoid:**
Generate a secret before the first deployment:
```bash
openssl rand -base64 32
```
Set it as `BETTER_AUTH_SECRET` in Railway. This is non-optional for any public-facing deployment.

**Warning signs:**
- Railway startup succeeds without any `BETTER_AUTH_SECRET` warning (the fallback is silent)
- Check Railway env vars — if `BETTER_AUTH_SECRET` is absent, the default is being used

**Phase to address:**
Phase 1 (Railway deployment) — must be set before the service is publicly accessible.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Use Supabase direct URL (port 5432) instead of pooler to avoid `prepare: false` change | No code change needed | Hits Postgres connection limit (~25 connections) under load | Acceptable for v1.1 testing; must switch to pooler for production |
| Set `BETTER_AUTH_TRUSTED_ORIGINS` via env without cookie `SameSite` code change | Faster to configure | Session cookies may fail in Safari (stricter SameSite enforcement) | Acceptable if only Chrome-only for v1.1; fix before wide release |
| Keep UI build in Dockerfile, set `SERVE_UI=false` via env | No Dockerfile changes | Railway images ~50MB larger than necessary; longer build times | Acceptable for v1.1; create slim Railway Dockerfile for v1.2 |
| Keep `PAPERCLIP_ALLOWED_HOSTNAMES` listing the Vercel app URL | No code changes to guard | Wildcard subdomains not supported — each preview environment URL must be listed | Acceptable for production URL; never use a wildcard |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| BetterAuth + Vercel split | Setting `BETTER_AUTH_TRUSTED_ORIGINS` to `*.vercel.app` (wildcard) — not supported | List the exact production domain; set up a custom Vercel domain for predictable URLs |
| Supabase + Drizzle | Using pooler URL (port 6543) without `prepare: false` | Set `{ prepare: false }` in `createDb()`, or use direct URL (port 5432) for v1.1 |
| Railway CORS + Vercel | Railway's HTTP edge can silently drop OPTIONS preflight requests | Always test CORS with a real cross-origin fetch from the Vercel domain, not same-origin |
| API Gateway + WebSockets | Choosing an HTTP-only gateway that converts WS frames to HTTP messages | Require raw TCP WebSocket passthrough as a mandatory filter criterion when evaluating options |
| Vercel + WebSockets | Attempting to proxy WebSocket traffic through Vercel rewrites | Not possible — Vercel Functions cannot maintain persistent connections. All WS traffic must go direct to Railway |
| Redis + BetterAuth sessions | Caching auth session lookups in Redis | Never cache session validation — it must always hit the DB to detect revoked sessions |
| Redis + Drizzle write-then-read | Caching query results that are invalidated by writes from other services | Use short TTLs or write-through invalidation; scope cache keys per company to limit cascade |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| No connection pooling to Supabase (direct port 5432) | Slow queries, connection timeout errors under load | Add Supavisor pooler URL with `prepare: false` when user count grows | ~20 concurrent active users |
| Redis caching company-wide data invalidated on every write | Cache invalidation becomes the bottleneck; DEL cascade takes longer than the original query | Scope cache keys narrowly (per-company or per-entity); use short TTLs for hot tables | First multi-user session with frequent writes |
| Railway container sleeping between requests (hobby tier) | First request after inactivity is slow (~2-5s) | Keep API on Railway always-on plan or use Railway's sleep prevention; Vercel CDN stays fast | Every ~5 min of inactivity on free/hobby tier |
| Supabase large result sets in Redis | Redis `put` fails when JSON-encoded result exceeds Redis max string size | Set max TTL and max result size thresholds; never cache unbounded list queries | Query results exceeding ~512MB Redis value limit |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `BETTER_AUTH_SECRET` left as `"paperclip-dev-secret"` | Session tokens forgeable — full account takeover | Generate with `openssl rand -base64 32` and set in Railway before any public access |
| `PAPERCLIP_AUTH_PUBLIC_BASE_URL` set to Railway internal URL | BetterAuth generates auth redirect URLs pointing at internal host; sign-in/out flows break | Must be the public HTTPS URL that the browser can reach |
| `SameSite=None` cookies without `Secure=true` | Browser silently rejects `SameSite=None` cookies over HTTP | Always pair `SameSite=None` with `Secure: true` — requires HTTPS on Railway |
| `BETTER_AUTH_TRUSTED_ORIGINS` omitted | BetterAuth rejects all cross-origin auth requests (sign-in returns 400/403) | Always set to the exact Vercel production URL |
| Supabase connection string stored as plain Railway env var | Credentials visible in Railway dashboard to all team members | Use Railway's secret variable type (encrypted at rest) for all database credentials |
| `DATABASE_URL` pointing at wrong Supabase project | Schema mismatch; data written to wrong project | Double-check project ref in connection string; run a `SELECT` immediately after setting to confirm |

---

## "Looks Done But Isn't" Checklist

- [ ] **WebSocket connections after split:** REST works but live events are silent — verify Network tab (WS filter) shows connection to Railway URL, not Vercel
- [ ] **Session persistence:** Sign-in succeeds but refresh shows logged-out state — check DevTools Application > Cookies for session cookie `SameSite=None; Secure`
- [ ] **Board mutation guard:** GET requests succeed but POST/PATCH return 403 — verify `PAPERCLIP_ALLOWED_HOSTNAMES` includes the Vercel domain
- [ ] **Supabase schema empty:** `DATABASE_URL` is set but tables don't exist — server does not auto-migrate; run migrations manually before first deploy
- [ ] **`SERVE_UI=false` active:** Railway deploy is live but users see stale bundled UI — verify startup log shows `Mode: none`, not `Mode: static`
- [ ] **HTTPS on both Railway and Vercel:** `SameSite=None` cookies require HTTPS on the backend — confirm Railway service URL starts with `https://`
- [ ] **`BETTER_AUTH_SECRET` set:** Check Railway env vars contain `BETTER_AUTH_SECRET` with a non-default value — startup does not warn if it falls back to the dev default

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| WebSocket URLs wrong after split | MEDIUM | Update 3 files, add `VITE_API_BASE_URL` Vite env, redeploy Vercel (~30 min) |
| BetterAuth cookies blocked | LOW | Add env vars to Railway, update BetterAuth cookie config, redeploy server (~15 min) |
| `boardMutationGuard` 403 on writes | LOW | Add Vercel domain to `PAPERCLIP_ALLOWED_HOSTNAMES` in Railway, redeploy (~10 min) |
| Supabase prepared statement crash | LOW | Add `prepare: false` to `createDb()`, redeploy server (~10 min) |
| `SERVE_UI=true` serving stale UI | LOW | Set `SERVE_UI=false` in Railway env, redeploy (~5 min) |
| API Gateway strips WebSocket headers | HIGH | May require switching gateway product entirely; test WS passthrough before committing (~hours) |
| `BETTER_AUTH_SECRET` left as default | HIGH | Rotate secret (all sessions invalidated — all users must re-login), update Railway env, redeploy |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| WebSocket URLs using `window.location.host` (3 files) | Phase 1: Frontend split | Network tab WS filter shows Railway URL with 101 response |
| API client relative `/api` URL | Phase 1: Frontend split | All API calls in Network tab show Railway as host |
| BetterAuth cross-origin cookies | Phase 1: Deployment infrastructure | Sign in, reload page, confirm still authenticated |
| `boardMutationGuard` 403 on writes | Phase 1: Deployment infrastructure | Create an issue from Vercel frontend — no 403 |
| `SERVE_UI=false` not set | Phase 1: Railway deployment | Startup log shows `Mode: none` |
| `BETTER_AUTH_SECRET` default | Phase 1: Railway deployment | Railway env has `BETTER_AUTH_SECRET` set to a generated value |
| Supabase prepared statements | Phase 2: Supabase migration | First query in Railway logs completes without protocol error |
| API Gateway WebSocket stripping | Phase 3: API Gateway | WebSocket connection in Network tab shows 101 Switching Protocols through the gateway |

---

## Sources

- Code-verified: `ui/src/context/LiveUpdatesProvider.tsx` lines 775-776 — WebSocket URL built from `window.location.host`
- Code-verified: `ui/src/components/transcript/useLiveRunTranscripts.ts` lines 188-189 — same pattern
- Code-verified: `ui/src/pages/AgentDetail.tsx` lines 3566-3567 — same pattern
- Code-verified: `ui/src/api/client.ts` — `const BASE = "/api"` (relative URL)
- Code-verified: `ui/src/api/auth.ts` — literal `/api/auth/...` strings
- Code-verified: `server/src/auth/better-auth.ts` — `SameSite` default, `trustedOrigins` derivation, fallback secret
- Code-verified: `server/src/middleware/board-mutation-guard.ts` — origin matching against own hostname only
- Code-verified: `Dockerfile` — `SERVE_UI=true` default in production stage
- [BetterAuth Invalid Origin on Vercel preview deployments](https://github.com/better-auth/better-auth/issues/2203) — community confirmed cross-origin issue
- [BetterAuth cross-domain cookies not set in production](https://github.com/better-auth/better-auth/issues/4038) — community confirmed SameSite issue
- [CORS issue Railway backend + Vercel frontend](https://station.railway.com/questions/cors-issue-post-request-blocked-from-ve-6920650c) — Railway community thread
- [Drizzle with Supabase: `prepare: false`](https://orm.drizzle.team/docs/connect-supabase) — official Drizzle documentation
- [Supabase connection management and Supavisor](https://supabase.com/docs/guides/database/connection-management) — official Supabase documentation
- [Vercel WebSocket limitations](https://github.com/vercel/community/discussions/422) — Vercel community confirmed, WebSockets not supported
- [WebSocket proxy header requirements](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Protocol_upgrade_mechanism) — MDN official
- [Drizzle cache integration with Upstash Redis](https://upstash.com/blog/drizzle-integration) — integration guide with pitfalls

---
*Pitfalls research for: Paperclip v1.1 — monolith split to Vercel + Railway + Supabase + Redis + API Gateway*
*Researched: 2026-04-04*
