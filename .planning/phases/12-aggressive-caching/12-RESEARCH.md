# Phase 12: Aggressive Caching - Research

**Researched:** 2026-04-05
**Domain:** TanStack Query v5 caching — staleTime, gcTime, invalidation, cache population
**Confidence:** HIGH

## Summary

Phase 12 is entirely a TanStack Query configuration and invalidation problem. The project already uses `@tanstack/react-query` v5.90.21. The global `QueryClient` sets `staleTime: 30_000` (30 seconds) and `refetchOnWindowFocus: true`. This is insufficient for the "instant navigation" requirement — queries are considered stale after 30 seconds and will refetch on every mount when stale. The fix is raising `staleTime` to 2 minutes (120 000 ms) on the targeted issue queries, and ensuring `gcTime` (garbage collection / in-memory lifetime) is long enough that data survives route transitions.

The My Tasks empty-render bug (CACHE-03) is a confirmed code bug independent of caching: `queryKeys.issues.listAssignedToMe(companyId)` is never invalidated in `LiveUpdatesProvider.invalidateActivityQueries`. When an issue is assigned to the current user via a WebSocket `activity.logged` event, the `listAssignedToMe` cache is not flushed — it stays empty until the user manually refreshes the page. The same key is also absent from the `invalidateIssue()` helper in `IssueDetail.tsx`. Both gaps must be filled.

CACHE-04 (no stale data after mutation) is already partially implemented — `invalidateIssue()` in `IssueDetail.tsx` and `onSuccess` in `Issues.tsx` both call `invalidateQueries`. The remaining gap is that `listAssignedToMe` is omitted from those invalidation calls.

**Primary recommendation:** Raise `staleTime` to 120 000 ms for issue list and issue detail queries; add `gcTime: 300_000` (5 min) to keep data in memory across route unmounts; add `listAssignedToMe` invalidation to all three sites where it is missing.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CACHE-01 | Issue lists are cached for 2 minutes — navigating back to a list shows data instantly without spinner | Raise `staleTime` to 120 000 ms on `queryKeys.issues.list` and related list keys in `Issues.tsx` and `MyIssues.tsx`; set `gcTime` ≥ 120 000 ms so data survives route unmount |
| CACHE-02 | Issue detail is cached for 2 minutes — reopening a previously-visited issue is instant | Raise `staleTime` to 120 000 ms on `queryKeys.issues.detail` in `IssueDetail.tsx`; `gcTime` default (5 min) is sufficient |
| CACHE-03 | My Tasks page renders assigned issues correctly (currently renders empty despite badge count showing tasks) | Add `queryKeys.issues.listAssignedToMe(companyId)` invalidation to `invalidateActivityQueries` in `LiveUpdatesProvider.tsx`, to `invalidateIssue()` in `IssueDetail.tsx`, and to `onSuccess` of `updateIssue` mutation in `Issues.tsx` |
| CACHE-04 | Cache invalidates correctly after any mutation — no stale data shown after a change | `listAssignedToMe` must be added to every existing invalidation call-site; existing `invalidateIssue()` already covers `list`, `detail`, `listMineByMe`, `listTouchedByMe`, `sidebarBadges` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-query | 5.90.21 (project uses `^5.90.21`, latest is 5.96.2) | Server-state cache | Already installed — this phase configures it, does not add libraries |

### No new dependencies required
All caching work is configuration and code changes inside the existing `QueryClient` setup and the three call-sites identified below.

## Architecture Patterns

### How TanStack Query v5 caching works

**staleTime** — how long (ms) fetched data is considered fresh. While fresh, `useQuery` returns cached data without re-fetching, even on component remount. Default is `0` (always stale).

**gcTime** — how long (ms) inactive (unmounted) query data stays in memory before being garbage-collected. Default is `300_000` (5 minutes). Data is only removed from memory after `gcTime` expires; it can still be served as stale data while the timer runs.

