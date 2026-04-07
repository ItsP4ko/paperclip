# Phase 3: Owner Team Visibility - Research

**Researched:** 2026-04-03
**Domain:** Team member listing, grouped assignee picker, workload summary
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| IDENT-03 | Human members appear in a members/team list within the company | Backend `GET /companies/:companyId/members` exists and returns `userDisplayName` + `userEmail`; UI `accessApi` needs a `listMembers` method; `Org.tsx` needs a second section below the AI org chart |
| ASGN-01 | Owner can assign tasks to human members from issue creation/detail | `IssueProperties` assignee picker renders its own button list; `NewIssueDialog` uses `InlineEntitySelector` with a flat `assigneeOptions` array — both need to be extended to include human member entries with `user:` prefix values |
| ASGN-02 | Assignee picker shows humans and AI agents in separate grouped sections | `InlineEntitySelector` is a flat list with no group headers; a new `GroupedAssigneeSelector` component (or a `groups` prop extension) is needed; `CommandPalette` uses the `Command*` primitives that already support `CommandGroup` — same grouping approach applies there |
| TEAM-01 | Human members visible in a dedicated "Team Members" section in org/team page | `Org.tsx` currently only renders the AI org tree; needs a second section after the tree, fetching `members` and filtering to `principalType: "user"` with `status: "active"` |
| TEAM-02 | Owner can see workload summary per member — open issue counts | `issuesApi.list({ assigneeUserId })` is the correct query; count is derived as `issues.filter(i => i.status !== "done" && i.status !== "cancelled").length`; same pattern for AI agents using `assigneeAgentId` |
</phase_requirements>

---

## Summary

Phase 3 is entirely additive UI work. All backend data is already available: `GET /companies/:companyId/members` returns human members with display name and email (built in Phase 1, Plan 02); `issuesApi.list({ assigneeUserId })` filters by human assignee (used in Phase 1 MyIssues); `agentsApi.list()` returns AI agents already used everywhere. No schema migrations, no new backend routes, and no new npm packages are required.

The two non-trivial design decisions are: (1) how to add group headers to the assignee picker, and (2) how to structure workload queries efficiently. For the picker, the existing `InlineEntitySelector` is a flat list — it needs either a `groups` prop or a sibling component. Given that `IssueProperties` builds its picker manually (not using `InlineEntitySelector`), and `NewIssueDialog` uses `InlineEntitySelector`, the cleanest approach is to add a `groups?: Array<{ heading: string; options: InlineEntityOption[] }>` prop to `InlineEntitySelector` — flat options and grouped options co-exist via the same component. For workload, each member's open issue count is fetched per-member using `issuesApi.list({ assigneeUserId })` — this is N+1 if done naively. Since the team page is owner-only and member counts are typically small (<20), N parallel `useQuery` calls per member row is acceptable.

The single gating concern is that `GET /companies/:companyId/members` requires the `users:manage_permissions` permission. Owners always have this permission (granted at board-claim time). The UI needs to call this endpoint as the owner, which is the only actor on the team/org page.

**Primary recommendation:** The three roadmap plans map cleanly — `resolveAssigneeName` helper + Org.tsx Team Members section (03-01), grouped assignee picker across all three surfaces (03-02), workload summary on team page (03-03). No new packages. Extend existing `InlineEntitySelector` with optional `groups` prop.

---

## Standard Stack

### Core (all already installed — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React + TanStack Query | 5.x | Data fetching + parallel per-member queries | Established project pattern |
| Radix UI / shadcn/ui | installed | Popover, CommandGroup, CommandSeparator | All picker UI already uses these |
| Lucide React | installed | Icons (`Users`, `User`, `Bot`) | All icons come from lucide |
| Vitest | ^3.0.5 | Unit tests for new helper and grouping logic | Project-wide test runner |

### No new npm installs needed

All primitives are in place. Phase 3 adds data fetching, a UI helper, and conditional rendering — zero new dependencies.

---

## Architecture Patterns

### Pattern 1: Members API — UI-side client method

The backend route `GET /companies/:companyId/members` already exists (built in Phase 1). The UI `accessApi` object does not yet expose it. Add a single method:

```typescript
// File: ui/src/api/access.ts — add to accessApi object
listMembers: (companyId: string) =>
  api.get<CompanyMember[]>(`/companies/${companyId}/members`),
```

The return type `CompanyMember` needs to be defined locally (or inlined as the shape returned by the backend):

