# Phase 2: Task Work Surface - Research

**Researched:** 2026-04-03
**Domain:** Issue mutations, permission gates, assignee handoff, UI conditionals
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TASKS-03 | "Assigned to me" filter toggle available and functional in main Issues list view | `applyFilters` already handles `__me` sentinel; need a dedicated UI toggle button in IssuesList toolbar |
| ACTN-01 | Human can change status of their assigned tasks | `issuesApi.update` + `PATCH /issues/:id` already work; need conditional status controls in MyIssues and IssueDetail |
| ACTN-02 | Human can attach files to their assigned tasks | `issuesApi.uploadAttachment` + IssueDetail drag-drop already work; need to verify board actor path is not gated |
| ACTN-03 | Human can create subtasks within their assigned tasks | `issuesApi.create` with `parentId` + `CREATE /companies/:cId/issues`; need subtask UI surface in IssueDetail for human actors |
| ACTN-04 | Human can reassign a task to an AI agent (bidirectional handoff) | `IssueProperties` assignee picker + `parseAssigneeValue` utility + `issuesApi.update`; need AI run interruption warning before confirm |
| ACTN-05 | Reassignment sends both `assigneeAgentId` AND `assigneeUserId` atomically (prevent 422) | 422 thrown at service layer when both non-null; must nullify the departing field in same PATCH |
| ASGN-03 | UI warns when reassigning an in-progress AI task to a human (run interruption) | `runningIssueRun` + `liveRuns` already available in IssueDetail; need confirmation dialog before submitting |
| PERM-01 | Human member can only mutate issues assigned to them (unless owner) | No server-side gate exists yet; add check in `PATCH /issues/:id` using `membershipRole` and `assigneeUserId` |
| PERM-02 | Owner can edit/assign any issue in the company | Owner has `membershipRole: "owner"` in `companyMemberships`; skip gate for owners |
</phase_requirements>

---

## Summary

Phase 2 builds the interactive layer on top of the foundation laid in Phase 1. The backend already stores `assigneeUserId` on issues and `principalType: "user"` in memberships. Every write operation the human needs — status change, file attachment, subtask creation, reassignment — already exists as a server route and a frontend API call. What is missing is: (1) a permission gate that prevents a human member from mutating tasks they do not own, (2) a UI action bar in IssueDetail that is conditionally shown for human-assigned tasks, (3) a warning dialog before reassigning an AI-active task to a human, and (4) an atomic setAssignee utility that always nullifies the departing field to prevent the 422 "only one assignee" error.

The single biggest pitfall is the **422 error from dual-assignee**. The service layer (`issues.ts:1261`) throws `unprocessable("Issue can only have one assignee")` when both `nextAssigneeAgentId` and `nextAssigneeUserId` are non-null after merge. Any PATCH that sets `assigneeUserId` without explicitly nulling `assigneeAgentId` (or vice versa) will hit this if the issue currently has the other field set. The fix is a client-side utility `resolveAssigneePatch(value: string): { assigneeAgentId: string | null; assigneeUserId: string | null }` that returns both fields together.

The permission gate (PERM-01/PERM-02) requires reading `membershipRole` from `companyMemberships`. The `accessService` already exposes `getMembership(companyId, "user", userId)`. In `PATCH /issues/:id`, after `assertCompanyAccess`, add: if actor is a non-owner board user, verify `existing.assigneeUserId === req.actor.userId` or throw 403.

**Primary recommendation:** Three focused plans match the three existing plan slots in ROADMAP.md — setAssignee utility + reassignment warning (02-01), human action bar in IssueDetail (02-02), permission gate + "Assigned to me" toggle (02-03).

---

## Standard Stack

### Core (all already installed — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React + TanStack Query | 5.x | Data fetching + mutation with optimistic updates | Established project pattern |
| Radix UI / shadcn/ui | installed | Dialog, Popover, Button primitives | All issue UI built on this |
| Zod | installed | Schema validation on server | All route validators use zod |
| Drizzle ORM | installed | DB queries | All server queries use drizzle |
| Vitest | ^3.0.5 | Unit + integration tests | Project-wide test runner |

