---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Security Hardening
status: roadmap_ready
stopped_at: phase 15 not started
last_updated: "2026-04-05T00:00:00.000Z"
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-06)

**Core value:** A human can receive, work on, and complete tasks inside Paperclip exactly as an AI agent does — without friction, from the web app.
**Current focus:** v1.3 Security Hardening — roadmap defined, ready to plan Phase 15

## Current Position

```
Phase: 15 (not started)
Plan: —
Status: Roadmap ready — start with /gsd:plan-phase 15

[░░░░░░░░░░░░░░░░░░░░] 0% — 0/4 phases complete
```

## Performance Metrics

- Phases this milestone: 4 (15, 16, 17, 18)
- Requirements covered: 14/14
- Phases completed: 0/4
- Plans completed: 0/TBD

## Accumulated Context

### Decisions

All v1.2 decisions captured in PROJECT.md Key Decisions table.

Key cross-milestone carry-forwards:
- [v1.1]: Session-mode Supabase pooler (port 5432) — Drizzle prepared statements break on transaction-mode (port 6543)
- [v1.1]: Redis optional with graceful degradation — server starts without REDIS_URL
- [v1.2]: Bearer() plugin strategy for mobile auth — solves HTTP and WS auth in one pass; cookie-only flows unaffected
- [v1.2]: Per-query staleTime 120s (not global) — targeted cache without regressions on polling queries
- [v1.2]: WS heartbeat inside connect() closure — nextSocket captured in closure, zero timer leaks
- [v1.2]: reconnectAttempt > 0 guard — initial connect does not flush cache

Key v1.3 architectural decisions (from research):
- CSRF protection NOT needed — bearer-token architecture is immune by design (OWASP confirmed); adding it breaks mobile and agent clients
- BetterAuth `listSessions` returns `token: ""` (empty string) — revoke-by-ID requires deleting `authSessions` row via Drizzle directly, not via native `revokeSession`
- Login rate limiter MUST be mounted BEFORE the BetterAuth handler in app.ts — registering after is a silent no-op
- CSP must start in `Content-Security-Policy-Report-Only`; `style-src 'unsafe-inline'` required for Tailwind v4 and shadcn/ui
- Audit writes must be fire-and-forget (`void ... .catch(logger.error)`) — awaiting adds 10-50ms Supabase round-trip to every sensitive action
- `dompurify` needed in UI package (browser-side); server already has it — do NOT use `isomorphic-dompurify` (adds jsdom unnecessarily)
- CSP-01 and CSP-02 are time-gated and inseparable — both in Phase 17; enforce only after 48-72h clean observation window

### Pending Todos

None.

### Open Concerns (carry-forward from v1.2)

- Server doesn't echo client WS ping — idle sessions reconnect every ~22s (low priority)
- File attachments use local disk — lost on container replacement (medium priority)
- Android Chrome mobile auth not device-verified (low priority — same code path as iOS)

### v1.3 Implementation Notes

**Phase 15 (Auth Hardening) critical pitfalls:**
- BetterAuth cookie cache means session revocation is eventually consistent — keep `cookieCache.maxAge` at 60s or below; confirm current value in `better-auth.ts`
- WS connections do not re-validate after revocation — WS token in pino HTTP logs is a security defect; redact via pino serializer
- Login rate limiter mount order is critical — mount `app.use("/api/auth/sign-in", createLoginRateLimiter(...))` BEFORE betterAuthHandler

**Phase 17 (CSP) critical pitfalls:**
- Never enforce CSP without report-only observation first — `style-src 'self'` (without `'unsafe-inline'`) breaks Toast, NavMenu, and animated shadcn/ui components
- Mermaid SVG uses `dangerouslySetInnerHTML`; `img-src` and `style-src` directives must account for Mermaid runtime style injection
- Exact Easypanel VPS hostname for `connect-src` must be confirmed from deployment config before `vercel.json` headers are deployed
- `'unsafe-eval'` must NEVER appear in production `script-src`

**Phase 18 (Audit Logs) gap:**
- `auth.login.failed` event capture: BetterAuth does not expose a failure hook directly — interception at login rate limiter (429 responses) or by wrapping BetterAuth handler; exact approach confirmed during planning

## Session Continuity

Last session: 2026-04-06
Stopped at: v1.3 roadmap defined (4 phases, 14 requirements)
Resume: `/gsd:plan-phase 15`
