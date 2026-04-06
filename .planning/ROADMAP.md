# Roadmap: Human Agents for Paperclip

## Milestones

- ✅ **v1.0 Human Agents MVP** — Phases 1-4 (shipped 2026-04-04)
- ✅ **v1.1 Deployment & SaaS Readiness** — Phases 5-9 (shipped 2026-04-05)
- ✅ **v1.2 Performance & Mobile Fix** — Phases 10-14 (shipped 2026-04-06)
- 📋 **v1.3 Security Hardening** — Phases 15-18 (planning)

## Phases

<details>
<summary>✅ v1.0 Human Agents MVP (Phases 1-4) — SHIPPED 2026-04-04</summary>

- [x] Phase 1: Identity, Membership & My Tasks Foundation (3/3 plans) — completed 2026-04-03
- [x] Phase 2: Task Work Surface (3/3 plans) — completed 2026-04-04
- [x] Phase 3: Owner Team Visibility (3/3 plans) — completed 2026-04-04
- [x] Phase 4: Online Deployment & Multi-User Auth (2/2 plans) — completed 2026-04-04

See: milestones/v1.0-ROADMAP.md for full phase details

</details>

<details>
<summary>✅ v1.1 Deployment & SaaS Readiness (Phases 5-9) — SHIPPED 2026-04-05</summary>

- [x] Phase 5: Cross-Origin Code Preparation (2/2 plans) — completed 2026-04-04
- [x] Phase 6: Infrastructure Provisioning & Deployment (5/5 plans) — completed 2026-04-05
- [x] Phase 7: End-to-End Verification (2/2 plans) — completed 2026-04-05
- [x] Phase 8: API Hardening & Redis (2/2 plans) — completed 2026-04-05
- [x] Phase 9: Gap Closure — Rate-Limit Fix & E2E Completion (2/2 plans) — completed 2026-04-05

See: milestones/v1.1-ROADMAP.md for full phase details

</details>

<details>
<summary>✅ v1.2 Performance & Mobile Fix (Phases 10-14) — SHIPPED 2026-04-06</summary>

- [x] Phase 10: Optimistic UI Mutations (2/2 plans) — completed 2026-04-05
- [x] Phase 11: Backend Deploy Gaps (2/2 plans) — completed 2026-04-05
- [x] Phase 12: Aggressive Caching (2/2 plans) — completed 2026-04-05
- [x] Phase 13: Mobile Cross-Origin Auth (2/2 plans) — completed 2026-04-05
- [x] Phase 14: WebSocket Optimization (2/2 plans) — completed 2026-04-06

See: milestones/v1.2-ROADMAP.md for full phase details

</details>

### v1.3 Security Hardening (Phases 15-18)

- [x] **Phase 15: Auth Hardening** — Brute-force login protection, active session management UI, and WS token log redaction (completed 2026-04-06)
- [x] **Phase 16: API Hardening** — Zod validation coverage across all routes, safe production error responses, and CSRF non-implementation documented (completed 2026-04-06)
- [ ] **Phase 17: Frontend / XSS Hardening** — CSP deployed report-only then promoted to enforcing, DOMPurify on all dangerouslySetInnerHTML sites
- [ ] **Phase 18: Audit Logs** — Owner-only gate on audit routes, graceful 403 in AuditLog UI

## Phase Details

### Phase 15: Auth Hardening
**Goal**: Users are protected from credential stuffing and can view and revoke their own active sessions; the WS token no longer appears in plaintext access logs
**Depends on**: Phase 14 (v1.2 complete)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05
**Success Criteria** (what must be TRUE):
  1. A user who sends 10+ failed login attempts from the same IP within 15 minutes is rate-limited before the BetterAuth handler processes the request, and the limit survives a server restart because state is stored in Redis
  2. A logged-in user can navigate to Account Settings and see a list of their active sessions with device/browser, IP address, and creation date for each
  3. A user can revoke a specific session from the list; the targeted session becomes invalid within the cookie-cache TTL (60s); all other sessions remain active
  4. A user can revoke all sessions except the current one with a single button action; the current session remains active
  5. WS upgrade requests to the live-events endpoint no longer expose the session token value in pino HTTP access logs (the `?token=` query param is redacted)
**Plans:** 3/3 plans complete

Plans:
- [ ] 15-01-PLAN.md — Wave 0 test stubs for login rate limiter and WS token redaction
- [ ] 15-02-PLAN.md — Backend: login rate limiter (AUTH-01) and WS token log redaction (AUTH-05)
- [ ] 15-03-PLAN.md — Frontend: session management UI with list/revoke (AUTH-02, AUTH-03, AUTH-04)