### No new npm installs needed

All necessary primitives (Dialog, Button, Popover, toast, mutation hooks) are already in the codebase. Phase 2 only adds logic and conditional rendering.

---

## Architecture Patterns

### Pattern 1: Atomic Assignee Patch Utility (ACTN-05 fix)

**What:** A single helper that converts an assignee picker value into a safe PATCH body where exactly one of the two assignee fields is non-null.

**When to use:** Every call site that changes issue assignee.

**Location:** `ui/src/lib/assignees.ts` (extend existing file)

```typescript
// Source: issues.ts:1261 — "Issue can only have one assignee"
export function resolveAssigneePatch(value: string): {
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
} {
  if (!value) return { assigneeAgentId: null, assigneeUserId: null };
  if (value.startsWith("agent:")) {
    return { assigneeAgentId: value.slice("agent:".length) || null, assigneeUserId: null };
  }
  if (value.startsWith("user:")) {
    return { assigneeAgentId: null, assigneeUserId: value.slice("user:".length) || null };
  }
  // backward compat: raw agent id
  return { assigneeAgentId: value || null, assigneeUserId: null };
}
```

`parseAssigneeValue` already exists and does the same thing — `resolveAssigneePatch` is an alias for clarity at call sites. The key rule is: **always send both fields** in the PATCH body when changing assignee.

### Pattern 2: Permission Gate in PATCH /issues/:id (PERM-01/PERM-02)

**What:** After `assertCompanyAccess`, before any mutation logic, check if the board user is a non-owner member trying to mutate a task they do not own.

**Location:** `server/src/routes/issues.ts` — `router.patch("/issues/:id", ...)`

```typescript
// Source: server/src/services/access.ts — getMembership returns { membershipRole }
// Board users always reach PATCH /issues/:id; existing gate only checks assignee changes.
// New gate: block non-owner members from mutating tasks assigned to others.
if (req.actor.type === "board" && req.actor.userId) {
  const membership = await access.getMembership(
    existing.companyId,
    "user",
    req.actor.userId,
  );
  const isOwner = membership?.membershipRole === "owner";
  const isLocalOrAdmin = req.actor.source === "local_implicit" || req.actor.isInstanceAdmin;
  if (!isOwner && !isLocalOrAdmin) {
    // Member: can only mutate tasks assigned to themselves
    if (existing.assigneeUserId !== req.actor.userId) {
      throw forbidden("Members can only mutate their own tasks");
    }
  }
}
```

**Important nuance:** `local_implicit` and `isInstanceAdmin` must bypass this gate (same pattern as `assertCompanyAccess`). Owners always bypass.

### Pattern 3: AI Run Interruption Warning Dialog (ASGN-03)

**What:** Before submitting a reassignment from an in-progress AI task to a human, show a confirmation Dialog. The dialog surfaces: the agent currently assigned, run start time, and a "Confirm" / "Cancel" action.

**Location:** New component `ui/src/components/ReassignWarningDialog.tsx` or inline in `IssueProperties.tsx`

```typescript
// Source: IssueDetail.tsx:355 — runningIssueRun already computed
// IssueProperties onUpdate is called directly; need interception when:
//   current issue has assigneeAgentId set AND status === "in_progress" AND new value is user:*
// Pattern: lift warning state into IssueProperties or caller; show Dialog before calling onUpdate
const [pendingReassign, setPendingReassign] = useState<string | null>(null);

function handleAssigneeSelect(value: string) {
  const isReassignToHuman = value.startsWith("user:");
  const hasActiveAiRun = !!issue.assigneeAgentId && issue.status === "in_progress";
  if (isReassignToHuman && hasActiveAiRun) {
    setPendingReassign(value);   // show warning dialog
    return;
  }
  confirmReassign(value);
}

function confirmReassign(value: string) {
  onUpdate(resolveAssigneePatch(value));
  setPendingReassign(null);
}
```

