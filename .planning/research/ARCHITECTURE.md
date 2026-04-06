# Architecture Research

**Domain:** Security hardening integration — Express 5 + BetterAuth + Drizzle + React 19
**Researched:** 2026-04-05
**Confidence:** HIGH (based on direct codebase inspection + official BetterAuth docs)

---

## System Overview (v1.2 Baseline — What We Are Hardening)

```
┌─────────────────────────────────────────────────────────────────┐
│  Vercel CDN — React 19 + Vite (ui/)                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │  Auth    │  │  Issues  │  │ AuditLog │  │  Settings    │    │
│  │  (page)  │  │  (page)  │  │  (page)  │  │  (page)      │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────────┘    │
│       │              │             │              │              │
│  localStorage: paperclip_session_token (bearer token)           │
│  React Query: staleTime 120s on lists/detail                    │
└───────────────────────┬─────────────────────────────────────────┘
                        │  HTTPS (cross-origin, VITE_API_URL)
                        │  Authorization: Bearer <token>  OR  cookie
┌───────────────────────▼─────────────────────────────────────────┐
│  Easypanel VPS — Express 5 (server/src/)                         │
│                                                                  │
│  Middleware chain (app.ts, in order):                            │
│  1. cors()          — origin whitelist + credentials:true        │
│  2. securityHeaders — Helmet: defaultSrc:'none', HSTS, X-Frame  │
│  3. createRateLimiter — 1000 req/15min, Redis-backed, rl: prefix │
│  4. express.json()  — 10mb limit, rawBody capture               │
│  5. httpLogger      — pino                                       │
│  6. privateHostnameGuard                                         │
│  7. actorMiddleware — resolves req.actor from session/bearer/JWT │
│  8. /api/auth/* — BetterAuth handler                             │
│  9. boardMutationGuard — origin/referer check for board writes   │
│  10. API routers (companies, issues, audit, ...)                 │
│  11. errorHandler — ZodError→400, HttpError→status, else→500    │
│                                                                  │
│  Auth resolution (actorMiddleware):                              │
│  cookie session → BetterAuth resolveSession                     │
│  bearer header  → BetterAuth resolveSession (bearer plugin)     │
│  board API key  → boardAuth.findBoardApiKeyByToken               │
│  agent JWT      → verifyLocalAgentJwt                            │
│  agent API key  → agentApiKeys table lookup                      │
└───────────────────┬───────────────────────────────────────────┬─┘
                    │                                           │
         ┌──────────▼──────────┐              ┌────────────────▼──┐
         │  Supabase PostgreSQL │              │  Redis             │
         │  (session-mode 5432) │              │  prefix: rl:       │
         │  Tables:             │              │  (rate-limit store)│
         │  - activity_log      │              │  prefix: cache:    │
         │  - session (BetterAuth)│            │  (API cache)       │
         │  - authUsers/accounts │              └───────────────────┘
         │  - company_memberships│
         │  - invites, issues.. │
         └──────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Location |
|-----------|---------------|----------|
| `securityHeaders` | Helmet wrapper: defaultSrc:'none', HSTS, X-Frame-deny | `server/src/middleware/security-headers.ts` |
| `createRateLimiter` | Global 1000 req/15min, Redis store, rl: prefix | `server/src/middleware/rate-limit.ts` |
| `actorMiddleware` | Resolves req.actor from any auth source | `server/src/middleware/auth.ts` |
| `boardMutationGuard` | Checks Origin/Referer on board-actor writes | `server/src/middleware/board-mutation-guard.ts` |
| `validate(schema)` | Thin Zod middleware: req.body = schema.parse(req.body) | `server/src/middleware/validate.ts` |
| `errorHandler` | ZodError→400, HttpError→status, catch-all→500 (no stack traces) | `server/src/middleware/error-handler.ts` |
| `better-auth.ts` | BetterAuth instance with bearer plugin + drizzleAdapter | `server/src/auth/better-auth.ts` |
| `auditService` | Paginated timeline, streaming export, GDPR erasure via activity_log | `server/src/services/audit.ts` |
| `auditRoutes` | 5 endpoints under /companies/:companyId/audit/* | `server/src/routes/audit.ts` |
| `AuditLog.tsx` | Owner-visible page at /audit, React Query, pagination + export | `ui/src/pages/AuditLog.tsx` |

---

## Integration Points: Security Features vs Existing Architecture

### 1. BetterAuth Session Management — List and Revoke

**What BetterAuth exposes (CONFIRMED — official docs + GitHub issues):**

BetterAuth's core API provides these session endpoints via the auth client:
- `authClient.listSessions()` — returns sessions with fields: `id`, `token`, `userId`, `createdAt`, `expiresAt`, `ipAddress`, `userAgent`
- `authClient.revokeSession({ token })` — revokes by session token
- `authClient.revokeOtherSessions()` — revokes all except current
- `authClient.revokeSessions()` — revokes all

**Critical constraint:** The `GET /api/auth/list-sessions` response returns sessions with `token: ""` (empty string) for security reasons. The `POST /api/auth/revoke-session` requires the actual token value. This means you cannot revoke a specific session by its ID from the UI using the built-in API alone — the token is not exposed to the frontend.

**Integration approach for this project:**

Since the app already has `authSessions` table in Drizzle schema (`packages/db/src/schema/auth.ts`) with `id`, `token`, `userId`, `ipAddress`, `userAgent`, `expiresAt`, and BetterAuth uses `drizzleAdapter` pointing at it:

1. **Use BetterAuth's built-in** `/api/auth/list-sessions` → renders session list with `ipAddress`, `userAgent`, `createdAt`, `expiresAt` in the UI.
2. **For revoke-by-session-ID**: expose a custom `POST /api/sessions/:sessionId/revoke` route that fetches the token from `authSessions` via Drizzle by session ID, then deletes the row directly (or calls BetterAuth's revoke — same effect since it uses the same table). Deleting the row via Drizzle is simpler and equivalent.
3. **Mount point in UI**: Session management belongs in a new **AccountSettings page** (per-user, not per-company). Not inside company context.

**Where to add new components:**
- New Express route: `server/src/routes/sessions.ts` — mounted under `/api` in `app.ts`
- New UI page: `ui/src/pages/AccountSettings.tsx`
- New API client: `ui/src/api/sessions.ts`
- App.tsx: add `<Route path="account" element={<AccountSettings />} />`

---

### 2. Brute-Force Protection — Middleware Chain Placement

**Current state:** One global rate limiter at `app.ts` line 117 — 1000 req/15min across all routes.

**Where to inject login-specific limiter:**

The BetterAuth handler is mounted at `app.all("/api/auth/*authPath", opts.betterAuthHandler)` (app.ts line 164), after the global rate limiter. The auth route handler intercepts `POST /api/auth/sign-in/email`.

**Correct placement in app.ts:**

```
app.use(createRateLimiter(opts.redisClient))                           // global — existing
app.use("/api/auth/sign-in", createLoginRateLimiter(opts.redisClient)) // NEW — before betterAuthHandler
app.all("/api/auth/*authPath", opts.betterAuthHandler)                 // existing
```

**Redis key pattern:** The existing `RedisStore` uses prefix `"rl:"`. Login limiter must use a distinct prefix: `"rl:login:"`. Track by IP (`req.ip` — express-rate-limit default).

**Recommended parameters:**
- Window: 15 minutes, limit: 10 attempts per IP
- On exceed: 429 with `{ error: "Too many login attempts. Try again later." }` — no stack trace
- Uses same `RedisClientType` already passed through `createApp` opts — no new dependency

**New component:** Extend `server/src/middleware/rate-limit.ts` — add `createLoginRateLimiter(redisClient?)` function alongside existing `createRateLimiter`.

---

### 3. Zod Validation Middleware — Schema Organization

**Current state (CONFIRMED — direct code inspection):**

`validate(schema)` middleware already exists and is in active use across many routes. The pattern is consistent: inline Zod schema defined at the top of the route file, applied as `router.post("/path", validate(schema), async handler)`.

The `errorHandler` already catches `ZodError` → 400 with `{ error: "Validation error", details: err.errors }`. No stack traces in 400 responses. This is correct safe error output.

**What is missing:** Some mutation routes do not yet use `validate()`. Routes in `access.ts` lacking coverage include: board-claim, cli-auth revoke, cli-setup generate, invite revoke, member status changes. Query params on GET routes with meaningful parameters (audit timeline `limit`, `from`, `to`) are validated ad-hoc or not at all.

**The existing pattern is correct — follow it without changing the architecture:**

```typescript
// Inline schema at top of route file — co-located with handler
const updateMemberStatusSchema = z.object({
  status: z.enum(["active", "suspended"]),
});

