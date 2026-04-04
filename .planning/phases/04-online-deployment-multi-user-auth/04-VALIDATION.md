---
phase: 4
slug: online-deployment-multi-user-auth
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.0.5 |
| **Config file** | `server/vitest.config.ts` |
| **Quick run command** | `cd server && pnpm vitest run src/__tests__/invite-auto-approve.test.ts` |
| **Full suite command** | `cd server && pnpm vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd server && pnpm vitest run src/__tests__/invite-auto-approve.test.ts`
- **After every plan wave:** Run `cd server && pnpm vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | AUTH-01 | unit (route mock) | `cd server && pnpm vitest run src/__tests__/invite-auto-approve.test.ts` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | AUTH-01 | unit (UI) | `cd ui && pnpm vitest run src/pages/InviteLanding.test.tsx` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 1 | AUTH-02 | unit (existing) | `cd server && pnpm vitest run src/__tests__/health.test.ts` | ✅ | ⬜ pending |
| 4-03-01 | 03 | 1 | AUTH-03 | unit (existing) | `cd server && pnpm vitest run src/__tests__/health.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/src/__tests__/invite-auto-approve.test.ts` — covers AUTH-01 server side (human accept returns approved joinRequest with companyId)
- [ ] `ui/src/pages/InviteLanding.test.tsx` — covers AUTH-01 UI side (navigate called when `status=approved`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Invite → unauthenticated → `/auth?next=/invite/TOKEN` → create account → redirect back → auto-join → `/` | AUTH-01 | Full E2E browser flow involving BetterAuth session cookies and React Router redirects | 1. Start server in `authenticated` mode. 2. Open invite link while logged out. 3. Verify redirect to `/auth?next=...`. 4. Create account. 5. Verify auto-join and redirect to `/`. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
