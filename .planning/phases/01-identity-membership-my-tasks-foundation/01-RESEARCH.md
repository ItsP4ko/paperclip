# Phase 1: Identity, Membership & My Tasks Foundation - Research

**Researched:** 2026-04-03
**Domain:** React SPA + Express API — invite flow, members API, issues filter, sidebar badges
**Confidence:** HIGH (all findings verified directly from source code)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| IDENT-01 | Owner can invite human users to the company via email/link from CompanySettings | `accessApi.createCompanyInvite` exists; backend `POST /companies/:id/invites` supports `allowedJoinTypes:"human"`. CompanySettings has invite UI only for OpenClaw agents today — needs a human invite button added. |
| IDENT-02 | Invited human can join the company through the invite landing page | `InviteLandingPage` already handles human joins (`requestType:"human"`). End-to-end flow exists. Blocker in STATE.md: do a manual smoke test before assuming it works. |
| IDENT-04 | Backend returns human member display name and email (join auth_users in members API) | `accessService.listMembers()` does a bare `select()` from `companyMemberships` — no join to `authUsers`. Fix required: add LEFT JOIN on `authUsers.id = principalId WHERE principalType = 'user'`. |
| TASKS-01 | Human user sees a dedicated "My Tasks" dashboard with issues assigned to them | `MyIssues` page exists at `ui/src/pages/MyIssues.tsx` but is NOT registered in `App.tsx` routes and NOT linked in `Sidebar.tsx`. |
| TASKS-02 | MyIssues filter correctly uses `assigneeUserId=me` (fix existing bug) | Current `MyIssues.tsx` calls `issuesApi.list(selectedCompanyId!)` with NO filters — it loads all issues then client-filters for `!assigneeAgentId && !done`. Must be changed to `assigneeUserId: "me"`. |
| TASKS-04 | Sidebar badge count reflects number of tasks assigned to the human user | `SidebarBadges` type has `{ inbox, approvals, failedRuns, joinRequests }` — no `myTasks` field. `sidebarBadgeService` and `sidebar-badges` route need to add a `myTasks` count. `SidebarNavItem` already supports a `badge` prop. |
| TASKS-05 | My Tasks page is accessible from the main navigation sidebar | `Sidebar.tsx` has no "My Tasks" link. Need to add `<SidebarNavItem to="/my-tasks" label="My Tasks" icon={ListTodo} badge={...} />` in the Work section. |
</phase_requirements>

---

## Summary

Phase 1 is almost entirely **UI wiring and small backend amendments** — no schema migrations needed. The backend already supports the core primitives: `assigneeUserId` on issues, `allowedJoinTypes: "human"` on invites, human `principalType: "user"` in `companyMemberships`, and the `assigneeUserId=me` server filter in the issues route. Three gaps need closing:

1. **MyIssues page is orphaned.** `MyIssues.tsx` exists but is never imported in `App.tsx`, never linked in `Sidebar.tsx`, and has a wrong filter (no `assigneeUserId`). All three things must be fixed in the same plan.

2. **Members API lacks user identity.** `accessService.listMembers()` returns raw membership rows with no user name or email. Adding a LEFT JOIN to `authUsers` on `principalId` (where `principalType = 'user'`) is the minimal correct fix — no migration required, `authUsers` already exists in the schema.

3. **Human invite UI is absent from CompanySettings.** The page has an OpenClaw-only invite button. A separate "Invite human" button calling `accessApi.createCompanyInvite(companyId, { allowedJoinTypes: "human" })` and displaying the resulting invite URL is missing.

**Primary recommendation:** Fix in three focused plans: (01-01) MyIssues filter + route + sidebar link; (01-02) members API auth_users join + invite UI in CompanySettings; (01-03) myTasks badge in sidebar-badges service/route/type + sidebar badge wiring.

---

## Standard Stack

### Core (existing — do not introduce new libraries)
| Library | Version | Purpose | Note |
|---------|---------|---------|------|
| React 19 | 19.0.0 | UI framework | Already installed |
| TanStack Query | 5.x | Server state, caching, invalidation | Pattern: `useQuery` + `queryKeys.*` |
| React Router DOM | 7.1.5 | Client routing | Company-prefix-aware wrappers in `@/lib/router` |
| Drizzle ORM | 0.38.4 | DB queries in server services | Pattern: service factory receiving `db: Db` |
| Zod | 3.24.x | Input validation on route bodies | Via `validate()` middleware |
| lucide-react | existing | Icons (e.g. `ListTodo`) | Already used in Sidebar |
| shadcn/ui | existing | UI primitives (Button, etc.) | Under `ui/src/components/ui/` |