router.patch("/companies/:companyId/members/:id/status",
  validate(updateMemberStatusSchema),
  async (req, res) => { ... }
);
```

**Enhancement needed for query params:** Current `validate()` only handles `req.body`. Add `validateQuery(schema)` variant to `validate.ts`:

```typescript
export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.query = schema.parse(req.query) as typeof req.query;
    next();
  };
}
```

Export from `middleware/index.ts`. Apply to audit timeline and other GET routes with typed query params.

**Build priority:** Audit missing `validate()` coverage starting with highest-risk mutation routes — invite creation, member role changes. These have authentication but no body shape validation.

---

### 4. CSRF — Does BetterAuth Handle It? Bearer Token Impact

**Finding (CONFIRMED — official docs + code inspection):**

BetterAuth implements multiple CSRF protections internally:
1. **Origin validation**: checks `Origin` header against `trustedOrigins` on all auth route mutations
2. **SameSite cookies**: `SameSite=none; Secure=true` in this app's cross-origin config (already configured in `better-auth.ts`)
3. **Fetch Metadata**: uses `Sec-Fetch-*` headers to block cross-site form submissions to sign-in/sign-up endpoints

**Bearer token flow eliminates the primary CSRF attack vector:** CSRF succeeds because browsers automatically send cookies with cross-origin requests. Bearer tokens in the `Authorization` header are never automatically sent — an attacker's page cannot inject them. The app stores the bearer token in localStorage (`paperclip_session_token`) and sends it via `getBearerHeaders()` — this is safe from CSRF.

**The existing `boardMutationGuard` provides CSRF-equivalent protection for all API mutation routes:** It checks `Origin`/`Referer` headers against allowedOrigins for all board-actor POST/PATCH/PUT/DELETE. This already covers the non-BetterAuth API surface for browser-session actors.

**Conclusion: No additional CSRF token infrastructure needed.** The combination of:
- BetterAuth's built-in origin checking on auth routes
- `boardMutationGuard` on API mutation routes
- Bearer token for mobile/cross-origin clients (not auto-sent by browsers)
- `SameSite=none; Secure` on cookies (already configured)

...fully covers the CSRF threat model for this architecture. A separate CSRF token system would be redundant and would break the bearer token mobile flow.

---

### 5. CSP with Helmet — Safe Directives for React SPA + CDN

**Current state (CONFIRMED — direct code inspection):**

Express Helmet is configured with only `contentSecurityPolicy: { directives: { defaultSrc: ["'none'"] } }` in `security-headers.ts`. This is extremely restrictive but correct for API-only responses — API responses should not load sub-resources.

**Critical architecture point:** The frontend (React SPA) is served from **Vercel CDN**, not from Express. Therefore the Express CSP header only applies to API responses and the plugin UI static route (which has its own sandbox CSP). The Vite-built React SPA needs its CSP configured via `vercel.json` headers — not through Helmet.

**Two separate CSP surfaces:**

**A. Express server CSP (API responses):** Keep `defaultSrc: 'none'` as-is. Correct for API-only endpoints. The plugin asset route at `server/src/routes/assets.ts:328` already sets its own CSP with sandbox override.

**B. Frontend CSP (Vercel CDN — via vercel.json headers):**

The React SPA connects to an external API origin (`VITE_API_URL` — the Easypanel VPS), uses Tailwind v4, shadcn/ui, renders Mermaid SVG via `dangerouslySetInnerHTML`, and opens WebSocket connections.

**Recommended production CSP for vercel.json:**

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy-Report-Only",
          "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' wss: https://[BACKEND_HOST]; frame-src 'none'; object-src 'none'; base-uri 'self'"
        }
      ]
    }
  ]
}
```

