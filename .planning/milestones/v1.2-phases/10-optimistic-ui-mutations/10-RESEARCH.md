# Phase 10: Optimistic UI Mutations - Research

**Researched:** 2026-04-05
**Domain:** TanStack Query v5 optimistic mutations, WebSocket guard pattern (React 19, TypeScript)
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OPTM-01 | User sees status change reflected immediately in the UI without waiting for server confirmation | `onMutate` + `cancelQueries` + `setQueryData` on `issues.detail` key; status field patched in cache |
| OPTM-02 | User sees assignee change reflected immediately on issue detail without waiting for server confirmation | Same pattern as OPTM-01 targeting `assigneeAgentId`/`assigneeUserId` fields on the detail cache entry |
| OPTM-03 | User sees newly created subtask appear in list before server confirms creation | Append a stub `Issue` object to the `issues.list(companyId)` cache via `setQueryData` inside `onMutate` |
| OPTM-04 | Failed mutations auto-rollback to previous state with visible error feedback | `onError` restores snapshot from context; `pushToast` already available in scope |
| OPTM-05 | WS-driven cache invalidations do not overwrite in-flight optimistic mutations (`isMutating` guard) | `queryClient.isMutating({ mutationKey })` check inside `invalidateActivityQueries` in `LiveUpdatesProvider.tsx` |
</phase_requirements>

---

## Summary

All five requirements can be satisfied by extending patterns already present in the codebase. The project already uses TanStack Query v5 (`@tanstack/react-query ^5.90.21`) and has a working optimistic-update implementation for comments (`addComment` / `addCommentAndReassign` mutations in `IssueDetail.tsx` and the `optimistic-issue-comments.ts` utility). The comment mutations demonstrate the exact three-step pattern needed: `cancelQueries` + snapshot + `setQueryData` in `onMutate`, restore snapshot in `onError`, invalidate in `onSettled`.

The three gaps are: (1) `updateStatus` and the assignee branch of `updateIssue` do not yet use `onMutate` — they only invalidate on success, causing the visible delay; (2) `createSubtask` does not inject an optimistic stub into the issue list cache; (3) `invalidateActivityQueries` in `LiveUpdatesProvider.tsx` unconditionally fires `invalidateQueries` for the detail/list keys even while a mutation is in-flight, which races against and can clobber optimistic values.

**Primary recommendation:** Add `mutationKey` identifiers to the three target mutations, implement the standard `onMutate`/`onError`/`onSettled` pattern following the existing `addComment` model, and add a `queryClient.isMutating` guard inside `invalidateActivityQueries` before invalidating issue detail/list queries.

---

## Standard Stack

### Core (already installed, no new dependencies required)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tanstack/react-query` | ^5.90.21 | Mutation state, cache manipulation, `useIsMutating` | Already the project's data layer |
| `react` | ^19.0.0 | Component model | Already the project's UI framework |

**No new packages are needed for this phase.**

### Supporting

| API | Purpose | When to Use |
|-----|---------|-------------|
| `queryClient.cancelQueries` | Cancel in-flight refetches before optimistic write | Call in `onMutate` before `setQueryData` |
| `queryClient.getQueryData` | Snapshot current cache value for rollback | Call in `onMutate` immediately after cancel |
| `queryClient.setQueryData` | Write optimistic value to cache | Call in `onMutate` after snapshot |
| `queryClient.isMutating` | Count in-flight mutations by key | Call in `invalidateActivityQueries` as guard |
| `useIsMutating` | Subscribe to mutation count in component tree | Only needed if a component must render a guard indicator |

---

## Architecture Patterns

### Existing Pattern to Follow: `addComment` Mutation (HIGH confidence)

The `addComment` mutation in `IssueDetail.tsx` (lines 693–758) is the canonical reference implementation already in the codebase. Every new optimistic mutation in this phase MUST follow its structure.

