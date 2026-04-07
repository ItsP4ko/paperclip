# Phase 6: Infrastructure Provisioning & Deployment — Research

**Researched:** 2026-04-04
**Domain:** Supabase PostgreSQL provisioning, Railway Docker deployment, Vercel Vite SPA, BetterAuth cross-origin cookies
**Confidence:** HIGH (all critical claims verified against official docs or source code)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEPLOY-05 | Backend deployed to Railway using existing Dockerfile with `SERVE_UI=false` | Railway Dockerfile auto-detection; `SERVE_UI` env var supported by config.ts; confirmed in server source |
| DEPLOY-07 | All required environment variables configured in Railway | Variable list derived from config.ts source scan; Railway Variables tab procedure documented |
| DEPLOY-09 | Supabase PostgreSQL provisioned and schema migrated (manual SQL execution) | 49 migration SQL files in `packages/db/src/migrations/`; manual apply via Supabase SQL Editor; matches project's no-auto-migrate rule |
| DEPLOY-10 | Backend connects to Supabase via session-mode pooler (port 5432) with pool size cap | Session pooler format verified against Supabase docs; postgres.js `max` option in client.ts |
| DEPLOY-11 | Existing data model works on Supabase without schema changes | All 49 migrations are standard PostgreSQL DDL; no embedded-postgres extensions used in schema files |
| AUTH-05 | User can sign up and log in from Vercel frontend to Railway backend | BetterAuth `SameSite=None; Secure` already wired in Phase 5; `BETTER_AUTH_URL` / `PAPERCLIP_AUTH_PUBLIC_BASE_URL` must be set to Railway public URL; `PAPERCLIP_ALLOWED_HOSTNAMES` must include Vercel domain |
</phase_requirements>

---

## Summary

Phase 6 is a pure infrastructure and configuration operation — no application code changes are expected. All code-level cross-origin fixes were completed in Phase 5. The work here is: (1) provision a fresh Supabase PostgreSQL project and manually apply the 49 existing migration files, (2) deploy the existing Docker image to Railway with the correct set of environment variables, (3) deploy the Vite SPA from the `ui/` subdirectory to Vercel with `VITE_API_URL` pointing at the Railway service URL, and (4) validate that BetterAuth cookies flow correctly end-to-end.

The most failure-prone step is the Railway private-hostname guard. The existing `privateHostnameGuard` middleware blocks requests from unrecognised hostnames when `deploymentMode=authenticated` and `deploymentExposure=private`. Railway's health check origin is `healthcheck.railway.app` — this hostname must appear in `PAPERCLIP_ALLOWED_HOSTNAMES` or the health check will return 403 and Railway will never mark the container healthy. This is the single most likely cause of a "stuck in deploy" failure.

The second failure mode is `vercel.app` cross-origin cookie rejection. Browser cookie policy may reject `SameSite=None` cookies on certain browsers when the frontend and backend share no common eTLD+1. The code is correct (Phase 5 wired `SameSite=None; Secure`), but the `BETTER_AUTH_URL` Railway variable must be set to the exact Railway public URL so BetterAuth's `trustedOrigins` list includes the Vercel domain.

**Primary recommendation:** Work in order — Supabase first (schema must be live before Railway boots), Railway second (get a healthy container before touching Vercel), Vercel third (only set `VITE_API_URL` after Railway URL is known).

---

## Standard Stack

### Core

| Tool | Version / Tier | Purpose | Why This |
|------|---------------|---------|----------|
| Supabase | Free/Pro tier | Managed PostgreSQL | Already decided in v1.1 research; session-mode pooler supports Drizzle prepared statements |
| Railway | Starter/Pro | Docker container hosting for Express backend | Already decided; supports Docker natively, health-check config built-in |
| Vercel | Hobby/Pro | Static CDN for Vite SPA | Already decided; `vercel.json` rewrite rule already in place in `ui/` |

### Supporting

| Tool | Purpose | Notes |
|------|---------|-------|
| Supabase SQL Editor | Manual migration execution | Required by project rule: no auto-migrations |
| Railway CLI / Dashboard | Service var management | Dashboard Variables tab is simplest for initial setup |
| `vercel` CLI | SPA deploy from `ui/` subdirectory | Can also use Vercel dashboard git integration |