**Key constraints from the codebase:**
- `style-src 'unsafe-inline'` is required: Tailwind v4, shadcn/ui components, and Mermaid all inject inline styles. Nonce-based CSP is not viable in a static SPA (no per-request server rendering).
- `connect-src` must include the Easypanel VPS hostname and `wss:` for WebSocket connections.
- Mermaid renders SVG with `securityLevel: "strict"` (already configured in `MarkdownBody.tsx`) — this is the correct XSS protection at the Mermaid layer. The `dangerouslySetInnerHTML` risk is scoped to library-generated SVG, not user-controlled input.
- `img-src data: blob:` is needed for data-URI images in rich content and potentially blob URLs from file handling.
- `script-src 'unsafe-eval'` must NOT appear in production (Vite dev server requires it but production builds do not).

**Start in report-only mode** (`Content-Security-Policy-Report-Only`) and promote to enforcing (`Content-Security-Policy`) after observing zero violations in production. The backend hostname must be substituted as a build-time or deployment-time value in `vercel.json`.

---

### 6. Audit Log DB Schema

**Current state (CONFIRMED — direct schema inspection):**

The `activity_log` table already exists in `packages/db/src/schema/activity_log.ts` with all fields needed:
- `id` (uuid PK), `company_id` (FK), `actor_type` (text), `actor_id` (text)
- `action` (text, dotted namespace: e.g. "issue.created", "auth.login.success")
- `entity_type` (text), `entity_id` (text)
- `agent_id` (nullable FK), `run_id` (nullable FK)
- `details` (jsonb), `created_at` (timestamptz)