```typescript
export type CompanyMember = {
  id: string;                    // membership id
  companyId: string;
  principalType: string;         // "user" | "board" | ...
  principalId: string;           // the userId
  membershipRole: string;        // "owner" | "member"
  status: string;                // "active" | "pending_approval" | ...
  createdAt: Date;
  updatedAt: Date;
  userDisplayName: string | null;
  userEmail: string | null;
};
```

Add the query key to `queryKeys.access`:

```typescript
// File: ui/src/lib/queryKeys.ts — extend access object
access: {
  ...existing,
  members: (companyId: string) => ["access", "members", companyId] as const,
},
```

### Pattern 2: `resolveAssigneeName` helper

The `formatAssigneeUserLabel` function in `assignees.ts` returns `"Me"`, `"Board"`, or a 5-char ID truncation. Phase 3 needs a richer display name that can use actual member data. Add a helper:

```typescript
// File: ui/src/lib/assignees.ts — new export
export function resolveAssigneeName(
  issue: { assigneeAgentId: string | null; assigneeUserId: string | null },
  agents: Agent[] | undefined,
  members: CompanyMember[] | undefined,
  currentUserId: string | null | undefined,
): string | null {
  if (issue.assigneeAgentId) {
    return agents?.find((a) => a.id === issue.assigneeAgentId)?.name ?? null;
  }
  if (issue.assigneeUserId) {
    if (currentUserId && issue.assigneeUserId === currentUserId) return "Me";
    const member = members?.find((m) => m.principalId === issue.assigneeUserId);
    return member?.userDisplayName ?? member?.userEmail ?? issue.assigneeUserId.slice(0, 8);
  }
  return null;
}
```

This is used in `IssueRow` and anywhere an issue card shows an assignee label. It replaces the partial `formatAssigneeUserLabel` for human members.

### Pattern 3: Grouped Assignee Picker

**Problem:** `InlineEntitySelector` currently renders a flat list. ASGN-02 requires two labelled groups: "Team Members" and "AI Agents".

**Solution:** Add an optional `groups` prop to `InlineEntitySelector`:

```typescript
// File: ui/src/components/InlineEntitySelector.tsx — extend interface
interface OptionGroup {
  heading: string;
  options: InlineEntityOption[];
}

interface InlineEntitySelectorProps {
  // ... existing props ...
  groups?: OptionGroup[];  // if provided, renders grouped instead of flat
}
```

When `groups` is provided, render a separator with a heading label between groups:

```tsx
// Inside the dropdown list area
{groups
  ? groups.map((group) => (
      <div key={group.heading}>
        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
          {group.heading}
        </div>
        {group.options.map((option, /* ... */) => (
          /* ... same button as flat ... */
        ))}
      </div>
    ))
  : flatOptions.map(/* ... existing rendering ... */)}
```

**For IssueProperties** (which builds its picker manually, not using `InlineEntitySelector`): add a heading row between the `{currentUserId && ...}` "Assign to me" button block and the `{sortedAgents ...}` block. Insert a new "Team Members" block above agents.

**For CommandPalette**: the assignee picker in the Command dialog uses `CommandGroup` + `CommandSeparator`, which already support headings — just split the current flat agent list into two `CommandGroup` sections.

### Pattern 4: Per-Member Workload Summary

For TEAM-02, open issue counts per member are computed by fetching issues filtered by `assigneeUserId` (or `assigneeAgentId` for AI agents) and counting non-terminal statuses.

The terminal statuses are `"done"` and `"cancelled"`. Everything else (`todo`, `in_progress`, `in_review`, `backlog`, `blocked`) counts as open.

```typescript
// Count open issues for a human member
const { data: issues = [] } = useQuery({
  queryKey: queryKeys.issues.list(companyId) + [memberId],  // derived key
  queryFn: () => issuesApi.list(companyId, { assigneeUserId: memberId }),
  enabled: !!companyId,
});
const openCount = issues.filter(
  (i) => i.status !== "done" && i.status !== "cancelled"
).length;
```

Use a small helper component `MemberWorkloadRow` that accepts a `memberId` (or `agentId`) and internally owns this query. This avoids prop-drilling count data from parent.

### Pattern 5: Org.tsx Extension for TEAM-01

The current `Org.tsx` fetches `agentsApi.org(companyId)` and renders `<OrgTree>`. After the AI tree section, add a second `useQuery` for members:

```typescript
const { data: members = [] } = useQuery({
  queryKey: queryKeys.access.members(selectedCompanyId!),
  queryFn: () => accessApi.listMembers(selectedCompanyId!),
  enabled: !!selectedCompanyId,
});

const humanMembers = members.filter(
  (m) => m.principalType === "user" && m.status === "active"
);
```

