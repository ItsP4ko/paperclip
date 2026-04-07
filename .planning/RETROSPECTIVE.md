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

## Milestone: v1.2 — Performance & Mobile Fix

**Shipped:** 2026-04-06
**Phases:** 5 (10-14) | **Plans:** 10 | **Commits:** 76 | **Files:** 99 | **Lines:** +11,531 / -113

### What Was Built
- Optimistic UI mutations: status, assignment, subtask changes reflect immediately with rollback on failure; WS race guarded by isMutating
- Backend deploy gap closure: all Easypanel routes active, sidebar routing fixed to company-prefixed paths
- Aggressive caching: 2-minute staleTime on issue queries; My Tasks empty-render bug fixed via listAssignedToMe invalidation
- Mobile cross-origin auth: bearer() BetterAuth plugin + frontend token injection; WS user session auth via ?token=; Vercel SPA routing fixed
- WebSocket reliability: 22s dead-connection detection via heartbeat; perMessageDeflate disabled; cache flushed on reconnect

### What Worked
- bearer() plugin strategy solved HTTP and WS auth in one pass — no Vercel proxy needed
- ESM import for ws package unlocked vitest mock interception — cleaner than the createRequire CJS workaround
- scheduleHeartbeat inside connect() closure pattern — zero timer leaks across all socket lifecycle events
- 3-source requirements cross-reference (VERIFICATION + SUMMARY + REQUIREMENTS) confirmed as reliable gap detector across two milestones
- Nyquist validation: all 3 audited phases reached nyquist_compliant: true before milestone close (vs 1/3 in first pass)

### What Was Inefficient
- Phase 12 SUMMARY.md frontmatter used `dependency_graph.provides` instead of `requirements-completed` — caused "missing" in 3-source cross-reference even though requirements were satisfied
- REQUIREMENTS.md traceability table had stale phase numbers (off by 1 across all 3 active phases) — accumulated from not updating when phases were renumbered
- Server-side WS ping (30s) and client-side heartbeat (22s) are asymmetric: server never responds to client JSON ping, causing idle sessions to reconnect every 22s unnecessarily — discovered by integration checker, not caught during execution
- Nyquist validation required two rounds: first milestone audit found phases 12 and 14 non-compliant, then `/gsd:validate-phase` fixed them before completion

### Patterns Established
- Bearer token strategy for mobile auth: bearer() plugin + exposedHeaders: ["set-auth-token"] + localStorage token + getBearerHeaders() single source of truth
- WS token auth: encodeURIComponent(?token=) in URL + synthetic Authorization header in authorizeUpgrade for session resolution
- Heartbeat pattern: scheduleHeartbeat inside connect() captures nextSocket; clearHeartbeat at useEffect level; every received message resets both timers
- Per-query staleTime override: apply 120s only to navigational queries (list/detail); leave polling queries and global default unchanged
- isMutating guard scope: suppress only issue list/detail keys; activity/comment/run keys always invalidate regardless of mutation state

### Key Lessons
1. SUMMARY frontmatter `requirements-completed` must always be populated — the `dependency_graph.provides` alias is not read by the audit tooling
2. Integration checker reliably catches cross-phase interaction bugs that phase-level verification misses (dual heartbeat asymmetry found this way)
3. Mobile auth always needs real-device testing — iOS Simulator does not enforce ITP; Android Chrome requires a real device or emulator
4. Nyquist validation is worth running before milestone close, not after — Phase 14's validation run was clean first try once the test runner was correctly set to vitest
5. REQUIREMENTS.md traceability table phase references drift when phases are renumbered — keep it in sync or accept it as a known documentation debt

### Cost Observations
- Model mix: ~5% opus (orchestrator), ~93% sonnet (executors, verifiers, integration checker, research), ~2% haiku
- Notable: Execution time per plan was extremely fast (3-11 min each) — well-researched plans with clear task breakdown are the main driver of speed

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 4 | 11 | First milestone — established TDD, wave-based execution, 3-source requirements audit |
| v1.1 | 5 | 13 | Gap closure phase pattern, Chrome DevTools MCP for E2E verification, integration checker agent |
| v1.2 | 5 | 10 | Nyquist validation, bearer token mobile auth pattern, WS heartbeat pattern |

### Cumulative Quality

| Milestone | Test Files | Verification Score | Tech Debt Items | Nyquist Compliant |
|-----------|-----------|-------------------|-----------------|-------------------|
| v1.0 | 8 new | 49/49 must-haves | 9 | — (pre-Nyquist) |
| v1.1 | 4 new (21 tests) | 33/33 must-haves | 9 | — (pre-Nyquist) |
| v1.2 | 6 new (22 tests added to phase 12-14) | 19/19 must-haves | 9 | 3/3 phases |

### Top Lessons (Verified Across Milestones)

1. Zero-migration approaches (reusing existing schema) dramatically reduce risk and speed
2. Register all requirement IDs upfront — phantom IDs create audit noise
3. Isolate concerns by phase: code changes before infrastructure, hardening after E2E baseline (verified v1.1)
4. SUMMARY frontmatter discipline: always populate `requirements-completed` — saves audit rework (lesson from v1.0, v1.1, and v1.2)
5. Integration checker catches cross-phase interaction bugs that phase-level verification misses — run it before milestone close (verified v1.2)
6. Real-device testing is mandatory for mobile auth — simulators don't enforce ITP (new: v1.2)