**The instant navigation guarantee requires both:**
1. `staleTime >= 120_000` — prevents a refetch on remount while data is fresh.
2. `gcTime >= 120_000` — ensures data is still in memory when the user navigates back within 2 minutes (data evicted from memory cannot be served at all, causing a skeleton render).

The current config (`staleTime: 30_000`, default `gcTime: 300_000`) means: data is served from cache for 30 seconds after fetch, then considered stale. On the next remount after 30 seconds, React Query fires a background refetch and (crucially) shows the stale cached value while fetching. So the user sees instant rendering but a brief flicker/replacement. Raising `staleTime` to 120 000 ms removes the background refetch for 2 minutes, fully satisfying CACHE-01 and CACHE-02.

**Do NOT raise the global default.** Many queries (live run polls, heartbeats, costs) intentionally use low staleTime or `refetchInterval`. Raising globally would break real-time data. Target only issue list and issue detail.

### Recommended change pattern

Apply `staleTime` per-query at the call-site. This is the TanStack Query v5 pattern — global defaults are overridden by per-query options.

```typescript
// Source: TanStack Query v5 official docs — useQuery options
const { data: issues, isLoading } = useQuery({
  queryKey: queryKeys.issues.list(selectedCompanyId!),
  queryFn: () => issuesApi.list(selectedCompanyId!),
  enabled: !!selectedCompanyId,
  staleTime: 120_000,   // 2 minutes — fresh navigation window
  // gcTime omitted: defaults to 300_000 (5 min), sufficient
});
```

### The three per-query staleTime sites

1. **`Issues.tsx`** — `queryKeys.issues.list` + the filtered variant with `participantAgentId`.
2. **`MyIssues.tsx`** — `queryKeys.issues.listAssignedToMe`.
3. **`IssueDetail.tsx`** — `queryKeys.issues.detail`.

Do NOT add `staleTime: 120_000` to dynamic/polling queries in `IssueDetail.tsx` (`liveRuns`, `activeRun`, `linkedRuns` with `refetchInterval: 3000–5000`). Those exist specifically to stay fresh.

### Recommended Project Structure (no changes needed)

Existing structure is correct. Changes are in-place edits to existing files:

```
ui/src/
├── main.tsx                     # QueryClient global config — no change needed
├── pages/
│   ├── Issues.tsx               # Add staleTime to issues.list query
│   ├── MyIssues.tsx             # Add staleTime to listAssignedToMe query
│   └── IssueDetail.tsx          # Add staleTime to issues.detail query
└── context/
    └── LiveUpdatesProvider.tsx  # Add listAssignedToMe invalidation
```

### Anti-Patterns to Avoid

- **Global staleTime raise:** Raising `staleTime` in `main.tsx` QueryClient will break polling queries (`liveRuns`, `activeRun`, heartbeats, costs). Always target per-query.
- **Removing `refetchOnWindowFocus: true`:** This is the correct setting for issue detail — if the user switches tabs and comes back, a background refetch fires. The stale cached data renders instantly, and the fresh data replaces it silently. Do not disable this.
- **Adding staleTime to non-issue queries in IssueDetail:** The agents, projects, session, instanceGeneralSettings queries have appropriate default staleTime. Do not bulk-add staleTime to all of IssueDetail's useQuery calls.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| In-memory cache for route transitions | Custom cache store, localStorage cache, sessionStorage | TanStack Query `gcTime` + `staleTime` | TanStack already keeps data in memory for `gcTime` ms after unmount; nothing to build |
| "Instant render" on back navigation | Store page data in router state | TanStack Query with non-zero staleTime | When staleTime > 0 and data is fresh, `useQuery` returns cached data synchronously on mount — no spinner |
| Invalidation after mutation | Manual state updates on every mutation | `queryClient.invalidateQueries` | Already used throughout the codebase; just add the missing key |

