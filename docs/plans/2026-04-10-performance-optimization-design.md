# Performance Optimization — Backend + Frontend

**Date:** 2026-04-10
**Branch:** `feature/performance-optimization`
**Scope:** Reduce initial page load times and improve UI smoothness across all pages

---

## Problem

Pages take too long to show data on initial navigation. Root causes:
1. Backend endpoints are individually slow (N+1 queries, redundant heavy calls)
2. Frontend fires 15-20 queries per page navigation
3. No prefetching on navigation — data fetched only after page mount

## Approach: Layered Optimization (Backend first, Frontend second)

---

## Backend Optimizations

### 1.1 Budget Overview — Eliminate N+1 Queries
**File:** `server/src/services/budgets.ts` (~line 628)

Currently `buildPolicySummary()` runs 2 individual queries per policy inside `Promise.all`.
With 5 policies = 10 queries.

**Fix:** Batch both operations:
- Single query to resolve all scope records for all policies
- Single aggregation query for observed amounts across all policies
- Assemble results in memory

### 1.2 Sidebar Badges — Decouple from dashboard.summary()
**File:** `server/src/routes/sidebar-badges.ts` (~line 79)

Currently calls full `dashboard.summary()` just for badge counts, inheriting all dashboard latency.

**Fix:** Create lightweight `dashboard.badgeCounts()` that only does the counts needed for badges
(pending approvals, active heartbeats), without budget overview or activity feed.

### 1.3 Agents List — Add Redis Cache
**File:** `server/src/routes/agents.ts` (~line 963)

No cache. Every navigation re-fetches.

**Fix:** Add Redis cache with 30s TTL (like dashboard), invalidate on agent create/update/delete.

### 1.4 Issues List — Reduce Post-Fetch Queries
**File:** `server/src/services/issues.ts` (~lines 838-941)

After main query, runs 5+ follow-up queries for labels, active runs, comments, activity, read states.

**Fix:** Combine labels + active runs as JOINs in main query.
Merge comment/activity counts into single aggregation query with GROUP BY.

---

## Frontend Optimizations

### 2.1 Prefetching on Sidebar Navigation
**File:** `ui/src/components/Sidebar.tsx`

No prefetch — data requested only on page mount.

**Fix:** On sidebar link hover, fire `queryClient.prefetchQuery()` for target page's main queries.
200ms throttle to avoid accidental hover triggers.

### 2.2 Reduce useInboxBadge Weight
**File:** `ui/src/hooks/useInboxBadge.ts`

Currently fires 5 queries (approvals, joinRequests, dashboard, issues, heartbeats) on every page.

**Fix:** Replace 5 queries with single call to optimized sidebar-badges endpoint.
Set staleTime to 60s to avoid refetch on every navigation.

### 2.3 Increase staleTime for Stable Data
**File:** `ui/src/main.tsx` + individual queries

**Changes:**
- `companies.list`: staleTime -> Infinity (only changes via mutations)
- `agents.list`: staleTime -> 10 min
- `projects.list`: staleTime -> 10 min
- `labels.list`: staleTime -> 15 min
- Keep WebSocket-based invalidation for real-time updates

### 2.4 Memoize Heavy Components
**Files:** `IssuesList.tsx`, `AgentCard`, `KanbanBoard`, `RunTranscriptView`

Almost no components use `memo()`. Parent updates cascade re-renders.

**Fix:** Wrap list item components (IssueRow, AgentCard, KanbanColumn) with `React.memo()`.
Use `useMemo` for data transformations in list views.

---

## Implementation Order

1. Backend 1.1 (budget N+1) — highest latency impact
2. Backend 1.2 (sidebar-badges decouple) — removes redundant heavy call
3. Backend 1.3 (agents cache) — quick win
4. Backend 1.4 (issues post-fetch) — complex but high impact
5. Frontend 2.1 (prefetching) — biggest perceived improvement
6. Frontend 2.2 (inbox badge) — reduces requests per navigation
7. Frontend 2.3 (staleTime) — reduces cache misses
8. Frontend 2.4 (memoization) — smoother interactions
