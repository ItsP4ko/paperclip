---
phase: 13
slug: mobile-cross-origin-auth
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (frontend) / jest (backend) |
| **Config file** | `frontend/vite.config.ts` / `backend/jest.config.ts` |
| **Quick run command** | `cd backend && npx jest --testPathPattern=auth --passWithNoTests` |
| **Full suite command** | `cd backend && npx jest --passWithNoTests && cd ../frontend && npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPattern=auth --passWithNoTests`
- **After every plan wave:** Run `cd backend && npx jest --passWithNoTests && cd ../frontend && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | MAUTH-01 | integration | `cd backend && npx jest --testPathPattern=auth` | ✅ | ⬜ pending |
| 13-01-02 | 01 | 1 | MAUTH-01 | integration | `cd backend && npx jest --testPathPattern=auth` | ✅ | ⬜ pending |
| 13-01-03 | 01 | 1 | MAUTH-03 | integration | `cd backend && npx jest --testPathPattern=auth` | ✅ | ⬜ pending |
| 13-02-01 | 02 | 1 | MAUTH-04 | integration | `cd backend && npx jest --testPathPattern=ws` | ✅ | ⬜ pending |
| 13-03-01 | 03 | 2 | MAUTH-02 | e2e-manual | manual — iOS/Android device | ❌ W0 | ⬜ pending |
| 13-04-01 | 04 | 1 | MAUTH-05 | smoke | `curl -I https://app.paperclip.so/PAC/dashboard` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/__tests__/auth-bearer.test.ts` — stubs for MAUTH-01, MAUTH-03
- [ ] `backend/src/__tests__/ws-auth.test.ts` — stubs for MAUTH-04

*Existing backend test infrastructure covers base; new test files needed for bearer and WS auth paths.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| iOS Safari sign-in with ITP enabled | MAUTH-01 | iOS Simulator does not enforce ITP; requires real device or BrowserStack | 1. Open Safari on real iPhone with default privacy settings. 2. Navigate to app URL. 3. Sign in. 4. Navigate to another page. 5. Confirm still logged in. |
| Android Chrome sign-in | MAUTH-02 | Requires real device or emulator with Chrome | 1. Open Chrome on Android. 2. Navigate to app URL. 3. Sign in. 4. Navigate pages. 5. Confirm session persists. |
| Bearer token WebSocket updates | MAUTH-04 | Real-time behavior requires live WS connection | Sign in as mobile user, observe task/agent updates arrive in real-time via WS. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
