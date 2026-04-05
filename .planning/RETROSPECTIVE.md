# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Human Agents MVP

**Shipped:** 2026-04-04
**Phases:** 4 | **Plans:** 11

### What Was Built
- My Tasks dashboard with server-side filtering and sidebar badge count
- Human invite flow with auto-approval (no manual owner step)
- Task work surface: status changes, file attachments, subtask creation
- Bidirectional human ↔ AI task handoff with reassignment warning
- Grouped assignee pickers (Team Members + AI Agents sections)
- Owner team visibility page with per-member workload counts

### What Worked
- Zero schema migrations — existing `assigneeUserId` and `principalType: "user"` carried the full feature set
- TDD approach (RED/GREEN commits) caught edge cases early and made verification straightforward
- Parallel plan execution within waves kept total execution time low (~5-6 min per wave)
- Phase verification after each phase caught the `resolveAssigneeName` orphan early
- Reusing `InlineEntitySelector` with a `groups` prop avoided a new component for grouped pickers

### What Was Inefficient
- ROADMAP.md plan checkboxes for phases 2-4 drifted out of sync (cosmetic but noisy during audit)
- AUTH-01/02/03 requirement IDs created in plans without registering in REQUIREMENTS.md — caused traceability noise during audit
- Phase 3 VERIFICATION left `human_needed` status — 4 items still untested manually
- Plan 01-01 SUMMARY missing `requirements_completed` frontmatter — had to verify from VERIFICATION.md instead

### Patterns Established
- `resolveAssigneePatch` as atomic utility for all assignment paths — prevents 422 partial-update errors
- Inline action bars gated on `assigneeUserId === currentUserId` — simple conditional rendering, no separate component
- LEFT JOIN pattern for enriching membership data with auth_users fields
- Permission gate pattern: check `membershipRole === "owner"` bypass first, then check `assigneeUserId` match

### Key Lessons
1. Register requirement IDs in REQUIREMENTS.md before using them in plans — saves audit rework
2. `local_implicit` bypass masks real permission issues in authenticated mode — test with real auth early
3. Grouped UI patterns (pickers, org page) need the data API to match the permission model — the members endpoint permission gap was invisible in local dev

### Cost Observations
- Model mix: ~5% opus (orchestrator), ~95% sonnet (executors, verifiers, integration checker)
- Notable: Parallel wave execution with sonnet subagents kept costs low while maintaining quality

---

## Milestone: v1.1 — Deployment & SaaS Readiness

**Shipped:** 2026-04-05
**Phases:** 5 | **Plans:** 13 | **Commits:** 23

### What Was Built
- Cross-origin deployment wiring: CORS middleware, SameSite=None cookies, centralized API_BASE/getWsHost
- Three-tier deployment: Vercel CDN (frontend), Easypanel VPS (backend), Supabase PostgreSQL (database)
- Full E2E verification of invite → join → work → handoff → real-time on live deployment
- API hardening: Helmet security headers, distributed rate limiting via Redis, instance settings cache
- Gap closure phase for rate-limit bug fix and manual E2E verification of file attach + WebSocket

### What Worked
- Isolating cross-origin code changes (Phase 5) before infrastructure provisioning (Phase 6) — prevented debugging CORS and infra simultaneously
- Chrome DevTools MCP for automated E2E verification — caught the members 403 bug in Phase 7
- Gap closure phase (Phase 9) as a structured approach to closing audit gaps — all 28 requirements verified
- Redis optional pattern with graceful degradation — server works without REDIS_URL, adds distributed features when available
- Milestone audit workflow (3-source cross-reference) caught real issues: rate-limit health-skip bug, missing E2E verifications

### What Was Inefficient
- Phase 5 SUMMARY frontmatter never populated with `requirements-completed` — caused 9 "partial" results in 3-source cross-reference (verified but not declared)
- Platform naming drift: REQUIREMENTS.md DEPLOY-06/08 still say "Railway" after migrating to Easypanel — documentation corrections are easy to miss
- Phase 7 marked as `[ ]` in ROADMAP despite all E2E requirements being closed — checkbox hygiene across files is fragile
- Two audit rounds needed: first audit found gaps → gap closure phase → second audit confirmed closure — consider catching integration bugs earlier

### Patterns Established
- `api-base.ts` centralization: `API_BASE` for REST, `getWsHost()` for WebSocket — single source of truth for cross-origin URLs
- Rate limiter skip pattern: explicit path matching (`req.path === "/api/health"`) at root middleware level for health probes
- Redis client threading: `createRedisClient` in `index.ts` → pass through `opts` → consumed by rate limiter and route handlers
- Cache invalidation before logging: `del()` placed before activity log writes to minimize stale-read window

### Key Lessons
1. Mount-level awareness matters: middleware at Express root sees full paths (`/api/health`), not router-relative paths (`/health`) — verify skip conditions match actual request paths
2. Cross-origin deployment has many moving parts — isolate code changes from infrastructure changes to debug one layer at a time
3. Human-in-the-loop verification (Chrome DevTools MCP) catches real integration bugs that automated tests miss (403 permission gate, file attach behavior, WebSocket cross-window)
4. Milestone audits with 3-source cross-reference (VERIFICATION + SUMMARY + REQUIREMENTS) are effective at catching gaps — but require SUMMARY frontmatter discipline

### Cost Observations
- Model mix: ~5% opus (orchestrator), ~90% sonnet (executors, verifiers, integration checker, research), ~5% haiku (quick lookups)
- Notable: Integration checker agent was high-value — caught documentation drift and operational risks that phase-level verification missed

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 4 | 11 | First milestone — established TDD, wave-based execution, 3-source requirements audit |
| v1.1 | 5 | 13 | Gap closure phase pattern, Chrome DevTools MCP for E2E verification, integration checker agent |

### Cumulative Quality

| Milestone | Test Files | Verification Score | Tech Debt Items |
|-----------|-----------|-------------------|-----------------|
| v1.0 | 8 new | 49/49 must-haves | 9 |
| v1.1 | 4 new (21 tests) | 33/33 must-haves | 9 |

### Top Lessons (Verified Across Milestones)

1. Zero-migration approaches (reusing existing schema) dramatically reduce risk and speed
2. Register all requirement IDs upfront — phantom IDs create audit noise
3. Isolate concerns by phase: code changes before infrastructure, hardening after E2E baseline (verified v1.1)
4. SUMMARY frontmatter discipline: always populate `requirements-completed` — saves audit rework (lesson from both v1.0 and v1.1)
