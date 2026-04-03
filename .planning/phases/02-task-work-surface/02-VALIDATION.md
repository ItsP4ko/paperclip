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
| **Framework** | vitest (frontend) + jest (backend) |
| **Config file** | `frontend/vite.config.ts` / `backend/jest.config.ts` |
| **Quick run command** | `cd backend && npm test -- --testPathPattern="02-"` |
| **Full suite command** | `cd backend && npm test && cd ../frontend && npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npm test -- --testPathPattern="02-"`
- **After every plan wave:** Run `cd backend && npm test && cd ../frontend && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | ASGN-03 | unit | `cd backend && npm test -- --testPathPattern="setAssignee"` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | ACTN-04/ACTN-05 | unit | `cd frontend && npm test -- --testPathPattern="reassign"` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 1 | ACTN-01 | unit | `cd frontend && npm test -- --testPathPattern="IssueDetail"` | ✅ | ⬜ pending |
| 2-02-02 | 02 | 1 | ACTN-02 | integration | `cd backend && npm test -- --testPathPattern="attachment"` | ✅ | ⬜ pending |
| 2-02-03 | 02 | 1 | ACTN-03 | integration | `cd backend && npm test -- --testPathPattern="subtask"` | ✅ | ⬜ pending |
| 2-03-01 | 03 | 2 | PERM-01/PERM-02 | unit | `cd backend && npm test -- --testPathPattern="permission"` | ❌ W0 | ⬜ pending |
| 2-03-02 | 03 | 2 | TASKS-03 | unit | `cd frontend && npm test -- --testPathPattern="assigned-to-me"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/routes/__tests__/02-setAssignee.test.ts` — stubs for ASGN-03
- [ ] `frontend/src/__tests__/02-reassign-warning.test.tsx` — stubs for ACTN-04/ACTN-05
- [ ] `backend/src/routes/__tests__/02-permission-gate.test.ts` — stubs for PERM-01/PERM-02
- [ ] `frontend/src/__tests__/02-assigned-to-me-filter.test.tsx` — stubs for TASKS-03

*Existing vitest/jest infrastructure covers the framework; no new install needed.*

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
