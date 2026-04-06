---
phase: 16
slug: api-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-06
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (server test suite) |
| **Config file** | `server/vitest.config.ts` (or jest equivalent if present) |
| **Quick run command** | `cd server && npm test -- --run` |
| **Full suite command** | `cd server && npm test -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd server && npm test -- --run`
- **After every plan wave:** Run `cd server && npm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | API-01 | integration | `cd server && npm test -- --run --grep "validate.*body"` | ❌ W0 | ⬜ pending |
| 16-01-02 | 01 | 1 | API-02 | integration | `cd server && npm test -- --run --grep "validateQuery"` | ❌ W0 | ⬜ pending |
| 16-02-01 | 02 | 2 | API-03 | integration | `cd server && npm test -- --run --grep "error.*handler"` | ❌ W0 | ⬜ pending |
| 16-02-02 | 02 | 2 | API-04 | manual | n/a (code comment review) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/src/__tests__/validate-middleware.test.ts` — stubs for API-01 (body validation on mutation routes)
- [ ] `server/src/__tests__/validate-query.test.ts` — stubs for API-02 (query param validation)
- [ ] `server/src/__tests__/error-handler.test.ts` — stubs for API-03 (no stack trace in 500 responses)

*Existing test infrastructure assumed; Wave 0 creates missing test files.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CSRF comment present in auth middleware | API-04 | Code comment, not runtime behavior | Read `server/src/middleware/auth.ts` — verify comment in `actorMiddleware` references bearer token architecture + OWASP |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
