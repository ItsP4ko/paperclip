---
phase: 10
slug: optimistic-ui-mutations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `ui/vite.config.ts` |
| **Quick run command** | `cd ui && npx vitest run --reporter=verbose 2>&1 | tail -20` |
| **Full suite command** | `cd ui && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd ui && npx vitest run --reporter=verbose 2>&1 | tail -20`
- **After every plan wave:** Run `cd ui && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | OPTM-01 | unit | `cd ui && npx vitest run src/__tests__/optimistic-mutations.test.ts` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | OPTM-02 | unit | `cd ui && npx vitest run src/__tests__/optimistic-mutations.test.ts` | ❌ W0 | ⬜ pending |
| 10-01-03 | 01 | 1 | OPTM-03 | unit | `cd ui && npx vitest run src/__tests__/optimistic-mutations.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 1 | OPTM-04 | unit | `cd ui && npx vitest run src/__tests__/optimistic-mutations.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-02 | 02 | 2 | OPTM-05 | unit | `cd ui && npx vitest run src/__tests__/optimistic-mutations.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `ui/src/__tests__/optimistic-mutations.test.ts` — test stubs for OPTM-01 through OPTM-05
- [ ] Reference: `ui/src/__tests__/optimistic-issue-comments.test.ts` — existing pattern to follow

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Status change appears immediately (no spinner visible) | OPTM-01 | Visual/timing — no DOM-level assertion can reliably test "no spinner visible" in < 100ms | 1. Open any issue. 2. Change status. 3. Confirm new status shows before network resolves. |
| Rollback shows error toast | OPTM-04 | Requires simulated network failure in browser | 1. Open DevTools Network. 2. Throttle to Offline. 3. Change status. 4. Confirm revert + error toast. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
