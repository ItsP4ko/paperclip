# Feature Research

**Domain:** Security Hardening — Auth, API, Frontend/XSS, Audit Logs for a React SPA + Express API task management app
**Researched:** 2026-04-05
**Confidence:** HIGH (OWASP, better-auth official docs, CSP specs), MEDIUM (UX patterns from industry reference), HIGH (Zod ecosystem)

---

## Context: What This Milestone Is

v1.3 adds security hardening to an already-shipped, production SaaS. No new user-facing workflows. Four axes:

1. **Auth hardening** — active session list + revoke, brute-force protection
2. **API hardening** — Zod validation middleware, safe error format, CSRF protection
3. **Frontend/XSS** — CSP headers, content sanitization
4. **Audit logs** — owner-only panel logging sensitive events

**Existing foundation:**
- BetterAuth with bearer plugin (sessions, mobile auth, revoke APIs already exist)
- Helmet.js + express-rate-limit + Redis already installed (v1.1)
- React 19 + Vite + Tailwind v4 + shadcn/ui (frontend)
- Express 5 + Drizzle ORM + Supabase PostgreSQL (backend)
- Vercel CDN (frontend), Easypanel VPS (backend)
- Role model: `owner` / `member` — owner-only features already gate on `membershipRole`

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that any production SaaS must have. Missing these = security posture gap that blocks enterprise adoption or creates liability.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Active session list (device + browser + IP + last seen) | Google, GitHub, Notion all show this. Users expect to see where they're logged in and revoke suspicious sessions. | LOW | BetterAuth already exposes `GET /api/auth/list-sessions` returning `ipAddress`, `userAgent`, `createdAt`, `token`. UI table: one row per session, current session marked, "Revoke" button per row. |
| Revoke individual session | Must pair with session list. "See but not remove" is a broken UX — users expect both. | LOW | BetterAuth: `authClient.revokeSession({ fetchOptions: { ... } })` passing session token. Server-side: `POST /api/auth/revoke-session`. The API exists — this is a UI + endpoint wiring task. |
| Brute-force login protection (rate limit on auth endpoints) | Industry standard. OWASP explicitly requires limiting login attempts. Any deployed SaaS without this is trivially attackable. | LOW | express-rate-limit is already installed. Add a strict limiter (5 attempts / 15 min) specifically on `/api/auth/sign-in` and `/api/auth/sign-up`. Narrower than the global rate limit in v1.1. |
| Zod validation on all request inputs | Type safety at the network boundary prevents malformed data reaching business logic. Users never see the benefit, but absence creates subtle bugs and security holes. | MEDIUM | Custom `validateRequest(schema)` middleware wrapping `schema.safeParse()`. Returns `400` with structured `{ error: "Validation failed", details: z.ZodError.issues }`. Use `z.coerce` for query params (Express delivers all as strings). |
| Safe error responses (no stack traces in production) | Production APIs must not leak internal file paths, DB schema, or stack frames. Any security scanner flags this. | LOW | Express 5 error handler already exists — add `process.env.NODE_ENV === 'production'` guard. Return `{ error: "Internal server error" }` only; log full error server-side. Helmet already strips some headers. |
| Content Security Policy (CSP) | Browser-level XSS mitigation. Expected on any app rendering user content. CDN-hosted frontends (Vercel) can set this via `vercel.json` headers config. | MEDIUM | See CSP section below. Key directives: `default-src 'self'`, `connect-src` for API + WS domains, `script-src 'self'`, `style-src 'self' 'unsafe-inline'` (Tailwind requires this). Deploy in report-only first, then enforce. |
| User-generated content sanitization (XSS prevention) | Task descriptions and comments can contain user-typed text. If rendered as HTML (rich text or markdown), unsanitized output is a stored XSS vector. | LOW–MEDIUM | DOMPurify on the React client before any `dangerouslySetInnerHTML`. If content is plain text rendered with React's default JSX (no `dangerouslySetInnerHTML`), React already escapes it — sanitization is only needed where HTML is intentionally rendered. Audit all render sites first. |
| Audit log of sensitive events (owner-visible) | Enterprise SaaS buyers require audit trails. Even at MVP scale, owners need "who did what" visibility for accountability. | MEDIUM | New DB table: `audit_logs`. Events: login, failed_login, logout, session_revoked, invite_sent, invite_accepted, task_assigned, task_unassigned, role_changed, member_removed. Schema: `id`, `event_type`, `actor_user_id`, `target_user_id`, `target_resource_id`, `resource_type`, `metadata` (JSONB), `ip_address`, `created_at`. |
| Audit log UI (owner-only panel) | The log is useless without a browsable interface. Owners need date range, event type, and actor filters. | MEDIUM | Table view: timestamp, event type (badge), actor (name + avatar), target (resource link), IP. Filters: date range picker, event type multi-select, actor user select. Pagination: cursor-based, 50 rows/page. Read-only — no delete/edit. |

