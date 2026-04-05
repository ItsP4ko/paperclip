---
phase: 8
slug: api-hardening-redis
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x |
| **Config file** | `backend/jest.config.ts` |
| **Quick run command** | `cd backend && npx jest --testPathPattern` |
| **Full suite command** | `cd backend && npx jest` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest --testPathPattern`
- **After every plan wave:** Run `cd backend && npx jest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | HARD-01 | integration | `npx jest --testPathPattern helmet` | ❌ W0 | ⬜ pending |
| 08-01-02 | 01 | 1 | HARD-02 | integration | `npx jest --testPathPattern rate-limit` | ❌ W0 | ⬜ pending |
| 08-01-03 | 01 | 1 | HARD-03 | integration | `npx jest --testPathPattern rate-limit.*redis` | ❌ W0 | ⬜ pending |
| 08-02-01 | 02 | 1 | REDIS-01 | unit | `npx jest --testPathPattern redis-client` | ❌ W0 | ⬜ pending |
| 08-02-02 | 02 | 1 | REDIS-02 | integration | `npx jest --testPathPattern redis.*reconnect` | ❌ W0 | ⬜ pending |
| 08-02-03 | 02 | 2 | REDIS-03 | integration | `npx jest --testPathPattern cache` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/__tests__/helmet.test.ts` — stubs for HARD-01 security header assertions
- [ ] `backend/src/__tests__/rate-limit.test.ts` — stubs for HARD-02, HARD-03 rate limiting
- [ ] `backend/src/__tests__/redis-client.test.ts` — stubs for REDIS-01, REDIS-02 connection/reconnect
- [ ] `backend/src/__tests__/cache.test.ts` — stubs for REDIS-03 cache hit verification

*Existing jest infrastructure covers framework needs. Test files need creation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Rate limit counters survive Railway restart | HARD-03 | Requires Railway container restart | Deploy, hit rate limit, restart container via Railway dashboard, verify counter persists |
| Redis connects on Railway private network | REDIS-01 | Requires Railway network environment | Deploy and verify Redis connection logs show private network address |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
