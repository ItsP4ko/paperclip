# Dashboard Useful Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 4 run-/issue-oriented charts on the dashboard with 4 charts that don't reference agents, aligned with the stat cards above them.

**Architecture:** Pure data-bucketing helpers live in `ActivityCharts.tsx` and are unit-tested. Presentation components consume those helpers and render with Recharts (already used in `Analytics.tsx`) or flex/SVG. `Dashboard.tsx` adds two new `useQuery` calls (finance events + cost by provider) and removes the heartbeats query.

**Tech Stack:** React + TypeScript, TanStack Query, Recharts, Vitest.

---

## File Structure

**Modified:**
- `ui/src/components/ActivityCharts.tsx` — remove 4 old charts (`RunActivityChart`, `PriorityChart`, `IssueStatusChart`, `SuccessRateChart`); keep `ChartCard`, `getLast14Days`, `DateLabels`, `ChartLegend`, `statusColors`, `statusLabels`; add 4 new charts + pure helpers.
- `ui/src/pages/Dashboard.tsx` — remove heartbeats query, drop unused imports, add queries for `financeEvents` and `byProvider`, swap the 4 chart components.

**Created:**
- `ui/src/components/ActivityCharts.test.tsx` — unit tests for the new pure helpers.

---

## Task 1: Add pure helpers and tests for Tasks Throughput + Spend per Day + Spend by Provider

**Files:**
- Modify: `ui/src/components/ActivityCharts.tsx`
- Create: `ui/src/components/ActivityCharts.test.tsx`

- [ ] **Step 1: Write failing tests for all new helpers**

Create `ui/src/components/ActivityCharts.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import {
  bucketIssuesByDay,
  bucketFinanceEventsByDay,
  groupIssuesByStatus,
  collapseToTopN,
  getLast14Days,
} from "./ActivityCharts";

describe("bucketIssuesByDay", () => {
  const days = ["2026-04-10", "2026-04-11"];

  it("counts created and completed issues per day", () => {
    const issues = [
      { status: "todo", createdAt: "2026-04-10T10:00:00Z", updatedAt: "2026-04-10T10:00:00Z" },
      { status: "done", createdAt: "2026-04-09T10:00:00Z", updatedAt: "2026-04-11T15:00:00Z" },
      { status: "done", createdAt: "2026-04-11T08:00:00Z", updatedAt: "2026-04-11T20:00:00Z" },
      { status: "cancelled", createdAt: "2026-04-10T09:00:00Z", updatedAt: "2026-04-11T09:00:00Z" },
    ];
    const result = bucketIssuesByDay(issues as any, days);
    expect(result.get("2026-04-10")).toEqual({ created: 2, completed: 0 });
    expect(result.get("2026-04-11")).toEqual({ created: 1, completed: 2 });
  });

  it("ignores issues outside the day window", () => {
    const issues = [{ status: "done", createdAt: "2026-04-01T00:00:00Z", updatedAt: "2026-04-01T00:00:00Z" }];
    const result = bucketIssuesByDay(issues as any, days);
    expect(result.get("2026-04-10")).toEqual({ created: 0, completed: 0 });
    expect(result.get("2026-04-11")).toEqual({ created: 0, completed: 0 });
  });
});

describe("bucketFinanceEventsByDay", () => {
  const days = ["2026-04-10", "2026-04-11"];

  it("sums costCents per day", () => {
    const events = [
      { costCents: 100, occurredAt: "2026-04-10T10:00:00Z" },
      { costCents: 250, occurredAt: "2026-04-10T22:00:00Z" },
      { costCents: 50, occurredAt: "2026-04-11T01:00:00Z" },
    ];
    const result = bucketFinanceEventsByDay(events as any, days);
    expect(result.get("2026-04-10")).toBe(350);
    expect(result.get("2026-04-11")).toBe(50);
  });

  it("ignores events outside the window", () => {
    const events = [{ costCents: 999, occurredAt: "2020-01-01T00:00:00Z" }];
    const result = bucketFinanceEventsByDay(events as any, days);
    expect(result.get("2026-04-10")).toBe(0);
  });
});

describe("groupIssuesByStatus", () => {
  it("returns counts per status", () => {
    const issues = [
      { status: "todo" },
      { status: "todo" },
      { status: "in_progress" },
      { status: "done" },
    ];
    const result = groupIssuesByStatus(issues as any);
    expect(result).toEqual({ todo: 2, in_progress: 1, done: 1 });
  });

  it("returns empty object for no issues", () => {
    expect(groupIssuesByStatus([] as any)).toEqual({});
  });
});

describe("collapseToTopN", () => {
  const rows = [
    { name: "a", value: 100 },
    { name: "b", value: 60 },
    { name: "c", value: 40 },
    { name: "d", value: 20 },
    { name: "e", value: 10 },
    { name: "f", value: 5 },
  ];

  it("keeps top N rows and collapses rest into 'Other'", () => {
    const result = collapseToTopN(rows, 3);
    expect(result).toEqual([
      { name: "a", value: 100 },
      { name: "b", value: 60 },
      { name: "c", value: 40 },
      { name: "Other", value: 35 },
    ]);
  });

  it("returns input unchanged when length <= n", () => {
    const result = collapseToTopN(rows.slice(0, 2), 3);
    expect(result).toEqual([
      { name: "a", value: 100 },
      { name: "b", value: 60 },
    ]);
  });

  it("filters zero-value rows before grouping", () => {
    const withZero = [...rows.slice(0, 3), { name: "g", value: 0 }];
    const result = collapseToTopN(withZero, 5);
    expect(result).toEqual([
      { name: "a", value: 100 },
      { name: "b", value: 60 },
      { name: "c", value: 40 },
    ]);
  });
});

describe("getLast14Days", () => {
  it("returns 14 ISO date strings in ascending order", () => {
    const days = getLast14Days();
    expect(days).toHaveLength(14);
    expect(days[0] < days[13]).toBe(true);
    expect(days[13]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @paperclipai/ui exec vitest run src/components/ActivityCharts.test.tsx
```