### Differentiators (Competitive Advantage)

Features that go beyond the minimum security bar and meaningfully improve trust or usability.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| "Revoke all other sessions" one-click | GitHub has this. High-value for compromised account recovery — one click instead of revoking N sessions individually. | LOW | BetterAuth already has `revokeOtherSessions()`. Add a "Sign out all other devices" button in the session list UI. Zero backend work. |
| Current session highlighted in session list | Users need to know which session is "this browser" so they don't accidentally revoke themselves. | LOW | Compare `session.token` from the active session against each listed session token. Mark with "Current" badge. Client-only logic. |
| Progressive lockout (delay, not hard lockout) | Hard account lockout creates a denial-of-service vector (attacker locks out a real user). Progressive delays (1s, 2s, 4s, 8s...) frustrate bots without punishing real users. | MEDIUM | Track failed attempts per account (Redis key: `login:fails:{email}`, TTL 15 min). Instead of refusing the request, add an artificial delay before responding. Express has no built-in delay middleware — implement with `setTimeout` + `Promise`. |
| Audit log export (CSV) | Enterprise buyers want to export logs for compliance or SIEM ingestion. Low implementation cost, high perceived value. | LOW | Add `GET /api/audit-logs/export?format=csv` returning a streaming CSV. No new UI — just a "Download CSV" button in the audit panel header. |
| CSP violation reporting endpoint | Report-only mode sends violations to a URL. A lightweight Express endpoint can collect them — turns CSP rollout from blind to observable. | LOW | `POST /api/csp-report` logs violations to server console (or audit log). Set `report-uri /api/csp-report` in the CSP header. Remove after enforcement is stable. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Hard account lockout after N failures | "Lock the account permanently until admin unlocks" sounds secure | Creates a DoS vector: attacker sends N+1 failed logins to lock out any user they know exists. Also creates support burden (unlock requests). OWASP explicitly discourages hard lockout as a primary control. | Progressive delay (see differentiators above) + IP-level rate limit (already exists via express-rate-limit). Notify the user via email on repeated failures (future — email not in scope for v1.3). |
| CSRF tokens on all endpoints | "Add CSRF protection everywhere to be safe" | Paperclip uses BetterAuth bearer plugin — API calls carry an `Authorization: Bearer <token>` header that JavaScript sets manually. Browsers cannot auto-attach custom headers in cross-site requests. Classic CSRF does not apply to bearer-authenticated endpoints. Adding CSRF tokens to bearer-authenticated routes adds complexity with zero security benefit. | CSRF protection is only needed on cookie-authenticated state-changing endpoints. Verify which endpoints rely on cookies vs. bearer. If cookie-only flows exist (e.g., the web session for browser users), apply double-submit cookie pattern only there. |
| Storing audit logs in application DB with DELETE capability | "Let owners delete log entries for GDPR" | Audit logs must be immutable — the entire point is a tamper-proof record. Allowing DELETE turns the audit log into a liability rather than an asset. Also, keeping logs in Supabase PostgreSQL indefinitely will grow the DB significantly. | Write-only audit log table (no UPDATE, no DELETE at app level). Implement DB-level row security to prevent deletes. For GDPR: anonymize (set `actor_user_id = null`) rather than delete. Retention policy: archive or drop rows older than 12 months via a cron job. |
| Row-Level Security (RLS) in Supabase | "Secure the database at the row level" | RLS is explicitly deferred in PROJECT.md (`Out of Scope`). Single-tenant testing does not require RLS. Adding RLS now requires rewriting every Drizzle query to pass the user context down to the DB layer — a large, risky refactor. | Application-level authorization is already implemented (`assertAssignableUser`, `tasks:assign` permissions). This is sufficient for v1.3. RLS belongs in a future v2.x security hardening milestone. |
| Rich text editor with HTML storage | "Let users write formatted task descriptions with bold, links, bullets" | If you store raw HTML from a rich text editor, every render site must sanitize. If sanitization is missed anywhere, it's a stored XSS. Managing an allowlist of safe HTML tags is an ongoing maintenance burden. | For v1.3, Paperclip stores plain text. DOMPurify is a safety net for any HTML that slips through — not a license to accept arbitrary HTML. If rich text is added in a future milestone, evaluate server-side sanitization (DOMPurify on Node.js via jsdom) so the DB never stores unsanitized HTML. |
| Fingerprint-based session binding (canvas/audio fingerprint) | "Bind sessions to the device fingerprint to prevent session hijacking" | Canvas and audio fingerprinting is unreliable across browser versions, breaks in privacy-focused browsers, and is ethically questionable. Session hijacking is better prevented by short session TTLs, secure cookie flags, and TLS — all already configured. | Use `SameSite=Strict` cookies + short expiry + HTTPS (already in BetterAuth config). IP-change detection is a reasonable middle ground: flag sessions where IP changes significantly (different country) and require re-auth — but this is v2.x scope. |

