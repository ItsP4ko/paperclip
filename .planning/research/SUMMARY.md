# Project Research Summary

**Project:** Paperclip v1.3 Security Hardening
**Domain:** Security hardening additions to a live Express 5 + BetterAuth + Drizzle + Redis + React 19 SaaS
**Researched:** 2026-04-05
**Confidence:** HIGH

## Executive Summary

Paperclip v1.3 is a security hardening milestone on an already-shipped production SaaS. The defining characteristic of this milestone is that virtually all required infrastructure already exists in the codebase — the work is configuration, wiring, and new UI surfaces, not greenfield construction. BetterAuth 1.4.18 exposes session list and revoke APIs natively. The `activity_log` table is fully built with correct schema and indexes. Helmet, express-rate-limit, Redis, Zod, and DOMPurify are already installed. Only one genuinely new package is needed: `dompurify` in the UI package (the server already has it). The frequently-requested `csrf-csrf` package should NOT be added — research confirms that CSRF does not apply to this architecture.

The recommended approach is a four-phase build ordered by dependency and risk: (1) Auth hardening — session management and brute-force protection, (2) API hardening — Zod validation coverage completion and safe error responses, (3) Frontend/XSS hardening — CSP via vercel.json (report-only first) and content sanitization audit, (4) Audit log — write security events to the existing `activity_log` table and gate the already-built AuditLog UI to owners only. The most important architectural insight from research is that CSRF protection is NOT needed for this app — the bearer token auth mechanism makes the threat model CSRF-immune by design, and adding it would break the mobile and AI agent clients.

The critical risks are: (a) BetterAuth's cookie cache means session revocation is eventually consistent — revoked sessions stay valid for up to the cache TTL; (b) WebSocket connections do not re-validate after session revocation and the session token in the WS query param currently appears in plaintext access logs; (c) CSP enforcement without a report-only phase first will break shadcn/ui components in production. These are well-understood risks with documented mitigations. Overall confidence is HIGH — all findings verified against official docs, open GitHub issues, and direct codebase inspection.

## Key Findings

### Recommended Stack

The existing stack already satisfies v1.3 requirements almost entirely. No architectural changes are needed. The one genuine addition is `dompurify` in the UI package (browser-side XSS sanitization — the server already has it). CSRF infrastructure (`csrf-csrf`) should not be added.

**Core technologies with v1.3 roles:**
- `better-auth` 1.4.18 — session list/revoke, brute-force rate limiting with `customRules`, CSRF protection on auth routes; all built-in, no plugins required
- `zod` ^3.24.2 — extend existing `validate()` middleware to cover query params via a new `validateQuery()` variant; use `z.coerce.*` for all query/path params
- `helmet` ^8.1.0 — API response CSP stays as `defaultSrc: 'none'` (correct for API-only); frontend CSP goes in `vercel.json`, not Helmet
- `express-rate-limit` + `rate-limit-redis` — add a tighter login-specific limiter (10 attempts/15min per IP) mounted before the BetterAuth handler; Redis-backed so limits survive restarts
- `dompurify` ^3.3.2 (UI package, new install) — browser-side sanitization for any `dangerouslySetInnerHTML` render sites; already installed on server
- `drizzle-orm` + `activity_log` table — existing table and service used for audit event writes; no migration needed

**Critical version and compatibility notes:**
- BetterAuth `listSessions` returns `token: ""` (empty string) for security — revoke-by-session-ID requires a custom route that deletes the `authSessions` row directly via Drizzle, not via BetterAuth's native `revokeSession` (which needs the token value, not the ID).
- Helmet CSP nonce is not viable for the SPA (static Vercel CDN, no per-request server rendering); `style-src 'unsafe-inline'` is required for Tailwind v4 and shadcn/ui.
- BetterAuth `rateLimit.customRules` must be used instead of a global rate limit config — the global config throttles `/get-session` (called on every page load) alongside login endpoints.

**What NOT to add:**
- `csrf-csrf` — the bearer-token architecture makes CSRF non-applicable; adding it breaks mobile and agent clients
- `csurf` — deprecated, archived, known DoS vulnerability
- `express-validator` — redundant; Zod is already installed and in use
- `isomorphic-dompurify` in UI — adds jsdom as production dep unnecessarily; browser has a real DOM
- `sanitize-html` — redundant; DOMPurify is more maintained with better XSS coverage