Then render a separate `<div>` section below the `OrgTree`, visually distinct (separate card or section heading "Team Members").

### Anti-Patterns to Avoid

- **Adding humans to the AI org tree:** The `OrgNode` type has `reports: OrgNode[]` and `status` interpreted as agent status (active/paused/error). Human members don't have this shape. The requirement explicitly says "separate from the AI org chart" (TEAM-01).
- **Fetching all issues then filtering client-side for workload:** Use the `assigneeUserId` filter on the API — do not load the full issue list and filter. The filter is already supported by `issuesApi.list`.
- **Using a single flat query for all member workloads:** Fine for <20 members. Would not scale but is acceptable for v1.
- **Forgetting to handle `userDisplayName: null`:** The backend LEFT JOINs `auth_users` — if the join misses, both fields are null. Always fall back to `userEmail ?? principalId.slice(0, 8)`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Search/filter in assignee picker | Custom input + filter logic | Existing `InlineEntitySelector` search input | Already handles query state, keyboard nav, and highlighted index |
| Group headings in Command picker | Custom command list | `CommandGroup` + `CommandSeparator` from `@/components/ui/command` | Radix CMD already provides accessible heading groups |
| Avatar/icon for human member | Custom avatar component | `User` icon from lucide (same as existing human rows in `IssueProperties`) | Consistent with existing "Assign to me" row styling |
| Issue status filtering | Custom status constants | `status !== "done" && status !== "cancelled"` — use IssueStatus constants from `@paperclipai/shared` if available | Avoid magic strings |

**Key insight:** Every building block already exists. Phase 3 is assembly, not invention.

---

## Common Pitfalls

### Pitfall 1: Members API Permission Gate

**What goes wrong:** `GET /companies/:companyId/members` requires `users:manage_permissions`. A non-owner member calling it gets 403.
**Why it happens:** The endpoint was designed for the settings page, not a general-purpose member list.
**How to avoid:** This is an owner-only view (Org page). Only the owner sees "Team Members". The query should only fire when `selectedCompany?.membershipRole === "owner"` or similar. Verify in the UI with `enabled: !!selectedCompanyId && isOwner`.
**Warning signs:** 403 errors in the browser network tab when a non-owner visits /org.

### Pitfall 2: `principalId` vs `userId` Confusion