### Phase 16: API Hardening
**Goal**: Every mutation and relevant GET route validates its input with Zod; production 5xx responses never expose internal details; the CSRF non-implementation decision is permanently documented
**Depends on**: Phase 15
**Requirements**: API-01, API-02, API-03, API-04
**Success Criteria** (what must be TRUE):
  1. Sending a malformed body to any mutation route (POST/PUT/PATCH) returns a 400 with a structured Zod error message, not a 500 or unhandled rejection
  2. Sending a non-numeric value to a GET route query param that expects a number (e.g., pagination limit) returns a 400, not a 500 or NaN-propagation
  3. Triggering an unhandled exception in production returns a generic `{"error":"Internal server error"}` body with no stack trace, no file paths, and no internal variable names
  4. A code comment in the auth or middleware layer explicitly states that CSRF protection is not needed and references the technical justification (bearer token architecture + OWASP)
**Plans:** 2/2 plans complete

Plans:
- [ ] 16-01-PLAN.md — Test infrastructure, validateQuery middleware, error handler 5xx hardening, CSRF documentation (API-03, API-04)
- [ ] 16-02-PLAN.md — Zod schemas on all mutation routes and validateQuery on all GET routes with numeric params (API-01, API-02)

### Phase 17: Frontend / XSS Hardening
**Goal**: A strict Content Security Policy is live in production (first report-only, then enforcing after clean observation), and all dangerouslySetInnerHTML sites are sanitized with DOMPurify
**Depends on**: Phase 15 (app shape stable before CSP is locked down)
**Requirements**: CSP-01, CSP-02, CSP-03
**Note**: CSP-01 and CSP-02 are time-gated and inseparable. CSP-01 deploys the report-only header; CSP-02 promotes it to enforcing only after 48-72h of zero violations in the report endpoint. Both are delivered in this phase because enforcement depends directly on observing the report-only header.
**Success Criteria** (what must be TRUE):
  1. The deployed Vercel app sends a `Content-Security-Policy-Report-Only` header on every HTML response; the browser console shows no CSP violation reports for normal app usage (navigation, login, issue management, Mermaid rendering)
  2. After a clean 48-72h observation window with zero violations, the header is promoted to `Content-Security-Policy` (enforcing); shadcn/ui components (Toast, NavMenu), Mermaid SVG rendering, and WebSocket connections all continue to work without CSP blocks
  3. Any location in the UI codebase that uses `dangerouslySetInnerHTML` passes its content through `DOMPurify.sanitize()` before rendering; the DOMPurify call is visible in the source, not abstracted away
**Plans**: TBD

### Phase 18: Audit Logs
**Goal**: The owner-only audit log is correctly gated so non-owners cannot access it via the API or UI, and the UI handles the 403 gracefully
**Depends on**: Phase 15 (session revocation events need the revoke feature to exist), Phase 16 (validateQuery covers audit GET params)
**Requirements**: AUDIT-01, AUDIT-02
**Success Criteria** (what must be TRUE):
  1. A non-owner member who calls the audit timeline or filters API endpoints directly receives a 403 response; the request never reaches the audit data query
  2. A non-owner member who navigates to the Audit Log page in the UI sees a clear, non-breaking "access restricted" state (no spinner loop, no blank page, no unhandled error boundary trigger)
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Identity, Membership & My Tasks Foundation | v1.0 | 3/3 | Complete | 2026-04-03 |
| 2. Task Work Surface | v1.0 | 3/3 | Complete | 2026-04-04 |
| 3. Owner Team Visibility | v1.0 | 3/3 | Complete | 2026-04-04 |
| 4. Online Deployment & Multi-User Auth | v1.0 | 2/2 | Complete | 2026-04-04 |
| 5. Cross-Origin Code Preparation | v1.1 | 2/2 | Complete | 2026-04-04 |
| 6. Infrastructure Provisioning & Deployment | v1.1 | 5/5 | Complete | 2026-04-05 |
| 7. End-to-End Verification | v1.1 | 2/2 | Complete | 2026-04-05 |
| 8. API Hardening & Redis | v1.1 | 2/2 | Complete | 2026-04-05 |
| 9. Gap Closure — Rate-Limit Fix & E2E Completion | v1.1 | 2/2 | Complete | 2026-04-05 |
| 10. Optimistic UI Mutations | v1.2 | 2/2 | Complete | 2026-04-05 |
| 11. Backend Deploy Gaps | v1.2 | 2/2 | Complete | 2026-04-05 |
| 12. Aggressive Caching | v1.2 | 2/2 | Complete | 2026-04-05 |
| 13. Mobile Cross-Origin Auth | v1.2 | 2/2 | Complete | 2026-04-05 |
| 14. WebSocket Optimization | v1.2 | 2/2 | Complete | 2026-04-06 |
| 15. Auth Hardening | v1.3 | 3/3 | Complete | 2026-04-06 |
| 16. API Hardening | 2/2 | Complete   | 2026-04-06 | — |
| 17. Frontend / XSS Hardening | v1.3 | 0/TBD | Not started | — |
| 18. Audit Logs | v1.3 | 0/TBD | Not started | — |
