---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Performance & Mobile Fix
status: unknown
stopped_at: "Completed 12-01-PLAN.md"
last_updated: "2026-04-05T22:01:00Z"
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 2
  completed_plans: 1
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-05)

**Core value:** A human can receive, work on, and complete tasks inside Paperclip exactly as an AI agent does — without friction, from the web app.
**Current focus:** Phase 12 — aggressive-caching

## Current Position

Phase: 12 (aggressive-caching) — EXECUTING
Plan: 2 of 2

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (v1.2)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion*
| Phase 10 P01 | 3m | 2 tasks | 3 files |
| Phase 10 P02 | 8 | 1 tasks | 2 files |
| Phase 10-optimistic-ui-mutations P02 | 10m | 2 tasks | 2 files |

## Accumulated Context

### Decisions

- [v1.1]: Cross-origin code before infrastructure — prevented debugging CORS + infra simultaneously
- [v1.1]: Session-mode Supabase pooler — Drizzle prepared statements break on transaction-mode
- [v1.1]: Redis optional with graceful degradation — no hard dependency
- [v1.2]: Phase 10 before Phase 11 — isMutating guard must exist before staleTime is raised or WS race window widens
- [v1.2]: MAUTH uses bearer() plugin strategy (not Vercel proxy) — solves both HTTP and WS auth in one pass
- [10-01]: createOptimisticSubtaskStub omits "as Issue" cast — TypeScript satisfied structurally via all required fields
- [10-01]: updateIssue patches both assignee and status optimistically via key-presence detection to cover all callers
- [Phase 10]: Guard suppresses only issue list and detail keys — non-optimistic keys (comments, activity, runs, attachments) always invalidated
- [Phase 10]: Three mutation key prefixes (issue-status, issue-update, create-subtask) match exactly the keys set in Plan 01 IssueDetail.tsx
- [Phase 10-02]: Guard suppresses only issue list and detail keys — non-optimistic keys (comments, activity, runs, attachments) always invalidated
- [Phase 10-02]: Three mutation key prefixes (issue-status, issue-update, create-subtask) match exactly the keys set in Plan 01 IssueDetail.tsx
- [12-01]: Mock IssuesList in Issues.test.tsx to avoid useDialog context — test goal is query options not render output
- [12-01]: Mock InlineEditor/sandpack components in IssueDetail.test.tsx — stitches CSS insertRule fails in jsdom
- [12-01]: Per-query staleTime 120_000 overrides global 30s default for issue list and detail queries only; polling queries unchanged

### Pending Todos

None.

### Blockers/Concerns

- [Phase 12]: WS user Bearer token auth path does not exist in `live-events-ws.ts` — requires BetterAuth session resolution audit before coding begins
- [Phase 12]: iOS Safari ITP verification requires a real iPhone with default privacy settings — Simulator does not enforce ITP
- [Phase 13]: `publishLiveEvent` payload completeness unknown — `setQueryData` fast-path may require server-side payload expansion; audit in Phase 13 planning

## Session Continuity

Last session: 2026-04-05T22:01:00Z
Stopped at: Completed 12-01-PLAN.md
Resume file: .planning/phases/12-aggressive-caching/12-01-SUMMARY.md