### Alternatives Considered

| Standard Choice | Alternative | Why Standard Wins |
|-----------------|-------------|-------------------|
| Supabase session pooler (5432) | Transaction pooler (6543) | Drizzle prepared statements break on 6543; session mode is safe |
| Railway environment variables tab | `.env` file in repo | Secrets must not be in git; Railway var injection is the correct pattern |

---

## Architecture Patterns

### Service Dependency Order

```
Supabase (PostgreSQL)  ←  DATABASE_URL  →  Railway (Express backend)
                                                    ↑
                                         VITE_API_URL (Railway public URL)
                                                    ↑
                                         Vercel (Vite SPA frontend)
```

**Deploy in this order.** Railway reads `DATABASE_URL` at boot; if Supabase is not provisioned first, the container boots against nothing and fails the DB health check.

### Environment Variable Map

All variables the Railway service needs, derived from `server/src/config.ts` source:

| Variable | Value | Source |
|----------|-------|--------|
| `DATABASE_URL` | Supabase session-pooler URL (port 5432) | Supabase dashboard → Project Settings → Database → Connection String → Session mode |
| `BETTER_AUTH_SECRET` | `openssl rand -hex 32` output | Generate once; seal in Railway |
| `PAPERCLIP_DEPLOYMENT_MODE` | `authenticated` | Required for multi-user login |
| `PAPERCLIP_DEPLOYMENT_EXPOSURE` | `public` | Railway is internet-facing |
| `SERVE_UI` | `false` | Frontend is on Vercel, not bundled |
| `PAPERCLIP_ALLOWED_HOSTNAMES` | `your-app.vercel.app,healthcheck.railway.app` | CRITICAL: both must be present |
| `PAPERCLIP_AUTH_PUBLIC_BASE_URL` | `https://your-app.up.railway.app` | Used by BetterAuth for `trustedOrigins`; also resolves `authBaseUrlMode=explicit` |
| `NODE_ENV` | `production` | Already set in Dockerfile `ENV` block; can omit |
| `HOST` | `0.0.0.0` | Already set in Dockerfile; Railway requires bind to 0.0.0.0 |
| `PORT` | (leave unset — Railway injects it) | Railway overrides `PORT` at runtime; Dockerfile default is 3100 |

For Vercel, only one build-time variable is needed:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://your-app.up.railway.app` (no trailing slash) |

### Recommended Project Structure for Vercel Deployment

The `ui/` directory is the Vercel root. Configure Vercel project settings:

```
Root Directory:   ui
Build Command:    pnpm build   (or: npm run build)
Output Directory: dist
Install Command:  pnpm install (pnpm-lock.yaml is at repo root; use --frozen-lockfile)
```

The `ui/vercel.json` SPA rewrite rule is already in place:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

This already handles direct-navigation (DEPLOY-01 was completed in Phase 5).

### Supabase Connection String Format

**Session mode pooler (use this):**
```
postgresql://postgres.PROJECT_REF:[PASSWORD]@aws-0-REGION.pooler.supabase.com:5432/postgres
```

**Transaction mode pooler (do NOT use):**
```
postgresql://postgres.PROJECT_REF:[PASSWORD]@aws-0-REGION.pooler.supabase.com:6543/postgres
```

The `@paperclipai/db` client already respects `DATABASE_URL` from environment (`client.ts` calls `postgres(url)` with no `prepare: false`). Session mode (5432) is safe because it supports prepared statements. Transaction mode (6543) would silently break Drizzle queries.

### Pool Size Cap

The existing `createDb()` in `packages/db/src/client.ts` calls `postgres(url)` with no explicit `max`. For a Railway Starter plan (shared CPU), set `max: 10` to avoid hitting Supabase's connection limit. This requires a one-line code change in `client.ts`:

```typescript
// packages/db/src/client.ts — createDb()
const sql = postgres(url, { max: 10 });  // cap for Supabase pooler
```

This is the only code change required in Phase 6 (DEPLOY-10).

### Railway Health Check Configuration

Railway health check must be configured in service settings:
- **Health Check Path:** `/api/health`
- **Health Check Timeout:** 120 seconds (migrations run at boot; give extra headroom)

