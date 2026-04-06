---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Performance & Mobile Fix
status: unknown
stopped_at: Completed 14-01-PLAN.md
last_updated: "2026-04-06T01:48:44.710Z"
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 6
  completed_plans: 6
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-05)

**Core value:** A human can receive, work on, and complete tasks inside Paperclip exactly as an AI agent does — without friction, from the web app.
**Current focus:** Phase 14 — websocket-optimization

## Current Position

Phase: 14 (websocket-optimization) — EXECUTING
Plan: 2 of 2 (complete)

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
| Phase 12 P02 | 10m | 2 tasks | 6 files |
| Phase 13 P01 | 4m | 2 tasks | 5 files |
| Phase 13 P02 | 15 | 2 tasks | 6 files |
| Phase 13 P02 | 45 | 3 tasks | 7 files |
| Phase 14 P02 | 3m | 2 tasks | 2 files |
| Phase 14 P01 | 4m | 2 tasks | 2 files |

## Accumulated Context

### Decisions

- [v1.1]: Cross-origin code before infrastructure — prevented debugging CORS + infra simultaneously
- [v1.1]: Session-mode Supabase pooler — Drizzle prepared statements break on transaction-mode
- [v1.1]: Redis optional with graceful degradation — no hard dependency
- [v1.2]: Phase 10 before Phase 11 — isMutating guard must exist before staleTime is raised or WS race window widens
- [v1.2]: MAUTH uses bearer() plugin strategy (not Vercel proxy) — solves both HTTP and WS auth in one pass
- [13-01]: bearer() plugin added unconditionally — only activates when Authorization: Bearer header is present, cookie-only flows unaffected
- [13-01]: authorizeUpgrade exported for unit testing — low risk, only adds a named export from module
- [13-01]: source="bearer_session" added to actor to distinguish bearer from cookie sessions in logs
- [10-01]: createOptimisticSubtaskStub omits "as Issue" cast — TypeScript satisfied structurally via all required fields
- [10-01]: updateIssue patches both assignee and status optimistically via key-presence detection to cover all callers
- [Phase 10]: Guard suppresses only issue list and detail keys — non-optimistic keys (comments, activity, runs, attachments) always invalidated
- [Phase 10]: Three mutation key prefixes (issue-status, issue-update, create-subtask) match exactly the keys set in Plan 01 IssueDetail.tsx
- [Phase 10-02]: Guard suppresses only issue list and detail keys — non-optimistic keys (comments, activity, runs, attachments) always invalidated
- [Phase 10-02]: Three mutation key prefixes (issue-status, issue-update, create-subtask) match exactly the keys set in Plan 01 IssueDetail.tsx
- [12-01]: Mock IssuesList in Issues.test.tsx to avoid useDialog context — test goal is query options not render output
- [12-01]: Mock InlineEditor/sandpack components in IssueDetail.test.tsx — stitches CSS insertRule fails in jsdom
- [12-01]: Per-query staleTime 120_000 overrides global 30s default for issue list and detail queries only; polling queries unchanged
- [Phase 12-02]: listAssignedToMe placed outside isMutating guard — filtered list not touched by optimistic writes, always safe to invalidate alongside listMineByMe/listTouchedByMe/listUnreadTouchedByMe
- [Phase 12-02]: IssueDetail/Issues tests use useMutation capture pattern to invoke onSettled/onSuccess callbacks and verify listAssignedToMe invalidation without rendering full mutation lifecycle
- [Phase 13-02]: getBearerHeaders/handle401 in api-base.ts as single source of truth for bearer token logic; signOut does not call handle401() — redirect handled by UI router
- [Phase 13-02]: encodeURIComponent() mandatory for WS token param — BetterAuth signed tokens contain . + = URL-special chars that corrupt query string parsing
- [Phase 13-02]: vercel.json rewrites replaced with routes + filesystem handle — rewrites cannot coexist with routes; filesystem handle required for static asset serving
- [Phase 13-02]: handle401() redirects to /auth (not /login) — matches actual app auth route; discovered during iOS Safari verification
- [Phase 13-02]: Token capture reads set-auth-token header before body consumption — CORS exposedHeaders must include set-auth-token for browser to surface it to JS
- [Phase 14]: scheduleHeartbeat defined inside connect() not useEffect top-level — nextSocket must be captured in closure, clearHeartbeat stays at useEffect level
- [Phase 14]: queryKey ['issues', 'detail'] prefix matching invalidates ALL issue detail queries on reconnect without iterating known IDs
- [Phase 14]: invalidateOnReconnect skips agent, cost, heartbeat, run queries — only issue-visible data needs reconnect recovery
- [Phase 14]: reconnectAttempt > 0 guard ensures initial connection does not fire cache invalidation, only true reconnects do
- [Phase 14-01]: ESM import replaces createRequire for ws — vitest vi.mock cannot intercept createRequire-based require() calls; ESM import goes through vitest's module system enabling mock spy assertion

### Pending Todos

None.

### Blockers/Concerns

- [Phase 12]: WS user Bearer token auth path does not exist in `live-events-ws.ts` — requires BetterAuth session resolution audit before coding begins
- [Phase 12]: iOS Safari ITP verification requires a real iPhone with default privacy settings — Simulator does not enforce ITP
- [Phase 13]: `publishLiveEvent` payload completeness unknown — `setQueryData` fast-path may require server-side payload expansion; audit in Phase 13 planning

## Session Continuity

Last session: 2026-04-06T01:45:32.338Z
Stopped at: Completed 14-01-PLAN.md
Resume file: None
