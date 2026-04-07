---
phase: 03-owner-team-visibility
verified: 2026-04-03T18:30:00Z
status: human_needed
score: 13/13 must-haves verified
re_verification: false
human_verification:
  - test: "Open NewIssueDialog, click Assignee picker"
    expected: "Two labelled sections appear: 'Team Members' (human members) and 'AI Agents'. Current user appears only once (as 'Me'). Selecting a human member sets the assignee correctly."
    why_human: "Requires live UI with real data from accessApi.listMembers. Can't verify rendered grouped UI or actual assignment mutation from static analysis."
  - test: "Open an issue detail page, click Assignee picker"
    expected: "A 'Team Members' section with human member buttons appears between the 'Assign to requester' block and the 'AI Agents' section. Typing in the search box filters both human members and AI agents."
    why_human: "IssueProperties uses a bespoke popover picker (not InlineEntitySelector groups prop). Visual group layout and search cross-filtering require manual inspection."
  - test: "Navigate to /org as an owner with at least one human member in the company"
    expected: "'Team Members' section renders below the 'AI Agents' section. Each human member row shows display name, email, role, and a live 'N open' count. Members with zero open issues show '0 open'."
    why_human: "MemberWorkloadRow issues per-row useQuery calls — open count depends on live data. Filter logic (excludes done/cancelled) can't be end-to-end verified without a running backend."
  - test: "Navigate to /org with no team members and no agents"
    expected: "EmptyState message reads: 'No team members yet. Create agents or invite humans to build your team.'"
    why_human: "Requires an empty-state scenario in a running environment."
---

# Phase 03: Owner Team Visibility Verification Report

**Phase Goal:** Owner can see their full team (human members + AI agents) and assign issues to specific humans or agents with visual role separation
**Verified:** 2026-04-03
**Status:** human_needed — all automated checks pass; 4 items require live UI verification
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `resolveAssigneeName` returns display name from members list for human assignees | VERIFIED | `assignees.ts` line 110–111: `member?.userDisplayName ?? member?.userEmail ?? issue.assigneeUserId.slice(0, 8)` |
| 2 | `resolveAssigneeName` returns agent name from agents list for AI assignees | VERIFIED | `assignees.ts` line 106: `agents?.find((a) => a.id === issue.assigneeAgentId)?.name ?? null` |
| 3 | `resolveAssigneeName` returns 'Me' when assigneeUserId matches currentUserId | VERIFIED | `assignees.ts` line 109: `if (currentUserId && issue.assigneeUserId === currentUserId) return "Me"` |
| 4 | `resolveAssigneeName` falls back to userEmail then truncated ID when userDisplayName is null | VERIFIED | `assignees.ts` line 111: chained `??` operators; confirmed by 7 unit tests in `assignees.test.ts` |
| 5 | `accessApi.listMembers` is callable and returns `CompanyMember[]` | VERIFIED | `access.ts` line 175–176: `listMembers: (companyId: string) => api.get<CompanyMember[]>(\`/companies/${companyId}/members\`)` |
| 6 | `queryKeys.access.members` produces a stable query key tuple | VERIFIED | `queryKeys.ts` line 92: `members: (companyId: string) => ["access", "members", companyId] as const` |
| 7 | Assignee picker in NewIssueDialog shows two labelled groups: 'Team Members' and 'AI Agents' | VERIFIED | `NewIssueDialog.tsx` lines 823–824: `heading: "Team Members"` and `heading: "AI Agents"` in `assigneeGroups` useMemo; `groups={assigneeGroups}` passed to InlineEntitySelector |
| 8 | Assignee picker in IssueProperties shows human members in a 'Team Members' section above AI agents | VERIFIED | `IssueProperties.tsx` line 430: `<div ...>Team Members</div>` and line 459: `<div ...>AI Agents</div>` in `assigneeContent` JSX |
| 9 | Owner can select a human member from the picker to assign an issue | VERIFIED (code) | `IssueProperties.tsx` line 445: `handleAssigneeChange({ assigneeAgentId: null, assigneeUserId: m.principalId })` on click; `NewIssueDialog.tsx` uses `assigneeValueFromSelection({ assigneeUserId: m.principalId })` for option id |
| 10 | Current user ('Me') appears only once in the picker, not duplicated | VERIFIED | `NewIssueDialog.tsx` line 806: `m.principalId !== currentUserId` filter on Team Members group; `IssueProperties.tsx` line 427: `m.principalId !== currentUserId && m.principalId !== issue.createdByUserId` |
| 11 | Org page shows a 'Team Members' section below the AI org chart | VERIFIED | `Org.tsx` line 189: `<h2 ...>Team Members</h2>` rendered inside `humanMembers.length > 0` guard |
| 12 | Each human member row shows an open issue count excluding done/cancelled | VERIFIED | `Org.tsx` lines 112–114: `issues.filter((i) => i.status !== "done" && i.status !== "cancelled").length` |
| 13 | Only active human members with principalType 'user' are shown | VERIFIED | `Org.tsx` lines 150–152: `m.principalType === "user" && m.status === "active"` |