**Key insight:** TanStack Query's in-memory cache already survives route unmounts for `gcTime` ms. The only reason users see spinners on back-navigation is that `staleTime: 30_000` causes a refetch-on-mount after 30 seconds. The data is still in memory (because `gcTime: 300_000`), but React Query treats it as stale and shows `isLoading: false` with the stale value — actually this already shows data, not a spinner. The spinner comes from `isLoading: true` on first load. Once data is in cache and `gcTime` hasn't expired, subsequent mounts always get data instantly regardless of staleTime. The staleTime affects whether a background refetch fires, not whether data is shown.

**Correction — verified against TanStack Query v5 docs:** `isLoading` is `true` only when there is no cached data at all. Once data is in cache (even stale), `isLoading` is `false` and cached data is shown. The current `staleTime: 30_000` + `gcTime: 300_000` already prevents spinners for 5 minutes on back-navigation. The actual problem is different: with the current config, a background refetch fires immediately on remount (because data is stale after 30s), and the refetch could briefly show a loading state in components that use `isFetching` rather than `isLoading`, or the data could change visually mid-render. The `PageSkeleton` component is rendered when `isLoading` is true — only on cold load. Raising `staleTime` to 120 000 ms ensures no background refetch fires for 2 minutes, giving a completely stable cached view.

**The real spinner cause for MyIssues specifically:** The `listAssignedToMe` query is a distinct query key — it is NOT populated when the user visits the main Issues list. It fetches independently on first mount of `MyIssues.tsx`. If the data is evicted from cache (> 5 min since last visit) or was never loaded, `isLoading: true` fires and `PageSkeleton` renders. Fix: `staleTime: 120_000` ensures no re-fetch within 2 minutes of last load.

## Common Pitfalls

### Pitfall 1: staleTime vs gcTime confusion
**What goes wrong:** Developer sets only `staleTime: 120_000` but removes `gcTime` accidentally or sets it too low (e.g. `gcTime: 0`). Data is evicted from memory immediately after unmount, so the next mount has nothing to show regardless of staleTime.
**Why it happens:** `gcTime` and `staleTime` are independent knobs. Stale data is served only if it is still in memory.
**How to avoid:** Keep `gcTime` at its default (300 000 ms) or higher. Only explicitly set `staleTime`.
**Warning signs:** `isLoading: true` on every back-navigation even after raising `staleTime`.

### Pitfall 2: listAssignedToMe missing from invalidation
**What goes wrong:** User is assigned an issue (by another user or agent), the sidebar badge count increments, but My Tasks page still shows empty list.
**Why it happens:** `invalidateActivityQueries` in `LiveUpdatesProvider.tsx` currently invalidates `listMineByMe`, `listTouchedByMe`, `listUnreadTouchedByMe` — but NOT `listAssignedToMe`. This is the root cause of CACHE-03.
**How to avoid:** Add `queryClient.invalidateQueries({ queryKey: queryKeys.issues.listAssignedToMe(companyId) })` inside the `entityType === "issue"` branch of `invalidateActivityQueries`, guarded by the same `isIssueMutating` check that protects `issues.list`.
**Warning signs:** `sidebarBadges.myTasks` count > 0 but `MyIssues.tsx` renders "No tasks assigned to you."

### Pitfall 3: invalidateIssue() omits listAssignedToMe
**What goes wrong:** User changes their own assignment from IssueDetail (removes themselves or adds themselves), but My Tasks page doesn't update until they navigate away and back.
**Why it happens:** `invalidateIssue()` in `IssueDetail.tsx` calls invalidation for `list`, `listMineByMe`, `listTouchedByMe`, `listUnreadTouchedByMe`, `sidebarBadges` — but not `listAssignedToMe`.
**How to avoid:** Add `queryKeys.issues.listAssignedToMe(selectedCompanyId)` to `invalidateIssue()`.