```typescript
// Source: ui/src/pages/IssueDetail.tsx, lines 693-758
const addComment = useMutation({
  mutationFn: ({ body, reopen }) => issuesApi.addComment(issueId!, body, reopen),
  onMutate: async ({ body, reopen }) => {
    // 1. Cancel outgoing refetches that would overwrite optimistic value
    await queryClient.cancelQueries({ queryKey: queryKeys.issues.comments(issueId!) });
    await queryClient.cancelQueries({ queryKey: queryKeys.issues.detail(issueId!) });

    // 2. Snapshot current value for rollback
    const previousIssue = queryClient.getQueryData<Issue>(queryKeys.issues.detail(issueId!));

    // 3. Write optimistic value to cache
    queryClient.setQueryData(queryKeys.issues.detail(issueId!), applyOptimisticUpdate(previousIssue, ...));

    // 4. Return snapshot in context for onError
    return { previousIssue };
  },
  onError: (_err, _variables, context) => {
    // 5. Restore snapshot on failure
    if (context?.previousIssue) {
      queryClient.setQueryData(queryKeys.issues.detail(issueId!), context.previousIssue);
    }
    pushToast({ title: "...", body: "...", tone: "error" });
  },
  onSettled: () => {
    // 6. Always invalidate to sync with server truth
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId!) });
  },
});
```

### Pattern 1: Status and Assignee Optimistic Updates (OPTM-01, OPTM-02)

**What:** Add `mutationKey`, `onMutate`, `onError`, `onSettled` to `updateStatus` and the status/assignee path of `updateIssue`.

**Target mutations:**
- `updateStatus` (line 650) — changes `status` field
- `updateIssue` (line 642) — generic, used for `status`, `assigneeAgentId`, `assigneeUserId`, `priority`, `title`, `description`

**Approach:** Rather than patching `updateIssue` generically, give `updateStatus` and a new `updateAssignee` mutation their own `mutationKey` values so the WS guard can target them precisely.

```typescript
// Source: TanStack Query v5 docs / existing addComment pattern in codebase
const updateStatus = useMutation({
  mutationKey: ["issue-status", issueId],
  mutationFn: (status: string) => issuesApi.update(issueId!, { status }),
  onMutate: async (status) => {
    await queryClient.cancelQueries({ queryKey: queryKeys.issues.detail(issueId!) });
    const previous = queryClient.getQueryData<Issue>(queryKeys.issues.detail(issueId!));
    if (previous) {
      queryClient.setQueryData<Issue>(queryKeys.issues.detail(issueId!), { ...previous, status: status as Issue["status"] });
    }
    return { previous };
  },
  onError: (_err, _status, context) => {
    if (context?.previous) {
      queryClient.setQueryData(queryKeys.issues.detail(issueId!), context.previous);
    }
    pushToast({ title: "Status update failed", body: "Could not change status. Try again.", tone: "error" });
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId!) });
    if (selectedCompanyId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId) });
    }
  },
});
```

The assignee update mirrors this pattern with `assigneeAgentId` and `assigneeUserId` fields. The assignee mutation is currently triggered via `IssueProperties.onUpdate` which calls `updateIssue.mutate(...)` — that call site must be left intact; only the mutation definition changes.

### Pattern 2: Optimistic Subtask Creation (OPTM-03)

**What:** Add a stub `Issue` object to the `issues.list(companyId)` cache before the server responds.

**Constraint:** The stub only needs `id`, `title`, `parentId`, `status`, `companyId`, and `createdAt`. The server response replaces the stub in `onSettled`. The `childIssues` derived value in `IssueDetail.tsx` (line 476) filters `allIssues` by `parentId === issue.id` — so a stub with the correct `parentId` will immediately appear in the subtask list.

