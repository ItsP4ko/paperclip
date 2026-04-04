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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 4 | 11 | First milestone — established TDD, wave-based execution, 3-source requirements audit |

### Cumulative Quality

| Milestone | Test Files | Verification Score | Tech Debt Items |
|-----------|-----------|-------------------|-----------------|
| v1.0 | 8 new | 49/49 must-haves | 9 |

### Top Lessons (Verified Across Milestones)

1. Zero-migration approaches (reusing existing schema) dramatically reduce risk and speed
2. Register all requirement IDs upfront — phantom IDs create audit noise