### Expected Features

**Must have (table stakes — P1 for v1.3 launch):**
- Brute-force login protection — BetterAuth `customRules` for `/sign-in/email` + login-specific express-rate-limit mounted before betterAuthHandler
- Zod validation on all POST/PUT/PATCH routes — extend existing `validate()` and add `validateQuery()` for GET routes with meaningful params
- Safe error responses in production — no stack traces in 5xx; existing errorHandler is mostly correct, needs production environment guard
- CSP headers in report-only mode — `Content-Security-Policy-Report-Only` in `vercel.json`; promote to enforcing after clean observation period
- Active session list UI — new AccountSettings page using BetterAuth's `list-sessions` endpoint with userAgent/IP/date per session
- Revoke individual session — custom `POST /api/sessions/:id/revoke` route; delete `authSessions` row via Drizzle; write audit event
- Audit log instrumentation — write `auth.login.success`, `session.revoked`, `invite.created/revoked`, `role.changed` events to existing `activity_log` table
- Audit log UI (owner-only) — gate existing AuditLog page to owners via `assertOwner` on timeline and filters routes

**Should have (P2 — add after P1 is stable):**
- CSP enforcement — switch from report-only to enforcing after 48-72h of zero violations
- "Revoke all other sessions" button — zero backend work; BetterAuth `revokeOtherSessions()` already exists
- DOMPurify on `dangerouslySetInnerHTML` sites — depends on code audit; Mermaid SVG in MarkdownBody.tsx is the confirmed case
- Progressive login delay (per-account Redis counter) — better UX than hard lockout; OWASP preferred approach
- Audit log CSV export — streaming download, owner-only, filter-aware

**Defer (v2+):**
- CSRF protection — NOT needed; bearer-token architecture is immune; adding it would break mobile and agent clients
- IP geolocation in session list — external API dependency, adds latency
- Suspicious login email alerts — requires email infrastructure, out of scope
- Row-Level Security (RLS) — explicitly deferred per PROJECT.md
- Audit log retention cron — operational, not a security feature

### Architecture Approach

The v1.3 changes are surgical modifications to the existing middleware chain and route files. No new architectural patterns are introduced. The Express middleware order in `app.ts` is critical: the login rate limiter must be mounted before the BetterAuth handler, or it never runs for auth routes. CSP has two distinct surfaces — the Express API (Helmet, `defaultSrc: 'none'`, correct as-is and unchanged) and the React SPA (Vercel CDN, new `vercel.json` headers block). The audit log storage is fully complete; only event writes and the owner gate are missing.

**Major components and their v1.3 changes:**

1. `server/src/middleware/rate-limit.ts` — ADD `createLoginRateLimiter()` with `rl:login:` Redis prefix; mount before betterAuthHandler in app.ts
2. `server/src/middleware/validate.ts` — ADD `validateQuery(schema)` for GET route query param validation with `z.coerce.*` for numeric/boolean params
3. `server/src/routes/authz.ts` — ADD `assertOwner(req, db, companyId)` async helper extracted from inline patterns in companies.ts
4. `server/src/routes/sessions.ts` (NEW) — `GET /api/sessions` + `POST /api/sessions/:id/revoke`; delete from `authSessions` directly via Drizzle; write audit event; verify session belongs to `req.actor.userId` before deleting
5. `server/src/routes/audit.ts` — ADD `assertOwner` gate to timeline and filters routes
6. `server/src/services/audit.ts` — ADD `log(event)` method for programmatic event writing from route handlers
7. `ui/src/pages/AccountSettings.tsx` (NEW) — session list with userAgent, ipAddress, revoke buttons; "current session" badge
8. `vercel.json` — ADD `headers` block with `Content-Security-Policy-Report-Only` (start in report-only, promote to enforcing later)

**Existing infrastructure that requires no changes:**
- `activityLog` table and indexes — complete, no migration needed
- `boardMutationGuard` — already provides CSRF-equivalent protection for API mutations; no duplication needed
- `errorHandler` — already catches ZodError → 400 and returns no stack traces on 500s
- `auditService.timeline()`, existing `auditRoutes`, existing `AuditLog.tsx` — all built; just need the owner gate and new event types written to `activity_log`