```typescript
// Source: TanStack Query v5 optimistic updates pattern + existing codebase structure
const createSubtask = useMutation({
  mutationKey: ["create-subtask", issueId],
  mutationFn: (title: string) => issuesApi.create(issue!.companyId, { title, parentId: issueId!, status: "todo" }),
  onMutate: async (title) => {
    if (!issue || !selectedCompanyId) return {};
    await queryClient.cancelQueries({ queryKey: queryKeys.issues.list(selectedCompanyId) });
    const previousList = queryClient.getQueryData<Issue[]>(queryKeys.issues.list(selectedCompanyId));
    const optimisticStub: Issue = {
      id: `optimistic-subtask-${Date.now()}`,
      identifier: "",
      title,
      status: "todo",
      priority: "medium",
      companyId: issue.companyId,
      parentId: issue.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      // ...all required fields with sensible defaults
      assigneeAgentId: null,
      assigneeUserId: null,
      projectId: issue.projectId ?? null,
      goalId: issue.goalId ?? null,
      description: null,
      labelIds: [],
      inboxArchivedAt: null,
      lastReadAt: null,
    } as Issue;
    queryClient.setQueryData<Issue[]>(queryKeys.issues.list(selectedCompanyId), (old) => [...(old ?? []), optimisticStub]);
    return { previousList, optimisticStubId: optimisticStub.id };
  },
  onError: (_err, _title, context) => {
    if (context?.previousList && selectedCompanyId) {
      queryClient.setQueryData(queryKeys.issues.list(selectedCompanyId), context.previousList);
    }
    setSubtaskError("Could not create subtask. Try again.");
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId!) });
    if (selectedCompanyId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId) });
    }
  },
});
```

**Important:** The `Issue` type must be inspected to identify all required fields. The stub type must satisfy the TypeScript type. Missing optional fields should be null/empty defaults.

### Pattern 3: isMutating Guard in LiveUpdatesProvider (OPTM-05)

**What:** Before `invalidateActivityQueries` fires cache invalidations for issue detail/list keys, check if any issue-mutation is in-flight. If so, skip the issue detail and list invalidations only — activity, comments, sidebar badges, and other non-optimistic keys can still be invalidated.

**Where:** `invalidateActivityQueries` in `ui/src/context/LiveUpdatesProvider.tsx` (lines 480–564).

**Mechanism:** `queryClient.isMutating({ mutationKey: [...] })` returns the count of matching in-flight mutations. Check it before invalidating the keys that hold optimistic data.

```typescript
// Source: TanStack Query v5 docs + codebase pattern
function invalidateActivityQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  companyId: string,
  payload: Record<string, unknown>,
) {
  queryClient.invalidateQueries({ queryKey: queryKeys.activity(companyId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(companyId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(companyId) });

  const entityType = readString(payload.entityType);
  const entityId = readString(payload.entityId);

  if (entityType === "issue") {
    // Guard: do not invalidate issue caches while the user's own mutation is in-flight
    const isIssueMutating =
      queryClient.isMutating({ mutationKey: ["issue-status"] }) > 0 ||
      queryClient.isMutating({ mutationKey: ["issue-assignee"] }) > 0 ||
      queryClient.isMutating({ mutationKey: ["create-subtask"] }) > 0;

    if (!isIssueMutating) {
      // Safe to invalidate — no optimistic write in-flight
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listMineByMe(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listTouchedByMe(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listUnreadTouchedByMe(companyId) });
      if (entityId) {
        const details = readRecord(payload.details);
        const issueRefs = resolveIssueQueryRefs(queryClient, companyId, entityId, details);
        for (const ref of issueRefs) {
          queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(ref) });
          // comments, activity, runs, documents etc. are safe — not part of optimistic patch
          queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(ref) });
          queryClient.invalidateQueries({ queryKey: queryKeys.issues.activity(ref) });
          queryClient.invalidateQueries({ queryKey: queryKeys.issues.runs(ref) });
          queryClient.invalidateQueries({ queryKey: queryKeys.issues.documents(ref) });
          queryClient.invalidateQueries({ queryKey: queryKeys.issues.attachments(ref) });
          queryClient.invalidateQueries({ queryKey: queryKeys.issues.approvals(ref) });
          queryClient.invalidateQueries({ queryKey: queryKeys.issues.liveRuns(ref) });
          queryClient.invalidateQueries({ queryKey: queryKeys.issues.activeRun(ref) });
        }
      }
    }
    return;
  }
  // ... rest of entityType branches unchanged
}
```

