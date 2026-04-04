---
phase: 01-identity-membership-my-tasks-foundation
verified: 2026-04-03T20:00:00Z
status: passed
score: 12/12 must-haves verified
re_verification: false
---

# Phase 01: Identity, Membership & My Tasks Foundation — Verification Report

**Phase Goal:** Ship the My Tasks page (filter fix + route), member identity display, human invite link, and sidebar badge count — giving users a working personal task view and giving admins a cleaner team management experience.
**Verified:** 2026-04-03
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | MyIssues page fetches only issues assigned to the current user via `assigneeUserId=me` | VERIFIED | `MyIssues.tsx` line 25: `issuesApi.list(selectedCompanyId!, { assigneeUserId: "me" })` |
| 2 | Navigating to `/my-tasks` renders the MyIssues page | VERIFIED | `App.tsx` line 153: `<Route path="my-tasks" element={<MyIssues />} />` |
| 3 | Sidebar has a My Tasks nav item in the Work section | VERIFIED | `Sidebar.tsx` line 109: `<SidebarNavItem to="/my-tasks" label="My Tasks" icon={ListTodo} badge={badges?.myTasks} />` |
| 4 | MyIssues breadcrumb reads "My Tasks" | VERIFIED | `MyIssues.tsx` line 20: `setBreadcrumbs([{ label: "My Tasks" }])` |
| 5 | MyIssues empty state reads "No tasks assigned to you." | VERIFIED | `MyIssues.tsx` line 44: `message="No tasks assigned to you."` |
| 6 | listMembers returns `userDisplayName` and `userEmail` for human members | VERIFIED | `access.ts` lines 90-91: explicit select of `authUsers.name` and `authUsers.email` |
| 7 | listMembers returns null for `userDisplayName`/`userEmail` for agent members | VERIFIED | LEFT JOIN on `principalType = "user"` — non-user rows yield NULL from outer join |
| 8 | Owner can generate a Human Invite Link in CompanySettings | VERIFIED | `CompanySettings.tsx` lines 165-179: `humanInviteMutation` calling `createCompanyInvite` with `allowedJoinTypes: "human"` |
| 9 | Human clicking the generated invite URL joins via InviteLandingPage | VERIFIED | `InviteLanding.tsx` lines 73-98: handles `allowedJoinTypes: "human"` — no new code required |
| 10 | SidebarBadges type includes `myTasks: number` | VERIFIED | `sidebar-badges.ts` line 6: `myTasks: number` in interface |
| 11 | Sidebar badges endpoint returns `myTasks` count for board actors | VERIFIED | `routes/sidebar-badges.ts` lines 37-49: board-actor-guarded count query on `issues` table |
| 12 | `myTasks` count is 0 for non-board actors | VERIFIED | `routes/sidebar-badges.ts` line 38: `if (req.actor.type === "board" && req.actor.userId)` guard; defaults to `0` |

**Score:** 12/12 truths verified

---

## Required Artifacts

### Plan 01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `ui/src/pages/MyIssues.tsx` | Fixed filter using `assigneeUserId=me`, correct queryKey, updated copy | VERIFIED | Contains `assigneeUserId: "me"`, `listAssignedToMe`, "My Tasks" breadcrumb, "No tasks assigned to you.", client-side filter removed |
| `ui/src/pages/MyIssues.test.tsx` | Unit test asserting correct API call with `assigneeUserId=me` | VERIFIED | Tests queryKey `["issues", "company-1", "assigned-to-me"]`, calls `issuesApi.list` with correct filter, no-company empty state |
| `ui/src/App.tsx` | Route registration for `/my-tasks` | VERIFIED | Line 153: `<Route path="my-tasks" element={<MyIssues />} />` before issues route |
| `ui/src/components/Sidebar.tsx` | My Tasks nav item in Work section | VERIFIED | Line 109: `label="My Tasks"`, `icon={ListTodo}`, `badge={badges?.myTasks}`, `sidebarBadgesApi` query wired |

### Plan 02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/src/services/access.ts` | listMembers with LEFT JOIN to authUsers | VERIFIED | Lines 79-103: explicit select block, `.leftJoin(authUsers, and(eq(principalType, "user"), eq(principalId, authUsers.id)))` |
| `server/src/__tests__/access-list-members.test.ts` | Unit test for listMembers returning user display fields | VERIFIED | 3 tests: user row with display fields, agent row with nulls, leftJoin call assertion |
| `ui/src/pages/CompanySettings.tsx` | Human invite section with generate button and URL display | VERIFIED | Lines 59-62: state vars; lines 165-179: mutation; lines 566-628: JSX card with button, URL input, copy button |