The Dialog uses `Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter` from `ui/src/components/ui/dialog.tsx` — the same set used in `ExecutionWorkspaceCloseDialog.tsx`.

### Pattern 4: Human Action Bar in IssueDetail (ACTN-01/ACTN-02/ACTN-03)

**What:** A conditional action row shown only when the issue is assigned to the current user (`issue.assigneeUserId === currentUserId`). Contains: status change control, file attachment button, add subtask button.

**When to use:** IssueDetail, triggered by `currentUserId` from `authApi.getSession()` (already queried at line 390–393).

**Location:** `ui/src/pages/IssueDetail.tsx` — insert near the top of the issue detail pane, before the comment thread.

**Status change:** Use `issuesApi.update(issueId, { status: nextStatus })` — already the mutation used for agents. No new API needed.

**File attachment:** `issuesApi.uploadAttachment(companyId, issueId, file)` — already wired in IssueDetail. Verify that the board actor path hits the same upload route (`POST /companies/:companyId/issues/:issueId/attachments`). Confirmed: route calls `assertCompanyAccess` only, no agent-specific gate.

**Subtask creation:** `issuesApi.create(companyId, { parentId: issueId, title, ... })` — route calls `assertCompanyAccess` + optional `assertCanAssignTasks` (only if assignee fields are provided). Creating an unassigned subtask requires no extra permission grant.

### Pattern 5: "Assigned to me" Filter Toggle (TASKS-03)

**What:** A single toggle button in the IssuesList toolbar. When active, adds `__me` to `state.assignees`. The `applyFilters` function at line 104 already handles `__me` by matching `issue.assigneeUserId === currentUserId`.

**Location:** `ui/src/components/IssuesList.tsx` — in the filter toolbar, alongside the existing Assignee popover filter.

```typescript
// Source: IssuesList.tsx:100-108 — __me sentinel already handled
<button
  onClick={() => onViewStateChange({ assignees: toggleInArray(state.assignees, "__me") })}
  className={cn("...", state.assignees.includes("__me") && "bg-accent")}
>
  <User className="h-3.5 w-3.5" />
  Assigned to me
</button>
```

`currentUserId` is not currently passed to `IssuesList` from `Issues.tsx`. The Issues page needs to query `authApi.getSession()` and pass `currentUserId` down, or `IssuesList` can query it internally (preferred — keeps Issues.tsx lean).

### Recommended Project Structure (no changes needed)

The existing structure is correct. Phase 2 adds:
```
ui/src/lib/assignees.ts          # extend: add resolveAssigneePatch export
ui/src/components/IssuesList.tsx # extend: add "Assigned to me" toggle
ui/src/pages/IssueDetail.tsx     # extend: add human action bar + reassign warning
ui/src/components/IssueProperties.tsx  # extend: intercept assignee change for warning
server/src/routes/issues.ts      # extend: add member permission gate in PATCH handler
```

### Anti-Patterns to Avoid

- **Sending only `assigneeUserId` without `assigneeAgentId: null`:** The service merges the incoming patch with existing values; if the issue has an `assigneeAgentId`, the merged result violates the XOR constraint and throws 422.
- **Gating file upload on agent check:** The attachment route is already board-accessible; adding an extra agent check would break human uploads.
- **Using `isInstanceAdmin` check without `source === "local_implicit"` check:** The authz pattern always combines both (see `assertCompanyAccess` line 124).
- **Showing human action bar for all issues:** Gate on `issue.assigneeUserId === currentUserId` — do not show for issues assigned to agents.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic assignee fields | Custom "clear other field" logic per call site | `resolveAssigneePatch(value)` utility | Single source of truth; the XOR constraint is enforced in 2 places in the service |
| Confirmation dialog | Native `window.confirm()` | `Dialog` from `ui/components/ui/dialog.tsx` | Project uses Radix Dialog everywhere; native confirm blocks the thread and ignores styling |
| Membership role lookup | Re-query DB in every gate | `access.getMembership()` (already exists in `accessService`) | One query, returns `membershipRole` directly |
| Session/currentUserId in IssuesList | Pass through Issues.tsx prop chain | `useQuery({ queryFn: authApi.getSession })` inside IssuesList | Already done this way in IssueDetail; consistent pattern |