No new packages required for this phase.

### Installation
```bash
# No new packages needed
```

---

## Architecture Patterns

### Recommended Project Structure (additions for this phase)
```
ui/src/
├── pages/
│   └── MyIssues.tsx          # exists — fix filter, keep file
├── components/
│   └── Sidebar.tsx           # add MyTasks nav item
├── api/
│   └── access.ts             # already has createCompanyInvite
└── App.tsx                   # add /my-tasks route + import MyIssues

server/src/
├── services/
│   ├── access.ts             # fix listMembers — add auth_users join
│   └── sidebar-badges.ts     # add myTasks count parameter
├── routes/
│   ├── sidebar-badges.ts     # pass myTasks count to svc.get()
│   └── (access.ts unchanged for invite — backend already works)

packages/shared/src/types/
└── sidebar-badges.ts         # add myTasks?: number field
```

### Pattern 1: Issues List Filter (assigneeUserId=me)
**What:** The issues list route resolves `"me"` to the actual `req.actor.userId` server-side. The UI just passes the string literal.
**When to use:** Whenever the frontend needs "current user" filtering — never send the real userId, send `"me"`.
**Example:**
```typescript
// Source: ui/src/api/issues.ts (existing pattern)
issuesApi.list(companyId, { assigneeUserId: "me" })

// Backend (server/src/routes/issues.ts:294-297) — already handles this:
const assigneeUserId =
  assigneeUserFilterRaw === "me" && req.actor.type === "board"
    ? req.actor.userId
    : assigneeUserFilterRaw;
```

### Pattern 2: Service Factory
**What:** All server services follow `export function fooService(db: Db) { return { ... } }`.
**Example:**
```typescript
// Source: server/src/services/access.ts
export function accessService(db: Db) {
  async function listMembers(companyId: string) {
    return db.select().from(companyMemberships)...
  }
  return { listMembers, ... };
}
```

### Pattern 3: SidebarNavItem Badge
**What:** `SidebarNavItem` accepts a `badge?: number` prop that renders a pill count when `> 0`.
**Example:**
```typescript
// Source: ui/src/components/SidebarNavItem.tsx:78-87
{badge != null && badge > 0 && (
  <span className={cn("ml-auto rounded-full px-1.5 py-0.5 text-xs leading-none", ...)}>
    {badge}
  </span>
)}
// Usage:
<SidebarNavItem to="/my-tasks" label="My Tasks" icon={ListTodo} badge={myTasksCount} />
```

### Pattern 4: Sidebar Badges Fetch
**What:** `CompanyRail` fetches `sidebarBadgesApi.get(companyId)` and stores result in TanStack Query under `queryKeys.sidebarBadges(companyId)`. Sidebar components read from this cache.
**Example:**
```typescript
// Source: ui/src/components/CompanyRail.tsx:178-180
useQuery({
  queryKey: queryKeys.sidebarBadges(companyId),
  queryFn: () => sidebarBadgesApi.get(companyId),
})
// To get myTasks count in Sidebar.tsx, query same key and read badges.myTasks
```

### Pattern 5: Route Registration in App.tsx
**What:** All board routes live in `boardRoutes()` function. Add route before the catch-all `"*"`.
**Example:**
```typescript
// Source: ui/src/App.tsx:119-180
function boardRoutes() {
  return (
    <>
      ...
      <Route path="my-tasks" element={<MyIssues />} />
      ...
    </>
  );
}
```

### Pattern 6: Drizzle LEFT JOIN for auth_users
**What:** To add display name + email to membership rows, LEFT JOIN `authUsers` on `principalId`.
**Example:**
```typescript
// Source: server/src/services/access.ts — extend listMembers
import { authUsers, companyMemberships } from "@paperclipai/db";
import { and, eq, sql } from "drizzle-orm";

async function listMembers(companyId: string) {
  return db
    .select({
      ...companyMemberships,          // all existing fields
      userDisplayName: authUsers.name,
      userEmail: authUsers.email,
    })
    .from(companyMemberships)
    .leftJoin(
      authUsers,
      and(
        eq(companyMemberships.principalType, "user"),
        eq(companyMemberships.principalId, authUsers.id),
      )
    )
    .where(eq(companyMemberships.companyId, companyId))
    .orderBy(sql`${companyMemberships.createdAt} desc`);
}
```
Note: For non-user principals (agents), `userDisplayName` and `userEmail` will be `null`. That is correct.

