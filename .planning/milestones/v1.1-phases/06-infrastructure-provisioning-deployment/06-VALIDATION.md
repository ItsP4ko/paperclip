---
phase: 6
slug: infrastructure-provisioning-deployment
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x (workspace config in `vitest.config.ts`) |
| **Config file** | `vitest.config.ts` at repo root; projects include `server` and `ui` |
| **Quick run command** | `pnpm --filter @paperclipai/server vitest run src/__tests__/health.test.ts` |
| **Full suite command** | `pnpm vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run the 5 targeted tests (health, cors, hostname-guard, better-auth-cookies, board-mutation-guard) — < 30s total
- **After every plan wave:** Run `pnpm --filter @paperclipai/server vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green + manual smoke test (curl + browser sign-in)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | DEPLOY-09 | manual (SQL apply) | `SELECT count(*) FROM information_schema.tables WHERE table_schema='public'` returns ~40+ tables | N/A — manual | ⬜ pending |
| 06-01-02 | 01 | 1 | DEPLOY-10 | smoke | `curl https://<railway-app>/api/health` — checks db connectivity | health.ts:33 ✅ | ⬜ pending |
| 06-01-03 | 01 | 1 | DEPLOY-11 | smoke | Backend boot without schema errors (Railway logs) | N/A — manual | ⬜ pending |
| 06-02-01 | 02 | 1 | DEPLOY-05 | manual (deploy) | `curl https://<railway-app>/api/health` returns 200 | N/A — manual | ⬜ pending |
| 06-02-02 | 02 | 1 | DEPLOY-07 | manual (config) | Visual check in Railway Variables tab | N/A — manual | ⬜ pending |
| 06-03-01 | 03 | 2 | AUTH-05 | manual (e2e) | POST `VITE_API_URL/api/auth/sign-up/email` then GET `/api/auth/get-session` | N/A — manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test stubs needed.

Phase 6 is infrastructure-only — requirements are validated by manual operational checks (curl, browser sign-in, dashboard inspection) plus the 5 pre-existing automated tests that cover code paths this phase depends on:

- `health.test.ts` — `/api/health` returns 200
- `cors-middleware.test.ts` — CORS allows credentialed cross-origin requests
- `private-hostname-guard.test.ts` — hostname guard blocks/allows correctly
- `better-auth-cookies.test.ts` — `SameSite=None; Secure` cookie attributes
- `board-mutation-guard.test.ts` — CSRF guard allows allowed origins

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Supabase schema migrated | DEPLOY-09, DEPLOY-11 | Requires live Supabase instance | Apply all 49 migration files via Supabase SQL editor; verify table count |
| Railway container running | DEPLOY-05 | Requires live Railway deployment | Deploy, check `GET /api/health` returns 200 |
| Env vars wired correctly | DEPLOY-07 | Platform config, not code | Check Railway Variables tab for all required vars |
| Vercel SPA routing | DEPLOY-10 | Requires live Vercel deployment | Navigate directly to `/boards` — should load app, not 404 |
| Cross-origin auth flow | AUTH-05 | End-to-end browser flow | Sign up from Vercel URL, verify session cookie persists on refresh |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