Railway sends health check requests from `healthcheck.railway.app`. The `privateHostnameGuard` middleware in `server/src/middleware/private-hostname-guard.ts` blocks requests from unknown hostnames when `deploymentExposure=private`. **Set `PAPERCLIP_DEPLOYMENT_EXPOSURE=public` OR include `healthcheck.railway.app` in `PAPERCLIP_ALLOWED_HOSTNAMES`.**

Recommended: set `PAPERCLIP_DEPLOYMENT_EXPOSURE=public` (Railway is internet-facing by design) which disables the private hostname guard entirely, and use `PAPERCLIP_ALLOWED_HOSTNAMES` only for CORS and boardMutationGuard.

### Schema Migration Procedure (DEPLOY-09)

The project rule is: **no automatic migrations**. Show SQL to user, wait for confirmation.

There are 49 migration files in `packages/db/src/migrations/` (0000 through 0048). The procedure:

1. Open Supabase dashboard → SQL Editor
2. Apply each `.sql` file in order (0000 → 0048), one at a time or batched
3. After all files are applied, the `drizzle.__drizzle_migrations` journal table will be present
4. The server's `applyPendingMigrations()` will detect the journal and skip re-application on boot

The migration files are standard PostgreSQL DDL (`CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`). No embedded-postgres extensions or non-standard SQL detected. DEPLOY-11 is satisfied — the schema is portable.

**Do not use `drizzle-kit push` or Supabase CLI** — apply raw SQL manually per the project convention.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Connection pooling | Custom pool logic | Supabase session-mode pooler + postgres.js `max` option | PgBouncer handles actual pooling; postgres.js `max` caps client-side concurrent connections |
| Secret generation | Custom entropy | `openssl rand -hex 32` | Cryptographically secure, standard practice |
| SPA routing on CDN | Express fallback routes on backend | `vercel.json` rewrites (already present) | Static CDN handles routing without a running server |
| Health check logic | Custom health route | Existing `/api/health` route (already implemented in Phase 5) | Returns 503 if DB unreachable, 200 when ready |

---

## Common Pitfalls

### Pitfall 1: Private Hostname Guard Blocking Railway Health Checks
**What goes wrong:** Railway health checks come from `healthcheck.railway.app`. The `privateHostnameGuard` blocks this hostname → returns 403 → Railway never marks the container ready → deployment is stuck in "deploying" forever.
**Why it happens:** `PAPERCLIP_DEPLOYMENT_EXPOSURE=private` (the Dockerfile default) enables the guard. Railway's health check origin is not localhost.
**How to avoid:** Set `PAPERCLIP_DEPLOYMENT_EXPOSURE=public` in Railway service variables. This disables the hostname guard entirely.
**Warning signs:** Deployment stuck at "health check failed"; Railway logs show `403 Forbidden` for `GET /api/health` from `healthcheck.railway.app`.

### Pitfall 2: Transaction-Mode Pooler Breaking Drizzle
**What goes wrong:** Using the port 6543 Supabase URL causes prepared statement errors at runtime.
**Why it happens:** Supabase transaction pooler does not support session-level state like prepared statements. Drizzle / postgres.js uses prepared statements by default.
**How to avoid:** Always copy the **Session** pooler URL (port 5432) from Supabase dashboard, not the Transaction pooler URL.
**Warning signs:** Server boots but queries fail with `prepared statement "..." already exists` or protocol errors.

### Pitfall 3: BetterAuth trustedOrigins Missing Vercel Domain
**What goes wrong:** Sign-in or sign-up from the Vercel frontend returns 403 from BetterAuth.
**Why it happens:** `createBetterAuthInstance()` in `server/src/auth/better-auth.ts` builds `trustedOrigins` from `config.allowedHostnames`. If `PAPERCLIP_ALLOWED_HOSTNAMES` does not include the Vercel domain, the origin check fails.
**How to avoid:** Set `PAPERCLIP_ALLOWED_HOSTNAMES=your-app.vercel.app,healthcheck.railway.app` and `PAPERCLIP_AUTH_PUBLIC_BASE_URL=https://your-app.up.railway.app`.
**Warning signs:** Browser console shows `403` on `POST /api/auth/sign-in/email` or `POST /api/auth/sign-up/email`.

