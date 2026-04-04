---
phase: 1
slug: identity-membership-my-tasks-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.0.5 |
| **Config file** | `vitest.config.ts` (root), `ui/vitest.config.ts`, `server/vitest.config.ts` |
| **Quick run command** | `pnpm vitest run --project ui && pnpm vitest run --project server` |
| **Full suite command** | `pnpm test:run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --project ui && pnpm vitest run --project server`
- **After every plan wave:** Run `pnpm test:run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | TASKS-02 | unit | `pnpm vitest run --project ui ui/src/pages/MyIssues.test.tsx` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | TASKS-01 | unit (inline) | covered by MyIssues.test.tsx | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | IDENT-04 | unit | `pnpm vitest run --project server server/src/__tests__/access-list-members.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | IDENT-01 | manual | n/a | manual-only | ⬜ pending |
| 01-02-03 | 02 | 1 | IDENT-02 | manual | n/a | manual-only | ⬜ pending |
| 01-03-01 | 03 | 1 | TASKS-04 | unit | `pnpm vitest run --project server server/src/__tests__/sidebar-badges.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 1 | TASKS-05 | manual / smoke | n/a | manual-only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `ui/src/pages/MyIssues.test.tsx` — covers TASKS-02, TASKS-01 (mock issuesApi, assert `assigneeUserId: "me"`)
- [ ] `server/src/__tests__/access-list-members.test.ts` — covers IDENT-04 (assert returned rows include `userDisplayName`, `userEmail`)
- [ ] `server/src/__tests__/sidebar-badges.test.ts` — covers TASKS-04 (assert `myTasks` field present and computed from issues count)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CompanySettings has human invite button and displays returned URL | IDENT-01 | Full browser flow with auth session | 1. Log in as owner 2. Go to CompanySettings 3. Click "Invite Human" button 4. Verify invite URL is displayed |
| Human invite link → join → approval → company access | IDENT-02 | Multi-step browser flow with session cookies and redirects | 1. Generate invite link 2. Open in incognito 3. Create account or sign in 4. Submit join request 5. Approve as owner 6. Verify human lands in company |
| `/my-tasks` route navigates to MyIssues | TASKS-05 | Sidebar navigation with React Router | 1. Log in as human member 2. Click "My Tasks" in sidebar 3. Verify MyIssues page renders |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
