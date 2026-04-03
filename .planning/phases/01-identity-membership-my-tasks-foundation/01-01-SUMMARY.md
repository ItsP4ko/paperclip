---
phase: 01-identity-membership-my-tasks-foundation
plan: "01"
subsystem: ui
tags: [my-tasks, filter, route, sidebar, tdd]
dependency_graph:
  requires: []
  provides: [my-tasks-page, my-tasks-route, my-tasks-sidebar-nav]
  affects: [ui/src/pages/MyIssues.tsx, ui/src/App.tsx, ui/src/components/Sidebar.tsx]
tech_stack:
  added: []
  patterns: [useQuery with server-side filter, SidebarNavItem with badge slot]
key_files:
  created:
    - ui/src/pages/MyIssues.test.tsx
  modified:
    - ui/src/pages/MyIssues.tsx
    - ui/src/App.tsx
    - ui/src/components/Sidebar.tsx
decisions:
  - "Client-side assigneeAgentId/status filter removed; server-side assigneeUserId=me handles all filtering"
  - "badges?.myTasks undefined until Plan 03 ships backend field — intentional, SidebarNavItem hides badge when undefined"
metrics:
  duration: "6m 35s"
  completed_date: "2026-04-03"
  tasks_completed: 2
  files_modified: 4
---

# Phase 01 Plan 01: My Tasks Page Foundation Summary

**One-liner:** Server-side assigneeUserId=me filter on MyIssues page, /my-tasks route, and My Tasks sidebar nav item with badge slot wired to sidebarBadgesApi.

## What Was Built

Fixed the MyIssues page to use server-side user filtering, registered the `/my-tasks` route, and added the My Tasks sidebar nav item in the Work section. All copy updated from "Issues" to "Tasks" per the UI-SPEC contract.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Write MyIssues unit test (TDD) and fix filter + copy | baf58103 | MyIssues.tsx, MyIssues.test.tsx |
| 2 | Register /my-tasks route in App.tsx and add sidebar nav item | a08d1258 | App.tsx, Sidebar.tsx |

## Key Changes

**MyIssues.tsx:**
- `queryKey` changed from `queryKeys.issues.list(...)` to `queryKeys.issues.listAssignedToMe(...)`
- `queryFn` now passes `{ assigneeUserId: "me" }` filter to `issuesApi.list`
- Client-side `filter((i) => !i.assigneeAgentId && ...)` removed entirely
- Breadcrumb label: "My Issues" → "My Tasks"
- Empty state messages updated to use "tasks" copy

**App.tsx:**
- Added `import { MyIssues } from "./pages/MyIssues"`
- Added `<Route path="my-tasks" element={<MyIssues />} />` before the issues route

**Sidebar.tsx:**
- Added `ListTodo` to lucide-react import
- Added `sidebarBadgesApi` import from `../api/sidebarBadges`
- Added `useQuery` for `sidebarBadges` using `queryKeys.sidebarBadges`
- Added `<SidebarNavItem to="/my-tasks" label="My Tasks" icon={ListTodo} badge={badges?.myTasks} />` after Issues in Work section

## Verification Results

- `pnpm vitest run` (UI project): 35/35 UI tests pass, including new MyIssues.test.tsx
- `grep assigneeUserId MyIssues.tsx`: confirmed present
- `grep my-tasks App.tsx`: confirmed route registered
- `grep "My Tasks" Sidebar.tsx`: confirmed nav item present
- 3 pre-existing server/e2e test failures (plugin-sdk not built, unrelated to this plan)

## Deviations from Plan

None — plan executed exactly as written.

## Decisions Made

1. **Client-side filter removed entirely:** The old `filter((i) => !i.assigneeAgentId && !["done","cancelled"].includes(i.status))` was removed as the plan specified. The server handles `assigneeUserId=me` filtering; displaying all statuses is intentional per the plan spec ("the user may want to see done tasks").

2. **badges?.myTasks intentionally undefined:** The `badges?.myTasks` field will be `undefined` until Plan 03 ships the backend `myTasks` count. `SidebarNavItem` renders no badge when the value is `undefined` or `0` — this is the correct "badge slot wired but dormant" behavior.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| ui/src/pages/MyIssues.tsx | FOUND |
| ui/src/pages/MyIssues.test.tsx | FOUND |
| ui/src/App.tsx | FOUND |
| ui/src/components/Sidebar.tsx | FOUND |
| .planning/phases/01-.../01-01-SUMMARY.md | FOUND |
| commit baf58103 (Task 1) | FOUND |
| commit a08d1258 (Task 2) | FOUND |
