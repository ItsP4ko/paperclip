---
phase: 15
slug: auth-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-06
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `server/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @paperclipai/server exec vitest run --reporter=verbose src/__tests__/login-rate-limit.test.ts src/__tests__/ws-token-redaction.test.ts` |
| **Full suite command** | `pnpm test:run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @paperclipai/server exec vitest run src/__tests__/login-rate-limit.test.ts src/__tests__/ws-token-redaction.test.ts`
- **After every plan wave:** Run `pnpm test:run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 0 | AUTH-01 | unit | `pnpm --filter @paperclipai/server exec vitest run src/__tests__/login-rate-limit.test.ts` | ❌ W0 | ⬜ pending |
| 15-01-02 | 01 | 0 | AUTH-05 | unit | `pnpm --filter @paperclipai/server exec vitest run src/__tests__/ws-token-redaction.test.ts` | ❌ W0 | ⬜ pending |
| 15-01-03 | 01 | 1 | AUTH-01 | unit | `pnpm --filter @paperclipai/server exec vitest run src/__tests__/login-rate-limit.test.ts` | ❌ W0 | ⬜ pending |
| 15-02-01 | 02 | 1 | AUTH-05 | unit | `pnpm --filter @paperclipai/server exec vitest run src/__tests__/ws-token-redaction.test.ts` | ❌ W0 | ⬜ pending |
| 15-03-01 | 03 | 2 | AUTH-02 | integration | `pnpm test:run` | ✅ (BetterAuth) | ⬜ pending |
| 15-03-02 | 03 | 2 | AUTH-03 | integration | `pnpm --filter @paperclipai/server exec vitest run src/__tests__/better-auth-cookies.test.ts` | ✅ (partial) | ⬜ pending |
| 15-03-03 | 03 | 2 | AUTH-04 | integration | `pnpm test:run` | ✅ (partial) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/src/__tests__/login-rate-limit.test.ts` — stubs for AUTH-01 (login limiter returns 429, uses Redis store, mounted before BetterAuth)
- [ ] `server/src/__tests__/ws-token-redaction.test.ts` — stubs for AUTH-05 (token stripped from logged URL, URLs without token unchanged, partial query strings handled)

*(Existing `rate-limit.test.ts` covers the global rate limiter — no changes needed there)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Session list shows device/browser, IP, creation date in UI | AUTH-02 | UI rendering requires browser | Navigate to Account Settings, verify session list renders with correct fields |
| Revoking a session in UI removes it from list | AUTH-03 | Requires active browser session | Login on two devices, revoke one from the other's UI, verify it's gone |
| "Revoke all others" keeps current session active | AUTH-04 | Requires multiple active sessions | Login on two devices, use "Revoke all others", verify current session persists |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