Expected: all tests fail with import errors for `bucketIssuesByDay`, `bucketFinanceEventsByDay`, `groupIssuesByStatus`, `collapseToTopN`.

- [ ] **Step 3: Add the helpers to `ActivityCharts.tsx`**

Append near the top of the file, below the existing utilities (after `getLast14Days` / `formatDayLabel`):

```ts
import type { Issue } from "@paperclipai/shared";
import type { FinanceEvent } from "@paperclipai/shared";

function toIsoDay(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

export function bucketIssuesByDay(
  issues: Pick<Issue, "status" | "createdAt" | "updatedAt">[],
  days: string[],
): Map<string, { created: number; completed: number }> {
  const bucket = new Map<string, { created: number; completed: number }>();
  for (const day of days) bucket.set(day, { created: 0, completed: 0 });
  for (const issue of issues) {
    const createdDay = toIsoDay(issue.createdAt);
    const entry = bucket.get(createdDay);
    if (entry) entry.created++;
    if (issue.status === "done") {
      const completedDay = toIsoDay(issue.updatedAt);
      const doneEntry = bucket.get(completedDay);
      if (doneEntry) doneEntry.completed++;
    }
  }
  return bucket;
}

export function bucketFinanceEventsByDay(
  events: Pick<FinanceEvent, "costCents" | "occurredAt">[],
  days: string[],
): Map<string, number> {
  const bucket = new Map<string, number>();
  for (const day of days) bucket.set(day, 0);
  for (const event of events) {
    const day = toIsoDay(event.occurredAt);
    const current = bucket.get(day);
    if (current !== undefined) bucket.set(day, current + event.costCents);
  }
  return bucket;
}

export function groupIssuesByStatus(
  issues: Pick<Issue, "status">[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const issue of issues) {
    out[issue.status] = (out[issue.status] ?? 0) + 1;
  }
  return out;
}

export function collapseToTopN<T extends { name: string; value: number }>(
  rows: T[],
  n: number,
): { name: string; value: number }[] {
  const positive = rows.filter((r) => r.value > 0);
  const sorted = [...positive].sort((a, b) => b.value - a.value);
  if (sorted.length <= n) return sorted.map(({ name, value }) => ({ name, value }));
  const top = sorted.slice(0, n).map(({ name, value }) => ({ name, value }));
  const other = sorted.slice(n).reduce((sum, r) => sum + r.value, 0);
  return other > 0 ? [...top, { name: "Other", value: other }] : top;
}
```

