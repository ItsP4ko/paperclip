# Milestones

## v1.2 Performance & Mobile Fix (Shipped: 2026-04-06)

**Phases completed:** 5 phases (10-14), 10 plans | 76 commits | +11,531 / -113 lines | 99 files
**Timeline:** 2026-04-05 → 2026-04-06 (2 days)
**Git range:** 0ac55ef8..f9ffd5de

**Key accomplishments:**

1. Optimistic UI mutations — status, assignment, and subtask changes reflect immediately with visible rollback on failure; WS race prevented by isMutating guard (Phase 10)
2. Backend deploy gaps resolved — all routes (Knowledge Base, Cost Recommendations, Pipelines) active on Easypanel; sidebar routing fixed to company-prefixed paths (Phase 11)
3. Aggressive caching — 2-minute staleTime on issue list, detail, and My Tasks queries; My Tasks empty-render bug fixed via listAssignedToMe invalidation at all missing call-sites (Phase 12)
4. Mobile cross-origin auth — iOS Safari login and session persistence via bearer() BetterAuth plugin + frontend token injection + WS user session auth via ?token= param; Vercel SPA routing fixed (Phase 13)
5. WebSocket optimization — dead-connection detection within 22s (10s heartbeat + 12s deadline); perMessageDeflate compression disabled; targeted cache invalidation on reconnect (Phase 14)

**Tech Debt (accepted):** 9 items — see milestones/v1.2-MILESTONE-AUDIT.md

---

## v1.1 Deployment & SaaS Readiness (Shipped: 2026-04-05)

**Phases completed:** 5 phases, 13 plans | 23 commits | +10,594 / -1,075 lines | 185 files
**Timeline:** 2026-04-04 → 2026-04-05 (2 days)
**Git range:** 0518fb32..8916bbd0

**Key accomplishments:**

1. Cross-origin deployment wiring: CORS middleware, BetterAuth SameSite=None cookies, centralized API_BASE/getWsHost, Vercel SPA rewrites
2. Three-tier deployment live: Vercel CDN frontend, Easypanel VPS backend, Supabase PostgreSQL with pool cap
3. Full E2E multi-user flow verified on live deployment: invite → join → work → handoff → real-time WebSocket updates
4. API hardening: Helmet security headers (HSTS, CSP, X-Frame-Options DENY), distributed rate limiting via Redis, instance settings cache with 60s TTL
5. Rate-limit health-skip bug fixed, E2E-04/05/06 manually verified and closed — all 28 requirements satisfied

**Tech Debt (accepted):** 9 items — see milestones/v1.1-MILESTONE-AUDIT.md

---

## v1.0 Human Agents MVP (Shipped: 2026-04-04)

**Phases completed:** 4 phases, 11 plans | 23 commits | +1,468 / -49 lines | 26 files
**Timeline:** 2026-04-03 → 2026-04-04 (1 day)
**Git range:** baf58103..e74f92a4

**Key accomplishments:**

1. My Tasks dashboard with server-side `assigneeUserId=me` filtering and sidebar badge count
2. Human invite flow with owner-generated links and auto-approval (no manual step)
3. Task work surface: status changes, file attachments, subtask creation for human assignees
4. Bidirectional human ↔ AI task handoff with reassignment warning dialog
5. Grouped assignee pickers showing Team Members and AI Agents in distinct sections
6. Owner team visibility: Org page with per-member workload counts

**Tech Debt (accepted):** 9 items — see milestones/v1.0-MILESTONE-AUDIT.md

---