**Existing indexes:**
- `activity_log_company_created_idx` on `(company_id, created_at)` — primary scan index
- `activity_log_run_id_idx` on `(run_id)`
- `activity_log_entity_type_id_idx` on `(entity_type, entity_id)`

**The schema is already complete for v1.3 audit log requirements. No new table or migration needed.**

**Missing indexes for filtered queries:** Timeline endpoint filters by `actor_type`, `action`, and `entity_type` on top of the primary `company_id` + `created_at` scan. For current scale (single-tenant testing with low volume), the existing compound index is sufficient. For future scale, these would help:

```sql
-- Would improve filtered timeline queries at scale
CREATE INDEX activity_log_company_actor_created_idx
  ON activity_log (company_id, actor_type, created_at DESC);

CREATE INDEX activity_log_company_action_created_idx
  ON activity_log (company_id, action, created_at DESC);
```

Flag these for a future migration when volume grows. Do not add now.

**What must be written to `activity_log` for v1.3 (new events):**
- `auth.login.success` — after BetterAuth session resolved in actorMiddleware, for `source: "session"` or `source: "bearer_session"`
- `auth.login.failed` — intercept at login rate limiter or BetterAuth failure (harder — BetterAuth does not expose a failure hook easily)
- `session.revoked` — in new session revoke route
- `invite.created`, `invite.revoked` — in existing access.ts routes (may already be logged, needs audit)

---

### 7. Audit Log API

**Current state (CONFIRMED — direct code inspection):**

The audit API is fully built in `server/src/routes/audit.ts`:
- `GET /companies/:companyId/audit/timeline` — paginated cursor-based, filterable by actorType/entityType/action
- `GET /companies/:companyId/audit/filters` — distinct actions + entity types for filter dropdowns
- `GET /companies/:companyId/audit/export` — streaming JSON/CSV download
- `GET /companies/:companyId/members/:userId/data-export` — GDPR export
- `POST /companies/:companyId/members/:userId/data-erasure` — GDPR erasure

**Current authorization:** All routes use `assertCompanyAccess` (passes for any member of the company) plus `assertBoard` for export/erasure. The v1.3 goal is owner-only visibility for the timeline and filters — **this requires adding an owner assertion to these two routes.**

**Missing owner gate pattern:**
```typescript
// In audit.ts — apply to timeline + filters routes
assertCompanyAccess(req, companyId);          // existing — ensures member
await assertOwner(req, db, companyId);        // NEW — ensures membershipRole='owner'
```

The `assertOwner` helper needs to be extracted as a reusable async function in `authz.ts`. The pattern exists inline in `companies.ts` via `access.ensureMembership(...)` with `"owner"` role — extract it.

