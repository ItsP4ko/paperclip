---
phase: 9
slug: gap-closure-ratelimit-e2e
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | server/vitest.config.ts |
| **Quick run command** | `cd server && npx vitest run src/__tests__/rate-limit.test.ts` |
| **Full suite command** | `cd server && npx vitest run` |
| **Estimated runtime** | ~5 seconds (quick), ~30 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `cd server && npx vitest run src/__tests__/rate-limit.test.ts`
- **After every plan wave:** Run `cd server && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | HARD-01, DEPLOY-06 | unit | `cd server && npx vitest run src/__tests__/rate-limit.test.ts` | YES | pending |
| 09-01-02 | 01 | 1 | E2E-04 | manual | Human checkpoint: file attach on live deployment | N/A | pending |
| 09-01-03 | 01 | 1 | E2E-06 | manual | Human checkpoint: two-window WebSocket test | N/A | pending |
| 09-01-04 | 01 | 1 | E2E-04, E2E-05, E2E-06 | grep | `grep -c "\[x\]" .planning/REQUIREMENTS.md` | N/A | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test framework or fixtures needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| File attach persists | E2E-04 | Requires native OS file picker on live deployment | Upload a file to a task on Vercel, reload page, verify file still attached |
| WebSocket real-time | E2E-06 | Requires two browser windows observing same task | Open task in two windows, change status in one, verify update appears in the other without refresh |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or manual checkpoint
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