---

## Common Pitfalls

### Pitfall 1: 422 on bidirectional reassignment (ACTN-05)

**What goes wrong:** UI sends `{ assigneeUserId: "xyz" }` to reassign to a human, but the issue already has `assigneeAgentId: "abc"`. Service merges: both fields are now non-null → 422 "Issue can only have one assignee."

**Why it happens:** `issuesApi.update` sends only the fields being changed. The service merge at line 1256–1259 fills in the missing field from `existing`.

**How to avoid:** Always send both fields: `issuesApi.update(id, { assigneeAgentId: null, assigneeUserId: "xyz" })`. Use `resolveAssigneePatch()` at every call site.

**Warning signs:** 422 error in the browser network tab; "Issue can only have one assignee" error text.

### Pitfall 2: Permission gate blocking owner operations

**What goes wrong:** The new PERM-01 gate rejects owners because `existing.assigneeUserId !== req.actor.userId` (owners assign to others by design).

**Why it happens:** Gate is applied without checking `membershipRole`.

**How to avoid:** Always check `membership?.membershipRole === "owner"` before enforcing the member-only restriction. Also skip for `local_implicit` and `isInstanceAdmin`.

### Pitfall 3: Warning dialog shows when reassigning to another human (not just AI→human)

**What goes wrong:** ASGN-03 warning fires on any reassignment, not just when an AI run is actively running.

**Why it happens:** Condition checked only `issue.assigneeAgentId !== null` without also requiring `status === "in_progress"` and a live run.

**How to avoid:** Gate the warning on all three: `issue.assigneeAgentId !== null && issue.status === "in_progress"` (the service and backend guarantee that `checkoutRunId` is set when in_progress with an agent). The `runningIssueRun` already accounts for this in IssueDetail.

### Pitfall 4: "Assigned to me" toggle persists stale data after reassignment

**What goes wrong:** After a human reassigns a task to an AI, the issue disappears from the filtered view mid-session because `__me` filter still active and re-queried data excludes it.

**Why it happens:** Client-side filter hides the row immediately after TanStack Query refetch.

**How to avoid:** This is expected behavior — the filter is working correctly. No special handling needed, but document this for UX clarity.

### Pitfall 5: Subtask creation fails with 422 if in_progress status is passed without assignee

**What goes wrong:** Creating a subtask with `status: "in_progress"` but no assignee throws 422 "in_progress issues require an assignee."

**Why it happens:** Service validation at line 1099 / 1264.

**How to avoid:** Create subtasks with `status: "todo"` (default). Only pass status if also sending an assignee.

---

## Code Examples

### Verified: Existing `IssuesList` filter pattern (TASKS-03 surface point)

```typescript
// Source: ui/src/components/IssuesList.tsx:100-108
if (state.assignees.length > 0) {
  result = result.filter((issue) => {
    for (const assignee of state.assignees) {
      if (assignee === "__unassigned" && !issue.assigneeAgentId && !issue.assigneeUserId) return true;
      if (assignee === "__me" && currentUserId && issue.assigneeUserId === currentUserId) return true;
      if (issue.assigneeAgentId === assignee) return true;
    }
    return false;
  });
}
// __me is already supported — just need the toggle button to set it
```

### Verified: Service XOR constraint (root cause of ACTN-05)

```typescript
// Source: server/src/services/issues.ts:1256-1262
const nextAssigneeAgentId =
  issueData.assigneeAgentId !== undefined ? issueData.assigneeAgentId : existing.assigneeAgentId;
const nextAssigneeUserId =
  issueData.assigneeUserId !== undefined ? issueData.assigneeUserId : existing.assigneeUserId;

if (nextAssigneeAgentId && nextAssigneeUserId) {
  throw unprocessable("Issue can only have one assignee"); // 422
}
```

### Verified: accessService.getMembership signature (for PERM-01 gate)

