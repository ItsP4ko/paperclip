---
phase: 2
slug: task-work-surface
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (both frontend and backend) |
| **Config file** | `ui/vitest.config.ts` / `server/vitest.config.ts` |
| **Quick run command (UI)** | `pnpm --filter @paperclipai/ui vitest run` |
| **Quick run command (server)** | `pnpm --filter @paperclipai/server vitest run` |
| **Full suite command** | `pnpm vitest run` (from repo root) |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @paperclipai/ui vitest run` and/or `pnpm --filter @paperclipai/server vitest run` depending on what changed
- **After every plan wave:** Run both commands
- **Before `/gsd:verify-work`:** Full suite must be green (`pnpm vitest run`)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | ASGN-03, ACTN-05 | unit | `pnpm --filter @paperclipai/ui vitest run ui/src/lib/assignees.test.ts --reporter=verbose` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 1 | ACTN-01 | unit | `pnpm --filter @paperclipai/ui vitest run ui/src/components/__tests__/HumanActionBar.test.tsx --reporter=verbose` | ❌ W0 | ⬜ pending |
| 2-03-01 | 03 | 2 | PERM-01/PERM-02 | integration | `pnpm --filter @paperclipai/server vitest run server/src/__tests__/issue-member-permission.test.ts --reporter=verbose` | ❌ W0 | ⬜ pending |
| 2-03-02 | 03 | 2 | TASKS-03 | unit | `pnpm --filter @paperclipai/ui vitest run --reporter=verbose` | ✅ (full suite) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `ui/src/lib/assignees.test.ts` — unit tests for `resolveAssigneePatch` (ASGN-03/ACTN-05); created by Plan 02-01 Task 1 TDD
- [ ] `ui/src/components/__tests__/HumanActionBar.test.tsx` — renders/hides HumanActionBar based on assignee match (ACTN-01); created by Plan 02-02 Task 1 TDD
- [ ] `server/src/__tests__/issue-member-permission.test.ts` — integration tests for PERM-01/PERM-02 member gate; created by Plan 02-03 Task 1 TDD

*Existing vitest infrastructure covers the framework; no new install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| AI run interruption warning dialog appears before reassign | ACTN-05 | Visual confirmation of dialog text and context surfacing | Open issue with running AI, click reassign, verify warning dialog shows AI activity |
| File attachment uploads without error in browser | ACTN-02 | File upload requires real browser + network | Attach a file to an issue assigned to logged-in user; verify no error toast |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
