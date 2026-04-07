---
phase: 12-aggressive-caching
plan: "01"
subsystem: ui/caching
tags: [react-query, staleTime, caching, performance, tdd]
dependency_graph:
  requires: []
  provides: [CACHE-01, CACHE-02]
  affects: [ui/src/pages/Issues.tsx, ui/src/pages/MyIssues.tsx, ui/src/pages/IssueDetail.tsx]
tech_stack:
  added: []
  patterns: [per-query staleTime override, TDD red-green]
key_files:
  created:
    - ui/src/pages/Issues.test.tsx
    - ui/src/pages/IssueDetail.test.tsx
  modified:
    - ui/src/pages/MyIssues.test.tsx
    - ui/src/pages/Issues.tsx
    - ui/src/pages/MyIssues.tsx
    - ui/src/pages/IssueDetail.tsx
decisions:
  - "Mock IssuesList in Issues.test.tsx to avoid useDialog context requirement — test goal is query options, not render output"
  - "Mock InlineEditor, IssueDocumentsSection, IssueWorkspaceCard, etc. in IssueDetail.test.tsx to avoid stitches/sandpack CSS insertRule error in jsdom"
  - "Fix usePluginSlots mock to return { slots: [], hasSlotContent } — IssueDetail useMemo maps over slots array"
metrics:
  duration: "11m"
  completed: "2026-04-05T22:01:00Z"
  tasks_completed: 2
  files_changed: 6
---

# Phase 12 Plan 01: Issue Query staleTime 2-Minute Cache Summary

Per-query `staleTime: 120_000` added to Issues list, MyIssues list, and IssueDetail detail queries using TDD red-green cycle, giving a 2-minute fresh window that eliminates background refetches on re-navigation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create test scaffolds for staleTime assertions (RED) | 348d83ae | Issues.test.tsx, IssueDetail.test.tsx, MyIssues.test.tsx |
| 2 | Add staleTime 120_000 to issue list and detail queries (GREEN) | f8b55bc0 | Issues.tsx, MyIssues.tsx, IssueDetail.tsx |

## What Was Built

Three production pages now have per-query staleTime overrides:

- **Issues.tsx** — `issues.list` query: `staleTime: 120_000` (CACHE-01)
- **MyIssues.tsx** — `listAssignedToMe` query: `staleTime: 120_000` (CACHE-01)
- **IssueDetail.tsx** — `issues.detail` query: `staleTime: 120_000` (CACHE-02)

Polling queries (`liveRuns` at 3s, `activeRun` at 3s, `linkedRuns` at 5s) were explicitly left unmodified.

The global QueryClient default (`staleTime: 30_000` in `main.tsx`) is unchanged — the per-query overrides only apply to these three specific calls.

## Test Coverage

- `Issues.test.tsx` — asserts `issues.list` query captures `staleTime: 120_000`
- `IssueDetail.test.tsx` — two tests: detail query has staleTime; polling queries do NOT have staleTime 120_000
- `MyIssues.test.tsx` — extended with `listAssignedToMe` staleTime assertion

All 6 staleTime-related tests pass. Two original MyIssues tests continue to pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] IssuesList useDialog context error in Issues.test.tsx**
- **Found during:** Task 1 (RED verification)
- **Issue:** `Issues.tsx` renders `<IssuesList>` which calls `useDialog` hook that requires a `DialogProvider` context — absent in test environment
- **Fix:** Mocked `../components/IssuesList` as a simple `<div>` — the test goal is asserting `useQuery` options, not validating IssuesList render
- **Files modified:** ui/src/pages/Issues.test.tsx
- **Commit:** 348d83ae

**2. [Rule 1 - Bug] stitches/sandpack CSS insertRule error in IssueDetail.test.tsx**
- **Found during:** Task 1 (RED verification)
- **Issue:** `IssueDetail.tsx` imports `InlineEditor` → `@mdxeditor/editor` → `@codesandbox/sandpack-react` which uses `@stitches/core` that calls `CSSStyleSheet.insertRule` with custom property syntax (`--sxs{}`) that jsdom's CSSOM parser rejects at module load time
- **Fix:** Mocked `InlineEditor`, `IssueDocumentsSection`, `CommentThread`, `IssueWorkspaceCard`, `LiveRunWidget`, `ImageGalleryModal` as empty divs
- **Files modified:** ui/src/pages/IssueDetail.test.tsx
- **Commit:** 348d83ae

**3. [Rule 1 - Bug] usePluginSlots mock missing slots array**
- **Found during:** Task 1 (RED verification)
- **Issue:** `IssueDetail.tsx` line 436 does `issuePluginDetailSlots.map(...)` — mock returned `{ hasSlotContent: () => false }` without `slots` array, causing `TypeError: Cannot read properties of undefined (reading 'map')`
- **Fix:** Updated mock to `{ slots: [], hasSlotContent: () => false }`
- **Files modified:** ui/src/pages/IssueDetail.test.tsx
- **Commit:** 348d83ae

## Self-Check: PASSED