### Pitfall 4: VITE_API_URL Set at Runtime Instead of Build Time
**What goes wrong:** The Vercel deployment ignores `VITE_API_URL` and all API calls go to relative paths.
**Why it happens:** Vite bakes `import.meta.env.VITE_API_URL` into the static bundle at build time. Runtime environment variables have no effect on already-built static files.
**How to avoid:** Set `VITE_API_URL` in Vercel project settings under Environment Variables (not just in the Vercel edge runtime). Redeploy after setting it — the variable must be present during the build step.
**Warning signs:** Network tab shows API requests going to `https://your-app.vercel.app/api/...` (same origin) instead of the Railway URL.

### Pitfall 5: Vercel Root Directory Not Set to `ui/`
**What goes wrong:** Vercel tries to build from the monorepo root, fails because it can't find a framework or finds conflicting build artifacts.
**Why it happens:** Vercel detects the repo root, not the `ui/` subdirectory. The pnpm workspace and top-level `package.json` confuse Vercel's framework detection.
**How to avoid:** In Vercel project settings, set **Root Directory** to `ui`. This tells Vercel to run `pnpm build` from `ui/` and deploy `ui/dist/`.
**Warning signs:** Build logs show `vite: command not found` or `cannot find index.html`.

### Pitfall 6: Missing `PAPERCLIP_AUTH_PUBLIC_BASE_URL`
**What goes wrong:** BetterAuth session cookies reference the wrong domain; `getSession` returns null after sign-in.
**Why it happens:** Without `PAPERCLIP_AUTH_PUBLIC_BASE_URL`, BetterAuth runs in `authBaseUrlMode=auto` and derives the base URL from the incoming request host (the Railway internal host). Cookies may be scoped to the wrong domain.
**How to avoid:** Set `PAPERCLIP_AUTH_PUBLIC_BASE_URL=https://your-app.up.railway.app` explicitly in Railway service variables.
**Warning signs:** Sign-in returns 200 but subsequent `GET /api/auth/get-session` returns null or 401; cookie is not visible in browser DevTools.

### Pitfall 7: Supabase Schema Already Applied but Migration Journal Missing
**What goes wrong:** Server boots, `inspectMigrations` detects tables but no Drizzle journal → throws `"no-migration-journal-non-empty-db"` → server crashes.
**Why it happens:** If migrations are applied without letting Drizzle create its own journal, it cannot reconcile state.
**How to avoid:** The server's `applyPendingMigrations()` handles a fresh empty DB by running `migratePg` (the standard Drizzle migrator), which creates the journal. Apply migrations to a **completely empty** Supabase database — not a pre-existing one.
**Warning signs:** Server crash at startup with `"Database has tables but no migration journal"`.

---

## Code Examples

### Verified: DEPLOY-10 Pool Size Cap

```typescript
// packages/db/src/client.ts — one-line change
// Source: Supabase docs + postgres.js docs

export function createDb(url: string) {
  const sql = postgres(url, { max: 10 }); // cap connections for Supabase pooler
  return drizzlePg(sql, { schema });
}
```

### Verified: Railway Service Variables (RAW editor paste)

```
DATABASE_URL=postgresql://postgres.PROJ:[PASS]@aws-0-REGION.pooler.supabase.com:5432/postgres
BETTER_AUTH_SECRET=<output of: openssl rand -hex 32>
PAPERCLIP_DEPLOYMENT_MODE=authenticated
PAPERCLIP_DEPLOYMENT_EXPOSURE=public
SERVE_UI=false
PAPERCLIP_ALLOWED_HOSTNAMES=your-app.vercel.app,healthcheck.railway.app
PAPERCLIP_AUTH_PUBLIC_BASE_URL=https://your-app.up.railway.app
```

### Verified: Vercel Project Settings (Vite monorepo subdirectory)

```
Root Directory:    ui
Framework Preset:  Vite
Build Command:     pnpm run build
Output Directory:  dist
Install Command:   pnpm install --frozen-lockfile
```

Environment Variable (set in Vercel dashboard, Production environment):
```
VITE_API_URL=https://your-app.up.railway.app
```

### Verified: Railway Health Check Settings

In Railway service → Settings → Health Checks:
```
Health Check Path:    /api/health
Health Check Timeout: 120
```

### Verified: BetterAuth `trustedOrigins` derivation (server/src/auth/better-auth.ts lines 45–66)

