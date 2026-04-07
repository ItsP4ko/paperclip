# Stack Research

**Domain:** Security hardening additions to existing SaaS (Express 5 + Drizzle + BetterAuth + Redis + React 19 + shadcn/ui)
**Researched:** 2026-04-05
**Confidence:** HIGH

---

## What Is Already Installed (Do Not Re-Install)

These packages already satisfy one or more v1.3 requirements and need
NO new installation — only configuration or usage changes:

| Package | Installed Version | Covers in v1.3 |
|---------|------------------|----------------|
| `better-auth` | 1.4.18 | Session list/revoke, brute-force rate limiting, CSRF on auth routes |
| `zod` | ^3.24.2 (server) | Request body/query/params validation |
| `helmet` | ^8.1.0 | CSP hardening (needs directive expansion) |
| `express-rate-limit` | ^8.3.2 | Global API rate limiting |
| `rate-limit-redis` | ^4.3.1 | Redis-backed rate limit store |
| `redis` | ^5.11.0 | Brute-force counter storage for BetterAuth secondary storage |
| `dompurify` | ^3.3.2 (server only) | HTML sanitization on server side |
| `jsdom` | ^28.1.0 (server) | DOM shim for server-side DOMPurify |
| `drizzle-orm` | ^0.38.4 | Audit log queries |

Existing infrastructure that is already partially implemented:

- `server/src/middleware/validate.ts` — `validate(schema)` helper using Zod (validates `req.body` only; needs extension)
- `server/src/middleware/board-mutation-guard.ts` — Origin/Referer-based CSRF mitigation for board mutations
- `server/src/services/audit.ts` — `auditService` with `timeline()`, `exportBatches()`, `distinctActions()`, `userDataExport()`, `userDataErasure()`
- `packages/db/src/schema/activity_log.ts` — `activityLog` table with correct schema and indexes
- `ui/src/api/audit.ts` — typed API client for audit endpoints (`timeline`, `filters`, `exportUrl`)
- `server/src/routes/audit.ts` — audit REST endpoints fully wired

---

## New Packages Required

Two packages need to be added. Everything else is configuration or usage of existing packages.

### Backend (server package)

| Package | Version | Purpose | Why This One |
|---------|---------|---------|--------------|
| `csrf-csrf` | ^4.0.3 | Stateless CSRF protection via Double Submit Cookie for all non-BetterAuth mutating routes | `csurf` is deprecated and archived by its maintainer with a known security vulnerability. `csrf-csrf` is the community-standard Express successor — stateless (no server-side session storage), Double Submit Cookie (OWASP recommended), Express 5 compatible, no known vulnerabilities, 36k weekly downloads. Version 4.0.3 is current as of 2025. |

### Frontend (ui package)

| Package | Version | Purpose | Why This One |
|---------|---------|---------|--------------|
| `dompurify` | ^3.3.2 | XSS sanitization of user-generated HTML rendered in the browser | DOMPurify is the cure53-maintained industry standard for browser-side HTML sanitization — zero-dependency, covers HTML/MathML/SVG, used by Google, Mozilla, etc. Already on the server; needs a separate install in the UI package because the browser environment has a real DOM (no shim needed). Do NOT use `isomorphic-dompurify` in the UI — it adds jsdom as a production dependency unnecessarily when the browser DOM is always available. |

---

## Installation Commands

```bash
# Backend — one new package
pnpm --filter @paperclipai/server add csrf-csrf

# Frontend — one new package
pnpm --filter @paperclipai/ui add dompurify
```

---

## Zero New Packages — Configuration and Usage Only

All eight security features are achievable with the two new packages above plus configuration/code changes to already-installed packages.

### 1. Auth Session Management (view + revoke by device)