**Refinement note:** Only `issues.detail` and `issues.list` (and their aliases) hold fields that are optimistically patched. `issues.comments`, `issues.activity`, etc. are safe to invalidate even during a mutation. The guard should be applied precisely to avoid blocking legitimate server updates from arriving.

### Anti-Patterns to Avoid

- **`onSuccess`-only invalidation:** The current `updateStatus` and `updateIssue` use `onSuccess` only. This skips invalidation on error. Always pair `onSuccess` invalidation logic in `onSettled` so errors still eventually sync.
- **Invalidating before cancelling:** `cancelQueries` MUST be called before `getQueryData` + `setQueryData`. A refetch landing after the optimistic write will overwrite the optimistic value if cancellation is missed.
- **Global `isMutating()` with no key:** `queryClient.isMutating()` without a `mutationKey` filter counts ALL mutations in the app. Use `{ mutationKey: [...] }` to scope the guard to issue-specific mutations only.
- **Incomplete stub fields:** TypeScript will enforce this, but the `Issue` type has many required fields. The stub must satisfy the type or the build fails. Use `as Issue` cast only after verifying all non-nullable fields are present.
- **Mutating the snapshot:** `getQueryData` returns the cached reference. Always spread: `{ ...previous, status: newStatus }` — never mutate in-place.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Optimistic UI library | Custom event bus / local state mirror | TanStack Query `onMutate` + `setQueryData` | Already installed; provides snapshot, rollback, and invalidation in one lifecycle |
| Toast / error feedback | Custom error state component | `pushToast` from `useToast()` | Already in scope in `IssueDetail.tsx`; consistent UX |
| Mutation tracking | `useRef` boolean flag | `queryClient.isMutating({ mutationKey })` | TanStack Query provides atomic, per-key counting |
| WS message dedup | Custom middleware layer | Guard in `invalidateActivityQueries` | The function is already the single point where WS invalidations execute |

**Key insight:** The project already has 80% of the needed infrastructure. The work is precision surgery on three mutations and one WS handler, not building new infrastructure.

---

## Common Pitfalls

### Pitfall 1: Race Between `onSettled` Invalidation and WS Event

**What goes wrong:** After the mutation completes, `onSettled` fires `invalidateQueries`. Almost simultaneously, the server emits an `activity.logged` WS event. Two refetches race — one or both may show stale data if the server processes them out of order.

**Why it happens:** `invalidateQueries` triggers a background refetch but does not await it. If the WS event fires before the refetch completes, a second invalidation queues another refetch.

**How to avoid:** TanStack Query deduplicates in-flight queries — two rapid invalidations on the same key resolve to one refetch. This is acceptable behavior; no special handling needed beyond what the pattern already does.

**Warning signs:** If the UI flickers to the old state briefly after the mutation succeeds, the WS event arrived before `onSettled` and the guard was too broad. Narrow the guard to only detail/list keys.

### Pitfall 2: Guard Too Broad — Comments and Activity Blocked

**What goes wrong:** If the `isMutating` guard blocks ALL issue query invalidations, WS events that update comments, activity feed, or live run status will be silently swallowed while a status mutation is pending.

**How to avoid:** Only guard `issues.detail` and `issues.list` (and their filter variants). Never guard `issues.comments`, `issues.activity`, `issues.runs`, `issues.liveRuns`, `issues.activeRun`. These keys are not part of the optimistic patch.

### Pitfall 3: Stub `Issue` Type Missing Required Fields

**What goes wrong:** TypeScript compile error — `Issue` has required fields (e.g., `identifier`, `labelIds`, `inboxArchivedAt`). The stub may compile with `as Issue` but then cause runtime errors if any code reads the missing field.

**How to avoid:** Inspect the `Issue` type in `@paperclipai/shared` before writing the stub. Set every required non-nullable field to a sensible default (`""`, `[]`, `null`, `new Date()`). The server response in `onSettled` will replace the stub with the real object.

**Warning signs:** TypeScript error `Property 'X' is missing in type`.

### Pitfall 4: `mutationKey` Array Prefix Matching