---

## Feature Details by Category

### 1. Active Session Management

**How it works in practice (reference: GitHub "Sessions" settings page):**
- Table showing each active session: browser/device name parsed from User-Agent, IP address, location (optional, via IP geolocation), "Last active" timestamp
- Current session highlighted with a "This device" label
- Each session has a "Revoke" button; current session's Revoke button is disabled or opens a "Sign out" flow instead
- "Sign out all other devices" button at the top

**BetterAuth capabilities (HIGH confidence — verified against official docs):**
- `GET /api/auth/list-sessions` — returns array of sessions with `token`, `ipAddress`, `userAgent`, `createdAt`, `expiresAt`
- `POST /api/auth/revoke-session` — revokes by token
- `POST /api/auth/revoke-other-sessions` — revokes all except current
- **Gap:** BetterAuth does not track `lastSeenAt` separately from `createdAt`. "Last seen" must be inferred from `createdAt` or derived from a separate middleware that updates a `lastSeen` Redis key on each authenticated request

**User-Agent parsing:** Use the `ua-parser-js` library (npm) to extract browser name + OS from the raw User-Agent string. Do not display raw UA strings to users.

---

### 2. Brute-Force Login Protection

**Strategy (OWASP-aligned, HIGH confidence):**

Two independent layers:
1. **IP-level rate limit** — already exists via express-rate-limit (v1.1). Tighten the auth-specific limit to 5 requests/15 min.
2. **Account-level tracking** — Redis key `login:fails:{email}`. Increment on each failed login. Add a per-attempt delay:
   - Attempt 1–3: no delay
   - Attempt 4: 1 second delay
   - Attempt 5: 2 seconds
   - Attempt 6+: 4 seconds (cap at 10s)
   - Reset counter on successful login

**Why not hard lockout:** Creates DoS vector. OWASP explicitly prefers delays or CAPTCHA over permanent lockout.

**Unlock mechanism:** None needed for delay-based approach. The counter expires via Redis TTL (15 min). If hard lockout were used, a time-based auto-unlock (30 min) is better than requiring owner action.