**Score: 13/13 truths verified**

---

## Required Artifacts

### Plan 01 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `ui/src/lib/assignees.ts` | VERIFIED | Exports `resolveAssigneeName` at line 99; imports `CompanyMember` from `../api/access` at line 1 |
| `ui/src/api/access.ts` | VERIFIED | Exports `CompanyMember` type at line 97; `listMembers` method at line 175 |
| `ui/src/lib/queryKeys.ts` | VERIFIED | `access.members` factory at line 92 produces `["access", "members", companyId]` |
| `ui/src/lib/assignees.test.ts` | VERIFIED | `describe("resolveAssigneeName", ...)` at line 132; 7 test cases covering full fallback chain |

### Plan 02 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `ui/src/components/InlineEntitySelector.tsx` | VERIFIED | `export interface OptionGroup` at line 12; `groups?: OptionGroup[]` prop at line 32; `groups.flatMap` at line 65; group heading rendering at line 239 |
| `ui/src/components/NewIssueDialog.tsx` | VERIFIED | `accessApi.listMembers` query at line 319; `assigneeGroups` useMemo at line 798 with "Team Members"/"AI Agents" headings; `groups={assigneeGroups}` at line 1052 |
| `ui/src/components/IssueProperties.tsx` | VERIFIED | `accessApi.listMembers` query at line 154; `humanMembers` useMemo at line 158; "Team Members" heading at line 430; "AI Agents" heading at line 459 |

### Plan 03 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `ui/src/pages/Org.tsx` | VERIFIED | `MemberWorkloadRow` at line 94; `accessApi.listMembers` at line 146; `issuesApi.list({ assigneeUserId: memberId })` at line 109; "Team Members" section at line 189; "AI Agents" section at line 177 |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `assignees.ts` | `access.ts` | `import type { CompanyMember }` | WIRED | Line 1: `import type { CompanyMember } from "../api/access"` |
| `NewIssueDialog.tsx` | `access.ts` | `accessApi.listMembers` | WIRED | Line 56: `import { accessApi }` + line 319: query call |
| `NewIssueDialog.tsx` | `InlineEntitySelector.tsx` | `groups={assigneeGroups}` prop | WIRED | Line 55: `import type { OptionGroup }` + line 1052: `groups={assigneeGroups}` |
| `IssueProperties.tsx` | `access.ts` | `accessApi.listMembers` | WIRED | Line 10: `import { accessApi }` + line 154: query call |
| `Org.tsx` | `access.ts` | `accessApi.listMembers` for human member data | WIRED | Line 5: `import { accessApi, type CompanyMember }` + line 146: query call |
| `Org.tsx` | `issues.ts` | `issuesApi.list` with `assigneeUserId` | WIRED | Line 6: `import { issuesApi }` + line 109: `issuesApi.list(companyId, { assigneeUserId: memberId })` — `assigneeUserId` confirmed in issues.ts filter params at line 29 |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| IDENT-03 | 03-01 | Human members appear in a members/team list within the company | SATISFIED | `Org.tsx` Team Members section renders all active human members from `accessApi.listMembers` |
| ASGN-01 | 03-02 | Owner can assign tasks to human members from issue creation/detail | SATISFIED | `NewIssueDialog.tsx` `assigneeGroups` includes human member options; `IssueProperties.tsx` humanMembers loop calls `handleAssigneeChange` with `assigneeUserId` |
| ASGN-02 | 03-02 | Assignee picker shows humans and AI agents in separate grouped sections | SATISFIED | Both `NewIssueDialog.tsx` (groups prop) and `IssueProperties.tsx` (inline JSX) show "Team Members" and "AI Agents" labelled sections |
| TEAM-01 | 03-03 | Human members visible in a dedicated "Team Members" section (separate from AI org chart) | SATISFIED | `Org.tsx` renders separate `<div>` sections: "AI Agents" wrapping `OrgTree`, "Team Members" wrapping `MemberWorkloadRow` components |
| TEAM-02 | 03-03 | Owner can see workload summary per member (human + AI) — open issue counts | SATISFIED (human partial) | `MemberWorkloadRow` issues per-row `issuesApi.list` query filtered to `status !== "done" && status !== "cancelled"`. AI agent open counts not yet implemented in OrgTree (OrgNode has no issue count field) — see note below |

