---
phase: 07
slug: end-to-end-verification
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Chrome DevTools MCP (manual browser automation) |
| **Config file** | None — no automated test config for E2E on deployed stack |
| **Quick run command** | Manual: open browser, navigate, screenshot |
| **Full suite command** | Complete E2E journey (both sessions, all 6 requirements) |
| **Estimated runtime** | ~15-20 minutes (sequential browser sessions) |

---

## Sampling Rate

- **After every task commit:** Verify the specific E2E requirement affected by the change
- **After every plan wave:** Run full E2E journey through all 6 requirements
- **Before `/gsd:verify-work`:** All 6 E2E requirements pass with screenshot evidence
- **Max feedback latency:** Immediate (Chrome DevTools MCP provides real-time feedback)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 0 | E2E-02/03 | code fix | Chrome DevTools MCP: verify members endpoint returns 200 after fix | N/A | ⬜ pending |
| 07-01-02 | 01 | 0 | E2E-01 | db check | Supabase SQL: verify `users:invite` grant exists for owner | N/A | ⬜ pending |
| 07-02-01 | 02 | 1 | E2E-01 | manual browser | Chrome DevTools MCP: CompanySettings → Generate Invite → screenshot URL | N/A | ⬜ pending |
| 07-02-02 | 02 | 1 | E2E-02 | manual browser | Chrome DevTools MCP: invite URL → sign up → accept → My Tasks | N/A | ⬜ pending |
| 07-02-03 | 02 | 1 | E2E-03 | manual browser | Chrome DevTools MCP: assign task to invited user → confirm in My Tasks | N/A | ⬜ pending |
| 07-02-04 | 02 | 1 | E2E-04 | manual browser | Chrome DevTools MCP: status change + file attach + subtask → reload → persist | N/A | ⬜ pending |
| 07-02-05 | 02 | 1 | E2E-05 | manual browser | Chrome DevTools MCP: reassign to AI agent → confirm assignee updated | N/A | ⬜ pending |
| 07-02-06 | 02 | 1 | E2E-06 | manual browser | Chrome DevTools MCP: status change in Session A → verify in Session B | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Fix members 403 bug in `server/src/routes/access.ts` — add owner bypass in `assertCompanyPermission`
- [ ] Verify `users:invite` permission grant exists for owner in deployed Supabase DB

*Both must be resolved before the E2E verification journey can proceed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Owner generates invite link | E2E-01 | Live deployment verification — no Playwright against Vercel | Chrome DevTools MCP: navigate CompanySettings, click generate, screenshot |
| User sign-up + invite accept | E2E-02 | Cross-origin auth on live deployment | Chrome DevTools MCP: navigate invite URL, sign up, accept, screenshot |
| Task assignment to invited user | E2E-03 | Multi-user interaction on live deployment | Chrome DevTools MCP: owner assigns task, switch session, verify |
| Status change, file attach, subtask | E2E-04 | File upload + persistence on live deployment | Chrome DevTools MCP: perform actions, reload, screenshot |
| Reassign to AI agent | E2E-05 | UI/API verification on live deployment | Chrome DevTools MCP: select AI agent, confirm API success |
| WebSocket real-time updates | E2E-06 | Cross-session real-time on live deployment | Chrome DevTools MCP: state change in A, verify in B without refresh |

*All phase behaviors are manual-only — this is a live deployment verification phase.*

---

## Validation Sign-Off

- [ ] All tasks have manual verification via Chrome DevTools MCP
- [ ] Sampling continuity: every E2E requirement has at least one screenshot
- [ ] Wave 0 covers all pre-verification blockers (403 fix, permission grant)
- [ ] No automated test infrastructure required (manual verification phase)
- [ ] Feedback latency: immediate via Chrome DevTools MCP
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
