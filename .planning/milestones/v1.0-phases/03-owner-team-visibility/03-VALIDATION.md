---
phase: 3
slug: owner-team-visibility
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest / jest |
| **Config file** | TBD — Wave 0 installs if needed |
| **Quick run command** | `npm run test --workspace=ui` |
| **Full suite command** | `npm run test --workspace=ui` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test --workspace=ui`
- **After every plan wave:** Run `npm run test --workspace=ui`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | IDENT-03 | unit | `npm run test --workspace=ui -- --grep resolveAssigneeName` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | IDENT-03 | manual | Org page shows Team Members section | ✅ | ⬜ pending |
| 03-02-01 | 02 | 1 | ASGN-01, ASGN-02 | manual | Grouped picker in NewIssueDialog | ✅ | ⬜ pending |
| 03-02-02 | 02 | 1 | ASGN-01, ASGN-02 | manual | Grouped picker in IssueDetail | ✅ | ⬜ pending |
| 03-03-01 | 03 | 2 | TEAM-01, TEAM-02 | manual | Open issue counts per member on team page | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `ui/src/lib/assignees.test.ts` — stubs for `resolveAssigneeName` unit tests

*Existing infrastructure covers all other phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Team Members section visible in Org page | IDENT-03 | React component render with live data | Log in as owner, navigate to /org, verify "Team Members" section appears with human member names |
| Grouped assignee picker (Team Members / AI Agents) | ASGN-01, ASGN-02 | UI interaction with live data | Open NewIssueDialog, click Assignee, verify two labeled groups appear |
| Assign human member from IssueDetail | ASGN-01 | Live mutation + optimistic update | Open existing issue, click Assignee picker, select a human member, verify saved |
| Open issue count per member on team page | TEAM-01, TEAM-02 | Live API call with real data | Navigate to /org, verify each member card shows open issue count |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