Notes:
- `FinanceEvent` type lives in `@paperclipai/shared` (`types/cost.ts` → re-exported). If the import path errors, use `import type { FinanceEvent } from "@paperclipai/shared";` and verify the shared package re-exports it (check `packages/shared/src/index.ts`).

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @paperclipai/ui exec vitest run src/components/ActivityCharts.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/ActivityCharts.tsx ui/src/components/ActivityCharts.test.tsx
git commit -m "feat: add pure helpers for dashboard charts"
```

---

## Task 2: Build <TasksThroughputChart />

**Files:**
- Modify: `ui/src/components/ActivityCharts.tsx`

- [ ] **Step 1: Add the chart component**

Append below the helpers:

```tsx
import type { Issue } from "@paperclipai/shared";

export function TasksThroughputChart({ issues }: { issues: Issue[] }) {
  const days = getLast14Days();
  const bucket = bucketIssuesByDay(issues, days);
  const hasData = Array.from(bucket.values()).some((v) => v.created + v.completed > 0);
  if (!hasData) return <p className="text-xs text-muted-foreground">No tasks yet</p>;

  const maxValue = Math.max(
    ...Array.from(bucket.values()).map((v) => Math.max(v.created, v.completed)),
    1,
  );

  return (
    <div>
      <div className="flex items-end gap-[3px] h-20">
        {days.map((day) => {
          const entry = bucket.get(day)!;
          return (
            <div key={day} className="flex-1 h-full flex items-end gap-px" title={`${day}: ${entry.created} created, ${entry.completed} completed`}>
              <div
                className="flex-1"
                style={{
                  height: `${(entry.created / maxValue) * 100}%`,
                  minHeight: entry.created > 0 ? 2 : 0,
                  backgroundColor: "#00E5FF",
                }}
              />
              <div
                className="flex-1"
                style={{
                  height: `${(entry.completed / maxValue) * 100}%`,
                  minHeight: entry.completed > 0 ? 2 : 0,
                  backgroundColor: "#39FF14",
                }}
              />
            </div>
          );
        })}
      </div>
      <DateLabels days={days} />
      <ChartLegend items={[
        { color: "#00E5FF", label: "Created" },
        { color: "#39FF14", label: "Completed" },
      ]} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @paperclipai/ui typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/ActivityCharts.tsx
git commit -m "feat: add TasksThroughputChart"
```

---

## Task 3: Build <SpendPerDayChart />

**Files:**
- Modify: `ui/src/components/ActivityCharts.tsx`

- [ ] **Step 1: Add the chart component**

Append:

```tsx
import type { FinanceEvent } from "@paperclipai/shared";

export function SpendPerDayChart({ events }: { events: FinanceEvent[] }) {
  const days = getLast14Days();
  const bucket = bucketFinanceEventsByDay(events, days);
  const values = days.map((d) => bucket.get(d) ?? 0);
  const hasData = values.some((v) => v > 0);
  if (!hasData) return <p className="text-xs text-muted-foreground">No spend recorded</p>;

  const maxValue = Math.max(...values, 1);

  return (
    <div>
      <div className="flex items-end gap-[3px] h-20">
        {days.map((day, i) => {
          const cents = values[i];
          const heightPct = (cents / maxValue) * 100;
          return (
            <div key={day} className="flex-1 h-full flex flex-col justify-end" title={`${day}: $${(cents / 100).toFixed(2)}`}>
              {cents > 0 ? (
                <div style={{ height: `${heightPct}%`, minHeight: 2, backgroundColor: "#f59e0b" }} />
              ) : (
                <div className="bg-muted/30 rounded-sm" style={{ height: 2 }} />
              )}
            </div>
          );
        })}
      </div>
      <DateLabels days={days} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @paperclipai/ui typecheck
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/ActivityCharts.tsx
git commit -m "feat: add SpendPerDayChart"
```

---

## Task 4: Build <SpendByProviderChart />

**Files:**
- Modify: `ui/src/components/ActivityCharts.tsx`

- [ ] **Step 1: Add the chart component (Recharts donut)**

Append:

```tsx
import type { CostByProviderModel } from "@paperclipai/shared";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

const PROVIDER_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4"];

export function SpendByProviderChart({ rows }: { rows: CostByProviderModel[] }) {
  const byProvider = new Map<string, number>();
  for (const row of rows) {
    byProvider.set(row.provider, (byProvider.get(row.provider) ?? 0) + row.costCents);
  }
  const aggregated = Array.from(byProvider.entries()).map(([name, value]) => ({ name, value }));
  const top = collapseToTopN(aggregated, 5);
  const total = top.reduce((sum, r) => sum + r.value, 0);
  if (total === 0) return <p className="text-xs text-muted-foreground">No spend recorded</p>;

  return (
    <div className="flex items-center gap-3">
      <div className="h-20 w-20 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={top} dataKey="value" innerRadius={22} outerRadius={38} paddingAngle={2}>
              {top.map((_, i) => (
                <Cell key={i} fill={PROVIDER_COLORS[i % PROVIDER_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-1 min-w-0">
        {top.map((row, i) => {
          const pct = (row.value / total) * 100;
          return (
            <div key={row.name} className="flex items-center gap-1.5 text-[10px]">
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: PROVIDER_COLORS[i % PROVIDER_COLORS.length] }} />
              <span className="truncate text-muted-foreground">{row.name}</span>
              <span className="tabular-nums ml-auto">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @paperclipai/ui typecheck
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/ActivityCharts.tsx
git commit -m "feat: add SpendByProviderChart (donut)"
```

---

## Task 5: Build <TasksByStatusChart />

**Files:**
- Modify: `ui/src/components/ActivityCharts.tsx`

- [ ] **Step 1: Add the chart component**

Append:

```tsx
export function TasksByStatusChart({ issues }: { issues: Issue[] }) {
  const grouped = groupIssuesByStatus(issues);
  const rows = Object.entries(grouped)
    .map(([status, count]) => ({ name: status, value: count }))
    .filter((r) => r.value > 0);
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  if (total === 0) return <p className="text-xs text-muted-foreground">No tasks yet</p>;

  return (
    <div className="flex items-center gap-3">
      <div className="h-20 w-20 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" innerRadius={22} outerRadius={38} paddingAngle={2}>
              {rows.map((row, i) => (
                <Cell key={i} fill={statusColors[row.name] ?? "#6b7280"} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-1 min-w-0">
        {rows.map((row) => {
          const pct = (row.value / total) * 100;
          return (
            <div key={row.name} className="flex items-center gap-1.5 text-[10px]">
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: statusColors[row.name] ?? "#6b7280" }} />
              <span className="truncate text-muted-foreground">{statusLabels[row.name] ?? row.name}</span>
              <span className="tabular-nums ml-auto">{row.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @paperclipai/ui typecheck
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/ActivityCharts.tsx
git commit -m "feat: add TasksByStatusChart"
```

---

## Task 6: Wire up Dashboard.tsx

**Files:**
- Modify: `ui/src/pages/Dashboard.tsx`

- [ ] **Step 1: Update imports**

Replace:

```ts
import { ChartCard, RunActivityChart, PriorityChart, IssueStatusChart, SuccessRateChart } from "../components/ActivityCharts";
```

With:

```ts
import { ChartCard, TasksThroughputChart, SpendPerDayChart, SpendByProviderChart, TasksByStatusChart } from "../components/ActivityCharts";
import { costsApi } from "../api/costs";
```

Remove the `heartbeatsApi` import at the top of the file:

```ts
import { heartbeatsApi } from "../api/heartbeats";  // DELETE THIS LINE
```

- [ ] **Step 2: Swap the runs query for the two cost queries**

Remove the `runs` `useQuery` block (the one that calls `heartbeatsApi.list`) and add above the `recentIssues`/`recentActivity` memos:

```ts
const fourteenDaysAgo = useMemo(() => {
  const d = new Date();
  d.setDate(d.getDate() - 14);
  return d.toISOString().slice(0, 10);
}, []);

const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

const monthStart = useMemo(() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}, []);

const { data: financeEvents } = useQuery({
  queryKey: queryKeys.financeEvents(selectedCompanyId!, fourteenDaysAgo, today, 2000),
  queryFn: () => costsApi.financeEvents(selectedCompanyId!, fourteenDaysAgo, today, 2000),
  enabled: !!selectedCompanyId,
  staleTime: 2 * 60 * 1000,
});

const { data: costByProvider } = useQuery({
  queryKey: queryKeys.usageByProvider(selectedCompanyId!, monthStart, today),
  queryFn: () => costsApi.byProvider(selectedCompanyId!, monthStart, today),
  enabled: !!selectedCompanyId,
  staleTime: 2 * 60 * 1000,
});
```

- [ ] **Step 3: Replace the chart grid JSX**

Find the block:

```tsx
<div data-animate="charts" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
  <ChartCard title="Run Activity" subtitle="Last 14 days">
    <RunActivityChart runs={runs ?? []} />
  </ChartCard>
  <ChartCard title="Issues by Priority" subtitle="Last 14 days">
    <PriorityChart issues={issues ?? []} />
  </ChartCard>
  <ChartCard title="Issues by Status" subtitle="Last 14 days">
    <IssueStatusChart issues={issues ?? []} />
  </ChartCard>
  <ChartCard title="Success Rate" subtitle="Last 14 days">
    <SuccessRateChart runs={runs ?? []} />
  </ChartCard>
</div>
```

Replace with:

```tsx
<div data-animate="charts" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
  <ChartCard title="Tasks Throughput" subtitle="Last 14 days">
    <TasksThroughputChart issues={issues ?? []} />
  </ChartCard>
  <ChartCard title="Spend per Day" subtitle="Last 14 days">
    <SpendPerDayChart events={financeEvents ?? []} />
  </ChartCard>
  <ChartCard title="Spend by Provider" subtitle="This month">
    <SpendByProviderChart rows={costByProvider ?? []} />
  </ChartCard>
  <ChartCard title="Tasks by Status" subtitle="Current snapshot">
    <TasksByStatusChart issues={issues ?? []} />
  </ChartCard>
</div>
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @paperclipai/ui typecheck
```

Expected: no errors. Note that `runs` is no longer referenced.

- [ ] **Step 5: Run all UI tests**

```bash
pnpm --filter @paperclipai/ui exec vitest run
```

Expected: all tests pass (including the helper tests from Task 1).

- [ ] **Step 6: Commit**

```bash
git add ui/src/pages/Dashboard.tsx
git commit -m "feat: swap dashboard charts to productivity + cost set"
```

---

## Task 7: Delete the old chart components

**Files:**
- Modify: `ui/src/components/ActivityCharts.tsx`

- [ ] **Step 1: Remove the old exports**

Delete these from `ActivityCharts.tsx`:
- `RunActivityChart`
- `priorityColors`, `priorityOrder`, `PriorityChart`
- `IssueStatusChart`
- `SuccessRateChart`
- The `import type { HeartbeatRun }` at the top (no longer referenced)

Keep:
- `getLast14Days`, `formatDayLabel`, `DateLabels`, `ChartLegend`, `ChartCard`
- `statusColors`, `statusLabels` (still used by `TasksByStatusChart`)
- All new helpers and chart components

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @paperclipai/ui typecheck
```

Expected: no errors. No lingering references to removed exports (Dashboard already swapped in Task 6).

- [ ] **Step 3: Grep-verify nothing else imported the removed components**

```bash
grep -rn "RunActivityChart\|PriorityChart\|IssueStatusChart\|SuccessRateChart" ui/src/
```

Expected: no matches (they only lived in `ActivityCharts.tsx` and `Dashboard.tsx`).

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/ActivityCharts.tsx
git commit -m "chore: remove old run/issue charts from ActivityCharts"
```

---

## Task 8: Manual verification

- [ ] **Step 1: Start dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Visually verify the dashboard**

Navigate to `http://localhost:5173/<company-slug>/dashboard`. Verify:
1. Stat cards unchanged at the top.
2. Chart row shows four new charts: Tasks Throughput, Spend per Day, Spend by Provider, Tasks by Status.
3. Recent Activity and Recent Tasks unchanged at the bottom.
4. Charts render either data or their empty-state text, nothing blank.
5. No console errors.
6. Responsive: 2 columns on mobile, 4 on desktop.
7. Dark theme renders correctly.

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin 'feature/(dashboard-useful-charts)'
gh pr create --base developer --title "Feature/(dashboard-useful-charts): replace dashboard charts with productivity + cost set" --body "$(cat <<'EOF'
## Summary
- Replaces the 4 agent-run/issue charts on the dashboard with Tasks Throughput, Spend per Day, Spend by Provider, and Tasks by Status.
- Removes the heartbeats query from the dashboard (agents are hidden).
- Adds unit tests for the new data-bucketing helpers.

## Test plan
- [ ] Dashboard renders 4 new charts
- [ ] Empty states appear correctly when company has no data
- [ ] `pnpm --filter @paperclipai/ui exec vitest run` passes
- [ ] `pnpm --filter @paperclipai/ui typecheck` passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed. Return URL to user.