BetterAuth 1.4.18 exposes these endpoints natively as core features — no plugin required:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/list-sessions` | GET | Returns all active sessions for the current user, including `userAgent` and `ipAddress` per session |
| `/api/auth/revoke-session` | POST | Revokes a specific session by token |
| `/api/auth/revoke-other-sessions` | POST | Revokes all sessions except the current one |
| `/api/auth/revoke-sessions` | POST | Revokes all sessions for the user |

The `authSessions` table already stores `userAgent` and `ipAddress` — no schema migration needed. Device identification in the UI comes from parsing `userAgent` (browser/OS info).

The UI needs a new "Active Sessions" panel that calls `authClient.listSessions()` and `authClient.revokeSession({ token })` from BetterAuth's typed client, or directly via the existing `api` fetch wrapper.

The `multiSession` plugin is NOT needed. That plugin adds multi-account switching (logging into multiple accounts simultaneously in one browser). The v1.3 requirement is session management across devices for one account — that is built-in.

**Confidence: HIGH** — Verified from BetterAuth official session management docs and confirmed in installed `better-auth/dist/api/index.d.mts`.

### 2. Brute-Force Login Protection

BetterAuth 1.4.18 has a built-in configurable rate limiter with per-endpoint custom rules and Redis secondary storage support.

Add to `createBetterAuthInstance()` in `server/src/auth/better-auth.ts`:

```typescript
rateLimit: {
  enabled: true,           // force-enable in all environments
  storage: "secondary",    // use Redis — counters survive restarts
  customRules: {
    "/sign-in/email": {
      window: 60,           // 60-second window
      max: 5,               // 5 failed attempts max
    },
  },
},
```

BetterAuth's `"secondary"` storage hooks into the existing Redis client, so brute-force counters persist across process restarts and work correctly across multiple backend instances. No separate Redis key management is required.

The existing `createRateLimiter` (express-rate-limit + rate-limit-redis) covers the full API at 1000 req/15min. The BetterAuth custom rule is a tighter overlay specifically on `/api/auth/sign-in/email`.

**Confidence: HIGH** — Verified from BetterAuth rate limit docs. Secondary storage config confirmed.

### 3. Zod Validation Middleware on All Express 5 Routes

The `validate(schema)` middleware exists but only validates `req.body` and lets `ZodError` bubble up to the generic error handler (which may expose stack traces).

Extend `server/src/middleware/validate.ts` to handle body, query, and params separately, and return structured 400 responses instead of throwing:

```typescript
import { ZodError, type ZodSchema } from "zod";
import type { Request, Response, NextFunction } from "express";

