---
phase: 13
slug: mobile-cross-origin-auth
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-05
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (server + ui) |
| **Config file** | `server/vitest.config.ts` / `ui/vite.config.ts` |
| **Quick run command** | `cd /Users/pacosemino/Desktop/Paperclip/paperclip && npx --prefix server vitest run --testPathPattern=auth --passWithNoTests` |
| **Full suite command** | `cd /Users/pacosemino/Desktop/Paperclip/paperclip && npx --prefix server vitest run --passWithNoTests && npx --prefix ui vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx --prefix server vitest run --testPathPattern=auth --passWithNoTests`
- **After every plan wave:** Run `npx --prefix server vitest run --passWithNoTests && npx --prefix ui vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | MAUTH-01, MAUTH-03 | unit | `npx --prefix server vitest run src/__tests__/actor-middleware-bearer-session.test.ts` | W0 | pending |
| 13-01-02 | 01 | 1 | MAUTH-04 | unit | `npx --prefix server vitest run src/__tests__/live-events-ws-user-session.test.ts` | W0 | pending |
| 13-02-01 | 02 | 2 | MAUTH-01, MAUTH-02 | integration | `npx --prefix ui vitest run` | existing | pending |
| 13-02-02 | 02 | 2 | MAUTH-04, MAUTH-05 | smoke | `node -e "const v = require('./vercel.json'); ..." && grep -c encodeURIComponent ui/src/context/LiveUpdatesProvider.tsx` | existing | pending |
| 13-02-03 | 02 | 2 | MAUTH-01, MAUTH-02 | e2e-manual | manual -- iOS/Android device verification | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [x] `server/src/__tests__/actor-middleware-bearer-session.test.ts` -- created as TDD in Plan 01 Task 1
- [x] `server/src/__tests__/live-events-ws-user-session.test.ts` -- created as TDD in Plan 01 Task 2

*Both test files are created as part of Plan 01's TDD tasks (tdd="true"), which write tests before implementation. Wave 0 is satisfied by Plan 01's test-first approach.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| iOS Safari sign-in with ITP enabled | MAUTH-01 | iOS Simulator does not enforce ITP; requires real device or BrowserStack | 1. Open Safari on real iPhone with default privacy settings. 2. Navigate to app URL. 3. Sign in. 4. Navigate to another page. 5. Confirm still logged in. |
| Android Chrome sign-in | MAUTH-02 | Requires real device or emulator with Chrome | 1. Open Chrome on Android. 2. Navigate to app URL. 3. Sign in. 4. Navigate pages. 5. Confirm session persists. |
| Bearer token WebSocket updates | MAUTH-04 | Real-time behavior requires live WS connection | Sign in as mobile user, observe task/agent updates arrive in real-time via WS. |
| 401 redirect to /login | MAUTH-01 | Requires browser environment with window.location | Corrupt token in localStorage, refresh page, confirm redirect to /login. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved
