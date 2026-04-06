---
phase: 14
slug: websocket-optimization
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (frontend), jest (backend) |
| **Config file** | `ui/vitest.config.ts` / `server/jest.config.ts` |
| **Quick run command** | `cd ui && npx vitest run --reporter=verbose src/context/LiveUpdatesProvider.test.ts` |
| **Full suite command** | `cd ui && npx vitest run && cd ../server && npx jest` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd ui && npx vitest run --reporter=verbose src/context/LiveUpdatesProvider.test.ts`
- **After every plan wave:** Run `cd ui && npx vitest run && cd ../server && npx jest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | WS-01 | unit | `cd ui && npx vitest run src/context/LiveUpdatesProvider.test.ts` | ✅ | ⬜ pending |
| 14-01-02 | 01 | 1 | WS-01 | unit | `cd ui && npx vitest run src/context/LiveUpdatesProvider.test.ts` | ✅ | ⬜ pending |
| 14-02-01 | 02 | 1 | WS-02 | unit | `cd server && npx jest live-events-ws-user-session` | ✅ | ⬜ pending |
| 14-02-02 | 02 | 2 | WS-03 | unit | `cd ui && npx vitest run src/context/LiveUpdatesProvider.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dead connection detected within 25s on Easypanel | WS-01 | Requires live network drop simulation | 1. Open app on Easypanel. 2. Disable network for 20s. 3. Re-enable — observe reconnect without page reload. |
| Latency measurably lower with perMessageDeflate=false | WS-02 | Requires live deployment measurement | 1. Measure WS round-trip before. 2. Deploy change. 3. Measure after. Compare values. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