**Query performance:** The timeline service uses keyset pagination on `created_at` with `limit + 1` fetch pattern. This correctly avoids OFFSET and works well with the existing `(company_id, created_at)` index. No changes needed to the query pattern.

---

### 8. Audit Log UI Integration

**Current state (CONFIRMED — direct code inspection):**

The `AuditLog` page (`ui/src/pages/AuditLog.tsx`) is already fully built and routed at `/audit` (App.tsx line 182). It:
- Fetches timeline and filters via React Query with `queryKeys.audit.timeline(companyId, filterParams)` and `queryKeys.audit.filters(companyId)`
- Implements cursor-based "load more" pagination (appends to local state)
- Has filter dropdowns for actor type, entity type, and action
- Has CSV/JSON export button opening via `window.open()` in new tab
- Renders actor name resolution (agent name from left join vs. raw actor ID for users)

**No `staleTime` is set on audit queries** — intentional, audit data should always be fresh. Correct.

**What is not yet done in the UI:**
- No owner-only guard at the UI level (any company member who navigates to `/audit` currently can see data because `assertCompanyAccess` passes for all members — this is a gap that will be closed when `assertOwner` is added to the route)
- No session management section anywhere in the app (new work in AccountSettings)
- No display of auth-specific events (login success/failure, session revoke) because they are not yet being written to `activity_log`

**Navigation integration:** AuditLog is under the company-scoped router layout. After adding `assertOwner` to the API route, non-owners will receive a 403. The UI should handle this gracefully with a "You don't have permission to view this" state rather than an error flash.

---

## Recommended Project Structure (additions and modifications for v1.3)

```
server/src/
├── middleware/
│   ├── rate-limit.ts         # MODIFY: add createLoginRateLimiter()
│   ├── security-headers.ts   # no change needed (CSP goes in vercel.json)
│   └── validate.ts           # MODIFY: add validateQuery(schema)
├── routes/
│   ├── sessions.ts           # NEW: GET /sessions + POST /sessions/:id/revoke
│   ├── audit.ts              # MODIFY: add assertOwner to timeline + filters
│   └── authz.ts              # MODIFY: add assertOwner() async helper
├── services/
│   └── audit.ts              # MODIFY: add log() method for security events
└── app.ts                    # MODIFY: mount sessions route, add login limiter

ui/src/
├── pages/
│   ├── AccountSettings.tsx   # NEW: session list + revoke UI
│   └── AuditLog.tsx          # MODIFY: graceful 403 state for non-owners
├── api/
│   └── sessions.ts           # NEW: listSessions + revokeSession
└── App.tsx                   # MODIFY: add /account route

vercel.json                   # MODIFY: add CSP headers (report-only first)
```

---

## Architectural Patterns

### Pattern 1: Layered Route-Specific Rate Limiting

**What:** Stack a global rate limiter (existing) with a route-specific login limiter using a distinct Redis key prefix.
**When to use:** When a subset of endpoints needs much stricter limits than the rest of the API.
**Trade-offs:** Two middleware registrations; must ensure login limiter runs before `betterAuthHandler`; Redis key namespacing (`"rl:login:"` vs `"rl:"`) avoids collision.

```typescript
// In app.ts — order matters, login limiter must come before betterAuthHandler
app.use(createRateLimiter(opts.redisClient));                              // global: 1000/15min
app.use("/api/auth/sign-in", createLoginRateLimiter(opts.redisClient));   // login: 10/15min
app.all("/api/auth/*authPath", opts.betterAuthHandler);
```

### Pattern 2: Inline Schema + Middleware (existing — follow without deviation)

**What:** Zod schema defined at the top of the route file, applied inline with `validate(schema)`.
**When to use:** Every mutation route with a request body. Every GET route with meaningful query params (use `validateQuery`).
**Trade-offs:** Schemas co-located with handlers (easy to find and maintain). `errorHandler` converts `ZodError` to 400 automatically — no per-route handling needed.

```typescript
const updateMemberStatusSchema = z.object({
  status: z.enum(["active", "suspended"]),
});

router.patch("/companies/:companyId/members/:id/status",
  validate(updateMemberStatusSchema),
  async (req, res) => { ... }
);
```