**What goes wrong:** `queryClient.isMutating({ mutationKey: ["issue-status"] })` matches any mutation whose key starts with `["issue-status"]`. If a mutation key is `["issue-status", issueId]`, the guard `{ mutationKey: ["issue-status"] }` will correctly catch it (fuzzy prefix matching). But if the guard key is too specific (includes the `issueId`), mutations on a different issue won't be caught.

**How to avoid:** The guard in `LiveUpdatesProvider` does not know which issue is being mutated. Use the prefix-only key (e.g., `["issue-status"]`) in the guard so it catches mutations for any issue.

### Pitfall 5: Missing `cancelQueries` for Issue List

**What goes wrong:** The optimistic subtask stub is written to `issues.list`, but if a refetch of `issues.list` is already in-flight when `onMutate` runs, it may land after the `setQueryData` call and overwrite the stub.

**How to avoid:** Call `cancelQueries({ queryKey: queryKeys.issues.list(companyId) })` before `setQueryData` on the list cache.

---

## Code Examples

### Reference: Existing Optimistic Comment (addComment, IssueDetail.tsx lines 693–757)

```typescript
// Source: ui/src/pages/IssueDetail.tsx — EXISTING, working implementation
const addComment = useMutation({
  mutationFn: ({ body, reopen, interrupt }) =>
    issuesApi.addComment(issueId!, body, reopen, interrupt),
  onMutate: async ({ body, reopen, interrupt }) => {
    await queryClient.cancelQueries({ queryKey: queryKeys.issues.comments(issueId!) });
    await queryClient.cancelQueries({ queryKey: queryKeys.issues.detail(issueId!) });
    const previousIssue = queryClient.getQueryData<Issue>(queryKeys.issues.detail(issueId!));
    // ... optimistic comment created and appended to local state
    return { optimisticCommentId, previousIssue };
  },
  onError: (err, _variables, context) => {
    // Remove optimistic comment from local state
    // Restore previous issue snapshot
    pushToast({ title: "Comment failed", body: err.message, tone: "error" });
  },
  onSettled: () => {
    invalidateIssue();
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(issueId!) });
  },
});
```

### Reference: `queryClient.isMutating` API (TanStack Query v5)

```typescript
// Source: TanStack Query v5 docs — https://tanstack.com/query/v5/docs/framework/react/reference/useIsMutating
// Used in non-React context (QueryClient method, not hook)
const count = queryClient.isMutating({ mutationKey: ["issue-status"] }); // returns number
if (count > 0) { /* mutation in flight — skip invalidation */ }
```

### Reference: Status field type (Issue shape)

The `status` field is a union type (e.g., `"backlog" | "todo" | "in_progress" | "in_review" | "done" | "blocked" | "cancelled"`). Cast appropriately when writing to cache:

```typescript
queryClient.setQueryData<Issue>(queryKeys.issues.detail(issueId!), (old) =>
  old ? { ...old, status: newStatus as Issue["status"] } : old
);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `onSuccess` only invalidation | `onMutate` + `onError` + `onSettled` with snapshot | TanStack Query v3+ | Eliminates the loading delay after user action |
| Local `useState` for pending UI | `useMutation` `isPending` + `variables` | TanStack Query v5 | Simpler — no manual state for single-component cases |
| Global `refetchOnWindowFocus` suppression | Per-query `cancelQueries` in `onMutate` | TanStack Query v4+ | Targeted; doesn't suppress unrelated queries |

**Deprecated/outdated:**
- `useIsMutating` as a React hook: Valid in v5, but `queryClient.isMutating()` (non-hook) is preferred inside non-component functions like `invalidateActivityQueries`.

---

## Open Questions

1. **`Issue` type completeness for the subtask stub**
   - What we know: `Issue` is defined in `@paperclipai/shared`. The type has required fields beyond `title`, `parentId`, `status`.
   - What's unclear: Whether all non-nullable fields have been identified without reading the full shared type definition.
   - Recommendation: The planner should include a Wave 0 task to read `packages/shared/src/types/issue.ts` (or equivalent) and list all required fields before writing the stub.

2. **`isMutating` guard scope for `listMineByMe` / `listTouchedByMe`**
   - What we know: These filtered lists are invalidated alongside `issues.list` in `invalidateActivityQueries`. They also hold data that optimistic mutations don't touch directly.
   - What's unclear: Whether guarding these keys causes visible staleness in the My Tasks / Inbox views during a mutation.
   - Recommendation: Guard only `issues.detail` and `issues.list`. Leave `listMineByMe`, `listTouchedByMe`, `listUnreadTouchedByMe` unguarded — they don't hold optimistically-patched fields.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `ui/vitest.config.ts` |
| Quick run command | `pnpm --filter @paperclipai/ui test --run` |
| Full suite command | `pnpm test --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPTM-01 | Status optimistic cache write and rollback | unit | `pnpm --filter @paperclipai/ui test --run optimistic-issue-mutations` | ❌ Wave 0 |
| OPTM-02 | Assignee optimistic cache write and rollback | unit | `pnpm --filter @paperclipai/ui test --run optimistic-issue-mutations` | ❌ Wave 0 |
| OPTM-03 | Subtask stub appended to list before server responds | unit | `pnpm --filter @paperclipai/ui test --run optimistic-issue-mutations` | ❌ Wave 0 |
| OPTM-04 | Rollback to previous state on error + toast | unit | `pnpm --filter @paperclipai/ui test --run optimistic-issue-mutations` | ❌ Wave 0 |
| OPTM-05 | `isMutating` guard prevents WS invalidation of guarded keys | unit | `pnpm --filter @paperclipai/ui test --run live-updates` | ❌ Wave 0 |

**Note:** OPTM-04 and OPTM-05 together require mocking the `useToast` context and a `QueryClient` instance — both patterns are already demonstrated in `optimistic-issue-comments.test.ts` (215 lines). That file is the reference for new test structure.

### Sampling Rate

- **Per task commit:** `pnpm --filter @paperclipai/ui test --run`
- **Per wave merge:** `pnpm test --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `ui/src/lib/optimistic-issue-mutations.test.ts` — covers OPTM-01, OPTM-02, OPTM-03, OPTM-04
- [ ] `ui/src/context/LiveUpdatesProvider.test.ts` — covers OPTM-05 (`isMutating` guard); extend existing `__liveUpdatesTestUtils` exports

*(Existing infrastructure: Vitest configured, `optimistic-issue-comments.test.ts` demonstrates the required test patterns with a bare `QueryClient` — no browser environment needed)*

---

## Sources

### Primary (HIGH confidence)

- Existing codebase — `ui/src/pages/IssueDetail.tsx` (lines 642–757): `addComment` and `addCommentAndReassign` are the canonical reference implementations
- Existing codebase — `ui/src/lib/optimistic-issue-comments.ts`: utility pattern for snapshot/merge/rollback
- Existing codebase — `ui/src/context/LiveUpdatesProvider.tsx` (lines 480–564): `invalidateActivityQueries` is the single WS invalidation point
- Existing codebase — `ui/src/lib/queryKeys.ts`: all cache key definitions

### Secondary (MEDIUM confidence)

- [TanStack Query v5 Optimistic Updates Guide](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates) — `onMutate`/`onError`/`onSettled` pattern confirmed
- [TanStack Query v5 `useIsMutating` Reference](https://tanstack.com/query/v5/docs/framework/react/reference/useIsMutating) — `mutationKey` prefix filtering confirmed

### Tertiary (LOW confidence)

- [TanStack Query GitHub Discussion #2245](https://github.com/TanStack/query/discussions/2245) — Prevent refetch while mutation is running (community pattern)
- [TanStack Query GitHub Discussion #5787](https://github.com/TanStack/query/discussions/5787) — mutationKey purpose (community)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — stack is locked; no new dependencies
- Architecture: HIGH — patterns directly derived from existing working code in the same file
- Pitfalls: HIGH — derived from reading the actual `invalidateActivityQueries` function and the `addComment` implementation
- Validation: HIGH — test framework already configured; reference test file exists

**Research date:** 2026-04-05
**Valid until:** 2026-05-05 (TanStack Query v5 is stable; no breaking changes expected)