### Pitfall 4: Issues.tsx mutation onSuccess omits listAssignedToMe
**What goes wrong:** `updateIssue` mutation in `Issues.tsx` calls `queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) })` on success but not `listAssignedToMe`.
**How to avoid:** Add `listAssignedToMe` invalidation there too.

### Pitfall 5: Adding staleTime to polling queries
**What goes wrong:** Setting `staleTime: 120_000` on queries with `refetchInterval: 3000` makes the interval meaningless — the data will never be refetched via interval because it never becomes stale during the refetch window.
**Why it happens:** `refetchInterval` and `staleTime` interact — if data is fresh, interval-triggered refetches still fire in TanStack Query v5 (unlike v4). So this is less severe, but it adds unnecessary network calls. Keep polling queries at default `staleTime: 0`.
**Warning signs:** Live run status stops updating.

## Code Examples

### Per-query staleTime (CACHE-01, CACHE-02)

```typescript
// Issues.tsx — main issue list query
const { data: issues, isLoading, error } = useQuery({
  queryKey: [...queryKeys.issues.list(selectedCompanyId!), "participant-agent", participantAgentId ?? "__all__"],
  queryFn: () => issuesApi.list(selectedCompanyId!, { participantAgentId }),
  enabled: !!selectedCompanyId,
  staleTime: 120_000,
});

// MyIssues.tsx — assigned-to-me list
const { data: issues, isLoading, error } = useQuery({
  queryKey: queryKeys.issues.listAssignedToMe(selectedCompanyId!),
  queryFn: () => issuesApi.list(selectedCompanyId!, { assigneeUserId: "me" }),
  enabled: !!selectedCompanyId,
  staleTime: 120_000,
});

// IssueDetail.tsx — issue detail
const { data: issue, isLoading, error } = useQuery({
  queryKey: queryKeys.issues.detail(issueId!),
  queryFn: () => issuesApi.get(issueId!),
  enabled: !!issueId,
  staleTime: 120_000,
});
```

### listAssignedToMe invalidation (CACHE-03, CACHE-04)

**In `LiveUpdatesProvider.tsx` — `invalidateActivityQueries` function, inside `entityType === "issue"` branch:**

```typescript
// Add after the existing listMineByMe/listTouchedByMe/listUnreadTouchedByMe lines (lines 507-509)
// Apply the same isIssueMutating guard that protects issues.list
if (!isIssueMutating) {
  queryClient.invalidateQueries({ queryKey: queryKeys.issues.listAssignedToMe(companyId) });
}
```

**In `IssueDetail.tsx` — `invalidateIssue()` function:**

```typescript
// Add inside the if (selectedCompanyId) block, alongside sidebarBadges invalidation
queryClient.invalidateQueries({ queryKey: queryKeys.issues.listAssignedToMe(selectedCompanyId) });
```

**In `Issues.tsx` — `updateIssue` mutation `onSuccess`:**