**Build sequence (dependency-ordered):**

| Step | Component | Status |
|------|-----------|--------|
| 1 | `authz.ts` — `assertOwner()` helper | MODIFY |
| 2 | `validate.ts` — `validateQuery()` variant | MODIFY |
| 3 | `rate-limit.ts` — `createLoginRateLimiter()` | MODIFY |
| 4 | `app.ts` — wire login limiter before betterAuthHandler | MODIFY |
| 5 | `routes/audit.ts` — add `assertOwner` gate | MODIFY |
| 6 | `services/audit.ts` — add `log()` method | MODIFY |
| 7 | `routes/sessions.ts` — list + revoke endpoints | NEW |
| 8 | `app.ts` — mount sessions route | MODIFY |
| 9 | Wire session revoke to audit log | MODIFY |
| 10 | Apply `validate()` / `validateQuery()` to unguarded routes | MODIFY |
| 11 | `ui/src/api/sessions.ts` | NEW |
| 12 | `ui/src/pages/AccountSettings.tsx` | NEW |
| 13 | `ui/src/App.tsx` — add /account route | MODIFY |
| 14 | `vercel.json` — CSP headers (report-only first) | MODIFY |
| 15 | `ui/src/pages/AuditLog.tsx` — graceful 403 + auth event badges | MODIFY |

### Critical Pitfalls

1. **BetterAuth cookie cache bypasses session revocation** — Revoking a session does not immediately invalidate it if `cookieCache` is active; the signed cookie remains usable for the duration of the cache TTL. Mitigation: keep `cookieCache.maxAge` at 60s or below; use BetterAuth's native revoke endpoints (which use `sensitiveSessionMiddleware` that bypasses cache); add UI messaging that revocation takes up to 60s to propagate.

2. **WebSocket connections survive session revocation — and the token is in access logs** — The WS auth check is one-time at upgrade; revoked sessions stay connected and receiving events. Separately, the session token is passed as `?token=` in the WS upgrade URL and appears in plaintext pino HTTP logs. Mitigation: add periodic re-validation in the heartbeat cycle; add a pino serializer to redact `token` from WS upgrade URLs. Both should be addressed in Phase 1.

3. **Login rate limiter mounted after betterAuthHandler is a silent no-op** — Express runs middleware in registration order. If the login limiter is registered after `app.all("/api/auth/*authPath")`, it never runs for auth routes. The BetterAuth handler intercepts first. Mitigation: register `app.use("/api/auth/sign-in", createLoginRateLimiter(...))` BEFORE the BetterAuth handler in app.ts. Easy to get wrong silently — no error, just no protection.

4. **CSP enforcement without report-only phase breaks shadcn/ui** — `style-src 'self'` (without `'unsafe-inline'`) blocks Toast, NavMenu, and animated shadcn/ui components. Mermaid SVG rendering uses `dangerouslySetInnerHTML`. Vite dev HMR requires `'unsafe-eval'` in script-src (dev only, never production). Mitigation: always start with `Content-Security-Policy-Report-Only`; require `'unsafe-inline'` for `style-src`; never add `'unsafe-eval'` to production.

5. **Zod `.strict()` on existing endpoints breaks AI agent and CLI clients** — Agents may send extra fields. `z.number()` for query params always throws because Express delivers all query/path params as strings. Mitigation: use default Zod strip behavior (not `.strict()`) for existing endpoints; always use `z.coerce.number()` / `z.coerce.boolean()` for `req.query` and `req.params`.

6. **Audit log inserts on the request critical path add 10-50ms latency** — Synchronous `await db.insert(activityLog)` adds a Supabase round-trip to every sensitive action. Mitigation: fire-and-forget with `void ... .catch(logger.error)` pattern; never await audit writes in the request handler.

7. **CSRF middleware breaks mobile and agent clients with zero security benefit** — The v1.3 CSRF task is "confirm not needed and document why," not "implement." The bearer-token architecture is CSRF-immune by design. Adding any CSRF middleware will break AI agent clients (which use `Authorization: Bearer`) and is pure overhead. Mitigation: explicitly document in code comments that CSRF protection is not needed and why.

