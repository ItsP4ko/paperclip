---
phase: 14
slug: websocket-optimization
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-05
audited: 2026-04-05
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (frontend + backend) |
| **Config file** | `ui/vitest.config.ts` / `server/vitest.config.ts` |
| **Quick run command** | `cd ui && npx vitest run --reporter=verbose src/context/LiveUpdatesProvider.test.ts` |
| **Full suite command** | `cd ui && npx vitest run && cd ../server && npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd ui && npx vitest run --reporter=verbose src/context/LiveUpdatesProvider.test.ts`
- **After every plan wave:** Run `cd ui && npx vitest run && cd ../server && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | WS-02 | unit | `cd server && npx vitest run --reporter=verbose src/__tests__/live-events-ws-user-session.test.ts` | ✅ | ✅ green |
| 14-01-02 | 01 | 1 | WS-02 | unit | `cd server && npx vitest run --reporter=verbose src/__tests__/live-events-ws-user-session.test.ts` | ✅ | ✅ green |
| 14-02-01 | 02 | 1 | WS-01 | unit | `cd ui && npx vitest run --reporter=verbose src/context/LiveUpdatesProvider.test.ts` | ✅ | ✅ green |
| 14-02-02 | 02 | 2 | WS-03 | unit | `cd ui && npx vitest run --reporter=verbose src/context/LiveUpdatesProvider.test.ts` | ✅ | ✅ green |

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** 2026-04-05

---

## Validation Audit 2026-04-05

| Metric | Count |
|--------|-------|
| Gaps found | 3 |
| Resolved | 3 |
| Escalated | 0 |

**Gaps resolved:**
1. Backend runner corrected from `jest` → `vitest` (server uses `vitest.config.ts`)
2. Requirement mapping corrected: plan 01 → WS-02, plan 02 → WS-01 + WS-03
3. All task statuses updated to ✅ green (13 frontend + 6 backend tests confirmed passing)