### Pattern 7: Invite URL Generation in CompanySettings
**What:** `accessApi.createCompanyInvite` POSTs to `/companies/:id/invites` and returns `{ inviteUrl, token, expiresAt }`. Display the URL for the owner to copy.
**Example:**
```typescript
// Source: ui/src/api/access.ts:98-106
accessApi.createCompanyInvite(companyId, { allowedJoinTypes: "human" })
// Returns: CompanyInviteCreated { id, token, inviteUrl, expiresAt, ... }
// inviteUrl is the absolute URL — display it directly in a read-only input
```
The backend already builds `inviteUrl` as `${requestBaseUrl(req)}/invite/${token}`. No backend changes needed for the invite creation itself.

### Anti-Patterns to Avoid
- **Filtering issues client-side:** Never fetch all issues and filter in the browser. Always pass `assigneeUserId: "me"` to `issuesApi.list()`.
- **Hardcoding userId in filter:** Never pass the real UUID to the filter. The backend resolves `"me"` to the actor's userId — use the literal string.
- **Skipping queryKey specificity:** The MyIssues query must use `queryKeys.issues.listAssignedToMe(companyId)` (already defined), not the generic `queryKeys.issues.list(companyId)` which is shared with Issues.tsx.
- **Adding myTasks count to inbox badge:** The myTasks badge is a separate counter on the "My Tasks" sidebar item — do NOT add it to `badges.inbox` (which is for the Inbox nav item).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Current user ID in filter | Custom userId resolver | `assigneeUserId: "me"` literal | Backend already handles `"me"` → `req.actor.userId` |
| Issue badge count | Custom fetch hook | `sidebarBadgesApi.get` + `queryKeys.sidebarBadges` | Consistent with existing badge infrastructure |
| Invite token generation | Custom token function | `accessApi.createCompanyInvite` | Backend already handles token creation, hashing, TTL, collision retry |
| Session user lookup | Custom auth query | `useQuery({ queryKey: queryKeys.auth.session, queryFn: authApi.getSession })` | Standard pattern used across 10+ components |
| Sidebar badge pill UI | Custom badge component | `SidebarNavItem badge={n}` prop | Component already supports badge rendering |

---

## Common Pitfalls

### Pitfall 1: MyIssues queryKey Collision
**What goes wrong:** Using `queryKeys.issues.list(companyId)` in MyIssues causes cache sharing with Issues.tsx, so updates to Issues.tsx refetch MyIssues and vice versa. Filters get lost on invalidation.
**Why it happens:** TanStack Query uses the queryKey for cache identity. The generic `list` key has no filter encoding.
**How to avoid:** Use `queryKeys.issues.listAssignedToMe(companyId)` which is already defined as `["issues", companyId, "assigned-to-me"]`.
**Warning signs:** MyIssues shows all issues instead of assigned ones after a cache invalidation.

### Pitfall 2: Human Join Requires Approval
**What goes wrong:** A human accepts the invite, but they are NOT immediately a member — they end up with `status: "pending_approval"` in `joinRequests`. They cannot see My Tasks because they lack company membership.
**Why it happens:** `POST /invites/:token/accept` creates a `joinRequests` row with `status: "pending_approval"`. Membership is only created at `POST /companies/:id/join-requests/:id/approve`.
**How to avoid:** Success criteria #2 says "lands inside the correct company" — the owner must approve the join request first. The invite UI should show the `"pending approval"` state clearly (InviteLandingPage already does). Document this in the plan: Phase 1 success requires the owner to approve after the human submits.
**Warning signs:** Human submits join request but gets 403 on all company APIs.

