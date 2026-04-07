---
phase: 12-aggressive-caching
plan: "02"
subsystem: ui-cache-invalidation
tags:
  - react-query
  - cache-invalidation
  - my-tasks
  - bug-fix
dependency_graph:
  requires:
    - 12-01 (staleTime configuration for issue queries)
  provides:
    - listAssignedToMe invalidation at all WS and mutation call-sites
  affects:
    - ui/src/context/LiveUpdatesProvider.tsx
    - ui/src/pages/IssueDetail.tsx
    - ui/src/pages/Issues.tsx
tech_stack:
  added: []
  patterns:
    - TDD red-green cycle for cache invalidation assertions
    - useMutation capture pattern for testing closure callbacks
key_files:
  created: []
  modified:
    - ui/src/context/LiveUpdatesProvider.tsx
    - ui/src/pages/IssueDetail.tsx
    - ui/src/pages/Issues.tsx
    - ui/src/context/LiveUpdatesProvider.test.ts
    - ui/src/pages/IssueDetail.test.tsx
    - ui/src/pages/Issues.test.tsx
decisions:
  - listAssignedToMe placed outside isMutating guard — same pattern as listMineByMe/listTouchedByMe/listUnreadTouchedByMe since it is a filtered list not touched by optimistic writes
  - IssueDetail test uses useMutation capture pattern to invoke onSettled callback and verify invalidateQueries calls
  - Issues test captures first useMutation call (updateIssue) and invokes onSuccess directly
metrics:
  duration: "10m"
  completed_date: "2026-04-05T22:11:03Z"
  tasks_completed: 2
  files_modified: 6
requirements_satisfied:
  - CACHE-03
  - CACHE-04
---

# Phase 12 Plan 02: listAssignedToMe Cache Invalidation Summary

**One-liner:** Added `listAssignedToMe` query invalidation to WS activity handler, `invalidateIssue()`, and `updateIssue.onSuccess` — fixing My Tasks empty-render bug (CACHE-03) and stale-data after mutation (CACHE-04).

## What Was Built

Three production call-sites were patched to include `queryKeys.issues.listAssignedToMe` invalidation, eliminating the root cause of two cache staleness bugs:

- **CACHE-03 (My Tasks empty render):** The My Tasks page queried `listAssignedToMe` but `LiveUpdatesProvider` never invalidated it on `activity.logged` WS events. The page appeared empty despite the sidebar badge showing task counts because the cache was never refreshed.
- **CACHE-04 (stale data after mutation):** After assignment changes in IssueDetail or status changes in Issues list, `listAssignedToMe` was not flushed, so My Tasks showed stale assignments until manual browser refresh.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add test assertions for listAssignedToMe invalidation (RED) | 0dbdf61c | LiveUpdatesProvider.test.ts, IssueDetail.test.tsx, Issues.test.tsx |
| 2 | Add listAssignedToMe invalidation to all three call-sites (GREEN) | 5431d7c7 | LiveUpdatesProvider.tsx, IssueDetail.tsx, Issues.tsx |

## Changes Made

### LiveUpdatesProvider.tsx — `invalidateActivityQueries`

Added `listAssignedToMe` alongside the other always-invalidated filtered list queries (outside the `isMutating` guard):

```typescript
// These filtered lists are not directly patched by optimistic writes — always safe
queryClient.invalidateQueries({ queryKey: queryKeys.issues.listMineByMe(companyId) });
queryClient.invalidateQueries({ queryKey: queryKeys.issues.listTouchedByMe(companyId) });
queryClient.invalidateQueries({ queryKey: queryKeys.issues.listUnreadTouchedByMe(companyId) });
queryClient.invalidateQueries({ queryKey: queryKeys.issues.listAssignedToMe(companyId) }); // added
```

### IssueDetail.tsx — `invalidateIssue()`

Added inside the `if (selectedCompanyId)` block:

```typescript
queryClient.invalidateQueries({ queryKey: queryKeys.issues.listAssignedToMe(selectedCompanyId) });
```

### Issues.tsx — `updateIssue.onSuccess`

Added second invalidation call:

```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
  queryClient.invalidateQueries({ queryKey: queryKeys.issues.listAssignedToMe(selectedCompanyId!) }); // added
},
```

## Test Coverage

6 test files total: 3 extended with new assertions, 3 production files patched.

New test assertions:
- `LiveUpdatesProvider.test.ts`: 2 new tests — `listAssignedToMe` invalidated when `isMutating=0` and when `isMutating=1`
- `IssueDetail.test.tsx`: 1 new test — `invalidateIssue()` includes `listAssignedToMe` (via `updateIssue.onSettled` capture)
- `Issues.test.tsx`: 1 new test — `updateIssue.onSuccess` includes `listAssignedToMe`

All 15 UI tests pass. Pre-existing `relaycontrol` CLI e2e failures (spawn pnpm) are unrelated.

## Deviations from Plan

None — plan executed exactly as written.

## Key Decisions

1. **`listAssignedToMe` outside `isMutating` guard** — This filtered list is not touched by optimistic writes (which only patch `issues.detail` and `issues.list`). Placing it alongside `listMineByMe`/`listTouchedByMe`/`listUnreadTouchedByMe` ensures it is always refreshed when WS activity fires, regardless of mutation state.

2. **useMutation capture pattern for IssueDetail test** — Since `invalidateIssue` is a closure inside the component, the test mocks `useMutation` to capture the options passed on each call, then invokes the `onSettled` callback directly. This avoids the complexity of triggering a real mutation through the UI.

## Self-Check: PASSED

- FOUND: ui/src/context/LiveUpdatesProvider.tsx
- FOUND: ui/src/pages/IssueDetail.tsx
- FOUND: ui/src/pages/Issues.tsx
- FOUND: .planning/phases/12-aggressive-caching/12-02-SUMMARY.md
- FOUND commit: 0dbdf61c (RED phase tests)
- FOUND commit: 5431d7c7 (GREEN phase production changes)