### Pattern 3: assertOwner Authorization Helper

**What:** An async guard function in `authz.ts` that queries `companyMemberships` for `membershipRole='owner'`.
**When to use:** Any route restricted to company owners — audit log, sensitive settings, session management for the org.
**Trade-offs:** One DB lookup per request for protected routes. Acceptable at current scale. If it becomes a bottleneck, add Redis caching with short TTL (30s).

```typescript
// authz.ts — new export
export async function assertOwner(req: Request, db: Db, companyId: string): Promise<void> {
  assertBoard(req);
  const userId = req.actor.userId!;
  const row = await db
    .select({ id: companyMemberships.id })
    .from(companyMemberships)
    .where(and(
      eq(companyMemberships.companyId, companyId),
      eq(companyMemberships.principalType, "user"),
      eq(companyMemberships.principalId, userId),
      eq(companyMemberships.membershipRole, "owner"),
      eq(companyMemberships.status, "active"),
    ))
    .then(rows => rows[0] ?? null);
  if (!row) throw forbidden("Owner access required");
}
```

---

## Data Flow Changes for v1.3

### Security Event Audit Flow (New)

```
User action (login success / session revoke / invite created)
    |
Route handler (or actorMiddleware post-session-resolve)
    |
auditService.log({ companyId, actorType: "user", actorId: userId,
                   action: "auth.login.success", entityType: "session",
                   entityId: sessionId, details: { ipAddress, userAgent } })
    |
INSERT INTO activity_log (indexed by company_id + created_at)
    |
AuditLog page → React Query → GET /companies/:id/audit/timeline
    |
auditService.timeline() → keyset-paginated query → response
```

### Session Revoke Flow (New)

```
AccountSettings page → "Revoke" button for a session
    |
POST /api/sessions/:sessionId/revoke (new sessions route)
    |
assertBoard(req) — user must be authenticated
Verify sessionId belongs to req.actor.userId (prevent revoke of other users' sessions)
    |
db.delete(authSessions).where(eq(authSessions.id, sessionId))
    |
auditService.log(action: "session.revoked", entityType: "session", entityId: sessionId)
    |
React Query invalidate → GET /api/auth/list-sessions → session list refreshes
```

### Login Rate Limit Flow (New)

```
POST /api/auth/sign-in/email
    |
createLoginRateLimiter middleware (before betterAuthHandler)
    |
[if over limit] → 429 { error: "Too many login attempts. Try again later." }
    |
[if under limit] → BetterAuth handler → credential validation
    |
[on success] → actorMiddleware resolves session on next request
               → optionally log auth.login.success to activity_log
    |
[on failure] → Redis INCR rl:login:<IP> with TTL, BetterAuth returns 401
```

---

## Build Order (Dependency-Aware)

The security hardening features have these dependency chains:

```
authz.ts assertOwner()
    └── audit route gate (assertOwner on timeline + filters)
    └── sessions route gate (assertOwner if exposing org-level sessions)

validate.ts validateQuery()
    └── Apply to audit/timeline + other GET routes with typed params

rate-limit.ts createLoginRateLimiter()
    └── app.ts wire before betterAuthHandler

auditService.log()
    └── login rate limiter (log failed attempts — optional)
    └── sessions route (log revocations)

sessions.ts route (server)
    └── sessions.ts API client (ui)
          └── AccountSettings.tsx page

vercel.json CSP headers (independent — no code deps)
    └── report-only → test → promote to enforcing
```

**Recommended build sequence:**

