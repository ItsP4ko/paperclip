# Pitfalls Research

**Domain:** Security hardening — adding auth, API, frontend, and audit features to a live Express 5 + BetterAuth + React 19 SaaS app
**Researched:** 2026-04-05
**Confidence:** HIGH (BetterAuth and CSP findings verified against official docs and open GitHub issues; Zod coercion and brute-force patterns from official Zod docs + OWASP; audit log patterns from production engineering experience; all findings cross-checked against the live codebase)

---

## Critical Pitfalls

### Pitfall 1: BetterAuth Cookie Cache Bypass Defeats Session Revocation

**What goes wrong:**
When `cookieCache` is enabled (BetterAuth's default for performance), revoking a session — including via `revokeOtherSessions: true` on password change — does NOT immediately invalidate that session on other devices or tabs. The cookie cache TTL continues to serve requests as authenticated even after server-side revocation. A user can change their password to force everyone out, then other parties can re-authenticate using the cached cookie for the remainder of the cache TTL.

**Why it happens:**
Cookie cache stores session data client-side. The server cannot push cache invalidation to existing browser sessions. BetterAuth processes `/change-password` with the cookie cache still active, so the revocation only removes the DB record while cached credentials remain usable. This was a confirmed bug (GitHub issue #4512, fixed in PR #4530 for sensitive endpoints) — but only for BetterAuth's own sensitive endpoints. Application-layer code that calls `auth.api.getSession()` directly is still affected if it does not pass `{ disableCookieCache: true }`.

**How to avoid:**
- When calling `auth.api.getSession()` inside any revocation-adjacent handler (e.g., a "revoke device" endpoint you write), pass `disableCookieCache: true`.
- For the session revocation UI feature (seeing + revoking active sessions), always call the BetterAuth-native `/revoke-session` and `/revoke-other-sessions` endpoints rather than rolling your own; these endpoints use `sensitiveSessionMiddleware` which already bypasses cache.
- Keep `cookieCache.maxAge` at 60 seconds or below. Short TTL limits the breach window.
- Do not expose a "revoke all sessions" feature and then have the user immediately trust it is enforced — add UI messaging that active tabs may take up to 60 seconds to expire.

**Warning signs:**
- After calling revoke, `GET /api/auth/get-session` from the same browser still returns a valid session immediately.
- Integration tests that revoke and then immediately poll see no 401.

**Phase to address:** Auth Hardening phase (session management feature).

---

### Pitfall 2: WS Session Token in Query Param Survives Session Revocation

**What goes wrong:**
The current implementation passes the BetterAuth session token as `?token=<encodeURIComponent(token)>` in the WebSocket upgrade URL (confirmed in `live-events-ws.ts`: `url.searchParams.get("token")`). When a session is revoked, the WebSocket connection that already authenticated with that token remains alive. The WS upgrade auth check runs once at connection time; there is no ongoing re-validation. A revoked-session user stays connected and keeps receiving live events until the TCP connection drops naturally.

**Why it happens:**
WebSocket protocol does not support custom headers during the browser's `new WebSocket()` call, so the only options are query param or cookie. The app correctly chose query param for mobile/bearer compatibility. But the auth check is fire-and-forget — it happens at upgrade time and never repeats for the lifetime of the connection.

**How to avoid:**
- Add a periodic re-validation step: every N seconds (e.g., every heartbeat cycle, every ~22s which the app already uses), validate that the session token in the connection context is still valid against the DB (not the cookie cache).
- Alternatively, track `sessionId` at connect time; when any session is revoked, iterate live WS connections and terminate those matching the revoked `sessionId`. More complex but immediate.
- At minimum, document this limitation: revocation for WS sessions has eventual consistency (up to the heartbeat interval).
- The token in the query string also appears in server access logs. Ensure the pino HTTP logger redacts `?token=` from WS upgrade URLs before logging.

**Warning signs:**
- After revoking a session via UI, the WS connection in the revoked tab still receives `issue-updated` events.
- Access log lines contain full `?token=<signed_token>` in plaintext.

**Phase to address:** Auth Hardening phase (session management + revocation).

---

### Pitfall 3: BetterAuth Rate Limiting is Global — Aggressive Limits Throttle Non-Auth Routes

**What goes wrong:**
BetterAuth's `rateLimit` config applies to all BetterAuth-handled routes, including `/get-session` which is called on every page load. Setting a tight window (e.g., 3 req/10s to protect `/sign-in/email`) via a global limit would throttle session retrieval and break normal app usage. Conversely, setting it loose enough for `/get-session` makes brute-force protection on `/sign-in/email` ineffective.

**Why it happens:**
BetterAuth's `customRules` let you specify per-path windows and maximums, but there was no way to exclude specific paths from rate limiting entirely until PR #4502. The global counter fires on every BetterAuth route hit, including benign ones. The in-memory default also means rate limit state is lost on server restart, creating a window for brute force after any deploy.

**How to avoid:**
- Use `customRules` to set aggressive limits ONLY on auth mutation routes: `/sign-in/email`, `/sign-up/email`, `/forget-password`, `/reset-password`. The default BetterAuth limit on `/sign-in/email` is 3 req/10s — keep that or tighten it.
- Set a permissive limit on `/get-session` (e.g., 100 req/60s per IP) so normal multi-tab usage is not affected.
- Configure BetterAuth to use Redis secondary storage for rate limit data so it survives restarts. The app already has Redis optional (`createRateLimiter` in `rate-limit.ts`); the same Redis client should be passed to BetterAuth's `secondaryStorage`.
- The existing Express-level rate limiter (`express-rate-limit` at 1000 req/15min) is separate from BetterAuth's own limiter. Both run independently. The Express one covers application API routes; BetterAuth's covers its own auth endpoints. Do not conflate them.

**Warning signs:**
- Users report "too many requests" errors when rapidly switching between pages (multiple tabs hitting `/get-session`).
- After a server restart, brute-force protection resets and an attacker can retry immediately.

**Phase to address:** Auth Hardening phase (brute-force protection).

---

### Pitfall 4: IP-Based Lockout Locks Out Legitimate Users Behind Shared IPs

**What goes wrong:**
Blocking by IP after N failed logins locks out all users behind a shared IP (corporate proxy, ISP NAT, mobile carrier). A single attacker who knows this can intentionally trigger the lockout for all users at that IP (denial of service). The reverse also happens: legitimate users in an office who collectively trigger the threshold get locked out.

**Why it happens:**
IP-based rate limiting is the simplest implementation, so it gets reached for first. The threat model for Paperclip is multi-user SaaS accessed by small teams — likely in shared office networks.

**How to avoid:**
- Rate limit on BOTH dimensions: per-IP (loose) AND per-email/account (tight). Example: IP limit = 20 failed attempts/15min; account limit = 5 failed attempts/15min. This way a distributed attack against one account is blocked even if it comes from many IPs.
- Use temporary lockouts only (15-30 min), never permanent. Permanent locks require manual admin intervention and create support burden.
- BetterAuth supports per-IP normalization for IPv6 subnets (`ipv6Subnet` config) — enable this to prevent IPv6 rotation attacks.
- Log failed login attempts with email, IP, and timestamp so patterns are visible in the audit log.
- Do NOT apply lockout to the "active sessions" list API — only apply it to mutation endpoints (sign-in, password reset).

**Warning signs:**
- Support requests from users who cannot log in despite knowing their correct password.
- Monitoring shows a burst of 429s from a single CIDR block that turns out to be a corporate proxy.

**Phase to address:** Auth Hardening phase (brute-force protection).

---

### Pitfall 5: Zod Validation Too Strict Breaks Existing API Clients

**What goes wrong:**
Adding Zod `.parse()` to existing endpoints that previously accepted any body breaks AI agent clients and the CLI that may be sending extra fields, `null` values where `undefined` was expected, or strings where numbers are expected in query params. The current `validate()` middleware in `middleware/validate.ts` calls `schema.parse(req.body)` — which throws for any extra field if the schema uses `.strict()`.

**Why it happens:**
Zod's default behavior (`.parse()`) strips unknown keys silently. But developers often add `.strict()` "for correctness" when hardening, which breaks clients sending extra fields. Separate issue: query params always arrive as strings in Express. A schema that says `z.number()` for `?limit=10` will throw because `"10" !== 10`. `z.coerce.number()` is required for all query/path param numeric values.

**How to avoid:**
- Use `.strip()` behavior (the Zod default) rather than `.strict()` when deploying Zod to existing endpoints. Strip unknown keys silently.
- For query parameters and URL path params, always use `z.coerce.number()`, `z.coerce.boolean()`, etc., not raw `z.number()`. This is mandatory, not optional.
- Treat adding Zod to a route as a backward-compatibility operation: the schema must accept everything the existing clients currently send. Audit request logs before writing each schema.
- Use `.optional()` generously for fields that may or may not be present across client versions.
- The existing `errorHandler` already returns `{ error: "Validation error", details: err.errors }` with HTTP 400 for `ZodError`. Keep this format consistent — do not change the error shape for Zod errors without updating all clients.

**Warning signs:**
- AI agent tasks start failing with 400 errors after Zod rollout.
- CLI commands that worked pre-hardening now return validation errors.
- Integration tests that previously passed now fail on routes that received Zod schemas.

**Phase to address:** API Hardening phase (Zod validation rollout).

---

### Pitfall 6: CSRF Protection Applied to a Bearer-Token App That Does Not Need It

**What goes wrong:**
CSRF attacks require the browser to automatically include credentials (cookies) in cross-origin requests. When authentication is via `Authorization: Bearer <token>` in a custom header, browsers do NOT automatically include that header in cross-origin requests — CSRF does not apply. Adding CSRF tokens to a bearer-token API is pure overhead: it breaks mobile clients that cannot receive CSRF tokens, it breaks the existing AI agent clients that use `Authorization: Bearer` headers, and it adds complexity for zero security benefit.

**Why it happens:**
CSRF protection appears on security checklists. Developers apply it without checking whether the authentication mechanism is cookie-based or header-based. The v1.3 feature list includes "CSRF protection" — this needs to be scoped to "confirm CSRF is not needed" rather than "implement CSRF."

**How to avoid:**
- Do NOT add CSRF middleware to the Express app. The auth mechanism is `Authorization: Bearer` (confirmed in `middleware/auth.ts` and the bearer plugin config in `auth/better-auth.ts`). This is immune to CSRF by design.
- The BetterAuth form endpoints (`/sign-in/email`, etc.) DO use cookies internally, but BetterAuth handles its own CSRF protection natively — do not double-apply.
- The only scenario where CSRF would matter is if the app transitions to cookie-only auth without the bearer plugin. That is not happening in v1.3.
- Document this decision explicitly so future developers do not re-add CSRF middleware.

**Warning signs:**
- AI agents start receiving 403 Forbidden on previously working endpoints after a "security update."
- Mobile clients (iOS Safari, Android Chrome) that use bearer tokens break silently.

**Phase to address:** API Hardening phase — address by explicitly NOT implementing it and documenting why.

---

### Pitfall 7: CSP Breaks shadcn/ui Components and Vite HMR

**What goes wrong:**
shadcn/ui components (confirmed in GitHub issue #4461: Toast, NavMenu, and others) inject inline styles at runtime. A CSP `style-src 'self'` without `'unsafe-inline'` blocks these styles, causing visual breakage — components render but look wrong or do not animate. Separately, Vite HMR requires `script-src 'unsafe-eval'` (for hot module evaluation) and `connect-src ws://localhost:*` (for the HMR websocket). Adding a strict CSP in development without these breaks the dev workflow entirely.

**Why it happens:**
CSP is typically written for the production API response in Helmet, but the React SPA frontend is served from Vercel (CDN), not Express. The CSP in `security-headers.ts` applies to the Express backend only, not to the Vite frontend's HTML. Developers assume one CSP covers everything and set it without testing the actual frontend behavior.

**How to avoid:**
- There are TWO separate CSP surfaces: (1) the Express backend's API responses (currently configured in `security-headers.ts` with `defaultSrc: ['none']` — correct for an API server), and (2) the frontend SPA served by Vercel/CDN. These need separate CSP configurations.
- For the frontend CSP (Vercel `_headers` file or HTTP meta tag): allow `'unsafe-inline'` for `style-src` to accommodate shadcn/ui. This is an acknowledged upstream limitation — nonce support in shadcn/ui is open issue #2891.
- For development CSP (Vite dev server): configure `vite.config.ts` with `server.headers` that adds `'unsafe-eval'` for `script-src` and `ws://localhost:*` for `connect-src`. Never ship the dev CSP to production.
- Use `Content-Security-Policy-Report-Only` first for 1-2 weeks in production to discover violations before blocking. Do not flip to enforcement mode blind.
- Do not configure `report-uri` without a working collection endpoint. Stale `report-uri` values generate failed network requests on every CSP violation and produce noise in logs.

**Warning signs:**
- shadcn/ui Toast notifications appear but are unstyled or invisible.
- Vite dev server HMR stops working after adding headers in `vite.config.ts`.
- Browser console shows `Refused to apply inline style` errors in production.

**Phase to address:** Frontend / XSS Hardening phase.

---

### Pitfall 8: Sanitizing Content at Save Time — Wrong Approach for Rich Text

**What goes wrong:**
Sanitizing HTML/markdown at write time (before storing in the database) appears safe but creates two serious problems: (1) the sanitized version is stored permanently, so the original user intent is lost and cannot be re-processed with improved sanitization rules later; (2) if content then passes through another parser or template engine before rendering, the already-sanitized HTML may be mutated, re-parsed, or double-encoded in ways that reintroduce XSS vectors (mutation XSS, a documented DOMPurify bypass class). The correct model is: store raw input, sanitize at render time.

**Why it happens:**
"Clean the data on the way in" feels intuitive. Developers conflate input validation (checking format/constraints — do this on save) with output sanitization (making content safe for rendering — do this at render).

**How to avoid:**
- Store user-authored content (issue descriptions, comments, task names) as-is in the database. No HTML sanitization on save.
- Run DOMPurify (or equivalent) exactly once, in the React component that calls `dangerouslySetInnerHTML`. Never call DOMPurify twice on the same content (double-sanitization can break valid content).
- For markdown fields: prefer a render pipeline that never calls `dangerouslySetInnerHTML` at all — use `react-markdown` with `rehype-sanitize`, which converts markdown to React elements directly without raw HTML injection.
- Audit every component that renders user content and confirm it goes through a single, consistent sanitization point at render.
- Input validation (not sanitization) is still valid on save: reject strings over a max length, reject binary data. This is Zod's job, not DOMPurify's.

**Warning signs:**
- Content stored in the database already has HTML entities like `&lt;` when inspected directly in psql.
- Reopening an edited issue shows double-encoded characters (e.g., `&amp;lt;`).
- Changing the sanitization library causes all stored content to look different retroactively.

**Phase to address:** Frontend / XSS Hardening phase (content sanitization).

---

### Pitfall 9: Audit Log Writes on the Request Critical Path Slow Down Every API Call

**What goes wrong:**
Inserting an audit log row synchronously (awaited) inside every sensitive request handler adds a database round-trip to every sensitive action's response time. For operations like issue assignment, status change, and invite creation that users perform frequently, this is immediately noticeable. Supabase is a remote database; each round-trip adds 10-50ms of latency on top of the existing query overhead. React Query's optimistic updates hide this on the UI, but P95 latency degrades.

**Why it happens:**
`await db.insert(auditLogs).values(...)` is the simplest implementation. Developers add it inline without thinking about the critical path.

**How to avoid:**
- Fire audit log inserts asynchronously (non-awaited `Promise`). Use a `void` pattern: `void db.insert(auditLogs).values(...).catch(err => logger.error({ err }, "Audit log insert failed"))`. This keeps the response fast and audit logging is best-effort.
- If strict audit completeness is required: use a local queue (simple in-memory async queue or `setImmediate`) that buffers writes and flushes them in batches.
- Create a composite index on `audit_logs(company_id, created_at DESC)` at table creation time. An unindexed audit log table causes full table scans on the owner dashboard query as the log grows.
- Do NOT log every HTTP request to the audit log. Log only semantically significant actions: login success/failure, session revocation, invite sent/accepted, role change, assignment. General request logging stays in the existing HTTP logger (pino).
- Avoid logging request bodies in the audit table — they may contain sensitive data. Log action type, actor ID, target resource ID, and timestamp only.

**Warning signs:**
- Issue assignment API latency increases by 30-80ms after audit log integration.
- Audit log query in the owner dashboard takes >1s as the table grows past 10k rows.
- Log lines show `audit_log` insert failures that are swallowed silently.

**Phase to address:** Audit Logs phase.

---

### Pitfall 10: Log Injection via User-Controlled Fields in Audit Entries

**What goes wrong:**
If user-supplied content (issue titles, user names, email addresses) is logged directly without sanitization, an attacker can inject newlines (`\n`, `\r\n`) and control characters to forge log entries. Example: a user named `Alice\n2026-04-05 CRITICAL: admin login from 1.2.3.4` pollutes structured logs and can mislead security incident analysis.

**Why it happens:**
Developers trust that database content is safe to log because it "already went through validation." But newlines and control characters pass most Zod string validators unless explicitly rejected.

**How to avoid:**
- Use structured logging (pino, already in use) rather than string interpolation. Pino serializes objects as JSON fields, which means newlines in field values are escaped to `\n` in the JSON output rather than interpreted as new log lines. This is the primary defense.
- Add a Zod refinement to user-input string fields: `.refine(s => !/[\r\n\x00]/.test(s), "Control characters not allowed")` for names, titles, and descriptions.
- When including user content in log messages (the string template, not the object), explicitly strip newlines: `actorName.replace(/[\r\n]+/g, ' ')`.
- In the audit log table itself, the content stored is structured (action type, IDs) rather than freeform — this limits injection surface.

**Warning signs:**
- Audit log entries appear to contain multi-line records from a single action.
- Log aggregation dashboard shows extra "events" that don't correspond to real actions.

**Phase to address:** Audit Logs phase.

---

### Pitfall 11: Security Theater — Features That Look Secure But Address Zero Real Threats

**What goes wrong:**
The v1.3 feature list may tempt implementors toward: (a) CSRF protection on bearer-token endpoints (immune by design — covered above), (b) `X-XSS-Protection: 1; mode=block` (deprecated, browsers ignore it), (c) rate-limiting the WebSocket message stream (rate limiting the upgrade only, not the message rate, is almost useless), (d) sanitizing data inside Drizzle query results before returning them in API responses (XSS happens at render in the browser, not at the API layer).

**Why it happens:**
Security checklists and tools like Helmet include these headers/features as defaults. Developers apply them wholesale without filtering for applicability to their threat model.

**How to avoid — this specific app's real vs. non-threats:**
- **Real threats**: XSS via user-authored content rendered in React; account takeover via credential stuffing; leaked session after device loss; privilege escalation via missing auth checks on endpoints.
- **Non-threats for this stack**: CSRF (bearer token immune); clickjacking (the backend CSP already sets `frameguard: { action: 'deny' }` in `security-headers.ts` — already handled); server-side template injection (no templates); SQL injection (Drizzle ORM uses parameterized queries); directory traversal (no file serving in auth routes).
- Keep the headers Helmet already provides. Do not add complexity chasing threats that do not exist for this stack.
- Specifically: do not add `report-uri` with a non-existent endpoint "for completeness" — it generates failed network requests on every CSP violation.

**Warning signs:**
- A phase is spent implementing CSRF middleware while session revocation remains unimplemented.
- Adding `report-uri` pointing to a URL that returns 404.
- Implementing a CAPTCHA on login before implementing rate limiting.

**Phase to address:** Every phase — filter each security feature against the actual threat model before implementing.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Validate only `req.body`, not `req.params` or `req.query` | Faster Zod rollout | Path traversal via malformed IDs; pagination params bypass validation | Never — validate all input surfaces |
| `'unsafe-inline'` in `script-src` for CSP | Fixes all inline script issues immediately | Completely defeats script CSP; XSS becomes trivially injectable | Never in script-src; acceptable only in style-src for the shadcn/ui constraint |
| Audit log in-process (synchronous await) | Zero infrastructure overhead | Every sensitive action adds a DB round-trip to response time | MVP only — replace with async/void pattern before load testing |
| Global rate limit for BetterAuth auth routes | Single config line | Throttles `/get-session` (called every page load) alongside login endpoints | Never — always use per-route `customRules` |
| Cookie cache left at default TTL | Better session performance | Revoked sessions remain active for the full TTL after revocation | Never for a production app with a session revocation UI |
| Sanitize on save instead of render | "Cleaner" DB content | Mutation XSS risk if content passes through another parser; stored content cannot be re-sanitized with improved rules | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| BetterAuth `revokeSession` | Calling it and trusting immediate invalidation without disabling cookie cache | Pass `disableCookieCache: true` to `getSession` inside any post-revocation check; use short `cookieCache.maxAge` (60s) |
| BetterAuth `bearer()` plugin + WS `?token=` | Assuming WS connections re-validate after session revocation | Auth check is one-time at upgrade; add periodic session re-check or revocation-push mechanism |
| BetterAuth rate limit + Redis | Using in-memory storage (default) in production | Pass the existing Redis client as `secondaryStorage` to BetterAuth config; same client the app already uses for `express-rate-limit` |
| Zod + Express query params | Using `z.number()` for numeric query params | Always `z.coerce.number()` for `req.query` and `req.params` — they are always strings in Express |
| Zod + existing routes | Adding `.strict()` to schemas for existing endpoints | Use default strip behavior; only add `.strict()` to newly created endpoints with no existing clients |
| Helmet CSP + Vercel frontend | Setting `content-security-policy` in Helmet expecting it to apply to the React app | Helmet CSP applies to Express API responses only; React app CSP must be set in Vercel `_headers` file separately |
| shadcn/ui + `style-src 'self'` | Strict style-src breaks Toast, NavMenu, and animated components | Allow `'unsafe-inline'` for `style-src` in the frontend CSP; this is an upstream limitation (issue #2891) |
| DOMPurify + react-markdown | Running DOMPurify on markdown source before passing to `react-markdown` | Use `rehype-sanitize` plugin in the `react-markdown` pipeline instead; never double-process |
| Audit log + Supabase | Synchronous await on every audit insert | Fire-and-forget with `.catch()` error logging; batch inserts if volume is high |
| `report-uri` CSP directive | Setting a `report-uri` pointing to a non-existent endpoint | Only add `report-uri` after deploying a CSP violation collection endpoint; start with `Content-Security-Policy-Report-Only` mode |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Audit log without index on `(company_id, created_at)` | Owner dashboard query takes >1s | Add composite index at migration time | ~10k rows, or ~1-2 weeks of active use |
| BetterAuth global rate limit hitting `/get-session` | Users see 429 errors during normal navigation; React Query retries amplify the problem | `customRules` to loosen `/get-session` limit | Any multi-tab session or fast page navigation |
| Synchronous audit log insert in request handler | Issue assignment P95 latency increases 30-80ms | Fire-and-forget with error catch | Immediate — every request to a hardened endpoint |
| Cookie cache `maxAge` set too low for performance but too high for security | Either too many DB hits (low) or too long a revocation window (high) | 60 seconds is the practical balance | N/A — tradeoff, not a threshold |
| Zod parse on large bodies without size limit | Memory spike if attacker sends enormous JSON body | Keep existing `express.json({ limit: '10mb' })` or tighten it; Zod has no size limit of its own | Adversarial input; not natural usage |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| CSRF middleware on a bearer-token API | Breaks AI agent clients and mobile clients with zero security gain | Do not add CSRF middleware; document why |
| Blocking based on IP alone for brute force | Legitimate users on shared IPs (corporate networks) get locked out | Always add per-account (per-email) rate limiting alongside IP limiting |
| `console.log` of session tokens or bearer tokens for debugging | Token appears in server logs, log storage, Easypanel dashboard | Never log token values; log only token hash or first 6 chars for tracing |
| WS `?token=` appearing in access logs | Full signed token in log files — anyone with log access can impersonate users | Redact `token` query param in the pino HTTP logger config |
| Adding CSP `script-src 'unsafe-eval'` in production | Allows arbitrary eval() — negates script CSP entirely | Only in Vite dev config, never in production |
| Returning `err.stack` in API error responses | Exposes internal file paths and stack frames to clients | The existing `errorHandler` correctly returns only `{ error: "Internal server error" }` for 500s — do not change this behavior |
| Sanitizing data retrieved from DB before returning in API responses | Unnecessary overhead and potential double-encoding when the React component also sanitizes | XSS happens at render (browser), not at API response; API returns raw data, React component sanitizes before `innerHTML` |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Hard lockout after 5 failed login attempts | Legitimate user who misremembered password is permanently locked out; requires admin reset | Temporary lockout (15-30 min) with clear message: "Too many attempts. Try again in 30 minutes." |
| No identifying info on active session list | Owner cannot identify which session to revoke (all show "Session") | Show user-agent, approximate location (from IP or just "logged in from Chrome on macOS"), and last active timestamp |
| CSP enforcement deployed without Report-Only phase first | Users see blank components (shadcn/ui Toast fails silently) without any visible error | Run `Content-Security-Policy-Report-Only` for 1-2 weeks and monitor reports before switching to enforcement |
| Audit log shows raw action codes | Owner cannot understand what `ISSUE_ASSIGNEE_CHANGED` means in context | Include human-readable descriptions and target resource titles in audit log display, not just IDs and codes |

---

## "Looks Done But Isn't" Checklist

- [ ] **Session revocation:** Verify that revoking a session via the UI causes a 401 on the next API request from that session — not just a DB record deletion with the cookie cache still serving.
- [ ] **WS session revocation:** Verify that a revoked session's WebSocket connection is terminated (or at minimum, stops receiving events) within the heartbeat interval (~22s).
- [ ] **Zod on query params:** Verify that every numeric query param (`?limit=`, `?page=`, `?offset=`) uses `z.coerce.number()`, not `z.number()`. Test by passing `?limit=10` (string) manually.
- [ ] **CSP on the frontend:** Verify the CSP header is present on the React app's HTML document (Vercel response headers), not just on Express API responses. These are different surfaces.
- [ ] **shadcn/ui under CSP:** After CSP is deployed on Vercel, open the browser console and confirm zero `Refused to apply inline style` errors across the full app (navigate to Issues, trigger a Toast notification, open the NavMenu).
- [ ] **Audit log async:** Verify that an audit log insert failure (e.g., simulate DB error) does not cause the parent request to fail — the API response should succeed even if the audit write fails.
- [ ] **Audit log index:** Confirm `EXPLAIN ANALYZE` on the owner dashboard audit query uses an index scan, not a sequential scan, on the `audit_logs` table.
- [ ] **Brute force per-account:** Verify that 10 failed login attempts from 10 different IPs against the same email address triggers the account-level rate limit — not only the IP-level one.
- [ ] **No stack traces in 500 responses:** Verify that a deliberate server error returns `{ error: "Internal server error" }` with no stack trace or internal details in the JSON body.
- [ ] **WS token not in access logs:** Verify that pino HTTP logger does not log the `?token=` query string value in WebSocket upgrade log lines.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Zod breaks existing clients after strict validation rollout | MEDIUM | Roll back schema to strip mode; audit request logs for unexpected fields; add those fields as `.optional()`; redeploy |
| CSP enforcement breaks the app in production | LOW (if using Report-Only first) | Switch back to `Content-Security-Policy-Report-Only`; review violation reports; fix allowlist; re-promote to enforcement |
| Audit log table without index causes slow queries | MEDIUM | `CREATE INDEX CONCURRENTLY` — PostgreSQL supports this without table lock; no downtime required |
| Brute-force lockout locks out legitimate users | LOW | Flush the Redis rate limit key for that IP/email; optionally whitelist the office IP CIDR in the rate limit config |
| Session revocation not working due to cookie cache | LOW-MEDIUM | Set `cookieCache.maxAge` to 30-60 seconds in BetterAuth config; redeploy; existing sessions expire within the new TTL |
| WS `?token=` appears in access logs | LOW | Add a custom pino serializer or middleware that strips `token` from WS upgrade URLs before logging |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Cookie cache bypasses session revocation | Auth Hardening — session management | Integration test: revoke session, poll `/get-session`, expect 401 within 60s |
| WS session not revoked on session revocation | Auth Hardening — session management | Integration test: revoke session, verify WS connection closes within heartbeat interval |
| Global BetterAuth rate limit throttles `/get-session` | Auth Hardening — brute-force protection | Load test: 50 concurrent `/get-session` requests should all succeed |
| IP-only lockout causes false positives | Auth Hardening — brute-force protection | Test: 10 failed logins from 10 different IPs against same email triggers account-level block |
| Zod strict mode breaks AI agent clients | API Hardening — Zod validation | Run existing integration test suite against Zod-hardened endpoints before merging |
| Zod numeric coercion missing for query params | API Hardening — Zod validation | Unit test: `schema.parse({ limit: "10" })` succeeds, does not throw |
| CSRF middleware breaks mobile/agent clients | API Hardening | Do not implement; document the decision in a code comment |
| CSP breaks shadcn/ui components | Frontend / XSS Hardening — CSP | Browser test: open full app under new CSP, confirm zero console CSP errors |
| Vite HMR breaks under dev CSP | Frontend / XSS Hardening — CSP | Dev workflow: confirm HMR reloads still work with dev-specific CSP config |
| Sanitize on save creates mutation XSS risk | Frontend / XSS Hardening — sanitization | Code review: confirm no DOMPurify calls in backend; confirm React components sanitize at render only |
| Audit log on critical path slows responses | Audit Logs phase | Benchmark: issue assignment endpoint latency should not increase >5ms vs baseline |
| Audit log table without index | Audit Logs phase | `EXPLAIN ANALYZE` on owner dashboard query shows index scan |
| Log injection via user content | Audit Logs phase | Unit test: log entry containing `\n` is serialized as escaped JSON, not split across log lines |
| Security theater (CSRF, deprecated headers) | Every phase | Threat model review before each phase: "What specific attack does this prevent for THIS app?" |

---

## Sources

- BetterAuth session management docs: https://better-auth.com/docs/concepts/session-management
- BetterAuth cookie cache bypass issue (fixed in PR #4530): https://github.com/better-auth/better-auth/issues/4512
- BetterAuth rate limit global scope issue (fixed in PR #4502): https://github.com/better-auth/better-auth/issues/4497
- BetterAuth rate limit docs: https://better-auth.com/docs/concepts/rate-limit
- BetterAuth bearer plugin docs: https://better-auth.com/docs/plugins/bearer
- OWASP brute force prevention: https://owasp.org/www-community/controls/Blocking_Brute_Force_Attacks
- OWASP CSRF prevention cheat sheet (bearer token exemption): https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- Vite HMR + CSP compatibility issue: https://github.com/vitejs/vite/issues/11862
- shadcn/ui CSP inline style incompatibility: https://github.com/shadcn-ui/ui/issues/4461
- shadcn/ui nonce support request (open as of research date): https://github.com/shadcn-ui/ui/issues/2891
- DOMPurify mutation XSS (sanitize-once, at-render discipline): https://mizu.re/post/exploring-the-dompurify-library-bypasses-and-fixes
- Log injection prevention (Node.js/Snyk): https://snyk.io/blog/prevent-log-injection-vulnerability-javascript-node-js/
- Zod coerce documentation: https://zod.dev
- Codebase files verified: `server/src/middleware/auth.ts`, `server/src/auth/better-auth.ts`, `server/src/realtime/live-events-ws.ts`, `server/src/middleware/validate.ts`, `server/src/middleware/security-headers.ts`, `server/src/middleware/rate-limit.ts`, `server/src/middleware/error-handler.ts`

---

*Pitfalls research for: Security hardening — Express 5 + BetterAuth + React 19 SaaS (Paperclip v1.3)*
*Researched: 2026-04-05*