### Pitfall 3: tasks:assign Not Auto-Granted for Human Members
**What goes wrong:** Human member cannot be assigned issues because they lack `tasks:assign` permission.
**Why it happens:** `grantsFromDefaults` for `"human"` reads from `invite.defaultsPayload.human.grants`. Unlike agents (where `agentJoinGrantsFromDefaults` always injects `tasks:assign`), there is NO equivalent auto-grant for humans. `grantsFromDefaults("human")` returns an empty array if the invite's `defaultsPayload` has no human grants.
**How to avoid:** When creating the human invite link in CompanySettings, the `accessApi.createCompanyInvite` call should include `tasks:assign` in the defaults payload, OR the approve route should always grant `tasks:assign` to human members. The simplest fix is to mirror the agent pattern and always inject `tasks:assign` for human approvals in the approve route (`server/src/routes/access.ts:2636`).
**Warning signs:** Human can log in and see My Tasks page but the task list is empty even though they were assigned issues by an owner.

### Pitfall 4: listMembers Requires tasks:assign Permission
**What goes wrong:** When calling `GET /companies/:id/members`, the route asserts `users:manage_permissions` — a regular human member will get a 403.
**Why it happens:** The members endpoint is intended for admin use (managing permissions). IDENT-04 only requires the backend to return display name + email; it does not require a new endpoint exposed to non-owners.
**How to avoid:** IDENT-04 is satisfied by fixing `listMembers` for the owner's benefit. The human member does not need to call this endpoint for Phase 1. Do not change the authorization guard.
**Warning signs:** Attempting to display member names from this endpoint in a context accessible to regular members will get 403s.

### Pitfall 5: Sidebar Badge Needs Authenticated Actor
**What goes wrong:** The sidebar badge `myTasks` count query runs for all actors, but `assigneeUserId=me` requires `req.actor.type === "board"`. An unauthenticated or agent actor will get a 403 from the issues list.
**Why it happens:** The sidebar badge route runs for any company member — including agents hitting the API. The `"me"` expansion only works for board (human) actors.
**How to avoid:** In `sidebar-badges.ts` route, only compute `myTasks` count when `req.actor.type === "board"` and `req.actor.userId` is set. Default to `0` otherwise. (Same pattern used for `canApproveJoins`.)

---

## Code Examples

Verified patterns from source files:

### Fix MyIssues.tsx — correct filter
```typescript
// Source: ui/src/api/issues.ts:22-58 (issuesApi.list signature)
const { data: issues, isLoading, error } = useQuery({
  queryKey: queryKeys.issues.listAssignedToMe(selectedCompanyId!),
  queryFn: () => issuesApi.list(selectedCompanyId!, { assigneeUserId: "me" }),
  enabled: !!selectedCompanyId,
});

// Remove the client-side filter: display issues directly from the query result
// (backend already filters to the current user's assigned issues)
```

### Add /my-tasks route in App.tsx
```typescript
// Source: ui/src/App.tsx:119+ (boardRoutes pattern)
import { MyIssues } from "./pages/MyIssues";

// Inside boardRoutes():
<Route path="my-tasks" element={<MyIssues />} />
```

### Add sidebar nav item in Sidebar.tsx
```typescript
// Source: ui/src/components/Sidebar.tsx + SidebarNavItem.tsx
import { ListTodo } from "lucide-react";

// In the "Work" section, after Issues:
<SidebarNavItem
  to="/my-tasks"
  label="My Tasks"
  icon={ListTodo}
  badge={badges?.myTasks}
/>
```

### Extend SidebarBadges type
```typescript
// Source: packages/shared/src/types/sidebar-badges.ts
export interface SidebarBadges {
  inbox: number;
  approvals: number;
  failedRuns: number;
  joinRequests: number;
  myTasks: number;  // add this field
}
```

### Add myTasks to sidebarBadgeService
```typescript
// Source: server/src/services/sidebar-badges.ts
get: async (
  companyId: string,
  extra?: {
    joinRequests?: number;
    unreadTouchedIssues?: number;
    myTasks?: number;   // add this
  },
): Promise<SidebarBadges> => {
  // ... existing logic ...
  return {
    inbox: ...,
    approvals: actionableApprovals,
    failedRuns,
    joinRequests,
    myTasks: extra?.myTasks ?? 0,  // add this
  };
}
```

### Compute myTasks count in sidebar-badges route
```typescript
// Source: server/src/routes/sidebar-badges.ts
// Add after canApproveJoins calculation:
let myTasksCount = 0;
if (req.actor.type === "board" && req.actor.userId) {
  const myTasksRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(issues)
    .where(
      and(
        eq(issues.companyId, companyId),
        eq(issues.assigneeUserId, req.actor.userId),
        not(inArray(issues.status, ["done", "cancelled"])),
      )
    );
  myTasksCount = Number(myTasksRows[0]?.count ?? 0);
}

const badges = await svc.get(companyId, {
  joinRequests: joinRequestCount,
  myTasks: myTasksCount,
});
```