```typescript
// Source: server/src/services/access.ts:28-43
async function getMembership(
  companyId: string,
  principalType: PrincipalType, // "user" | "agent"
  principalId: string,
): Promise<MembershipRow | null>
// MembershipRow includes: { membershipRole: string | null, status: "active" | "pending" | "suspended" }
// owner membershipRole = "owner", regular members = "member"
```

### Verified: Board actor shape (for permission gate)

```typescript
// Source: server/src/routes/authz.ts
// req.actor.type === "board" means a human user
// req.actor.userId  — the user's id
// req.actor.source === "local_implicit" — local dev board (bypass gates)
// req.actor.isInstanceAdmin — instance admin (bypass gates)
```

### Verified: addCommentAndReassign mutation (IssueDetail.tsx:707) — reassignment goes through here

```typescript
// Source: ui/src/pages/IssueDetail.tsx:707-793
mutationFn: ({ body, reopen, interrupt, reassignment }) =>
  issuesApi.update(issueId!, {
    comment: body,
    assigneeAgentId: reassignment.assigneeAgentId,
    assigneeUserId: reassignment.assigneeUserId,
    ...(reopen ? { status: "todo" } : {}),
    ...(interrupt ? { interrupt } : {}),
  }),
// reassignment: { assigneeAgentId: string | null, assigneeUserId: string | null }
// This already sends both fields — safe. IssueProperties.onUpdate path sends only one field.
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| `assigneeAgentId` only | `assigneeAgentId` OR `assigneeUserId` (XOR) | Any assignee change must send both fields or risk 422 |
| All board users can mutate any issue | Member can only mutate their assigned issue (Phase 2 gate) | New server check needed; no existing guard covers this |
| No "Assigned to me" toggle in Issues view | `__me` sentinel already in `applyFilters` | Toggle button is purely a UI addition |

**No deprecated patterns in this phase.** The existing `addCommentAndReassign` mutation in IssueDetail already sends both assignee fields — this is the safe pattern to follow everywhere.

---

## Open Questions

1. **Should the permission gate block subtask creation for non-assignees?**
   - What we know: `POST /companies/:companyId/issues` calls `assertCanAssignTasks` only when an assignee is provided; otherwise it only calls `assertCompanyAccess`.
   - What's unclear: PERM-01 says "cannot mutate issues assigned to other users" — does creating a subtask inside someone else's issue count as mutation?
   - Recommendation: For Phase 2, only gate `PATCH /issues/:id`. Subtask creation (`POST`) is a separate operation and the roadmap does not list it as needing a gate. Revisit in Phase 3 if needed.

2. **Where to surface the human action bar: inside `IssueDetail` or `MyIssues`?**
   - What we know: MyIssues currently shows only a list row (no inline actions). IssueDetail has full issue context (liveRuns, attachments, etc.).
   - Recommendation: Put the action bar in `IssueDetail` only (success criterion #1 says "from My Tasks AND from the issue detail view" — My Tasks rows link to IssueDetail, so the detail view covers both entry points). A status change directly from the My Tasks list row is a nice-to-have; the success criterion uses "directly from My Tasks" to mean the route is accessible, not necessarily inline.

3. **Does `req.actor.userId` resolve correctly for human members?**
   - What we know: Blocker from STATE.md — "Confirm `principalType: 'board'` vs `'user'` distinction before building human permission gate." Board auth JWT sets `req.actor.type = "board"` and `req.actor.userId = session.userId`. Human members log in via the same board auth flow.
   - Recommendation: In Plan 02-03, add a test that creates a human member, logs in as them, and verifies `req.actor.userId` is their user ID. The `accessService.getMembership(companyId, "user", req.actor.userId)` call depends on this.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^3.0.5 |
| Config file | `ui/vitest.config.ts` (UI), `server/vitest.config.ts` (server) |
| Quick run command (UI) | `pnpm --filter @paperclipai/ui vitest run --reporter=verbose` |
| Quick run command (server) | `pnpm --filter @paperclipai/server vitest run --reporter=verbose` |
| Full suite command | `pnpm vitest run` (from root) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TASKS-03 | `__me` sentinel in `applyFilters` selects only current user's issues | unit | `pnpm --filter @paperclipai/ui vitest run --reporter=verbose` | ❌ Wave 0 |
| ACTN-05 | `resolveAssigneePatch("agent:abc")` returns `{ assigneeAgentId: "abc", assigneeUserId: null }` | unit | `pnpm --filter @paperclipai/ui vitest run --reporter=verbose` | ❌ Wave 0 |
| ACTN-05 | `resolveAssigneePatch("user:xyz")` returns `{ assigneeAgentId: null, assigneeUserId: "xyz" }` | unit | `pnpm --filter @paperclipai/ui vitest run --reporter=verbose` | ❌ Wave 0 |
| PERM-01 | `PATCH /issues/:id` by non-owner member for another user's task → 403 | integration | `pnpm --filter @paperclipai/server vitest run --reporter=verbose` | ❌ Wave 0 |
| PERM-02 | `PATCH /issues/:id` by owner member for any task → allowed | integration | `pnpm --filter @paperclipai/server vitest run --reporter=verbose` | ❌ Wave 0 |
| PERM-01 | `PATCH /issues/:id` by member for their own task → allowed | integration | `pnpm --filter @paperclipai/server vitest run --reporter=verbose` | ❌ Wave 0 |
| ACTN-01 | Status badge renders and triggers correct mutation | unit | `pnpm --filter @paperclipai/ui vitest run --reporter=verbose` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @paperclipai/ui vitest run` + `pnpm --filter @paperclipai/server vitest run`
- **Per wave merge:** same commands
- **Phase gate:** Full suite green (`pnpm vitest run` from root) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `ui/src/lib/assignees.test.ts` — covers ACTN-05 (resolveAssigneePatch unit tests)
- [ ] `ui/src/components/IssuesList.test.tsx` — covers TASKS-03 (__me toggle in filter UI)
- [ ] `server/src/__tests__/issue-member-permission.test.ts` — covers PERM-01/PERM-02 (member gate integration tests)
- [ ] `server/src/__tests__/issue-human-action-bar.test.ts` — covers ACTN-01 status update by board user (can reuse existing issues-service.test.ts patterns)