| Step | Component | Type | Depends On |
|------|-----------|------|-----------|
| 1 | `authz.ts` — `assertOwner()` helper | Modify | — |
| 2 | `validate.ts` — `validateQuery()` variant | Modify | — |
| 3 | `middleware/index.ts` — export `validateQuery` | Modify | Step 2 |
| 4 | `rate-limit.ts` — `createLoginRateLimiter()` | Modify | Redis already wired |
| 5 | `app.ts` — wire login limiter before betterAuthHandler | Modify | Step 4 |
| 6 | `routes/audit.ts` — add `assertOwner` gate to timeline + filters | Modify | Step 1 |
| 7 | `services/audit.ts` — add `log()` method for security events | Modify | — |
| 8 | `routes/sessions.ts` — list + revoke endpoints | New | Step 1 |
| 9 | `app.ts` — mount sessions route | Modify | Step 8 |
| 10 | Wire session revoke to audit log | Modify | Steps 7, 8 |
| 11 | Apply `validate()` / `validateQuery()` to unguarded routes | Modify | Step 2 |
| 12 | `ui/src/api/sessions.ts` | New | Step 8 |
| 13 | `ui/src/pages/AccountSettings.tsx` | New | Step 12 |
| 14 | `ui/src/App.tsx` — add /account route | Modify | Step 13 |
| 15 | `vercel.json` — CSP headers (report-only first) | Modify | — |
| 16 | `ui/src/pages/AuditLog.tsx` — graceful 403 + auth event badges | Modify | Steps 6, 10 |

---

## New vs Modified Components Summary

| Component | Status | What Changes |
|-----------|--------|-------------|
| `server/src/middleware/rate-limit.ts` | MODIFY | Add `createLoginRateLimiter()` — 10/15min per IP, prefix `rl:login:` |
| `server/src/middleware/validate.ts` | MODIFY | Add `validateQuery(schema)` for query param validation |
| `server/src/middleware/index.ts` | MODIFY | Export `validateQuery` |
| `server/src/routes/authz.ts` | MODIFY | Add `assertOwner(req, db, companyId)` async helper |
| `server/src/routes/audit.ts` | MODIFY | Add `assertOwner` gate to timeline and filters routes |
| `server/src/routes/sessions.ts` | NEW | `GET /api/sessions` (list) + `POST /api/sessions/:id/revoke` |
| `server/src/routes/access.ts` | MODIFY | Add `validate()` to ~4 unguarded mutation routes |
| `server/src/services/audit.ts` | MODIFY | Add `log(event)` method for programmatic event writing |
| `server/src/app.ts` | MODIFY | Mount sessions route; add login limiter before betterAuthHandler |
| `ui/src/api/sessions.ts` | NEW | `listSessions()` and `revokeSession(sessionId)` |
| `ui/src/pages/AccountSettings.tsx` | NEW | Session list with ipAddress/userAgent + revoke buttons |
| `ui/src/pages/AuditLog.tsx` | MODIFY | Graceful 403 state for non-owners; auth event badges |
| `ui/src/App.tsx` | MODIFY | Add `/account` route for AccountSettings |
| `vercel.json` | MODIFY | Add `headers` block with CSP (report-only header key first) |

### Existing Infrastructure Reuse (No Change Required)

| Existing Component | Reused For |
|-------------------|------------|
| `createRateLimiter` + Redis `RedisClientType` | Login rate limiter reuses same Redis client, different prefix |
| `validate(schema)` middleware | Pattern to follow for all new mutation routes |
| `errorHandler` | Catches ZodError from `validateQuery` automatically — no change needed |
| `boardMutationGuard` | Already provides CSRF-equivalent protection — not duplicated |
| `assertCompanyAccess` + `assertBoard` | Foundation for new `assertOwner` chain |
| `activity_log` table + indexes | Audit log storage — complete, no migration needed |
| `auditService.timeline()` | Already built — just needs owner gate added to route |
| `authSessions` table (Drizzle schema) | Direct query for session list and delete-by-ID in revoke flow |
| BetterAuth `bearer()` plugin | Session token delivery for mobile — unchanged |
| `securityHeaders` (Helmet) | API response CSP stays as `defaultSrc: 'none'` — correct, no change |

---

## Anti-Patterns

### Anti-Pattern 1: Custom CSRF Token System

**What people do:** Add a separate CSRF token cookie + header check on top of BetterAuth.
**Why it's wrong:** This app uses `bearer()` plugin — tokens in `Authorization` header are never auto-sent by browsers, eliminating the CSRF attack vector. Adding CSRF tokens conflicts with the mobile bearer flow and duplicates protection already provided by `boardMutationGuard` + BetterAuth's origin validation.
**Do this instead:** Verify `boardMutationGuard` covers all new mutation routes. No additional CSRF infrastructure needed.