## Implications for Roadmap

Based on combined research, suggest four phases ordered by dependency and production risk.

### Phase 1: Auth Hardening

**Rationale:** Session management and brute-force protection are the highest-impact, lowest-implementation-cost features. BetterAuth already exposes all required APIs — this phase is primarily wiring and a new UI page. Must come before Audit Logs (session revocation events need the revoke feature to exist first). The WS token-in-logs issue is a security fix that belongs here, not deferred.

**Delivers:** Users can see and revoke active sessions per device with browser/OS/IP details. Login endpoint is protected against credential stuffing via two layers (IP rate limit + BetterAuth customRules). Redis-backed rate limit state survives server restarts. WS session token redacted from access logs.

**Addresses:** Active session list, revoke individual session, "revoke all other sessions" button, brute-force protection, WS token log redaction

**Avoids:** Cookie cache bypass (Pitfall 1), WS session revocation gap (Pitfall 2), login limiter mount order (Pitfall 3), IP-only lockout (add per-account dimension too)

**Files:** `rate-limit.ts`, `app.ts`, `better-auth.ts` (BetterAuth customRules + secondaryStorage), `routes/sessions.ts` (new), `routes/authz.ts`, `api/sessions.ts` (new), `pages/AccountSettings.tsx` (new), `App.tsx`

**Research flag:** Standard patterns — well-documented BetterAuth APIs verified against official docs and installed dist types. No additional research needed.

### Phase 2: API Hardening

**Rationale:** Zod validation and safe error responses are independent of all other features and low-risk (purely additive). Must complete before Audit Logs to ensure the new audit-writing code uses validated inputs. The CSRF decision must be documented in this phase so it is not re-litigated during implementation.

**Delivers:** All mutation routes have consistent Zod body validation. GET routes with query params have `validateQuery()` coverage with proper type coercion. No stack traces in production 5xx responses. CSRF decision documented in code comments.

**Addresses:** `validateQuery()` variant for GET routes, Zod on unguarded mutation routes in access.ts, safe error responses in production, CSRF non-implementation documented

**Avoids:** Zod strict mode breaking agents (Pitfall 5), numeric query param type errors, CSRF middleware breaking mobile/agent clients (Pitfall 7)

**Files:** `validate.ts`, `middleware/index.ts`, `routes/access.ts` (4 unguarded mutation routes), `error-handler.ts` (production guard verification)

**Research flag:** Standard patterns — no additional research needed.

### Phase 3: Frontend/XSS Hardening

**Rationale:** CSP must start in report-only mode; enforcement requires observing zero violations for 48-72h. This is a time-gated phase — deploy report-only, observe, then enforce. Content sanitization requires a code audit for `dangerouslySetInnerHTML` sites (Mermaid in MarkdownBody.tsx is confirmed; others TBD). Schedule third so the full app shape is stable before CSP is locked down.

**Delivers:** CSP deployed in report-only on Vercel. After observation window, enforced CSP. DOMPurify installed in UI package; any `dangerouslySetInnerHTML` sites wrapped. No inline script risks in production.

**Addresses:** CSP headers (report-only then enforcing), DOMPurify on render sites, safe `style-src` for shadcn/ui and Mermaid

**Avoids:** CSP enforcement breaking shadcn/ui (Pitfall 4), sanitize-on-save mutation XSS risk (Pitfall 8 from PITFALLS.md — always sanitize at render, never at save), `'unsafe-eval'` in production

**Files:** `vercel.json`, `ui/src/lib/sanitize.ts` (new), `MarkdownBody.tsx` and any other files with `dangerouslySetInnerHTML`

**Research flag:** `vercel.json` CSP patterns are well-documented. The code audit for `dangerouslySetInnerHTML` sites may surface unexpected render patterns — allow time for this discovery step. The exact Easypanel VPS hostname for `connect-src` must be confirmed from deployment config.

### Phase 4: Audit Logs

**Rationale:** The DB table, service, and UI are already built. This phase is: (a) adding `assertOwner` gate to timeline/filters routes, (b) adding `auditService.log()` and wiring it at all event sources, (c) graceful 403 handling in AuditLog.tsx. Comes last because it depends on session revocation (Phase 1) and instrumented routes (Phase 2) existing.