### Human invite button in CompanySettings
```typescript
// Source: ui/src/api/access.ts:98-106 (createCompanyInvite exists)
// ui/src/pages/CompanySettings.tsx (useMutation pattern)
const humanInviteMutation = useMutation({
  mutationFn: () =>
    accessApi.createCompanyInvite(selectedCompanyId!, {
      allowedJoinTypes: "human",
    }),
  onSuccess: (invite) => {
    setHumanInviteUrl(invite.inviteUrl);
  },
});
// Display invite.inviteUrl in a read-only input for the owner to copy/share
```

### Fix listMembers to include auth_users data
```typescript
// Source: server/src/services/access.ts:78-84 (current listMembers)
// packages/db/src/schema/auth.ts (authUsers table)
async function listMembers(companyId: string) {
  return db
    .select({
      id: companyMemberships.id,
      companyId: companyMemberships.companyId,
      principalType: companyMemberships.principalType,
      principalId: companyMemberships.principalId,
      membershipRole: companyMemberships.membershipRole,
      status: companyMemberships.status,
      createdAt: companyMemberships.createdAt,
      updatedAt: companyMemberships.updatedAt,
      userDisplayName: authUsers.name,
      userEmail: authUsers.email,
    })
    .from(companyMemberships)
    .leftJoin(
      authUsers,
      and(
        eq(companyMemberships.principalType, "user"),
        eq(companyMemberships.principalId, authUsers.id),
      )
    )
    .where(eq(companyMemberships.companyId, companyId))
    .orderBy(sql`${companyMemberships.createdAt} desc`);
}
```

---

## State of the Art

| Old Approach (current code) | Correct Approach | Impact |
|----------------------------|------------------|--------|
| `MyIssues` filters client-side on `!assigneeAgentId` | `issuesApi.list(id, { assigneeUserId: "me" })` | Shows actual assigned issues; scales to large lists |
| `listMembers` returns bare membership rows | LEFT JOIN `authUsers` on `principalId` | Returns display name + email as required by IDENT-04 |
| No human invite button in CompanySettings | `createCompanyInvite({ allowedJoinTypes: "human" })` | Enables IDENT-01 |
| `MyIssues` not routed or linked | Add route + sidebar nav item | Enables TASKS-01, TASKS-05 |
| `SidebarBadges` has no myTasks count | Add `myTasks` field + count query | Enables TASKS-04 |

---

## Open Questions

1. **tasks:assign auto-grant for humans**
   - What we know: `agentJoinGrantsFromDefaults` always injects `tasks:assign` for agents; no equivalent exists for humans.
   - What's unclear: Should `tasks:assign` be injected at approve-time unconditionally, or should it be driven by the invite's `defaultsPayload`? Phase 1 does not surface permission management UI, so the human member needs it automatically to be usable.
   - Recommendation: Modify the human approve path (line 2636 in `access.ts`) to mirror the agent pattern — inject `tasks:assign` unconditionally if not already present in grants. This mirrors the check at line 1435 for agents.

2. **InviteLanding human join smoke test**
   - What we know: The code path for human joins exists (`requestType: "human"` in `acceptInvite`), but STATE.md flags it as "not fully traced."
   - What's unclear: Whether the join creates a usable session state (company membership visible to the human's next page load) or if there are redirect/navigation issues after approval.
   - Recommendation: Plan 01-02 should include a manual smoke-test step: generate invite, join as human, approve, verify company access. If issues are found, add a fix task.

3. **issues table import in sidebar-badges route**
   - What we know: The sidebar-badges route currently imports `joinRequests` from `@paperclipai/db` but not `issues`.
   - What's unclear: Whether `issues` and `not`/`inArray` are already re-exported from the db package index, or need explicit import.
   - Recommendation: Verify imports by checking `packages/db/src/schema/index.ts` before writing the plan task. Low risk — all schema tables are exported from the same barrel.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.0.5 |