### Plan 03 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/shared/src/types/sidebar-badges.ts` | SidebarBadges interface with `myTasks` field | VERIFIED | Line 6: `myTasks: number` added to interface |
| `server/src/services/sidebar-badges.ts` | Service accepting `myTasks` in extra param | VERIFIED | Line 13: `myTasks?: number` in extra type; line 52: `myTasks: extra?.myTasks ?? 0` in return (NOT in inbox sum) |
| `server/src/routes/sidebar-badges.ts` | myTasks count computation using issues table query | VERIFIED | Lines 37-49: `myTasksCount` query with board actor guard, `eq(issues.assigneeUserId, req.actor.userId)`, `not(inArray(issues.status, ["done", "cancelled"]))` |
| `server/src/__tests__/sidebar-badges.test.ts` | Unit test asserting myTasks field is present | VERIFIED | 3 tests: myTasks as number, board actor passthrough, agent actor 0-guard |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `ui/src/pages/MyIssues.tsx` | `issuesApi.list` | `useQuery` with `assigneeUserId: "me"` filter | WIRED | Line 25: `issuesApi.list(selectedCompanyId!, { assigneeUserId: "me" })` |
| `ui/src/App.tsx` | `ui/src/pages/MyIssues.tsx` | Route `path="my-tasks"` `element={<MyIssues />}` | WIRED | Line 28: import; line 153: route |
| `ui/src/components/Sidebar.tsx` | `/my-tasks` | `SidebarNavItem to="/my-tasks"` | WIRED | Line 109 |
| `server/src/services/access.ts` | `authUsers` table | LEFT JOIN on `principalType=user` + `principalId` | WIRED | Lines 94-99 |
| `ui/src/pages/CompanySettings.tsx` | `accessApi.createCompanyInvite` | `useMutation` with `allowedJoinTypes: "human"` | WIRED | Lines 165-179 |
| `server/src/routes/sidebar-badges.ts` | `issues` table | Count query with `assigneeUserId` and status filter | WIRED | Lines 39-49: `eq(issues.assigneeUserId, req.actor.userId)` + `not(inArray(...))` |
| `server/src/services/sidebar-badges.ts` | `packages/shared/src/types/sidebar-badges.ts` | SidebarBadges return type includes `myTasks` | WIRED | Line 52 returns `myTasks: extra?.myTasks ?? 0` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TASKS-01 | Plan 01 | Human user sees a dedicated "My Tasks" dashboard | SATISFIED | `/my-tasks` route + `MyIssues` page render actual issue data |
| TASKS-02 | Plan 01 | `assigneeUserId=me` filter bug fixed | SATISFIED | Client-side filter removed; server filter `{ assigneeUserId: "me" }` in `queryFn` |
| TASKS-05 | Plan 01 | My Tasks accessible from main navigation sidebar | SATISFIED | Sidebar Work section has `SidebarNavItem to="/my-tasks"` |
| IDENT-01 | Plan 02 | Owner can invite humans from CompanySettings | SATISFIED | "Generate Human Invite Link" button calls `createCompanyInvite` with `allowedJoinTypes: "human"` |
| IDENT-02 | Plan 02 | Invited human joins via InviteLandingPage | SATISFIED | `InviteLanding.tsx` already handles `allowedJoinTypes: "human"` — no code changes needed |
| IDENT-04 | Plan 02 | Backend returns human display name + email | SATISFIED | `listMembers` LEFT JOIN returns `userDisplayName: authUsers.name`, `userEmail: authUsers.email` |
| TASKS-04 | Plan 03 | Sidebar badge count reflects assigned tasks | SATISFIED | `myTasks` count query in route; `SidebarBadges.myTasks` type field; Sidebar reads `badges?.myTasks` |

All 7 declared requirement IDs are satisfied. No orphaned requirements detected — REQUIREMENTS.md traceability table confirms IDENT-03 and TASKS-03 belong to later phases, not Phase 1.

---

## Anti-Patterns Found

No blockers or warnings found. Scanned files:
- `ui/src/pages/MyIssues.tsx` — clean, no stubs
- `ui/src/pages/MyIssues.test.tsx` — substantive tests with real assertions
- `ui/src/App.tsx` — route registered and wired
- `ui/src/components/Sidebar.tsx` — query wired, badge slot live
- `server/src/services/access.ts` — complete LEFT JOIN implementation
- `server/src/__tests__/access-list-members.test.ts` — 3 substantive test cases
- `ui/src/pages/CompanySettings.tsx` — complete mutation + JSX (HTML `placeholder` attributes on form inputs are not anti-patterns)
- `packages/shared/src/types/sidebar-badges.ts` — type extended
- `server/src/services/sidebar-badges.ts` — passthrough wired, not added to inbox sum (correct per spec)
- `server/src/routes/sidebar-badges.ts` — full count query with guard
- `server/src/__tests__/sidebar-badges.test.ts` — 3 tests covering field presence, board actor, agent actor

---

## Human Verification Required

### 1. Human Invite Link End-to-End Flow

**Test:** Log in as an owner, navigate to Company Settings, click "Generate Human Invite Link," copy the URL, open it in an incognito window, and complete the human join flow.
**Expected:** Invite URL resolves to InviteLandingPage; user can sign up/sign in and join the company as a human member with `membershipRole: "member"`.
**Why human:** Requires live backend, auth session, and actual invite token generation — cannot be verified by static code inspection.

### 2. My Tasks Badge Pill Visibility

**Test:** Log in as a board user with at least one non-done/non-cancelled issue assigned to them. Check the sidebar.
**Expected:** The My Tasks nav item shows a numeric badge pill with the correct count.
**Why human:** Requires live API response including `myTasks` field from the backend, and visual rendering of the SidebarNavItem badge prop.

### 3. My Tasks Page Issue List

**Test:** Log in as a board user with assigned issues, navigate to `/my-tasks`.
**Expected:** The page lists only issues assigned to the current user. Issues with status "done" or "cancelled" may appear (by design — the backend filter does not exclude them for the page, only for the badge count).
**Why human:** Requires live data and visual inspection; the badge and page use different filtering logic (badge excludes done/cancelled; page shows all assigned).

---

## Commit Traceability

All 6 feature commits documented in SUMMARYs verified to exist in the repository:

| Commit | Plan | Task |
|--------|------|------|
| `baf58103` | 01-01 | Fix MyIssues filter + copy + test |
| `a08d1258` | 01-01 | Register /my-tasks route + sidebar nav item |
| `9dbecb2c` | 01-02 | Extend listMembers with LEFT JOIN + test |
| `916aace0` | 01-02 | Add human invite section to CompanySettings |
| `26eb6307` | 01-03 | Add myTasks field to SidebarBadges type + service |
| `11ac4825` | 01-03 | Add myTasks count query to sidebar badges route + test |

---

_Verified: 2026-04-03_
_Verifier: Claude (gsd-verifier)_