**What endpoint to protect:** Only `/api/auth/sign-in`. Sign-up can keep the global rate limit (prevents account enumeration at scale but doesn't need per-account logic).

---

### 3. Zod Validation Middleware

**Standard pattern (HIGH confidence — 40M+ weekly npm downloads, Zod v3.24):**

```
validateRequest({ body: schema, params: schema, query: schema })
  → schema.safeParse(req.body/params/query)
  → if !success: res.status(400).json({ error: "Validation failed", details: issues })
  → if success: req.validatedBody = parsed; next()
```

**Error response format (consistent with existing Paperclip API error shape):**
```json
{
  "error": "Validation failed",
  "details": [
    { "path": ["email"], "message": "Invalid email" }
  ]
}
```

**Query param coercion:** Use `z.coerce.number()`, `z.coerce.boolean()` for params that Express delivers as strings.

**Where to apply:** Every state-changing endpoint: POST/PUT/PATCH/DELETE routes. Also any GET routes with non-trivial query params (filters, pagination). Skip GET routes with no params.

**Do not add:** Global validation for all routes including internal health checks or WebSocket upgrade — scope to user-facing API routes only.

---

### 4. CSRF Protection

**When it applies to Paperclip (HIGH confidence — OWASP + multiple verified sources):**

CSRF exploits the browser's automatic cookie attachment. It does not apply to requests that use a custom `Authorization: Bearer <token>` header — because browsers cannot auto-attach custom headers in cross-site requests.

**Paperclip's situation:**
- Bearer plugin (v1.2): Mobile and WS flows use `Authorization: Bearer <token>` — no CSRF risk
- Browser cookie sessions: Desktop web users may use cookie-based sessions — CSRF risk exists for cookie-authenticated endpoints

**Decision:** Audit which endpoints are cookie-authenticated vs. bearer-authenticated. Apply CSRF protection only to cookie-authenticated state-changing routes. Use the `csrf-csrf` npm package (double-submit cookie pattern) for stateless protection compatible with the existing Redis setup.

**What NOT to protect:** Bearer-authenticated endpoints, read-only GET endpoints, the WebSocket upgrade.

**Practical scope for v1.3:** If most state-changing routes accept both cookie and bearer, add CSRF protection as a middleware that skips the check when `Authorization: Bearer` header is present. This is the lowest-friction approach.

---

### 5. Content Security Policy (CSP)

**Key directives for Paperclip's stack (MEDIUM confidence — CSP spec + Cloudflare/Vercel docs):**

| Directive | Value | Reason |
|-----------|-------|--------|
| `default-src` | `'self'` | Base allowlist — everything defaults to same-origin only |
| `script-src` | `'self'` | No inline scripts; Vite bundles everything into files |
| `style-src` | `'self' 'unsafe-inline'` | Tailwind v4 generates inline styles; cannot remove `unsafe-inline` without nonce-based approach |
| `connect-src` | `'self' https://[api-domain] wss://[api-domain]` | Allow fetch to API + WebSocket upgrades |
| `img-src` | `'self' data: blob:` | Allow base64 data URIs for avatar previews, blob: for file previews |
| `frame-ancestors` | `'none'` | Prevents clickjacking (equivalent to X-Frame-Options: DENY) |
| `object-src` | `'none'` | Blocks Flash/plugins — legacy but still required |
| `base-uri` | `'self'` | Prevents base tag injection |
| `form-action` | `'self'` | Restricts form submissions to same origin |

**Deployment approach:**
- **Current (Vercel):** Set in `vercel.json` under `headers` config. Already has a `vercel.json` for SPA routing — add security headers there.
- **Future (Cloudflare Pages):** Set in `_headers` file in the static output directory. Format is compatible — no code changes needed, just a different file.
- **Never use `<meta http-equiv="Content-Security-Policy">`** — meta-based CSP does not support all directives and is processed too late for some resources.

**Rollout order:**
1. Deploy `Content-Security-Policy-Report-Only` with `/api/csp-report` endpoint
2. Monitor violations for 48–72 hours
3. Fix violations (likely: specific font domains, asset URLs, any forgotten inline scripts)
4. Switch to enforcing `Content-Security-Policy`

**Tailwind v4 caveat:** Tailwind v4 injects some styles at runtime (CSS custom properties), which may trigger `unsafe-inline` style violations. Verify with report-only before enforcing.

---

### 6. User-Generated Content Sanitization

**Scope audit (what Paperclip currently renders — requires code audit to confirm):**

| Content Type | Storage Format | Render Method | XSS Risk |
|--------------|---------------|---------------|-----------|
| Task title | Plain text | React JSX text node | None — React escapes |
| Task description | Plain text (assumed) | React JSX text node | None — React escapes |
| Comments | Plain text (assumed) | React JSX text node | None — React escapes |
| Subtask names | Plain text | React JSX text node | None — React escapes |
| File attachment names | Plain text | React JSX text node | None — React escapes |

**If current render is all JSX text nodes:** DOMPurify is not needed now. The risk is future — if a markdown renderer or rich text viewer is ever added, `dangerouslySetInnerHTML` will be used and DOMPurify becomes mandatory.

**If any render uses `dangerouslySetInnerHTML`:** Apply DOMPurify immediately:
```
import DOMPurify from 'dompurify';
const clean = DOMPurify.sanitize(userContent);
<div dangerouslySetInnerHTML={{ __html: clean }} />
```

**Server-side note:** DOMPurify is DOM-dependent. For server-side sanitization (SSR or sanitize-before-store pattern), use `dompurify` with `jsdom` as the DOM implementation. For Paperclip (no SSR), client-side only is fine.

**Recommendation for v1.3:** Audit all render sites. If no `dangerouslySetInnerHTML` found, install DOMPurify as a dependency and add it to the one or two places most likely to be upgraded to HTML rendering (task description, comment body) as a defensive measure. Do not add it to every text render — that's over-engineering.

---

### 7. Audit Log Schema

**Event taxonomy (HIGH confidence — industry standard, OWASP, enterprise SaaS patterns):**

| Event Type | Trigger | Actor | Target | Metadata |
|------------|---------|-------|--------|----------|
| `auth.login` | Successful sign-in | user | — | `ip`, `user_agent` |
| `auth.login_failed` | Failed sign-in attempt | — (unknown user) | `email` (attempted) | `ip`, `fail_count` |
| `auth.logout` | Explicit sign-out | user | — | `session_token` |
| `auth.session_revoked` | User revokes a session | user | `session_id` | `revoked_ip`, `revoked_ua` |
| `auth.all_sessions_revoked` | User revokes all other sessions | user | — | `count` |
| `invite.sent` | Owner invites a member | owner | `email` | `role` |
| `invite.accepted` | Invited user joins | user | — | `invite_id` |
| `invite.revoked` | Owner cancels an invite | owner | `invite_id` | `email` |
| `member.removed` | Owner removes a member | owner | `user_id` | `email`, `role` |
| `role.changed` | Role change | owner | `user_id` | `old_role`, `new_role` |
| `task.assigned` | Task assigned to a user | actor | `issue_id` | `assignee_user_id` |
| `task.unassigned` | Task unassigned | actor | `issue_id` | `previous_assignee_user_id` |

**DB schema:**
```sql
CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  event_type    TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id),  -- NULL for unauthenticated events (failed login)
  target_user_id UUID REFERENCES users(id), -- NULL when target is not a user
  target_resource_id TEXT,                  -- issue ID, invite ID, session ID, etc.
  resource_type TEXT,                       -- 'issue', 'invite', 'session', 'member'
  metadata      JSONB DEFAULT '{}',         -- flexible; event-specific fields
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_logs_company_id_created_at ON audit_logs(company_id, created_at DESC);
CREATE INDEX audit_logs_actor_user_id ON audit_logs(actor_user_id);
CREATE INDEX audit_logs_event_type ON audit_logs(event_type);
```

**Retention:** Keep 12 months of data in the active table. Beyond that, archive or drop via a scheduled cron job. Do not expose a delete API to application users — logs are write-only from the app layer.

**Immutability:** No UPDATE or DELETE routes at the application layer. Enforce at DB level with a trigger or Supabase row security rule (no RLS required — just prevent DELETE on this table).

---

### 8. Audit Log UI

**Expected UX (reference: GitHub audit log, Vercel team activity, HighLevel audit logs):**

**Page layout:**
- Owner-only route (gate with `membershipRole === 'owner'` check on both server and client)
- Full-width table: Timestamp | Event type (colored badge) | Actor | Target/Resource | IP address
- Clicking a row expands a detail drawer (right side panel) showing full metadata
- Sticky filter bar at top: date range picker + event type multi-select + actor dropdown

**Filters:**
| Filter | Type | Options |
|--------|------|---------|
| Date range | Date picker | Last 7 days / Last 30 days / Last 90 days / Custom range |
| Event type | Multi-select | Grouped: Auth events, Member events, Task events |
| Actor | Dropdown | All members of the company |

**Pagination:** Cursor-based (use `created_at` + `id` as cursor). 50 rows per page. Do not use offset pagination — audit logs grow large and offset becomes slow.

**Export:** "Download CSV" button in header. Returns all rows matching current filters (no pagination limit on export). Stream the response.

**What NOT to build:**
- No real-time update of the audit table (users viewing audit logs are not watching a live feed — server polling or WebSocket invalidation for this table is over-engineering)
- No search-by-text (fuzzy search on JSONB metadata is expensive without a dedicated search index; filter by event type + actor + date range is sufficient for v1.3)
- No audit log for the audit log itself (recursive, adds noise)

---

## Feature Dependencies

```
[Active session list]
    └──requires──> [BetterAuth list-sessions API — already exists]
    └──requires──> [ua-parser-js for User-Agent display]
    └──enhances──> [audit log: session_revoked event]

[Revoke session]
    └──requires──> [active session list] (user must see sessions to revoke them)
    └──requires──> [BetterAuth revoke-session API — already exists]
    └──triggers──> [audit_log event: auth.session_revoked]

[Brute-force protection]
    └──requires──> [Redis — already installed]
    └──enhances──> [audit log: auth.login_failed events become more meaningful with fail_count]

[Zod validation middleware]
    └──requires──> [Zod — already a dependency in the project]
    └──blocks──> [nothing — additive to existing routes]
    └──enables──> [safe error responses become consistent]

[CSRF protection]
    └──requires──> [audit of which routes are cookie-authenticated vs. bearer]
    └──requires──> [csrf-csrf npm package]
    └──must-not-break──> [bearer token flows already in production]

[CSP headers]
    └──requires──> [knowledge of all external domains API calls go to]
    └──requires──> [connect-src includes WebSocket domain (wss://)]
    └──requires──> [report-only phase before enforcement]
    └──enhances──> [DOMPurify: defense-in-depth, CSP is the second layer]
    └──Vercel: vercel.json headers config]
    └──Cloudflare Pages: _headers file]

[Content sanitization (DOMPurify)]
    └──requires──> [code audit of all dangerouslySetInnerHTML uses]
    └──independent──> [all other security features]

[Audit log DB table]
    └──requires──> [Drizzle migration for audit_logs table]
    └──requires──> [company_id from existing companies table]
    └──blocks──> [audit log UI — UI cannot exist without data]

[Audit log writes (instrumentation)]
    └──requires──> [audit_logs table exists]
    └──requires──> [auth middleware passes request context (IP, UA) to route handlers]
    └──scattered-across──> [auth routes, invite routes, task assignment routes, member management routes]

[Audit log UI]
    └──requires──> [audit_logs table + data]
    └──requires──> [owner-only route guard — pattern already exists in the codebase]
    └──requires──> [shadcn/ui Table, DatePicker, Select components — check which are already installed]
    └──optional──> [CSV export endpoint]
```

### Dependency Notes

- **Audit log instrumentation spans multiple route files.** This is not one file change — every event source (auth, invites, assignments, members) needs a call to `writeAuditLog(event)`. Plan for this cross-cutting nature in implementation.
- **CSRF audit must precede CSRF implementation.** Do not add CSRF tokens to all routes blindly. The bearer vs. cookie split in Paperclip means some routes need it, some don't. Wrong application breaks mobile auth.
- **CSP report-only must precede enforcement.** Enforcing a wrong CSP breaks the app for all users. The report-only phase is non-negotiable.
- **Zod validation is independent and low-risk.** It can be added incrementally — start with auth routes, then expand to all POST/PUT routes. No dependencies on other v1.3 features.

---

## MVP Definition

### v1.3 Launch With (security hardening complete)

These are the features required to call v1.3 "security hardened":

- [ ] **Brute-force protection on `/api/auth/sign-in`** — IP rate limit tightened + per-account delay counter in Redis
- [ ] **Zod validation middleware on all POST/PUT/PATCH routes** — consistent 400 errors, no malformed data reaches business logic
- [ ] **Safe error responses in production** — no stack traces, no internal paths in 5xx responses
- [ ] **CSP headers in report-only** — deployed to Vercel, collecting violations, ready to enforce
- [ ] **Active session list UI** — user can see their sessions (device, IP, created date)
- [ ] **Revoke individual session** — user can remove a specific session
- [ ] **Audit log table (DB migration)** — write-only table with correct schema
- [ ] **Audit log instrumentation** — events written for: login, failed login, logout, invite sent/accepted, task assigned, role changed
- [ ] **Audit log UI (owner-only)** — filterable table with date range + event type + actor filters, cursor pagination

### Add After Core Verified (v1.3 polish)

- [ ] **CSP enforcement** — switch from report-only to enforcing after 48-72h of clean reports
- [ ] **"Revoke all other sessions" button** — one-click for compromised account recovery (zero backend work — BetterAuth API exists)
- [ ] **DOMPurify on all `dangerouslySetInnerHTML` sites** — depends on code audit finding any such sites
- [ ] **Audit log CSV export** — "Download CSV" button, streams filtered results
- [ ] **Progressive login delay** — per-account delay counter (more user-friendly than hard lockout)
- [ ] **CSRF protection on cookie-authenticated routes** — depends on CSRF audit identifying affected routes

### Future Consideration (v2.x)

- [ ] **IP geolocation in session list** — city/country parsed from IP (requires external API, adds latency)
- [ ] **Suspicious login email alerts** — notify user when login from new IP/device (requires email, out of scope v1.x)
- [ ] **Audit log retention cron** — auto-archive rows older than 12 months (operational, not a security feature per se)
- [ ] **Row-Level Security (RLS)** — explicitly deferred per PROJECT.md

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Zod validation middleware | HIGH — prevents bugs + security holes | MEDIUM — all routes | P1 |
| Safe error responses | HIGH — no internal leaks in production | LOW — error handler guard | P1 |
| Brute-force protection (IP rate limit tightening) | HIGH — attacks are real | LOW — existing library | P1 |
| CSP headers (report-only) | HIGH — XSS mitigation | LOW — vercel.json config | P1 |
| Audit log DB + instrumentation | HIGH — compliance and accountability | MEDIUM — schema + cross-cutting writes | P1 |
| Audit log UI | MEDIUM — owner visibility | MEDIUM — table + filters + pagination | P1 |
| Active session list + revoke | MEDIUM — user control over sessions | LOW — BetterAuth APIs exist | P1 |
| CSP enforcement | HIGH — actual protection | LOW (after report-only phase) | P2 |
| "Revoke all other sessions" | MEDIUM — convenience for compromised accounts | LOW — API already exists | P2 |
| DOMPurify on `dangerouslySetInnerHTML` sites | HIGH if sites exist, ZERO if they don't | LOW per site | P2 |
| Progressive login delay (account-level) | MEDIUM — better UX than hard lockout | MEDIUM — Redis + delay logic | P2 |
| CSRF protection | MEDIUM — applies only to cookie-auth routes | MEDIUM — requires audit first | P2 |
| Audit log CSV export | LOW (enterprise feature, no users demanding it yet) | LOW | P3 |
| IP geolocation in session list | LOW — nice-to-have visual | HIGH (external API dependency) | P3 |

**Priority key:**
- P1: Required for v1.3 security hardening goal
- P2: Meaningful security improvement, add when P1 is stable
- P3: Deferred — adds complexity without proportional near-term value

---

## Sources

- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) — session metadata, revocation, tracking requirements (HIGH confidence)
- [OWASP Blocking Brute Force Attacks](https://owasp.org/www-community/controls/Blocking_Brute_Force_Attacks) — progressive delay preferred over hard lockout (HIGH confidence)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) — when CSRF applies, double-submit cookie pattern (HIGH confidence)
- [OWASP Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html) — directives, nonce-based CSP (HIGH confidence)
- [Better Auth Session Management Docs](https://better-auth.com/docs/concepts/session-management) — list-sessions, revoke-session, revokeOtherSessions APIs, session metadata fields (HIGH confidence)
- [Better Auth Multi-Session Plugin](https://better-auth.com/docs/plugins/multi-session) — multi-session revoke patterns (HIGH confidence)
- [csrf-csrf npm package](https://github.com/Psifi-Solutions/csrf-csrf) — double-submit cookie pattern for Express (MEDIUM confidence)
- [Zod v3.24 validation middleware for Express](https://dev.to/1xapi/how-to-validate-api-requests-with-zod-in-nodejs-2026-guide-3ibm) — safeParse pattern, z.coerce for query params (HIGH confidence — 40M weekly downloads)
- [DOMPurify GitHub](https://github.com/cure53/DOMPurify) — DOM-based sanitization, React integration (HIGH confidence)
- [Cloudflare Pages _headers file docs](https://developers.cloudflare.com/pages/configuration/headers/) — _headers file format for CSP on Cloudflare Pages (HIGH confidence)
- [Vercel security headers docs](https://vercel.com/docs/headers/security-headers) — vercel.json headers config (HIGH confidence)
- [EnterpriseReady.io Audit Logging Guide](https://www.enterpriseready.io/features/audit-log/) — event taxonomy, immutability requirement, schema best practices (MEDIUM confidence)
- [Audit Logging Design in SaaS Systems — Agnite Studio](https://agnitestudio.com/blog/audit-logging-saas/) — who/what/when/where schema, compliance considerations (MEDIUM confidence)
- [CSRF Tokens in React: When You Actually Need Them](https://cybersierra.co/blog/csrf-tokens-react-need-them/) — bearer token SPA does not need CSRF, cookie-auth does (HIGH confidence — consistent with OWASP)

---

*Feature research for: Paperclip v1.3 Security Hardening*
*Researched: 2026-04-05*
