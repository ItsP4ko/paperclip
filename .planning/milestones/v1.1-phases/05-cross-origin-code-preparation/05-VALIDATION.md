---
phase: 5
slug: cross-origin-code-preparation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.0.x |
| **Config file (server)** | `server/vitest.config.ts` — `environment: "node"` |
| **Config file (ui)** | `ui/vitest.config.ts` — `environment: "node"` |
| **Quick run command (server)** | `pnpm --filter @paperclipai/server test --run` |
| **Quick run command (ui)** | `pnpm --filter @paperclipai/ui test --run` |
| **Full suite command** | `pnpm --filter @paperclipai/server test --run && pnpm --filter @paperclipai/ui test --run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run the specific test file for the changed area
- **After every plan wave:** `pnpm --filter @paperclipai/server test --run && pnpm --filter @paperclipai/ui test --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 0 | DEPLOY-02, DEPLOY-03 | unit | `pnpm --filter @paperclipai/ui test --run src/lib/api-base` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 0 | AUTH-01 | unit | `pnpm --filter @paperclipai/server test --run src/__tests__/cors-middleware` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 0 | AUTH-02, AUTH-04 | unit | `pnpm --filter @paperclipai/server test --run src/__tests__/better-auth-cookies` | ❌ W0 | ⬜ pending |
| 05-01-04 | 01 | 0 | AUTH-03 | unit | `pnpm --filter @paperclipai/server test --run src/__tests__/board-mutation-guard` | ✅ (needs new case) | ⬜ pending |
| 05-XX-XX | XX | 1 | DEPLOY-02 | unit | `pnpm --filter @paperclipai/ui test --run src/lib/api-base` | ❌ W0 | ⬜ pending |
| 05-XX-XX | XX | 1 | DEPLOY-03 | unit | `pnpm --filter @paperclipai/ui test --run src/lib/api-base` | ❌ W0 | ⬜ pending |
| 05-XX-XX | XX | 1 | AUTH-01 | unit | `pnpm --filter @paperclipai/server test --run src/__tests__/cors-middleware` | ❌ W0 | ⬜ pending |
| 05-XX-XX | XX | 1 | AUTH-02 | unit | `pnpm --filter @paperclipai/server test --run src/__tests__/better-auth-cookies` | ❌ W0 | ⬜ pending |
| 05-XX-XX | XX | 1 | AUTH-03 | unit | `pnpm --filter @paperclipai/server test --run src/__tests__/board-mutation-guard` | ✅ | ⬜ pending |
| 05-XX-XX | XX | 1 | AUTH-04 | unit | `pnpm --filter @paperclipai/server test --run src/__tests__/better-auth-cookies` | ❌ W0 | ⬜ pending |
| 05-XX-XX | XX | 1 | DEPLOY-01 | manual | Open `ui/vercel.json`, verify `rewrites` key | N/A | ⬜ pending |
| 05-XX-XX | XX | 1 | DEPLOY-04 | smoke | `VITE_API_URL=https://test.railway.app pnpm --filter @paperclipai/ui build` | N/A | ⬜ pending |
| 05-XX-XX | XX | 1 | DEPLOY-06 | unit | `pnpm --filter @paperclipai/server test --run src/__tests__/health` | ✅ | ⬜ pending |
| 05-XX-XX | XX | 1 | DEPLOY-08 | unit | `pnpm --filter @paperclipai/server test --run src/__tests__/paperclip-env` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `ui/src/lib/api-base.test.ts` — covers DEPLOY-02, DEPLOY-03 (`API_BASE` and `getWsHost()` with/without `VITE_API_URL`)
- [ ] `server/src/__tests__/cors-middleware.test.ts` — covers AUTH-01 (allowed origin passes, unlisted origin rejected, OPTIONS preflight returns correct headers)
- [ ] `server/src/__tests__/better-auth-cookies.test.ts` — covers AUTH-02 (`defaultCookieAttributes` for HTTPS) and AUTH-04 (throws without `BETTER_AUTH_SECRET`)
- [ ] `server/src/__tests__/board-mutation-guard.test.ts` — ✅ exists; add one case: POST with `allowedOrigins: ["https://app.vercel.app"]` and `Origin: https://app.vercel.app` is accepted

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `vercel.json` rewrite rule present | DEPLOY-01 | Config file validation | Open `ui/vercel.json`, verify `rewrites` array contains `{ "source": "/(.*)", "destination": "/index.html" }` |
| Vite build with external API URL | DEPLOY-04 | Build smoke test | Run `VITE_API_URL=https://test.railway.app pnpm --filter @paperclipai/ui build` and verify exit code 0 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