### Anti-Pattern 2: Configuring SPA CSP via Express/Helmet

**What people do:** Configure Helmet's CSP on the Express server expecting it to cover the React SPA.
**Why it's wrong:** The SPA is served from Vercel CDN — Express CSP headers only apply to API responses, not to the HTML/JS/CSS assets from Vercel. The current `defaultSrc: 'none'` in Helmet is correct for API responses and should not be changed.
**Do this instead:** SPA CSP goes in `vercel.json` headers. Keep Express CSP as `defaultSrc: 'none'` for API responses.

### Anti-Pattern 3: Revoking BetterAuth Sessions by ID Without Token Lookup

**What people do:** Call BetterAuth's `revokeSession({ token: sessionId })` passing the session ID as the token.
**Why it's wrong:** BetterAuth's `revokeSession` requires the session token (a signed value), not the ID. The `listSessions` endpoint returns `token: ""` (empty) for security — passing the ID silently fails or throws.
**Do this instead:** Server-side route deletes the `authSessions` row directly via Drizzle using the session ID. BetterAuth uses drizzleAdapter on the same table, so row deletion is equivalent to revocation. Verify the session belongs to `req.actor.userId` before deleting.

### Anti-Pattern 4: Applying `validate()` Only to Request Body

**What people do:** Assume all input is validated because mutation routes have `validate(schema)`.
**Why it's wrong:** Query parameters on GET routes arrive as raw strings and are not currently validated by `validate()`. Type confusion (NaN limits, invalid ISO dates) can cause unexpected behavior. SQL injection is already prevented by Drizzle's parameterized queries, but business logic errors are not.
**Do this instead:** Add `validateQuery(schema)` to GET routes with meaningful params. The audit timeline route already manually validates dates — replace with `z.string().datetime().optional()`.

### Anti-Pattern 5: Login Rate Limiter After betterAuthHandler

**What people do:** Register the login rate limiter after the BetterAuth handler mount, expecting it to apply.
**Why it's wrong:** Express middleware runs in registration order. If the login limiter is registered after `app.all("/api/auth/*authPath")`, the BetterAuth handler runs first and the limiter never executes for auth routes.
**Do this instead:** Register `app.use("/api/auth/sign-in", createLoginRateLimiter(...))` before `app.all("/api/auth/*authPath")`.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (1-100 users) | All v1.3 changes are appropriate. No new scaling concerns introduced. |
| 1k-10k users | Add `(company_id, actor_type, created_at DESC)` and `(company_id, action, created_at DESC)` indexes on `activity_log`. Rate limit by both IP and user ID on login attempts. |
| 10k+ users | Partition `activity_log` by month. Move BetterAuth session storage from DB to Redis. Consider separate audit log storage from primary write DB. |

---

## Sources

- BetterAuth session management: [https://better-auth.com/docs/concepts/session-management](https://better-auth.com/docs/concepts/session-management) — MEDIUM confidence (docs fetched; token field gap confirmed in GitHub issues)
- BetterAuth security: [https://better-auth.com/docs/reference/security](https://better-auth.com/docs/reference/security) — HIGH confidence (official docs fetched)
- BetterAuth bearer plugin: [https://better-auth.com/docs/plugins/bearer](https://better-auth.com/docs/plugins/bearer) — HIGH confidence (official docs fetched)
- BetterAuth revoke by ID vs token issue: [https://github.com/better-auth/better-auth/issues/6940](https://github.com/better-auth/better-auth/issues/6940) — HIGH confidence (active GitHub issue)
- BetterAuth listSessions token empty: [https://github.com/better-auth/better-auth/issues/1178](https://github.com/better-auth/better-auth/issues/1178) — HIGH confidence (confirmed behavior)
- Existing codebase — `server/src/middleware/` (all files), `server/src/routes/audit.ts`, `server/src/services/audit.ts`, `server/src/auth/better-auth.ts`, `server/src/app.ts`, `packages/db/src/schema/activity_log.ts`, `packages/db/src/schema/auth.ts`, `ui/src/pages/AuditLog.tsx`, `vercel.json` — HIGH confidence (direct inspection)

---

*Architecture research for: Paperclip v1.3 Security Hardening*
*Researched: 2026-04-05*