---

## Sources

### Primary (HIGH confidence)

- Codebase: `server/src/routes/issues.ts` — all issue mutation routes, permission checks, 422 throw sites
- Codebase: `server/src/services/issues.ts` — XOR constraint at lines 1261, 1090
- Codebase: `server/src/services/access.ts` — `getMembership`, `membershipRole`, `canUser` API
- Codebase: `ui/src/components/IssuesList.tsx` — filter state, `applyFilters`, `__me` sentinel
- Codebase: `ui/src/lib/assignees.ts` — `parseAssigneeValue`, `assigneeValueFromSelection`
- Codebase: `ui/src/pages/IssueDetail.tsx` — `runningIssueRun`, `addCommentAndReassign` mutation
- Codebase: `ui/src/components/IssueProperties.tsx` — assignee picker UI
- Codebase: `ui/src/api/issues.ts` — all frontend API methods (uploadAttachment, create, update)
- Codebase: `packages/shared/src/constants.ts:358-366` — PERMISSION_KEYS (no "issues:write" exists — gate must use membershipRole, not permission grants)

### Secondary (MEDIUM confidence)

- STATE.md blocker note: "Confirm `principalType: 'board'` vs `'user'` distinction before building human permission gate" — confirmed: board actors always have `type: "board"` and a `userId`; `principalType: "user"` is the DB-side designation. They refer to the same entity.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, no new deps
- Architecture: HIGH — patterns read directly from existing route/service/component code
- Pitfalls: HIGH — 422 behavior verified in service source; permission gate absence confirmed by absence of membershipRole check in PATCH handler
- Test approach: HIGH — test file structure mirrors existing `sidebar-badges.test.ts`, `issues-service.test.ts` patterns

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable codebase — patterns change slowly)
