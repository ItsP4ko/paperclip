---
phase: 10-optimistic-ui-mutations
plan: 01
subsystem: ui
tags: [optimistic-ui, react-query, mutations, tanstack-query]
dependency_graph:
  requires: []
  provides: [optimistic-issue-mutations-utilities, rewired-issue-mutations-with-lifecycle]
  affects: [ui/src/pages/IssueDetail.tsx, ui/src/lib/optimistic-issue-mutations.ts]
tech_stack:
  added: []
  patterns: [tanstack-query-optimistic-updates, onMutate-onError-onSettled-pattern, pure-utility-functions]
key_files:
  created:
    - ui/src/lib/optimistic-issue-mutations.ts
    - ui/src/lib/optimistic-issue-mutations.test.ts
  modified:
    - ui/src/pages/IssueDetail.tsx
decisions:
  - "createOptimisticSubtaskStub omits 'as Issue' cast — TypeScript satisfied structurally via all required fields"
  - "updateIssue optimistically patches both assignee and status via key-presence detection to cover all callers"
  - "Pre-existing TypeScript errors in Analytics.tsx and Pipeline pages are out-of-scope deferred items"
metrics:
  duration: "~3 min"
  completed_date: "2026-04-05"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 10 Plan 01: Optimistic Issue Mutations — Utility Library and Rewired Mutations Summary

**One-liner:** Pure optimistic cache-patch utilities (applyOptimisticStatus, applyOptimisticAssignee, createOptimisticSubtaskStub) with full onMutate/onError/onSettled lifecycle hooks wired into IssueDetail.tsx's three target mutations.

## What Was Built

### Utility Library (`ui/src/lib/optimistic-issue-mutations.ts`)

Three exported pure functions:
- `applyOptimisticStatus(issue, status)` — returns new Issue with updated status, no-ops on undefined
- `applyOptimisticAssignee(issue, assignee)` — returns new Issue with updated assignee fields, no-ops on undefined
- `createOptimisticSubtaskStub(params)` — creates a complete Issue stub for optimistic subtask display before server confirmation

### Test Suite (`ui/src/lib/optimistic-issue-mutations.test.ts`)

10 unit tests covering: status update, identity preservation (new object returned), undefined handling, user/agent assignee variants, stub id format, stub field correctness, and stub id uniqueness.

### Rewired Mutations in `ui/src/pages/IssueDetail.tsx`

Three mutations upgraded with full optimistic lifecycle:

**updateIssue** (`mutationKey: ["issue-update", issueId]`)
- onMutate: cancels queries, snapshots, patches cache for assignee changes and status changes
- onError: rolls back to snapshot, shows "Update failed" toast
- onSettled: calls invalidateIssue() for full refresh

**updateStatus** (`mutationKey: ["issue-status", issueId]`)
- onMutate: cancels detail query, snapshots, immediately patches status in cache
- onError: rolls back to snapshot, shows "Status update failed" toast
- onSettled: invalidates detail + list queries

**createSubtask** (`mutationKey: ["create-subtask", issueId]`)
- onMutate: cancels list query, snapshots list, appends optimistic stub to list
- onSuccess: clears subtask input state
- onError: rolls back list to snapshot, shows subtask error
- onSettled: invalidates detail + list queries

## Verification

- `cd ui && npx vitest run` — 185 tests pass (39 test files)
- `grep -n "mutationKey" ui/src/pages/IssueDetail.tsx` — shows 3 matches: issue-update, issue-status, create-subtask
- No TypeScript errors in modified files (pre-existing errors in Analytics.tsx and Pipeline pages are out of scope)

## Deviations from Plan

None — plan executed exactly as written.

## Deferred Items

- Pre-existing TypeScript error in `src/pages/Analytics.tsx:194` — type unknown not assignable to ReactNode (not introduced by this plan)
- Pre-existing TypeScript errors in Pipeline pages (missing queryKeys.pipelines) — not introduced by this plan

## Self-Check

- [x] `ui/src/lib/optimistic-issue-mutations.ts` exists
- [x] `ui/src/lib/optimistic-issue-mutations.test.ts` exists
- [x] All three mutationKeys present in IssueDetail.tsx
- [x] Task 1 commit: 6c580be8
- [x] Task 2 commit: 8e4966ff
- [x] 185/185 tests pass