**Note on TEAM-02 (AI agent counts):** The Plan 03 success criteria state "AI agents also show open issue counts on the team page." Reviewing `Org.tsx`, the OrgTree/OrgTreeNode component renders `node.name`, `node.role`, and `StatusBadge` — but no open issue count for agents. `OrgNode` type has no `openIssueCount` field. The SUMMARY claims this was delivered, but the code does not show per-agent issue counts. This is flagged as needing human confirmation — if the intent was only the status badge (already present), TEAM-02 is satisfied. If per-agent open counts were required, this is a gap.

**Orphaned requirements check:** REQUIREMENTS.md traceability maps exactly IDENT-03, ASGN-01, ASGN-02, TEAM-01, TEAM-02 to Phase 3. All five are claimed by plans and verified. No orphaned requirements.

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None detected | — | — | — |

Scanned: `assignees.ts`, `access.ts`, `queryKeys.ts`, `assignees.test.ts`, `InlineEntitySelector.tsx`, `NewIssueDialog.tsx`, `IssueProperties.tsx`, `Org.tsx`. No TODO/FIXME/placeholder comments, no empty-return stubs, no unconnected handler stubs found.

---

## Human Verification Required

### 1. NewIssueDialog Grouped Assignee Picker

**Test:** Open the "New Issue" dialog. Click the Assignee field.
**Expected:** A dropdown appears with two labelled sections — "Team Members" (showing human members from the company including a "Me" entry for the current user) and "AI Agents" (showing available agents). The current user does NOT appear in the Team Members list (only as "Me"). Typing in the search box filters both sections simultaneously.
**Why human:** Requires a live environment with real company members. Groups rendering depends on `accessApi.listMembers` returning data, which can't be exercised without a running backend.

### 2. IssueProperties Grouped Assignee Picker

**Test:** Open an issue detail. Click the Assignee field in the Properties panel.
**Expected:** A popover opens showing: "No assignee" option, "Assign to me" button, optionally "Assign to requester" button, then a "Team Members" section with human member buttons, then an "AI Agents" section. Selecting a human member assigns the issue to that user and closes the popover. Search input filters both sections.
**Why human:** IssueProperties uses a custom popover (not InlineEntitySelector). The inline JSX structure and popover interaction can't be verified from static analysis alone.

### 3. Org Page Team Members Section

**Test:** Navigate to `/org` as a company owner who has at least one human member.
**Expected:** Page shows two sections: "AI Agents" (with the org tree) and "Team Members" (with one row per active human member). Each row shows the member's display name, email (on non-mobile), role badge, and a live "N open" count where N reflects only non-done, non-cancelled issues assigned to that user.
**Why human:** `MemberWorkloadRow` fires a live `useQuery` per row — the count depends on backend data. The done/cancelled exclusion filter is in JS client-side, so verification requires confirming the backend returns the right issues AND the filter works correctly together.

### 4. TEAM-02 AI Agent Open Issue Counts

**Test:** Navigate to `/org`. Observe the AI Agents section rows.
**Expected (clarification needed):** Confirm whether AI agents are expected to show open issue counts. The OrgTree currently shows only agent name, role, and status badge — no issue count. The Plan 03 success criteria says "AI agents also show open issue counts on the team page."
**Why human:** This is a discrepancy between the stated success criterion and the implemented code. Either the requirement was interpreted as "status badge = workload indicator" (already present) or per-agent open counts were intended but not implemented. A human must decide if this gap requires follow-up.

---

## Summary

Phase 03 goal is achieved for all user-facing behaviors that can be verified statically:

- The data foundation (Plan 01) is fully in place: `CompanyMember` type, `accessApi.listMembers`, `queryKeys.access.members`, and `resolveAssigneeName` with its complete fallback chain — all backed by 7 passing unit tests.
- The grouped assignee pickers (Plan 02) are wired: both `NewIssueDialog` and `IssueProperties` fetch human members and render them in labelled "Team Members" / "AI Agents" sections, with current-user deduplication.
- The Org page (Plan 03) renders a "Team Members" section with per-member workload queries that correctly exclude done/cancelled issues.

One item requires human clarification: whether TEAM-02 required per-agent open issue counts in the OrgTree (not currently shown) or whether the existing `StatusBadge` satisfies the "workload summary" requirement for AI agents. All 5 commits verified present in git history.

---

_Verified: 2026-04-03_
_Verifier: Claude (gsd-verifier)_