**What goes wrong:** The member row has `principalId` (the user's auth id) but `issuesApi.list` uses `assigneeUserId` as the filter. These are the same value but named differently.
**How to avoid:** When building `assigneeValue` for a human member, use `assigneeValueFromSelection({ assigneeUserId: member.principalId })`. When building the workload query, pass `{ assigneeUserId: member.principalId }`.
**Warning signs:** Empty workload counts for all human members, or picker selecting the wrong user.

### Pitfall 3: Flat InlineEntitySelector Search Breaking Groups

**What goes wrong:** If groups are rendered but the search filter only applies to the `allOptions` flat array, options in groups won't be filtered.
**How to avoid:** When `groups` prop is provided, filter each group's `options` array by the current search query using the same `haystack.includes(term)` logic as the flat path.
**Warning signs:** Typing in the search box shows "No results" even though matching options exist in groups.

### Pitfall 4: Duplicate "Assign to me" in Grouped Picker

**What goes wrong:** In `NewIssueDialog`, `currentUserAssigneeOption` adds a "Me" option at the top of the flat list. If humans are in a "Team Members" group, "Me" appears twice — once at the top and once inside the group.
**How to avoid:** When building grouped options, exclude the current user from the "Team Members" group (they're already in the top-level "Me" shortcut). Filter: `members.filter(m => m.principalId !== currentUserId)`.
**Warning signs:** Current user appears twice in the picker dropdown.

### Pitfall 5: userDisplayName is null for Pending Members

**What goes wrong:** A member who was invited but hasn't completed signup may have joined the `companyMemberships` table but not the `auth_users` table yet (or with no name set).
**How to avoid:** The fallback chain is: `userDisplayName ?? userEmail ?? principalId.slice(0, 8)`. This handles all null states gracefully.
**Warning signs:** "undefined" or blank name shown in Team Members section.

---

## Code Examples

### Adding `listMembers` to `accessApi`

```typescript
// Source: server/src/routes/access.ts:2872 — GET /companies/:companyId/members
// File: ui/src/api/access.ts

export type CompanyMember = {
  id: string;
  companyId: string;
  principalType: string;
  principalId: string;
  membershipRole: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  userDisplayName: string | null;
  userEmail: string | null;
};

// Add inside accessApi object:
listMembers: (companyId: string) =>
  api.get<CompanyMember[]>(`/companies/${companyId}/members`),
```

### Using `listMembers` in Org.tsx

```typescript
// File: ui/src/pages/Org.tsx
import { accessApi } from "../api/access";

const { data: members = [] } = useQuery({
  queryKey: queryKeys.access.members(selectedCompanyId!),
  queryFn: () => accessApi.listMembers(selectedCompanyId!),
  enabled: !!selectedCompanyId,
});

const humanMembers = members.filter(
  (m) => m.principalType === "user" && m.status === "active"
);
```

### Grouped assignee options for NewIssueDialog

```typescript
// File: ui/src/components/NewIssueDialog.tsx
const assigneeGroups = useMemo(() => [
  {
    heading: "Team Members",
    options: [
      ...currentUserAssigneeOption(currentUserId),
      ...(humanMembers ?? [])
        .filter((m) => m.principalId !== currentUserId)
        .map((m) => ({
          id: assigneeValueFromSelection({ assigneeUserId: m.principalId }),
          label: m.userDisplayName ?? m.userEmail ?? m.principalId.slice(0, 8),
          searchText: `${m.userDisplayName ?? ""} ${m.userEmail ?? ""}`,
        })),
    ],
  },
  {
    heading: "AI Agents",
    options: sortAgentsByRecency(
      (agents ?? []).filter((agent) => agent.status !== "terminated"),
      recentAssigneeIds,
    ).map((agent) => ({
      id: assigneeValueFromSelection({ assigneeAgentId: agent.id }),
      label: agent.name,
      searchText: `${agent.name} ${agent.role} ${agent.title ?? ""}`,
    })),
  },
], [agents, humanMembers, currentUserId, recentAssigneeIds]);
```

### Workload count per member in Org.tsx

```typescript
// File: ui/src/pages/Org.tsx — per-member component
function MemberWorkloadRow({
  companyId,
  memberId,
  displayName,
}: {
  companyId: string;
  memberId: string;
  displayName: string;
}) {
  const { data: issues = [] } = useQuery({
    queryKey: ["issues", companyId, "by-user", memberId],
    queryFn: () => issuesApi.list(companyId, { assigneeUserId: memberId }),
    enabled: !!companyId,
  });
  const openCount = issues.filter(
    (i) => i.status !== "done" && i.status !== "cancelled"
  ).length;
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm">
      <User className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="flex-1">{displayName}</span>
      <span className="text-xs text-muted-foreground">{openCount} open</span>
    </div>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Assignee picker showed only AI agents | Phase 2 added "Assign to me" (current user) as a single human option | Phase 2, plan 02-03 | ASGN-02 now needs full human members list, not just self |
| `formatAssigneeUserLabel` returned short IDs | Now returns "Me" / "Board" for known IDs | Phase 2 | Phase 3 replaces this with `resolveAssigneeName` for full display names |
| `IssueProperties` assignee list = agents only | Phase 2 added "Assign to me" and "Assign to requester" shortcuts | Phase 2 | Phase 3 extends to all company human members |

**Not deprecated:**
- `resolveAssigneePatch` — still correct; Phase 3 uses the same utility for assignment mutations
- `assigneeValueFromSelection` / `parseAssigneeValue` — still the canonical encode/decode for `user:` and `agent:` prefixed values

---

## Open Questions

1. **Should "Team Members" section in Org.tsx be visible to non-owners?**
   - What we know: TEAM-01 says "owner can see" — the requirement targets the owner. The Org page is currently accessible to all authenticated users.
   - What's unclear: Should a human member see other human members on the Org page?
   - Recommendation: Show the "Team Members" section to all authenticated users (owners and members). Workload counts (TEAM-02) can be restricted to owners only if needed. The members list itself is not sensitive. Gate only if spec explicitly says owner-only.

2. **`InlineEntitySelector` groups prop vs. separate component?**
   - What we know: The `groups` prop approach keeps backward compatibility — all existing `InlineEntitySelector` usages continue working with just `options`.
   - What's unclear: Whether the grouped search logic introduces enough complexity to warrant a separate component.
   - Recommendation: Extend `InlineEntitySelector` with `groups` — the filtering logic is identical; only the render output differs.

3. **CommandPalette assignee assignment surface**
   - What we know: The roadmap says "command palette shows humans and AI agents in distinct grouped sections." The current `CommandPalette` component is a navigation/search tool; it can open a new issue dialog but doesn't have inline assignee selection.
   - What's unclear: ASGN-02 refers to the assignee picker within the new issue creation flow, which is opened from the command palette via `openNewIssue()`. The grouped picker in `NewIssueDialog` satisfies this.
   - Recommendation: Plan 03-02 should focus on the picker in `NewIssueDialog` + `IssueProperties`. The command palette itself only needs to open the dialog. Clarify in PLAN.md.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (both frontend and backend) |
| Config file | `ui/vitest.config.ts` / `server/vitest.config.ts` |
| Quick run command (UI) | `pnpm --filter @paperclipai/ui vitest run` |
| Quick run command (server) | `pnpm --filter @paperclipai/server vitest run` |
| Full suite command | `pnpm vitest run` (from repo root) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IDENT-03 | `resolveAssigneeName` returns display name from members list | unit | `pnpm --filter @paperclipai/ui vitest run ui/src/lib/assignees.test.ts --reporter=verbose` | ✅ (file exists; add test cases) |
| ASGN-01 | Grouped assignee options include human member with `user:` prefix | unit | `pnpm --filter @paperclipai/ui vitest run ui/src/lib/assignees.test.ts --reporter=verbose` | ✅ (file exists; add test cases) |
| ASGN-02 | InlineEntitySelector renders group headings when `groups` prop passed | unit | `pnpm --filter @paperclipai/ui vitest run ui/src/components/__tests__/InlineEntitySelector.test.tsx --reporter=verbose` | ❌ Wave 0 |
| TEAM-01 | Org.tsx human members section renders member display names | manual-only | N/A | N/A |
| TEAM-02 | MemberWorkloadRow renders correct open issue count | unit | `pnpm --filter @paperclipai/ui vitest run ui/src/components/__tests__/MemberWorkloadRow.test.tsx --reporter=verbose` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @paperclipai/ui vitest run`
- **Per wave merge:** Both UI and server: `pnpm --filter @paperclipai/ui vitest run && pnpm --filter @paperclipai/server vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `ui/src/components/__tests__/InlineEntitySelector.test.tsx` — tests grouped rendering for ASGN-02
- [ ] `ui/src/components/__tests__/MemberWorkloadRow.test.tsx` — tests open count derivation for TEAM-02

*(Existing `ui/src/lib/assignees.test.ts` already exists — add `resolveAssigneeName` test cases in Plan 03-01 rather than creating a new file.)*

---

## Sources

### Primary (HIGH confidence)

- Direct codebase read: `server/src/routes/access.ts:2872` — `GET /companies/:companyId/members` endpoint, permission requirement `users:manage_permissions`
- Direct codebase read: `server/src/services/access.ts:79` — `listMembers` returns `userDisplayName` + `userEmail` via LEFT JOIN on `auth_users`
- Direct codebase read: `ui/src/api/issues.ts` — `issuesApi.list` accepts `assigneeUserId` filter, already used for MyIssues
- Direct codebase read: `ui/src/lib/assignees.ts` — `assigneeValueFromSelection`, `parseAssigneeValue`, `resolveAssigneePatch`, `formatAssigneeUserLabel` — all available for reuse
- Direct codebase read: `ui/src/components/InlineEntitySelector.tsx` — flat list; no native groups support
- Direct codebase read: `ui/src/components/IssueProperties.tsx:365-435` — manual assignee picker; agents-only list with two hard-coded human shortcuts
- Direct codebase read: `ui/src/components/NewIssueDialog.tsx:791-803` — `assigneeOptions` useMemo builds flat array
- Direct codebase read: `ui/src/components/CommandPalette.tsx` — uses `CommandGroup`/`CommandSeparator` from shadcn; opener for new issue dialog via `openNewIssue()`
- Direct codebase read: `ui/src/lib/queryKeys.ts` — `access.joinRequests` key exists; `access.members` does not yet
- Direct codebase read: `ui/src/pages/Org.tsx` — renders `OrgTree` only; no member section

### Secondary (MEDIUM confidence)

- Phase 2 RESEARCH.md (`.planning/phases/02-task-work-surface/02-RESEARCH.md`) — confirms standard stack, test commands, and pattern precedents
- Phase 2 VALIDATION.md — confirms `pnpm --filter @paperclipai/ui vitest run` as the project's standard UI test command

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all confirmed by direct codebase inspection; no new packages
- Architecture: HIGH — all patterns based on directly observed code structures
- Pitfalls: HIGH — based on actual code behavior (permission gate confirmed at `access.ts:2874`; principalId/assigneeUserId confirmed by field names in schema)

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable codebase, no fast-moving dependencies)