```typescript
// deriveAuthTrustedOrigins adds https://<hostname> for every entry in allowedHostnames.
// PAPERCLIP_ALLOWED_HOSTNAMES=your-app.vercel.app → trustedOrigins includes https://your-app.vercel.app
// This is what allows BetterAuth sign-in from the Vercel origin.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Supabase direct connection (port 5432, no pooler) | Supabase session-mode pooler (also port 5432 but through Supavisor) | 2023 | Pooler is now the recommended path; direct connections are limited by plan |
| Railway auto-deploy from Dockerfile at repo root | `RAILWAY_DOCKERFILE_PATH` for custom locations | Current | Not needed here — `Dockerfile` is already at repo root |
| Vercel `vercel.json` `routes` array | `rewrites` array | ~2021 | `routes` is deprecated; `rewrites` is current. Already using `rewrites` in `ui/vercel.json` |

**Deprecated/outdated:**
- Supabase transaction pooler (port 6543) for Drizzle: causes prepared-statement errors — use session pooler (port 5432) instead.
- `BETTER_AUTH_URL` env var: accepted as an alias by `config.ts` (line 163: `process.env.BETTER_AUTH_URL`), but the canonical var is `PAPERCLIP_AUTH_PUBLIC_BASE_URL`.

---

## Open Questions

1. **Railway IPv6 outbound to Supabase**
   - What we know: Supabase session pooler resolves via IPv4. Railway environments created after Oct 16, 2025 support both IPv4 and IPv6 on internal DNS.
   - What's unclear: Whether Railway outbound internet traffic to Supabase pooler uses IPv4 or IPv6.
   - Recommendation: Use the session-mode pooler URL (which is IPv4-resolvable). If connection fails at boot, fall back to enabling Supabase's direct connection option (IPv6 direct connection is available on paid plans).

2. **Vercel `pnpm install` in monorepo root**
   - What we know: `pnpm-lock.yaml` is at the repo root; `ui/` is a workspace package.
   - What's unclear: Whether Vercel can run `pnpm install` from `ui/` root directory and resolve workspace deps.
   - Recommendation: Set the install command to `cd .. && pnpm install --frozen-lockfile` if Vercel's default install fails with missing workspace packages. Alternative: set Root Directory to `/` (repo root) and configure Build Command as `pnpm --filter @paperclipai/ui build` with Output Directory as `ui/dist`.

3. **Cookie domain on `vercel.app` public suffix**
   - What we know: Multiple BetterAuth GitHub issues report that `vercel.app` is on the Public Suffix List, which may cause browsers to refuse cross-origin cookies.
   - What's unclear: Whether this affects Phase 6 in practice (the test will confirm).
   - Recommendation: Test sign-in from the Vercel app first. If cookies are rejected, use a custom domain for either Railway or Vercel — but defer this to Phase 7 if Phase 6 smoke test passes.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 3.x (workspace config in `vitest.config.ts`) |
| Config file | `vitest.config.ts` at repo root; projects include `server` and `ui` |
| Quick run command | `pnpm --filter @paperclipai/server vitest run src/__tests__/health.test.ts` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements → Test Map

Phase 6 is infrastructure-only — the requirements are validated by manual operational checks, not automated unit tests. The existing test suite already covers the code paths that Phase 6 depends on:

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEPLOY-05 | Railway container runs with `SERVE_UI=false`; `/api/health` returns 200 | manual (deploy) | `curl https://your-app.up.railway.app/api/health` | N/A — manual |
| DEPLOY-07 | Required env vars are set in Railway | manual (config) | Visual check in Railway Variables tab | N/A — manual |
| DEPLOY-09 | Supabase schema fully migrated | manual (SQL apply) | Check `SELECT count(*) FROM information_schema.tables WHERE table_schema='public'` returns ~40+ tables | N/A — manual |
| DEPLOY-10 | Backend connects via session-mode pooler with pool cap | smoke | `curl https://your-app.up.railway.app/api/health` — checks `db.execute(sql\`SELECT 1\`)` | health.ts:33 exists ✅ |
| DEPLOY-11 | Schema works on Supabase without changes | smoke | Backend boot without schema errors (check Railway logs) | N/A — manual |
| AUTH-05 | User can sign up/login from Vercel to Railway | manual (e2e) | POST `VITE_API_URL/api/auth/sign-up/email` then `GET /api/auth/get-session` | N/A — manual |

