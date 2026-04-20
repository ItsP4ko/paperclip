# Dashboard Useful Charts — Design

**Date:** 2026-04-20
**Branch target:** `feature/(dashboard-useful-charts)` (from `developer`)
**Status:** Design approved, ready for implementation planning

## Problem

The current `Dashboard.tsx` renders 4 charts between the stat cards and the Recent Activity / Recent Tasks block:

- `RunActivityChart` (agent runs last 14 days)
- `PriorityChart` (issues by priority last 14 days)
- `IssueStatusChart` (issues by status last 14 days)
- `SuccessRateChart` (run success rate last 14 days)

Three of them depend on agent runs (`heartbeatsApi`), and agents are being hidden from the product (see `2026-04-20-hide-agents-ui-design.md`). As a result, the charts render empty states most of the time and add visual noise without value.

## Goal

Replace the 4 existing charts with 4 useful charts that:

1. Do **not** reference agents in any way (agents are hidden from the product).
2. Align with the 3 stat cards above them (Tasks In Progress / Month Spend / Pending Approvals).
3. Use data already available through existing API endpoints — no new backend work.
4. Show both temporal trends and current distributions.

## Final Chart Set

| # | Chart                 | Type                   | Data source                                           | Answers                                    |
|---|-----------------------|------------------------|-------------------------------------------------------|--------------------------------------------|
| 1 | Tasks Throughput      | Double bar, 14 days    | `issuesApi.list` (createdAt + completedAt/status=done) | Is the team producing more than it takes on? |
| 2 | Spend per Day         | Area chart, 14 days    | `costsApi.financeEvents` (occurredAt, costCents)      | Is our daily spend trending up?            |
| 3 | Spend by Provider     | Donut, current month   | `costsApi.byProvider`                                 | Where is the money going (Anthropic/OpenAI/etc)? |
| 4 | Tasks by Status       | Donut, snapshot now    | `issuesApi.list` (status)                             | What is the work queue composition right now? |

### Chart 1 — Tasks Throughput
- Two bars per day for the last 14 days: created (muted/blue) and completed (green).
- Completed = issues with `status === "done"` — date bucket by `updatedAt`. Cancelled issues are excluded (cancellation is not productive output).
- Created = issues bucketed by `createdAt`.
- Legend shows the two series.
- Empty state: "No tasks yet".

### Chart 2 — Spend per Day
- Area chart, 14 daily buckets, x = day, y = USD spend.
- Sum `costCents` of all `FinanceEvent` rows per day, bucketed by `occurredAt`.
- Fetch via `costsApi.financeEvents(companyId, fromDate, toDate, limit=2000)` with `from` = 14 days ago. Limit 2000 is chosen to cover typical 14-day windows with headroom; if more rows exist the chart undercounts the oldest days — acceptable for a dashboard at-a-glance view. If this becomes a problem, add a dedicated daily-aggregation endpoint in a follow-up.
- Label: "Spend (last 14 days)".
- Empty state: "No spend recorded".

### Chart 3 — Spend by Provider
- Donut, current month.
- `costsApi.byProvider(companyId, monthStart, monthEnd)` grouped by `provider` (Anthropic, OpenAI, etc).
- Show up to 5 largest slices; rest collapses into "Other".
- Center label: total cents formatted via `formatCents`.
- Empty state: "No spend recorded".

### Chart 4 — Tasks by Status
- Donut, snapshot of currently-open issues.
- Group `issues` by `status`: todo, in_progress, in_review, done, blocked, cancelled, backlog.
- Reuse the existing `statusColors` and `statusLabels` maps from `ActivityCharts.tsx`.
- Center label: total task count.
- Empty state: "No tasks yet".

## Layout

```
[ Incident banner (if active budget incidents) ]
[ Stat cards: Tasks In Progress | Month Spend | Pending Approvals ]
[ Tasks Throughput | Spend per Day | Spend by Provider | Tasks by Status ]   ← 4 cols on lg, 2 cols on sm
[ Plugin dashboard widgets ]
[ Recent Activity | Recent Tasks ]
```

The grid already uses `grid-cols-2 lg:grid-cols-4 gap-4` — keep that.

## File-Level Changes

### `ui/src/components/ActivityCharts.tsx`
- **Delete:** `RunActivityChart`, `PriorityChart`, `IssueStatusChart`, `SuccessRateChart`.
- **Keep:** `ChartCard`, `getLast14Days`, `DateLabels`, `ChartLegend`, `statusColors`, `statusLabels`.
- **Add:** `TasksThroughputChart`, `SpendPerDayChart`, `SpendByProviderChart`, `TasksByStatusChart`.
- Each new component receives pre-fetched data via props (same pattern as existing charts) — no fetching inside chart components.

### `ui/src/pages/Dashboard.tsx`
- Remove import and usage of: `RunActivityChart`, `PriorityChart`, `IssueStatusChart`, `SuccessRateChart`.
- Remove the `useQuery` for `heartbeatsApi.list` (runs) — no longer needed on dashboard.
- Remove the `runs` import: `import { heartbeatsApi } from "../api/heartbeats";`.
- Add `useQuery` calls for:
  - `costsApi.financeEvents(companyId, fourteenDaysAgo, today, 500)` — keyed by `queryKeys.costs.financeEvents(companyId, range)` or a new local key.
  - `costsApi.byProvider(companyId, monthStart, monthEnd)`.
- Replace the 4 `ChartCard` blocks in the `data-animate="charts"` grid with the 4 new chart components.
- Keep GSAP entrance animation (metrics → charts → bottom) — no changes to the animation code.

### `ui/src/api/costs.ts`
- No changes. `financeEvents` and `byProvider` already exist.

### `ui/src/lib/queryKeys.ts`
- Add keys for the two new dashboard-side cost queries if query-key conventions require it. (Verify during implementation — may be handled with inline keys.)

## Edge Cases

- **No issues yet:** both task charts render empty state text; `MetricCard` already handles zero.
- **No spend yet:** spend charts render "No spend recorded".
- **Partial data (some providers with 0 cents):** filter out zero-cost providers before drawing the donut.
- **Timezone for day buckets:** use UTC `toISOString().slice(0, 10)` to stay consistent with existing `getLast14Days`.
- **Month boundary for Spend by Provider:** compute `monthStart` = first of current month local-ish date (`YYYY-MM-01`), `monthEnd` = today. Align with how `Costs.tsx` computes ranges for consistency.

## Out of Scope

- No backend changes. All data comes from existing endpoints.
- No changes to stat cards, Recent Activity, Recent Tasks, Remote Control widget, or incident banner.
- No new plugin widget slots. Existing plugin widget outlet stays where it is.
- No changes to the chart palette / dark-mode tokens beyond what's already in `ActivityCharts.tsx`.
- No Costs page changes — that page has its own richer charts.

## Testing / Verification

- With `pnpm dev` running locally, navigate to `/PACA/dashboard` (or the active company slug).
- Verify 4 new charts render in place of the old ones.
- Verify empty states render when a fresh company has no data.
- Verify Tasks Throughput counts match the totals on `/issues`.
- Verify Spend per Day totals match `Month Spend` stat card for the current month when the 14-day window covers the full month-to-date.
- Verify Spend by Provider totals match the Costs page for the same month window.
- Verify mobile layout: 2 columns on `sm`, 4 on `lg`.
- Verify dark/light theme both render correctly.

## Open Questions

None. Design approved by user on 2026-04-20.