```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
  queryClient.invalidateQueries({ queryKey: queryKeys.issues.listAssignedToMe(selectedCompanyId!) });
},
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `gcTime` was called `cacheTime` | `gcTime` | TanStack Query v5 (2023) | API rename only — behavior identical |
| Per-query `staleTime: Infinity` for "never refetch" | `staleTime: Infinity` still valid | v5 — no change | Use only for truly static data |
| `keepPreviousData` option | `placeholderData: keepPreviousData` (v5 import) | v5 | Not relevant for this phase |

**Deprecated/outdated:**
- `cacheTime`: renamed to `gcTime` in v5 — do not use `cacheTime` in this codebase.
- `isLoading` vs `isPending`: In TanStack Query v5, `isLoading` means no data + fetching. `isPending` means no data. Existing code uses `isLoading` correctly.

## Open Questions

1. **Should the global `staleTime` in `main.tsx` be raised to 120 000 ms?**
   - What we know: Many queries (liveRuns, activeRun, heartbeats) use `refetchInterval` and need low staleTime
   - What's unclear: Whether `refetchInterval` overrides staleTime in v5 (it does — interval fires regardless)
   - Recommendation: Keep global at 30 000 ms; use per-query overrides for the three targeted pages. This is safer and surgical.

2. **Does `listAssignedToMe` need `staleTime` raised, or is the empty-render bug purely an invalidation gap?**
   - What we know: The sidebar badge count is accurate (comes from `sidebarBadges` API, which uses a DB count). The list query is a separate fetch. If the list was fetched in the last 30 seconds, it shows correctly. The bug manifests when assignment happens via WS event and the list is stale.
   - Recommendation: Both fixes needed — raise staleTime (CACHE-01 compliance) AND add invalidation on WS assignment events (CACHE-03 fix).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (root `vitest.config.ts` aggregates `ui` project) |
| Config file | `ui/vitest.config.ts` — environment: `node` (jsdom via per-file `@vitest-environment jsdom` directive) |
| Quick run command | `pnpm --filter ui test --run` |
| Full suite command | `pnpm test --run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CACHE-01 | Issues list query has `staleTime: 120_000` | unit | `pnpm --filter ui test --run Issues` | ❌ Wave 0 |
| CACHE-02 | IssueDetail query has `staleTime: 120_000` | unit | `pnpm --filter ui test --run IssueDetail` (add test) | ❌ Wave 0 |
| CACHE-03 | `listAssignedToMe` invalidated on `activity.logged` WS event with entityType=issue | unit | `pnpm --filter ui test --run LiveUpdatesProvider` | ✅ (existing file, new test case needed) |
| CACHE-04 | `invalidateIssue()` in IssueDetail invalidates `listAssignedToMe` | unit | `pnpm --filter ui test --run IssueDetail` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter ui test --run`
- **Per wave merge:** `pnpm test --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `ui/src/pages/Issues.test.tsx` — covers CACHE-01 (staleTime on list query)
- [ ] `ui/src/pages/IssueDetail.test.tsx` — covers CACHE-02, CACHE-04 (staleTime on detail; listAssignedToMe invalidated in invalidateIssue)
- [ ] New test case in `ui/src/context/LiveUpdatesProvider.test.ts` — covers CACHE-03 (listAssignedToMe invalidated on WS activity.logged for issue entity)

Note: `ui/src/pages/MyIssues.test.tsx` already exists and covers the query key shape. It does not need a new file, but CACHE-01 compliance for MyIssues can be validated by extending the existing test to assert `staleTime: 120_000` is passed to `useQuery`.

## Sources

### Primary (HIGH confidence)
- TanStack Query v5 official docs (https://tanstack.com/query/v5/docs/framework/react/reference/useQuery) — staleTime, gcTime, isLoading, refetchInterval interaction
- Direct code inspection — `ui/src/main.tsx` (global QueryClient config), `ui/src/context/LiveUpdatesProvider.tsx` (invalidation logic), `ui/src/pages/Issues.tsx`, `ui/src/pages/MyIssues.tsx`, `ui/src/pages/IssueDetail.tsx`, `ui/src/lib/queryKeys.ts`
- `npm view @tanstack/react-query version` → 5.96.2 (project pins `^5.90.21`, compatible)

### Secondary (MEDIUM confidence)
- TanStack Query v5 migration guide — gcTime rename from cacheTime confirmed

### Tertiary (LOW confidence)
- None for this phase — all findings are from direct code inspection

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; existing TanStack Query v5 in project
- Architecture: HIGH — all findings from direct code read; no external research needed
- Pitfalls: HIGH — root causes identified by tracing code paths (listAssignedToMe absence confirmed in LiveUpdatesProvider, IssueDetail, Issues.tsx)

**Research date:** 2026-04-05
**Valid until:** 2026-05-05 (TanStack Query v5 is stable; no breaking changes expected in 30 days)