**Pre-existing tests that validate code paths Phase 6 depends on:**

| Test file | What it covers | Run command |
|-----------|---------------|-------------|
| `health.test.ts` | `/api/health` returns 200 with correct shape | `pnpm --filter @paperclipai/server vitest run src/__tests__/health.test.ts` |
| `cors-middleware.test.ts` | CORS allows credentialed requests from allowed origins | `pnpm --filter @paperclipai/server vitest run src/__tests__/cors-middleware.test.ts` |
| `private-hostname-guard.test.ts` | Hostname guard blocks/allows correctly | `pnpm --filter @paperclipai/server vitest run src/__tests__/private-hostname-guard.test.ts` |
| `better-auth-cookies.test.ts` | BetterAuth `SameSite=None; Secure` attributes | `pnpm --filter @paperclipai/server vitest run src/__tests__/better-auth-cookies.test.ts` |
| `board-mutation-guard.test.ts` | CSRF guard allows allowed origins | `pnpm --filter @paperclipai/server vitest run src/__tests__/board-mutation-guard.test.ts` |

### Sampling Rate

- **Per task commit:** Run the 5 targeted tests above (< 30 seconds total)
- **Per wave merge:** `pnpm --filter @paperclipai/server vitest run`
- **Phase gate:** All existing tests green + manual smoke test (curl + browser sign-in) before `/gsd:verify-work`

### Wave 0 Gaps

None — existing test infrastructure covers all code paths this phase depends on. Phase 6 introduces one code change (pool size `max: 10` in `client.ts`), which is covered by the existing `client.test.ts` in `packages/db`.

---

## Sources

### Primary (HIGH confidence)
- `server/src/config.ts` — complete env var resolution logic; source of truth for all variable names
- `server/src/auth/better-auth.ts` — `deriveAuthTrustedOrigins()` and `createBetterAuthInstance()`; confirms PAPERCLIP_ALLOWED_HOSTNAMES drives trustedOrigins
- `server/src/middleware/private-hostname-guard.ts` — confirms healthcheck.railway.app block
- `packages/db/src/client.ts` — confirms `postgres(url)` with no `max` cap; one change needed
- `packages/db/src/migrations/` — 49 files (0000–0048); all standard PostgreSQL DDL
- `ui/vercel.json` — SPA rewrite rule already in place
- `ui/src/lib/api-base.ts` — confirms VITE_API_URL drives all API calls (build-time bake)
- [Railway Healthchecks Docs](https://docs.railway.com/deployments/healthchecks) — `healthcheck.railway.app` as origin; 120s recommended timeout
- [Railway Variables Docs](https://docs.railway.com/variables) — RAW editor; reference variable syntax
- [Railway Dockerfiles Docs](https://docs.railway.com/builds/dockerfiles) — auto-detection of `Dockerfile` at root
- [Supabase Connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres) — session pooler port 5432 format verified
- [Vercel Vite Docs](https://vercel.com/docs/frameworks/frontend/vite) — SPA rewrites; Root Directory setting; build-time env vars

### Secondary (MEDIUM confidence)
- [BetterAuth Railway issue thread](https://station.railway.com/questions/better-auth-in-production-not-sending-co-fea07157) — confirms BETTER_AUTH_URL / trustedOrigins pattern
- [BetterAuth cross-domain cookie issue #4038](https://github.com/better-auth/better-auth/issues/4038) — public suffix / vercel.app concern documented

### Tertiary (LOW confidence — flag for validation)
- `vercel.app` public suffix list issue: reported in multiple BetterAuth issues but not definitively reproduced. Phase 6 smoke test will confirm or deny.
- Railway IPv6 outbound: documented that new environments support IPv6 internal DNS but external outbound IPv6 behavior is unverified.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all derived from project source code and official platform docs
- Architecture patterns: HIGH — env var names traced to config.ts; connection string format from Supabase official docs
- Pitfalls: HIGH for pitfalls 1–4 (traced to source code); MEDIUM for pitfalls 5–7 (community-verified patterns)
- Migration procedure: HIGH — file count and SQL dialect confirmed by direct inspection

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable platforms; re-verify Railway health check hostname if deployment fails)