export function validate(schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body)   req.body   = schemas.body.parse(req.body);
      if (schemas.query)  req.query  = schemas.query.parse(req.query as unknown);
      if (schemas.params) req.params = schemas.params.parse(req.params);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Validation failed", issues: err.issues });
        return;
      }
      next(err);
    }
  };
}
```

No third-party Zod middleware package is needed. `zod-express-middleware` has not been updated since 2021. `express-zod-api` is a full framework wrapper — inappropriate for adding validation to existing Express routes.

**Confidence: HIGH** — Zod 3.x API is stable and well-documented. Pattern is idiomatic for Express.

### 4. CSRF Protection in Express 5

Three layers, different scopes:

**Layer A — BetterAuth routes (`/api/auth/*`):** Already protected. BetterAuth enforces `Content-Type: application/json` and Origin header validation on every state-changing endpoint internally. No additional work needed.

**Layer B — Non-BetterAuth API mutations (existing):** `boardMutationGuard` already performs Origin/Referer checking for browser sessions (`req.actor.type === "board"`). This is structurally equivalent to the Referer-based CSRF check.

**Layer C — `csrf-csrf` as belt-and-suspenders:** Add Double Submit Cookie CSRF token for all `POST`/`PUT`/`PATCH`/`DELETE` requests to `/api/*`, skipping `/api/auth/*` (BetterAuth) and WebSocket upgrades.

Mount order in `app.ts`:
```typescript
import { doubleCsrf } from "csrf-csrf";

const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.BETTER_AUTH_SECRET!, // reuse existing secret
  getSessionIdentifier: (req) => req.actor?.userId ?? "anon",
  cookieName: "__Host-pc-csrf",
  cookieOptions: { sameSite: "strict", secure: true, httpOnly: true },
});

// Mount before API routes, after auth middleware
app.get("/api/csrf-token", (req, res) => {
  res.json({ token: generateToken(req, res) });
});
app.use("/api", doubleCsrfProtection);  // excludes /api/auth/* (mounted separately)
```

Frontend fetches the CSRF token on app load and adds it to every mutating request header as `x-csrf-token`.

**Confidence: HIGH for approach, MEDIUM for exact mount order** — mount order relative to `boardMutationGuard` needs implementation-time verification.

### 5. CSP Hardening — Helmet Already in Place

The existing `securityHeaders` sets `defaultSrc: ["'none'"]` which blocks everything including scripts, styles, images, and fetch — this breaks the React SPA. The current setup may work in production only because Helmet is applied to API routes and not to the static file serve path, but this needs verification.

Expand to a full React SPA-compatible CSP with a per-request nonce for inline scripts (Tailwind v4 injects inline styles, so `style-src` needs `'unsafe-inline'`):

```typescript
// server/src/middleware/security-headers.ts
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export function createSecurityHeaders(): RequestHandler {
  return (req, res, next) => {
    res.locals.cspNonce = randomUUID();
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc:              ["'self'"],
          scriptSrc:               ["'self'", `'nonce-${res.locals.cspNonce as string}'`],
          styleSrc:                ["'self'", "'unsafe-inline'"],  // Tailwind v4
          imgSrc:                  ["'self'", "data:", "blob:"],
          connectSrc:              ["'self'", "wss:", "https:"],   // WS + API
          fontSrc:                 ["'self'"],
          objectSrc:               ["'none'"],
          frameSrc:                ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      frameguard:              { action: "deny" },
      strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: false },
      referrerPolicy:          { policy: "strict-origin-when-cross-origin" },
    })(req, res, next);
  };
}
```

Pass `res.locals.cspNonce` into the HTML template when serving `index.html` so the `<script type="module">` tags in the Vite build carry the nonce attribute.

No new packages needed. Helmet 8.x includes `permissionsPolicy` natively. `crypto.randomUUID()` is Node.js built-in.

**Confidence: HIGH** — Helmet 8.x CSP nonce pattern verified from helmetjs.github.io/faq/csp-nonce-example/. Tailwind v4 inline style requirement confirmed from Tailwind v4 docs.

### 6. User-Generated Content Sanitization (XSS Prevention in Frontend)

**Server side:** `dompurify` + `jsdom` already installed on the server and usable for sanitizing HTML before DB persistence.

**Browser side (new):** After `pnpm --filter @paperclipai/ui add dompurify`, create a shared sanitization utility:

```typescript
// ui/src/lib/sanitize.ts
import DOMPurify from "dompurify";

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["b", "i", "em", "strong", "a", "p", "br", "ul", "ol", "li", "code", "pre", "blockquote"],
    ALLOWED_ATTR: ["href", "target", "rel"],
    FORCE_BODY: true,
  });
}
```

Replace every use of `dangerouslySetInnerHTML={{ __html: rawHtml }}` with `dangerouslySetInnerHTML={{ __html: sanitizeHtml(rawHtml) }}`.

**Confidence: HIGH** — DOMPurify browser usage confirmed. `isomorphic-dompurify` unnecessary for browser-only context confirmed from library README.

### 7. Audit Log Storage + Querying

Already implemented. The `activityLog` table has the correct schema:
- `id`, `companyId`, `actorType`, `actorId`, `action`, `entityType`, `entityId`, `agentId`, `runId`, `details` (jsonb), `createdAt`
- Composite indexes: `(companyId, createdAt)`, `(entityType, entityId)`, `(runId)`

`auditService` covers timeline pagination, filter discovery, streaming export, and GDPR helpers.

The v1.3 gap is **writing security-relevant events** to the existing table. These are not currently logged: login events, failed login attempts, session revocations, invite sends, role changes, and issue assignment to human users. These writes need to be added at the relevant handler/service call sites.

No schema migration. No new packages.

### 8. Audit Log UI (React + shadcn/ui, owner-only panel)

Partially implemented. `ui/src/api/audit.ts` provides a typed client. The REST endpoints (`/companies/:id/audit/timeline`, `filters`, `export`) are fully functional.

The gap is the UI panel itself. Build as a new page/tab gated on `membershipRole === "owner"`. Use existing shadcn/ui components:

| Component | Use |
|-----------|-----|
| `Table` (shadcn/ui) | Audit event rows |
| `Select` (shadcn/ui) | Action and entity type filter dropdowns |
| `Badge` (shadcn/ui) | Color-coded action labels |
| `Button` (shadcn/ui) | Export (JSON/CSV), load more |
| `Input` (shadcn/ui) | Date range inputs (from/to) |
| `ScrollArea` (shadcn/ui) | Virtualized log list |

Cursor-based pagination (`nextCursor`) already returned by the API. The UI calls `auditApi.timeline()` with TanStack Query and appends pages on "Load more" click.

No new packages. All required shadcn/ui components are available in the existing radix-ui + shadcn setup.

---

## Alternatives Considered

| Feature | Recommended | Alternative | Why Not |
|---------|-------------|-------------|---------|
| CSRF | `csrf-csrf` ^4.0.3 | `csurf` | Deprecated, archived, known security vulnerability, not Express 5 compatible |
| CSRF | `csrf-csrf` | `lusca` | Last published 2019, unmaintained, no ESM support |
| Zod middleware | Extend existing `validate.ts` | `zod-express-middleware` | Last updated 2021 (June 17), no longer maintained, adds a dependency for no gain |
| Zod middleware | Extend existing `validate.ts` | `express-zod-api` | Full framework wrapper — inappropriate for adding validation to existing routes |
| Frontend sanitization | `dompurify` (direct) | `isomorphic-dompurify` | Designed for SSR (Next.js/Nuxt); adds jsdom as production dep unnecessarily in a browser-only UI |
| Session management | BetterAuth built-in `listSessions`/`revokeSession` | `multiSession` plugin | Plugin is for multi-account switching — not needed for single-account device session management |
| Brute-force protection | BetterAuth `rateLimit.customRules` | Custom Redis counter middleware | BetterAuth owns the auth route; using its native rate limiter keeps logic co-located and avoids double-counting with the global express-rate-limit |
| Audit storage | Existing `activityLog` table | New `audit_events` table | Table already has correct schema and indexes; second table adds dual-write complexity |
| CSP nonce | `res.locals.cspNonce` via Helmet | `helmet-csp` package | `helmet-csp` was absorbed into `helmet` core — installing it separately is redundant |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `csurf` | Deprecated, archived, security vulnerability (DoS via parameter parsing) | `csrf-csrf` |
| `express-validator` | Redundant — Zod already installed and used | Extend `validate.ts` |
| `lusca` | Last published 2019, unmaintained | `csrf-csrf` |
| `helmet-csp` | Replaced — absorbed into `helmet` 8.x | `helmet` (already installed) |
| `isomorphic-dompurify` in ui | Adds jsdom as production dependency; browser has real DOM | `dompurify` direct import |
| `rate-limiter-flexible` | Redundant — `express-rate-limit` + Redis store already in place | Extend existing `createRateLimiter` + BetterAuth `customRules` |
| `multiSession` plugin | Adds multi-account switching; not the requirement | BetterAuth built-in session endpoints |
| `jsonwebtoken` for CSRF tokens | CSRF token is not a JWT; adds crypto complexity | `csrf-csrf` double-submit cookie |
| `sanitize-html` | Redundant — DOMPurify is more maintained and has better XSS coverage | `dompurify` |

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| `csrf-csrf` ^4.0.3 | Express ^5.1.0 | Fully compatible — standard `(req, res, next)` middleware signature |
| `csrf-csrf` ^4.0.3 | BetterAuth `SameSite=None` cookies | Requires `CSRF cookie SameSite` to align — use `"strict"` for CSRF cookie on same-origin, `"none"` only if cross-origin CSRF endpoint |
| `dompurify` ^3.3.2 | React ^19.0.0 | Fully compatible — pure browser DOM API, no React-specific integration |
| BetterAuth `listSessions` | better-auth 1.4.18 | No plugin required | Built-in core endpoint, confirmed in installed dist types |
| BetterAuth `rateLimit.storage: "secondary"` | better-auth 1.4.18 | Requires Redis client passed to BetterAuth config | Existing Redis client can be reused |
| Helmet CSP nonce | helmet ^8.1.0 | Express 5 + Node.js built-in `crypto` | `randomUUID()` available since Node 14.17.0 |
| `csrf-csrf` `__Host-` cookie prefix | HTTPS deployments only | Easypanel VPS + Vercel (both HTTPS) | `__Host-` prefix requires `Secure`, no `Domain`, path `/` |

---

## Integration Points with Existing Stack

| New Capability | File | Integration Note |
|---------------|------|-----------------|
| `csrf-csrf` | `server/src/app.ts` | Mount CSRF token route (`GET /api/csrf-token`) and protection middleware after CORS/auth, before API routes; skip `/api/auth/*` and WS upgrades |
| `csrf-csrf` frontend | `ui/src/api/client.ts` | Fetch CSRF token on app init; add `x-csrf-token` header to all non-GET requests |
| DOMPurify in UI | `ui/src/lib/sanitize.ts` (new file) | Import DOMPurify, export `sanitizeHtml()`; replace raw `dangerouslySetInnerHTML` usages |
| BetterAuth session endpoints | `ui/src/api/auth.ts` or new `ui/src/api/sessions.ts` | Call `GET /api/auth/list-sessions` and `POST /api/auth/revoke-session` via existing `api` wrapper |
| BetterAuth `rateLimit.customRules` | `server/src/auth/better-auth.ts` in `createBetterAuthInstance()` | Add `rateLimit` config block; pass `secondaryStorage` using existing Redis client |
| Extended `validate.ts` | `server/src/middleware/validate.ts` | Change signature from `validate(schema)` to `validate({ body?, query?, params? })`; update all existing call sites |
| CSP nonce | `server/src/middleware/security-headers.ts` | Change from exported constant to exported factory function; set `res.locals.cspNonce` before delegating to Helmet |
| CSP nonce in HTML | `server/src/app.ts` → `applyUiBranding()` | Inject `nonce` attribute on `<script>` tags in `index.html` using `res.locals.cspNonce` |
| Audit log writes | `server/src/routes/` + auth handler | `db.insert(activityLog)` at: sign-in success/failure, `POST /api/auth/revoke-session`, invite send, role change, issue assignment to human |
| Audit log UI | `ui/src/pages/` (new page) | Owner-only route, uses `auditApi` (already exists), shadcn/ui Table + Select + Badge |

---

## Sources

- BetterAuth session management — `listSessions`, `revokeSession`, `userAgent`/`ipAddress` per session confirmed: https://better-auth.com/docs/concepts/session-management — HIGH confidence
- BetterAuth rate limit — `customRules`, `secondary` storage, `/sign-in/email` window config: https://better-auth.com/docs/concepts/rate-limit — HIGH confidence
- BetterAuth security — built-in CSRF protection on auth routes, Origin validation, `Content-Type` enforcement: https://better-auth.com/docs/reference/security — HIGH confidence
- BetterAuth plugins dist — `listSessions`, `revokeSession`, `revokeSessions` confirmed in installed `better-auth/dist/api/index.d.mts` — HIGH confidence
- `csrf-csrf` 4.0.3 — latest version, Express 5 compatible, OWASP double-submit: https://github.com/Psifi-Solutions/csrf-csrf — HIGH confidence (search verified, Snyk no vulnerabilities)
- `csurf` deprecation confirmed: https://github.com/expressjs/express/discussions/5491 — HIGH confidence
- DOMPurify browser-only usage — `isomorphic-dompurify` is for SSR only: https://github.com/kkomelin/isomorphic-dompurify — HIGH confidence
- Helmet CSP nonce pattern: https://helmetjs.github.io/faq/csp-nonce-example/ — HIGH confidence
- OWASP CSRF Double Submit Cookie pattern: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html — HIGH confidence
- Installed versions verified from `server/package.json`, `ui/package.json`, `pnpm-lock.yaml` — HIGH confidence
- Existing code verified by reading: `server/src/middleware/validate.ts`, `server/src/middleware/security-headers.ts`, `server/src/middleware/board-mutation-guard.ts`, `server/src/auth/better-auth.ts`, `server/src/services/audit.ts`, `server/src/routes/audit.ts`, `packages/db/src/schema/activity_log.ts`, `ui/src/api/audit.ts` — HIGH confidence

---

*Stack research for: Paperclip v1.3 Security Hardening*
*Researched: 2026-04-05*