| Config file | `vitest.config.ts` (root), `ui/vitest.config.ts`, `server/vitest.config.ts` |
| Quick run command | `pnpm vitest run --project ui` |
| Full suite command | `pnpm test:run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TASKS-02 | MyIssues calls `issuesApi.list` with `assigneeUserId: "me"` | unit | `pnpm vitest run --project ui ui/src/pages/MyIssues.test.tsx` | ❌ Wave 0 |
| IDENT-04 | `listMembers` returns `userDisplayName` + `userEmail` fields | unit | `pnpm vitest run --project server server/src/__tests__/access-list-members.test.ts` | ❌ Wave 0 |
| TASKS-04 | Sidebar badges endpoint returns `myTasks` count | unit | `pnpm vitest run --project server server/src/__tests__/sidebar-badges.test.ts` | ❌ Wave 0 |
| TASKS-01 | `queryKeys.issues.listAssignedToMe` used in MyIssues (not generic list) | unit (inline) | covered by MyIssues.test.tsx | ❌ Wave 0 |
| IDENT-01 | CompanySettings has human invite button and displays returned URL | manual | n/a | manual-only |
| IDENT-02 | Human invite link → join → approval → company access | manual | n/a | manual-only |
| TASKS-05 | `/my-tasks` route navigates to MyIssues | manual / smoke | n/a | manual-only |

**Notes on manual-only:** IDENT-01, IDENT-02, TASKS-05 involve full browser flows (session cookies, redirects, real better-auth). These are E2E-level tests that would require Playwright. For Phase 1, treat them as manual smoke tests.

### Sampling Rate
- **Per task commit:** `pnpm vitest run --project ui` + `pnpm vitest run --project server`
- **Per wave merge:** `pnpm test:run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `ui/src/pages/MyIssues.test.tsx` — covers TASKS-02, TASKS-01 (mock issuesApi, assert `assigneeUserId: "me"`)
- [ ] `server/src/__tests__/access-list-members.test.ts` — covers IDENT-04 (assert returned rows include `userDisplayName`, `userEmail`)
- [ ] `server/src/__tests__/sidebar-badges.test.ts` — covers TASKS-04 (assert `myTasks` field present and computed from issues count)

---

## Sources

### Primary (HIGH confidence — verified directly from source files)
- `ui/src/pages/MyIssues.tsx` — confirmed buggy filter (`!assigneeAgentId` client-side)
- `ui/src/api/issues.ts` — confirmed `assigneeUserId?: string` filter parameter exists
- `server/src/routes/issues.ts:294-297` — confirmed `"me"` → `req.actor.userId` resolution
- `server/src/services/access.ts:78-84` — confirmed `listMembers` has no `authUsers` join
- `server/src/routes/access.ts:2626-2646` — confirmed human approval path and `grantsFromDefaults`
- `server/src/routes/access.ts:1393-1425` — confirmed `grantsFromDefaults` does NOT auto-inject `tasks:assign` for humans
- `ui/src/components/Sidebar.tsx` — confirmed no My Tasks nav item
- `ui/src/App.tsx` — confirmed no `/my-tasks` route registered
- `packages/shared/src/types/sidebar-badges.ts` — confirmed no `myTasks` field
- `server/src/services/sidebar-badges.ts` — confirmed no `myTasks` computation
- `ui/src/components/SidebarNavItem.tsx` — confirmed `badge` prop exists and renders correctly
- `ui/src/lib/queryKeys.ts` — confirmed `listAssignedToMe` key already exists
- `ui/src/api/access.ts:98-106` — confirmed `createCompanyInvite` API method exists
- `server/src/routes/access.ts:1938-1965` — confirmed `POST /companies/:id/invites` backend endpoint
- `ui/src/pages/CompanySettings.tsx:462-536` — confirmed existing invite UI is OpenClaw-only

### Secondary (MEDIUM confidence)
- STATE.md concern: "InviteLanding.tsx human join end-to-end not fully traced" — supports Pitfall 2 finding
- STATE.md concern: "Verify `tasks:assign` is auto-granted to owners at join time" — supports Pitfall 3 finding

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — entire stack verified in `.planning/codebase/STACK.md` + source files
- Architecture patterns: HIGH — all patterns extracted from verified source files
- Pitfalls: HIGH — Pitfalls 1-4 verified from source; Pitfall 5 inferred from existing `canApproveJoins` pattern (MEDIUM for 5)
- Validation: HIGH — test framework verified from `vitest.config.ts` + TESTING.md

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable codebase, no external API dependencies)