**Delivers:** Owner-only audit log UI showing login, failed login, session revocation, invite, role change, and assignment events. All audit writes are fire-and-forget (no latency impact on API responses). Existing timeline, pagination, and export features are now accessible to owners only.

**Addresses:** `assertOwner` helper wired to audit routes, `auditService.log()` called at all event sources (auth routes, invite routes, assignment routes, member management routes), graceful 403 in AuditLog.tsx

**Avoids:** Audit writes on the critical path (Pitfall 6), log injection via user content (use structured pino logging, not string interpolation), missing index (existing indexes are sufficient at current scale)

**Files:** `authz.ts`, `services/audit.ts`, `routes/audit.ts`, `routes/sessions.ts` (wire revoke event), `routes/access.ts` (wire invite/role events), `pages/AuditLog.tsx`

**Research flag:** Standard patterns — all infrastructure exists. The `auth.login.failed` event capture requires implementation-time investigation (BetterAuth does not expose a failure hook directly; must intercept at the login rate limiter or parse BetterAuth's 401 response).

### Phase Ordering Rationale

- Phase 1 before Phase 4: Session revocation events in the audit log require the session revocation feature to exist.
- Phase 2 before Phase 4: `validateQuery()` extension provides typed query param handling used in audit route GET params.
- Phase 3 is mostly independent: The `vercel.json` CSP changes can begin in parallel with Phase 1. The time-gated report-only observation period means Phase 3 enforcement likely completes last regardless of start order.
- Phase 4 last: Depends on all auth and API route changes being in place before cross-cutting event writes are added to avoid incomplete instrumentation.

### Research Flags

Phases with standard patterns (skip `/gsd:research-phase`):
- **Phase 1 (Auth Hardening):** All BetterAuth APIs confirmed in official docs and installed dist types. Build sequence and anti-patterns fully documented in ARCHITECTURE.md.
- **Phase 2 (API Hardening):** Zod `coerce` patterns stable and documented. CSRF non-implementation confirmed and documented.
- **Phase 4 (Audit Logs):** All infrastructure in place. Changes are additive.

Phases that may benefit from targeted validation during planning:
- **Phase 3 (CSP):** The specific Easypanel VPS hostname used in `connect-src` must be confirmed from the deployment environment. The code audit for `dangerouslySetInnerHTML` sites may surface unexpected render patterns beyond the confirmed Mermaid case.
- **Phase 4 (`auth.login.failed` capture):** BetterAuth does not expose a failure hook directly — the exact interception approach requires implementation-time investigation.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All package versions verified from installed `package.json` and `pnpm-lock.yaml`. New package recommendation (dompurify in UI) verified against npm and official docs. CSRF non-implementation confirmed against OWASP and multiple corroborating sources. |
| Features | HIGH | P1/P2/defer classification based on OWASP, BetterAuth official docs, and direct codebase inspection. The CSRF "not needed" conclusion is well-sourced, not an omission. |
| Architecture | HIGH | Build sequence and integration points derived from direct inspection of 15+ source files in the live codebase. BetterAuth `listSessions` empty-token behavior confirmed via GitHub issues #1178 and #6940. |
| Pitfalls | HIGH | Cookie cache bypass (issue #4512, PR #4530), BetterAuth global rate limit scope (issue #4497, PR #4502), shadcn/ui CSP inline style (issue #4461), Vite HMR CSP (issue #11862) all verified against open/closed GitHub issues. |

**Overall confidence:** HIGH

### Gaps to Address

- **WS token in access logs (security issue):** The `live-events-ws.ts` handler passes the session token as `?token=` in the WS upgrade URL, and this appears in pino HTTP logs. This is a security defect — anyone with log access can impersonate users. Address in Phase 1 with a pino serializer that redacts `token` query params from WS upgrade log lines.

- **Mermaid `dangerouslySetInnerHTML`:** Architecture research confirms `MarkdownBody.tsx` uses `dangerouslySetInnerHTML` for Mermaid-generated SVG with `securityLevel: 'strict'`. The CSP `img-src` and `style-src` directives in `vercel.json` need to account for Mermaid's runtime style injection — validate with report-only before enforcing.

- **`auth.login.failed` event capture:** BetterAuth does not expose a failure hook easily. This event must be intercepted at the login rate limiter (on 429 responses) or by wrapping the BetterAuth handler. The exact implementation approach requires confirmation during Phase 4 planning.

- **Exact Vercel backend hostname for `connect-src`:** The CSP directive must include the Easypanel VPS hostname (both `wss://` and `https://`). This must be confirmed from deployment configuration before the `vercel.json` header block is deployed.

- **BetterAuth `cookieCache.maxAge` current setting:** Research recommends keeping this at 60s or below for the session revocation UI to be trustworthy. The current setting in `better-auth.ts` must be verified and adjusted if higher.

## Sources

### Primary (HIGH confidence)
- BetterAuth session management — `listSessions`, `revokeSession`, `revokeOtherSessions` APIs, session metadata fields: https://better-auth.com/docs/concepts/session-management
- BetterAuth rate limit `customRules`, secondary storage config: https://better-auth.com/docs/concepts/rate-limit
- BetterAuth security — built-in CSRF protection, Origin validation, Fetch Metadata: https://better-auth.com/docs/reference/security
- BetterAuth bearer plugin: https://better-auth.com/docs/plugins/bearer
- BetterAuth cookie cache bypass (GitHub issue #4512, fixed in PR #4530): https://github.com/better-auth/better-auth/issues/4512
- BetterAuth `listSessions` empty token (GitHub issue #1178): https://github.com/better-auth/better-auth/issues/1178
- BetterAuth revoke by ID vs token (GitHub issue #6940): https://github.com/better-auth/better-auth/issues/6940
- BetterAuth global rate limit scope (GitHub issue #4497, fixed in PR #4502): https://github.com/better-auth/better-auth/issues/4497
- `csurf` deprecation — known security vulnerability, archived: https://github.com/expressjs/express/discussions/5491
- Helmet CSP nonce pattern: https://helmetjs.github.io/faq/csp-nonce-example/
- OWASP CSRF Prevention Cheat Sheet (bearer token exemption): https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- OWASP Blocking Brute Force Attacks (delays preferred over lockout): https://owasp.org/www-community/controls/Blocking_Brute_Force_Attacks
- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP Content Security Policy Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
- shadcn/ui CSP inline style incompatibility (GitHub issue #4461): https://github.com/shadcn-ui/ui/issues/4461
- shadcn/ui nonce support — open issue as of research date (GitHub issue #2891): https://github.com/shadcn-ui/ui/issues/2891
- Vite HMR + CSP compatibility (GitHub issue #11862): https://github.com/vitejs/vite/issues/11862
- DOMPurify browser-only usage — `isomorphic-dompurify` is SSR-only: https://github.com/kkomelin/isomorphic-dompurify
- Vercel security headers config: https://vercel.com/docs/headers/security-headers
- Installed versions verified from `server/package.json`, `ui/package.json`, `pnpm-lock.yaml`
- Codebase files verified by direct inspection: `server/src/middleware/` (all), `server/src/routes/audit.ts`, `server/src/services/audit.ts`, `server/src/auth/better-auth.ts`, `server/src/app.ts`, `server/src/realtime/live-events-ws.ts`, `packages/db/src/schema/activity_log.ts`, `packages/db/src/schema/auth.ts`, `ui/src/pages/AuditLog.tsx`, `ui/src/api/audit.ts`, `vercel.json`

### Secondary (MEDIUM confidence)
- EnterpriseReady.io Audit Logging Guide — event taxonomy, immutability requirement: https://www.enterpriseready.io/features/audit-log/
- Audit Logging Design in SaaS Systems — who/what/when/where schema: https://agnitestudio.com/blog/audit-logging-saas/
- DOMPurify mutation XSS (sanitize-once, at-render discipline): https://mizu.re/post/exploring-the-dompurify-library-bypasses-and-fixes
- Log injection prevention (Node.js/Snyk) — structured logging as primary defense: https://snyk.io/blog/prevent-log-injection-vulnerability-javascript-node-js/
- CSRF Tokens in React — when bearer token SPA does not need them: https://cybersierra.co/blog/csrf-tokens-react-need-them/

---
*Research completed: 2026-04-05*
*Ready for roadmap: yes*
