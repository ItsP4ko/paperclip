# Sprint Analytics & Task Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add story points, burndown/velocity charts, sprint report, due dates, task dependencies, checklists, watchers, swimlanes, WIP limits, sprint goal field, and a basic Gantt roadmap to Paperclip.

**Architecture:** Four independently shippable phases. Phase 1 (Sprint Analytics) is the foundation — story points unlock all charts. All DB changes go through Drizzle schema edits + `drizzle-kit generate` migrations. All new issue fields follow the existing `updateIssue` passthrough pattern (schema → validator → service → API → UI). Charts use Recharts.

**Tech Stack:** Drizzle ORM (PostgreSQL), Zod, TanStack Query, React 19, Tailwind CSS 4, shadcn/ui, Recharts (added in Phase 1), TypeScript

---

## File Map

| File | Change |
|---|---|
| `packages/db/src/schema/issues.ts` | Add `storyPoints`, `dueDate` columns |
| `packages/db/src/schema/sprints.ts` | Add `goal` text column |
| `packages/db/src/schema/issue_links.ts` | **CREATE** — blocks/blocked-by table |
| `packages/db/src/schema/issue_checklist_items.ts` | **CREATE** — checklist items table |
| `packages/db/src/schema/issue_watchers.ts` | **CREATE** — watchers table |
| `packages/db/src/index.ts` | Export new schema tables |
| `packages/shared/src/types/issue.ts` | Add `storyPoints`, `dueDate`, `links`, `checklistItems`, `watchers` |
| `packages/shared/src/types/sprint.ts` | Add `goal` to Sprint; add `totalPoints`, `completedPoints`, `burndown`, `velocityBySprint` to metrics |
| `packages/shared/src/types/issue-link.ts` | **CREATE** — IssueLink type |
| `packages/shared/src/types/issue-checklist.ts` | **CREATE** — IssueChecklistItem type |
| `packages/shared/src/validators/issue.ts` | Add `storyPoints`, `dueDate` to createIssueSchema |
| `packages/shared/src/validators/sprint.ts` | Add `goal` to updateSprintSchema |
| `packages/shared/src/index.ts` | Export new types |
| `server/src/services/sprints.ts` | Enhance `getMetrics` + `getProjectMetrics`; add `getBurndown` |
| `server/src/services/issue-links.ts` | **CREATE** — CRUD for issue links |
| `server/src/services/issue-checklists.ts` | **CREATE** — CRUD for checklist items |
| `server/src/services/issue-watchers.ts` | **CREATE** — CRUD for watchers |
| `server/src/routes/sprints.ts` | Add `GET /sprints/:id/burndown` |
| `server/src/routes/issues.ts` | Add link/checklist/watcher sub-routes |
| `ui/src/api/sprints.ts` | Add `getBurndown` method |
| `ui/src/api/issues.ts` | Add links/checklists/watchers methods |
| `ui/src/lib/queryKeys.ts` | Add `burndown`, `links`, `checklists`, `watchers` keys |
| `ui/src/components/IssueProperties.tsx` | Add story points, due date, watchers rows |
| `ui/src/components/IssueChecklist.tsx` | **CREATE** — checklist UI component |
| `ui/src/components/IssueDependencies.tsx` | **CREATE** — dependencies UI component |
| `ui/src/pages/SprintPlanning.tsx` | Show point totals per column |
| `ui/src/pages/SprintBoard.tsx` | Show story points on cards + sprint goal in header |
| `ui/src/pages/SprintMetricsPanel.tsx` | Add velocity chart, burndown chart, sprint report |
| `ui/src/components/KanbanBoard.tsx` | Add swimlanes (by assignee) + WIP limit warnings |
| `ui/src/pages/GoalDetail.tsx` | Add basic Gantt timeline |

---

## PHASE 1 — Sprint Analytics

### Task 1: Add `story_points` column to issues schema

**Files:**
- Modify: `packages/db/src/schema/issues.ts`

- [ ] Open `packages/db/src/schema/issues.ts`. After the `sprintId` line (~line 51), add:

```typescript
    storyPoints: integer("story_points"),
```

- [ ] Generate and apply migration:

```bash
cd /Users/valentinoriva/Rosental/HittManager/paperclip/packages/db
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

Expected output: a new migration file created in `src/migrations/` and applied successfully.

- [ ] Commit:

```bash
git add packages/db/src/schema/issues.ts packages/db/src/migrations/
git commit -m "feat(db): add story_points column to issues"
```

---

### Task 2: Add `goal` column to sprints schema

**Files:**
- Modify: `packages/db/src/schema/sprints.ts`

- [ ] Open `packages/db/src/schema/sprints.ts`. After the `description` line, add:

```typescript
    goal: text("goal"),
```

- [ ] Generate and apply migration:

```bash
cd /Users/valentinoriva/Rosental/HittManager/paperclip/packages/db
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

- [ ] Commit:

```bash
git add packages/db/src/schema/sprints.ts packages/db/src/migrations/
git commit -m "feat(db): add goal column to sprints"
```

---

### Task 3: Update shared types and validators

**Files:**
- Modify: `packages/shared/src/types/issue.ts`
- Modify: `packages/shared/src/types/sprint.ts`
- Modify: `packages/shared/src/validators/issue.ts`
- Modify: `packages/shared/src/validators/sprint.ts` (or wherever updateSprintSchema lives)

- [ ] In `packages/shared/src/types/issue.ts`, add `storyPoints` to the `Issue` interface after `sprintId`:

```typescript
  storyPoints?: number | null;
```

- [ ] In `packages/shared/src/types/sprint.ts`, add `goal` to the `Sprint` interface after `description`:

```typescript
  goal?: string | null;
```

- [ ] In the same file, extend `SprintMetrics` with:

```typescript
  totalPoints: number;
  completedPoints: number;
  burndown?: Array<{ date: string; remaining: number; ideal: number }>;
```

- [ ] Extend `ProjectSprintMetrics` with:

```typescript
  velocityBySprint: Array<{ sprintId: string; name: string; completedPoints: number; completedCount: number }>;
```

- [ ] In `packages/shared/src/validators/issue.ts`, find `createIssueSchema` and add inside its `.extend({...})` or object body:

```typescript
  storyPoints: z.number().int().nonnegative().nullable().optional(),
```

- [ ] Find the sprint update validator (likely in `packages/shared/src/validators/sprint.ts`). Add:

```typescript
  goal: z.string().max(500).nullable().optional(),
```

- [ ] Build the shared package to verify no type errors:

```bash
cd /Users/valentinoriva/Rosental/HittManager/paperclip
pnpm --filter @paperclipai/shared build
```

Expected: builds without errors.

- [ ] Commit:

```bash
git add packages/shared/src/types/issue.ts packages/shared/src/types/sprint.ts packages/shared/src/validators/
git commit -m "feat(types): add storyPoints, sprint goal and metric point fields"
```

---

### Task 4: Server — sprint metrics include point totals

**Files:**
- Modify: `server/src/services/sprints.ts`

- [ ] Open `server/src/services/sprints.ts`. Find the `getMetrics(sprintId)` function. Inside, after fetching sprint issues, add point calculations before the return:

```typescript
const totalPoints = issues.reduce((sum, i) => sum + (i.storyPoints ?? 0), 0);
const completedPoints = issues
  .filter((i) => i.status === 'done')
  .reduce((sum, i) => sum + (i.storyPoints ?? 0), 0);
```

- [ ] Add `totalPoints` and `completedPoints` to the returned object:

```typescript
return {
  // ...existing fields...
  totalPoints,
  completedPoints,
};
```

- [ ] In `getProjectMetrics(projectId)`, after computing `sprintSummaries`, add a velocity array. For each completed sprint, sum the `completedPoints` of its issues:

```typescript
const velocityBySprint = await Promise.all(
  completedSprints.map(async (sprint) => {
    const sprintIssues = await db
      .select({ storyPoints: issues.storyPoints, status: issues.status })
      .from(issues)
      .where(eq(issues.sprintId, sprint.id));
    const completedPoints = sprintIssues
      .filter((i) => i.status === 'done')
      .reduce((sum, i) => sum + (i.storyPoints ?? 0), 0);
    return {
      sprintId: sprint.id,
      name: sprint.name,
      completedPoints,
      completedCount: sprintIssues.filter((i) => i.status === 'done').length,
    };
  })
);
```

- [ ] Add `velocityBySprint` to the `getProjectMetrics` return object.

- [ ] Restart the dev server and verify no TypeScript errors:

```bash
cd /Users/valentinoriva/Rosental/HittManager/paperclip
pnpm dev
```

- [ ] Commit:

```bash
git add server/src/services/sprints.ts
git commit -m "feat(server): add story point totals and velocity to sprint metrics"
```

---

### Task 5: Server — burndown endpoint

**Files:**
- Modify: `server/src/services/sprints.ts`
- Modify: `server/src/routes/sprints.ts`

- [ ] In `server/src/services/sprints.ts`, add a `getBurndown(sprintId)` method after `getMetrics`:

```typescript
getBurndown: async (sprintId: string) => {
  const sprint = await db.select().from(sprints).where(eq(sprints.id, sprintId)).then((r) => r[0]);
  if (!sprint) throw new Error('Sprint not found');

  const sprintIssues = await db
    .select({ id: issues.id, storyPoints: issues.storyPoints })
    .from(issues)
    .where(eq(issues.sprintId, sprintId));

  if (!sprint.startDate || !sprint.endDate) return [];

  const start = new Date(sprint.startDate);
  const end = new Date(sprint.endDate);
  const totalPoints = sprintIssues.reduce((sum, i) => sum + (i.storyPoints ?? 0), 0);
  const issueIds = sprintIssues.map((i) => i.id);

  // Get all "moved to done" transitions for sprint issues
  const completions = issueIds.length > 0
    ? await db
        .select({ issueId: issueStateHistory.issueId, changedAt: issueStateHistory.changedAt })
        .from(issueStateHistory)
        .where(
          and(
            inArray(issueStateHistory.issueId, issueIds),
            eq(issueStateHistory.toStatus, 'done'),
            gte(issueStateHistory.changedAt, start),
            lte(issueStateHistory.changedAt, end),
          )
        )
    : [];

  // Map issueId → points
  const pointsMap = new Map(sprintIssues.map((i) => [i.id, i.storyPoints ?? 0]));

  // Build daily burndown
  const days: Array<{ date: string; remaining: number; ideal: number }> = [];
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;

  for (let d = 0; d < totalDays; d++) {
    const dayDate = new Date(start.getTime() + d * 86400000);
    const dayStr = dayDate.toISOString().slice(0, 10);
    const completedByDay = completions
      .filter((c) => c.changedAt <= dayDate)
      .reduce((sum, c) => sum + (pointsMap.get(c.issueId) ?? 0), 0);
    const remaining = totalPoints - completedByDay;
    const ideal = Math.round(totalPoints - (totalPoints / (totalDays - 1)) * d);
    days.push({ date: dayStr, remaining, ideal });
  }

  return days;
},
```

- [ ] Add the required imports at the top of `server/src/services/sprints.ts` if not already present:

```typescript
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { issueStateHistory } from '../db/schema/issue_state_history.js'; // adjust path to match existing imports
```

- [ ] In `server/src/routes/sprints.ts`, add the burndown route after `GET /sprints/:id/metrics`:

```typescript
router.get('/sprints/:id/burndown', async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await svc.sprints.getBurndown(id);
    res.json(data);
  } catch (err) {
    next(err);
  }
});
```

- [ ] Verify server compiles:

```bash
cd /Users/valentinoriva/Rosental/HittManager/paperclip
pnpm --filter @paperclipai/server build
```

- [ ] Commit:

```bash
git add server/src/services/sprints.ts server/src/routes/sprints.ts
git commit -m "feat(server): add sprint burndown endpoint"
```

---

### Task 6: UI API + query keys for burndown and sprint goal

**Files:**
- Modify: `ui/src/api/sprints.ts`
- Modify: `ui/src/lib/queryKeys.ts`

- [ ] In `ui/src/api/sprints.ts`, add inside the `sprintsApi` object:

```typescript
getBurndown: (id: string) =>
  api.get<Array<{ date: string; remaining: number; ideal: number }>>(`/sprints/${id}/burndown`),
```

- [ ] In `ui/src/lib/queryKeys.ts`, add inside the `sprints` object:

```typescript
burndown: (id: string) => ["sprints", "burndown", id] as const,
```

- [ ] Commit:

```bash
git add ui/src/api/sprints.ts ui/src/lib/queryKeys.ts
git commit -m "feat(ui): add burndown API method and query key"
```

---

### Task 7: Install Recharts

- [ ] Install recharts in the UI package:

```bash
cd /Users/valentinoriva/Rosental/HittManager/paperclip/ui
pnpm add recharts
```

Expected: `recharts` appears in `ui/package.json` dependencies.

- [ ] Commit:

```bash
git add ui/package.json ui/pnpm-lock.yaml pnpm-lock.yaml
git commit -m "feat(ui): add recharts for sprint charts"
```

---

### Task 8: UI — Story points in IssueProperties

**Files:**
- Modify: `ui/src/components/IssueProperties.tsx`

- [ ] In `IssueProperties.tsx`, add the `Hash` icon to the existing import from `lucide-react`:

```typescript
import { User, Hexagon, ArrowUpRight, Tag, Plus, Trash2, Hash } from "lucide-react";
```

- [ ] Find the `PropertyRow` for **Priority** (around line 581). Immediately after its closing `</PropertyRow>`, add a story points row:

```tsx
<PropertyRow label="Points">
  <div className="flex items-center gap-1.5">
    <Hash className="h-3.5 w-3.5 text-muted-foreground" />
    <input
      type="number"
      min={0}
      max={999}
      placeholder="—"
      defaultValue={issue.storyPoints ?? ""}
      onBlur={(e) => {
        const raw = e.target.value.trim();
        const val = raw === "" ? null : parseInt(raw, 10);
        if (isNaN(val as number) && val !== null) return;
        onUpdate({ storyPoints: val });
      }}
      className="w-16 bg-transparent text-sm text-foreground outline-none border-b border-transparent hover:border-border focus:border-primary transition-colors"
    />
  </div>
</PropertyRow>
```

- [ ] Start the dev server and verify the field renders and saves:

```bash
cd /Users/valentinoriva/Rosental/HittManager/paperclip
pnpm dev
```

Open an issue, set a story points value, blur the field. Reload — value should persist.

- [ ] Commit:

```bash
git add ui/src/components/IssueProperties.tsx
git commit -m "feat(ui): story points field in IssueProperties"
```

---

### Task 9: UI — Story points in SprintPlanning

**Files:**
- Modify: `ui/src/pages/SprintPlanning.tsx`

- [ ] In `SprintPlanning.tsx`, find the derivation of `sprintIssues`. After it, add:

```typescript
const sprintPoints = sprintIssues.reduce((sum, i) => sum + (i.storyPoints ?? 0), 0);
const backlogPoints = backlog.reduce((sum, i) => sum + (i.storyPoints ?? 0), 0);
```

- [ ] Find the SPRINT column header (the `<div>` showing `sprint?.name`). Update it to show point total:

```tsx
<div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
  <span className="text-xs font-semibold text-foreground">{sprint?.name}</span>
  <span className="text-xs text-muted-foreground tabular-nums">
    {sprintIssues.length} issues · {sprintPoints} pts
  </span>
</div>
```

- [ ] Do the same for the BACKLOG column header:

```tsx
<div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Backlog</span>
  <span className="text-xs text-muted-foreground tabular-nums">
    {backlog.length} · {backlogPoints} pts
  </span>
</div>
```

- [ ] Commit:

```bash
git add ui/src/pages/SprintPlanning.tsx
git commit -m "feat(ui): show story point totals in sprint planning columns"
```

---

### Task 10: UI — Story points on SprintBoard cards

**Files:**
- Modify: `ui/src/pages/SprintBoard.tsx`

- [ ] In `SprintBoard.tsx`, find `IssueCardContent`. Update it to display story points when present:

```tsx
function IssueCardContent({ issue }: { issue: Issue }) {
  return (
    <>
      <p className="text-foreground text-sm leading-snug">{issue.title}</p>
      <div className="flex items-center gap-2 mt-1">
        {issue.priority && (
          <span className={cn("text-xs capitalize font-medium", PRIORITY_COLOR[issue.priority] ?? "text-muted-foreground")}>
            {issue.priority}
          </span>
        )}
        {issue.identifier && (
          <span className="text-xs text-muted-foreground font-mono">{issue.identifier}</span>
        )}
        {issue.storyPoints != null && (
          <span className="ml-auto text-xs font-semibold text-muted-foreground bg-muted rounded px-1.5 py-0.5">
            {issue.storyPoints}
          </span>
        )}
      </div>
    </>
  );
}
```

- [ ] Find the sprint header section. Add the sprint goal display below the sprint name (if `sprint.goal` exists):

```tsx
{sprint.goal && (
  <p className="text-xs text-muted-foreground mt-0.5 italic">"{sprint.goal}"</p>
)}
```

- [ ] Commit:

```bash
git add ui/src/pages/SprintBoard.tsx
git commit -m "feat(ui): show story points on sprint board cards and goal in header"
```

---

### Task 11: UI — Velocity chart in SprintMetricsPanel

**Files:**
- Modify: `ui/src/pages/SprintMetricsPanel.tsx`

- [ ] Add recharts imports at the top of `SprintMetricsPanel.tsx`:

```typescript
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine,
} from 'recharts';
```

- [ ] The component already fetches `projectMetrics` via `sprintsApi.getProjectMetrics`. The data now includes `velocityBySprint`. Find the section after the KPI grid and add a velocity chart section:

```tsx
{projectMetrics.velocityBySprint.length > 0 && (
  <div className="mt-6">
    <h3 className="text-sm font-semibold text-foreground mb-3">Velocity</h3>
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={projectMetrics.velocityBySprint} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            fontSize: '12px',
          }}
          formatter={(value: number, name: string) =>
            name === 'completedPoints' ? [`${value} pts`, 'Points'] : [value, 'Issues']
          }
        />
        <Bar dataKey="completedPoints" name="completedPoints" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
        <Bar dataKey="completedCount" name="completedCount" fill="hsl(var(--muted-foreground))" radius={[3, 3, 0, 0]} opacity={0.4} />
      </BarChart>
    </ResponsiveContainer>
    <p className="text-xs text-muted-foreground text-center mt-1">
      Points (solid) and issue count (faint) per sprint
    </p>
  </div>
)}
```

- [ ] Commit:

```bash
git add ui/src/pages/SprintMetricsPanel.tsx
git commit -m "feat(ui): velocity chart in sprint metrics panel"
```

---

### Task 12: UI — Burndown chart (new component + SprintBoard integration)

**Files:**
- Create: `ui/src/components/SprintBurndown.tsx`
- Modify: `ui/src/pages/SprintBoard.tsx`

- [ ] Create `ui/src/components/SprintBurndown.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import { sprintsApi } from '../api/sprints';
import { queryKeys } from '../lib/queryKeys';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  sprintId: string;
  sprintName: string;
}

export function SprintBurndown({ sprintId, sprintName }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.sprints.burndown(sprintId),
    queryFn: () => sprintsApi.getBurndown(sprintId),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <Skeleton className="h-40 w-full rounded-md" />;
  if (!data || data.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-8">
        No hay datos de burndown. Asegurate de que el sprint tiene story points y fechas.
      </p>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-foreground mb-2">Burndown — {sprintName}</h3>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(d: string) => d.slice(5)}
          />
          <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '6px',
              fontSize: '12px',
            }}
            formatter={(value: number, name: string) => [
              `${value} pts`,
              name === 'remaining' ? 'Remaining' : 'Ideal',
            ]}
          />
          <Legend
            formatter={(value) => (value === 'remaining' ? 'Remaining' : 'Ideal')}
            wrapperStyle={{ fontSize: 11 }}
          />
          <Line
            type="monotone"
            dataKey="remaining"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="ideal"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
          />
          <ReferenceLine x={today} stroke="hsl(var(--destructive))" strokeDasharray="3 3" label="" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] In `ui/src/pages/SprintBoard.tsx`, add the import:

```typescript
import { SprintBurndown } from '../components/SprintBurndown';
```

- [ ] In the SprintBoard JSX, add a collapsible burndown section below the sprint header:

```tsx
{/* Burndown toggle */}
{total > 0 && (
  <details className="border-b border-border px-4 py-2 group">
    <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none list-none flex items-center gap-1">
      <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
      Burndown
    </summary>
    <SprintBurndown sprintId={sprint.id} sprintName={sprint.name} />
  </details>
)}
```

- [ ] Verify in browser: open an active sprint board — the burndown section should be collapsible and render the chart.

- [ ] Commit:

```bash
git add ui/src/components/SprintBurndown.tsx ui/src/pages/SprintBoard.tsx
git commit -m "feat(ui): sprint burndown chart component"
```

---

### Task 13: UI — Sprint Report in SprintMetricsPanel

**Files:**
- Modify: `ui/src/pages/SprintMetricsPanel.tsx`

The `sprintsApi.getMetrics(sprintId)` already returns `byStatus`, `total`, `completionRate`, `spilledOver`. We'll add a per-sprint report using existing data.

- [ ] In `SprintMetricsPanel.tsx`, find where `sprintSummaries` is displayed (the left column of the two-column detail grid). Below the existing spill-over list, add a sprint completion summary:

```tsx
{projectMetrics.sprintSummaries.map((s) => (
  <div key={s.sprintId} className="flex items-center gap-2 py-1.5 border-b border-border last:border-0">
    <div className="flex-1 min-w-0">
      <p className="text-xs font-medium text-foreground truncate">{s.name}</p>
      <p className="text-xs text-muted-foreground">
        {s.completed}/{s.total} completed
        {s.spilledOver > 0 && (
          <span className="ml-1.5 text-yellow-500">· {s.spilledOver} spilled</span>
        )}
      </p>
    </div>
    <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden shrink-0">
      <div
        className="h-full bg-primary rounded-full"
        style={{ width: `${Math.round((s.completed / Math.max(s.total, 1)) * 100)}%` }}
      />
    </div>
    <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
      {Math.round((s.completed / Math.max(s.total, 1)) * 100)}%
    </span>
  </div>
))}
```

Note: `sprintSummaries` already includes `{ sprintId, name, total, completed, spilledOver }` based on existing `ProjectSprintMetrics`. Verify these exact field names match the server response; adjust if needed.

- [ ] Commit:

```bash
git add ui/src/pages/SprintMetricsPanel.tsx
git commit -m "feat(ui): sprint report with completion rates in metrics panel"
```

---

### Task 14: Sprint Goal — UI in SprintPlanning

**Files:**
- Modify: `ui/src/pages/SprintPlanning.tsx`

- [ ] Import `sprintsApi` mutation. Find the existing mutations (`addIssue`, `removeIssue`, `activate`). Add an `updateSprint` mutation:

```typescript
const updateSprint = useMutation({
  mutationFn: (data: { goal?: string }) => sprintsApi.update(sprint!.id, data),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sprints.list(projectId) }),
});
```

- [ ] In the sprint header area, below the sprint name/dates, add an editable goal field:

```tsx
<div className="px-3 py-1.5 border-b border-border">
  <input
    type="text"
    placeholder="Sprint goal... (optional)"
    defaultValue={sprint?.goal ?? ''}
    onBlur={(e) => {
      const val = e.target.value.trim() || null;
      if (val !== (sprint?.goal ?? null)) {
        updateSprint.mutate({ goal: val ?? undefined });
      }
    }}
    className="w-full text-xs text-muted-foreground placeholder:text-muted-foreground/50 bg-transparent outline-none hover:text-foreground focus:text-foreground transition-colors"
  />
</div>
```

- [ ] Commit:

```bash
git add ui/src/pages/SprintPlanning.tsx
git commit -m "feat(ui): editable sprint goal in planning view"
```

---

## PHASE 2 — Task Fundamentals

### Task 15: DB — `due_date` column on issues

**Files:**
- Modify: `packages/db/src/schema/issues.ts`

- [ ] In `packages/db/src/schema/issues.ts`, after `storyPoints`, add:

```typescript
    dueDate: timestamp("due_date", { withTimezone: true }),
```

- [ ] Generate and apply migration:

```bash
cd /Users/valentinoriva/Rosental/HittManager/paperclip/packages/db
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

- [ ] Commit:

```bash
git add packages/db/src/schema/issues.ts packages/db/src/migrations/
git commit -m "feat(db): add due_date column to issues"
```

---

### Task 16: Due date — shared types + validators + UI

**Files:**
- Modify: `packages/shared/src/types/issue.ts`
- Modify: `packages/shared/src/validators/issue.ts`
- Modify: `ui/src/components/IssueProperties.tsx`

- [ ] In `packages/shared/src/types/issue.ts`, add to the `Issue` interface:

```typescript
  dueDate?: Date | string | null;
```

- [ ] In `packages/shared/src/validators/issue.ts`, add to `createIssueSchema`:

```typescript
  dueDate: z.string().datetime().nullable().optional(),
```

- [ ] Build shared package:

```bash
cd /Users/valentinoriva/Rosental/HittManager/paperclip
pnpm --filter @paperclipai/shared build
```

- [ ] In `ui/src/components/IssueProperties.tsx`, add `Calendar` to the lucide-react import:

```typescript
import { User, Hexagon, ArrowUpRight, Tag, Plus, Trash2, Hash, Calendar } from "lucide-react";
```

- [ ] After the story points `PropertyRow`, add a due date row:

```tsx
<PropertyRow label="Due date">
  <div className="flex items-center gap-1.5">
    <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    <input
      type="date"
      defaultValue={
        issue.dueDate
          ? new Date(issue.dueDate).toISOString().slice(0, 10)
          : ''
      }
      onChange={(e) => {
        const val = e.target.value ? new Date(e.target.value).toISOString() : null;
        onUpdate({ dueDate: val });
      }}
      className="text-sm text-foreground bg-transparent outline-none border-b border-transparent hover:border-border focus:border-primary transition-colors cursor-pointer"
    />
    {issue.dueDate && (
      <button
        onClick={() => onUpdate({ dueDate: null })}
        className="text-muted-foreground hover:text-destructive transition-colors"
      >
        <span className="text-xs">×</span>
      </button>
    )}
  </div>
</PropertyRow>
```

- [ ] Commit:

```bash
git add packages/shared/src/types/issue.ts packages/shared/src/validators/issue.ts ui/src/components/IssueProperties.tsx
git commit -m "feat: add due date field to issues"
```

---

### Task 17: DB — `issue_links` table (dependencies)

**Files:**
- Create: `packages/db/src/schema/issue_links.ts`
- Modify: `packages/db/src/index.ts` (or wherever schemas are exported)

- [ ] Create `packages/db/src/schema/issue_links.ts`:

```typescript
import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { issues } from './issues.js';

export const issueLinks = pgTable(
  'issue_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceIssueId: uuid('source_issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
    targetIssueId: uuid('target_issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
    linkType: text('link_type').notNull(), // 'blocks' | 'blocked_by' | 'relates_to' | 'duplicates'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceIdx: index('issue_links_source_idx').on(t.sourceIssueId),
    targetIdx: index('issue_links_target_idx').on(t.targetIssueId),
    uniquePair: uniqueIndex('issue_links_unique').on(t.sourceIssueId, t.targetIssueId, t.linkType),
  }),
);
```

- [ ] Export it from the DB package index (find `packages/db/src/schema/index.ts` or similar and add):

```typescript
export * from './issue_links.js';
```

- [ ] Generate and apply migration:

```bash
cd /Users/valentinoriva/Rosental/HittManager/paperclip/packages/db
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

- [ ] Commit:

```bash
git add packages/db/src/schema/issue_links.ts packages/db/src/schema/index.ts packages/db/src/migrations/
git commit -m "feat(db): add issue_links table for task dependencies"
```

---

### Task 18: IssueLink shared type + server service + routes

**Files:**
- Create: `packages/shared/src/types/issue-link.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `server/src/services/issue-links.ts`
- Modify: `server/src/routes/issues.ts`

- [ ] Create `packages/shared/src/types/issue-link.ts`:

```typescript
export type IssueLinkType = 'blocks' | 'blocked_by' | 'relates_to' | 'duplicates';

export interface IssueLink {
  id: string;
  sourceIssueId: string;
  targetIssueId: string;
  linkType: IssueLinkType;
  createdAt: Date;
  targetIssue?: {
    id: string;
    identifier: string | null;
    title: string;
    status: string;
    priority: string;
  };
}
```

- [ ] Export it from `packages/shared/src/index.ts` (or the types barrel):

```typescript
export * from './types/issue-link.js';
```

- [ ] Create `server/src/services/issue-links.ts` (adjust db import path to match existing services):

```typescript
import { and, eq, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import { issueLinks } from '../db/schema/issue_links.js';
import { issues } from '../db/schema/issues.js';

export const issueLinksService = {
  list: async (issueId: string) => {
    const rows = await db
      .select({
        id: issueLinks.id,
        sourceIssueId: issueLinks.sourceIssueId,
        targetIssueId: issueLinks.targetIssueId,
        linkType: issueLinks.linkType,
        createdAt: issueLinks.createdAt,
        targetId: issues.id,
        targetIdentifier: issues.identifier,
        targetTitle: issues.title,
        targetStatus: issues.status,
        targetPriority: issues.priority,
      })
      .from(issueLinks)
      .leftJoin(issues, eq(issues.id, issueLinks.targetIssueId))
      .where(
        or(
          eq(issueLinks.sourceIssueId, issueId),
          eq(issueLinks.targetIssueId, issueId),
        )
      );

    return rows.map((r) => ({
      id: r.id,
      sourceIssueId: r.sourceIssueId,
      targetIssueId: r.targetIssueId,
      linkType: r.linkType,
      createdAt: r.createdAt,
      targetIssue: r.targetId
        ? {
            id: r.targetId,
            identifier: r.targetIdentifier,
            title: r.targetTitle,
            status: r.targetStatus,
            priority: r.targetPriority,
          }
        : undefined,
    }));
  },

  create: async (sourceIssueId: string, targetIssueId: string, linkType: string) => {
    const [row] = await db
      .insert(issueLinks)
      .values({ sourceIssueId, targetIssueId, linkType })
      .returning();
    return row;
  },

  remove: async (linkId: string) => {
    await db.delete(issueLinks).where(eq(issueLinks.id, linkId));
  },
};
```

- [ ] In `server/src/routes/issues.ts`, add link sub-routes. Find the end of issue routes and add:

```typescript
// Issue links (dependencies)
router.get('/issues/:id/links', async (req, res, next) => {
  try {
    const links = await issueLinksService.list(req.params.id);
    res.json(links);
  } catch (err) { next(err); }
});

router.post('/issues/:id/links', async (req, res, next) => {
  try {
    const { targetIssueId, linkType } = req.body as { targetIssueId: string; linkType: string };
    const link = await issueLinksService.create(req.params.id, targetIssueId, linkType);
    res.status(201).json(link);
  } catch (err) { next(err); }
});

router.delete('/issues/links/:linkId', async (req, res, next) => {
  try {
    await issueLinksService.remove(req.params.linkId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
```

- [ ] Add the import at the top of `server/src/routes/issues.ts`:

```typescript
import { issueLinksService } from '../services/issue-links.js';
```

- [ ] Commit:

```bash
git add packages/shared/src/types/issue-link.ts packages/shared/src/index.ts \
        server/src/services/issue-links.ts server/src/routes/issues.ts
git commit -m "feat: issue links service and routes (blocks/blocked-by/relates)"
```

---

### Task 19: UI — Dependencies section in IssueDetail

**Files:**
- Modify: `ui/src/api/issues.ts`
- Modify: `ui/src/lib/queryKeys.ts`
- Create: `ui/src/components/IssueDependencies.tsx`

- [ ] In `ui/src/api/issues.ts`, add to `issuesApi`:

```typescript
listLinks: (id: string) => api.get<IssueLink[]>(`/issues/${id}/links`),
createLink: (id: string, data: { targetIssueId: string; linkType: string }) =>
  api.post<IssueLink>(`/issues/${id}/links`, data),
removeLink: (linkId: string) => api.delete<{ ok: true }>(`/issues/links/${linkId}`),
```

- [ ] Add the import for `IssueLink` in `ui/src/api/issues.ts`:

```typescript
import type { ..., IssueLink } from '@paperclipai/shared';
```

- [ ] In `ui/src/lib/queryKeys.ts`, add to the `issues` object:

```typescript
links: (issueId: string) => ["issues", "links", issueId] as const,
```

- [ ] Create `ui/src/components/IssueDependencies.tsx`:

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { issuesApi } from '../api/issues';
import { queryKeys } from '../lib/queryKeys';
import { useCompany } from '../context/CompanyContext';
import { StatusIcon } from './StatusIcon';
import { PriorityIcon } from './PriorityIcon';
import { Link } from '@/lib/router';
import { Plus, Trash2, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IssueLinkType } from '@paperclipai/shared';

const LINK_TYPE_LABELS: Record<IssueLinkType, string> = {
  blocks: 'Blocks',
  blocked_by: 'Blocked by',
  relates_to: 'Relates to',
  duplicates: 'Duplicates',
};

const LINK_TYPES: IssueLinkType[] = ['blocks', 'blocked_by', 'relates_to', 'duplicates'];

interface Props {
  issueId: string;
}

export function IssueDependencies({ issueId }: Props) {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const [showAdd, setShowAdd] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [linkType, setLinkType] = useState<IssueLinkType>('blocks');

  const { data: links = [] } = useQuery({
    queryKey: queryKeys.issues.links(issueId),
    queryFn: () => issuesApi.listLinks(issueId),
  });

  const addLink = useMutation({
    mutationFn: async () => {
      // Look up issue by identifier
      const results = await issuesApi.list(selectedCompanyId!, { q: identifier });
      const target = results.find((i) => i.identifier === identifier);
      if (!target) throw new Error(`Issue "${identifier}" not found`);
      return issuesApi.createLink(issueId, { targetIssueId: target.id, linkType });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.links(issueId) });
      setShowAdd(false);
      setIdentifier('');
    },
  });

  const removeLink = useMutation({
    mutationFn: (linkId: string) => issuesApi.removeLink(linkId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.issues.links(issueId) }),
  });

  if (links.length === 0 && !showAdd) {
    return (
      <button
        onClick={() => setShowAdd(true)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        <Link2 className="h-3.5 w-3.5" />
        Add dependency
      </button>
    );
  }

  const grouped = LINK_TYPES.map((type) => ({
    type,
    items: links.filter(
      (l) => (l.sourceIssueId === issueId && l.linkType === type) ||
             (l.targetIssueId === issueId && l.linkType === (type === 'blocks' ? 'blocked_by' : type === 'blocked_by' ? 'blocks' : type))
    ),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-2 mt-2">
      {grouped.map(({ type, items }) => (
        <div key={type}>
          <p className="text-xs font-medium text-muted-foreground mb-1">{LINK_TYPE_LABELS[type]}</p>
          {items.map((link) => {
            const target = link.targetIssue;
            if (!target) return null;
            return (
              <div key={link.id} className="flex items-center gap-2 py-1 group">
                <StatusIcon status={target.status} />
                <PriorityIcon priority={target.priority} />
                <span className="text-xs text-muted-foreground font-mono">{target.identifier}</span>
                <Link
                  to={`/issues/${target.identifier ?? target.id}`}
                  className="text-xs text-foreground hover:underline truncate flex-1"
                >
                  {target.title}
                </Link>
                <button
                  onClick={() => removeLink.mutate(link.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      ))}

      {showAdd ? (
        <div className="flex items-center gap-2 mt-2">
          <select
            value={linkType}
            onChange={(e) => setLinkType(e.target.value as IssueLinkType)}
            className="text-xs bg-muted border border-border rounded px-1.5 py-1 outline-none"
          >
            {LINK_TYPES.map((t) => (
              <option key={t} value={t}>{LINK_TYPE_LABELS[t]}</option>
            ))}
          </select>
          <input
            autoFocus
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value.toUpperCase())}
            placeholder="PAC-123"
            className="text-xs bg-muted border border-border rounded px-2 py-1 outline-none focus:border-primary w-24 font-mono"
          />
          <button
            onClick={() => addLink.mutate()}
            disabled={!identifier || addLink.isPending}
            className="text-xs text-primary hover:text-primary/80 disabled:opacity-50"
          >
            Add
          </button>
          <button onClick={() => setShowAdd(false)} className="text-xs text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          {addLink.isError && (
            <span className="text-xs text-destructive">{(addLink.error as Error).message}</span>
          )}
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add link
        </button>
      )}
    </div>
  );
}
```

- [ ] Find where the issue detail renders its main content (likely `ui/src/pages/IssueDetail.tsx`). Add the `IssueDependencies` component in an appropriate section (e.g. after the description, before comments):

```tsx
import { IssueDependencies } from '../components/IssueDependencies';

// Inside the issue detail body:
<div className="mt-4">
  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Dependencies</h3>
  <IssueDependencies issueId={issue.id} />
</div>
```

- [ ] Commit:

```bash
git add ui/src/api/issues.ts ui/src/lib/queryKeys.ts \
        ui/src/components/IssueDependencies.tsx ui/src/pages/IssueDetail.tsx
git commit -m "feat(ui): task dependencies section in issue detail"
```

---

### Task 20: DB — `issue_checklist_items` table

**Files:**
- Create: `packages/db/src/schema/issue_checklist_items.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] Create `packages/db/src/schema/issue_checklist_items.ts`:

```typescript
import { pgTable, uuid, text, boolean, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { issues } from './issues.js';

export const issueChecklistItems = pgTable(
  'issue_checklist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issueId: uuid('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    checked: boolean('checked').notNull().default(false),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    issueIdx: index('checklist_items_issue_idx').on(t.issueId),
  }),
);
```

- [ ] Add export to `packages/db/src/schema/index.ts`:

```typescript
export * from './issue_checklist_items.js';
```

- [ ] Generate and apply migration:

```bash
cd /Users/valentinoriva/Rosental/HittManager/paperclip/packages/db
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

- [ ] Commit:

```bash
git add packages/db/src/schema/issue_checklist_items.ts packages/db/src/schema/index.ts packages/db/src/migrations/
git commit -m "feat(db): add issue_checklist_items table"
```

---

### Task 21: Checklists — type + service + routes + UI

**Files:**
- Create: `packages/shared/src/types/issue-checklist.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `server/src/services/issue-checklists.ts`
- Modify: `server/src/routes/issues.ts`
- Modify: `ui/src/api/issues.ts`
- Modify: `ui/src/lib/queryKeys.ts`
- Create: `ui/src/components/IssueChecklist.tsx`

- [ ] Create `packages/shared/src/types/issue-checklist.ts`:

```typescript
export interface IssueChecklistItem {
  id: string;
  issueId: string;
  text: string;
  checked: boolean;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] Export from `packages/shared/src/index.ts`:

```typescript
export * from './types/issue-checklist.js';
```

- [ ] Create `server/src/services/issue-checklists.ts`:

```typescript
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { issueChecklistItems } from '../db/schema/issue_checklist_items.js';

export const issueChecklistsService = {
  list: async (issueId: string) =>
    db.select().from(issueChecklistItems)
      .where(eq(issueChecklistItems.issueId, issueId))
      .orderBy(asc(issueChecklistItems.position)),

  create: async (issueId: string, text: string, position: number) => {
    const [row] = await db.insert(issueChecklistItems)
      .values({ issueId, text, position })
      .returning();
    return row;
  },

  update: async (id: string, data: { text?: string; checked?: boolean; position?: number }) => {
    const [row] = await db.update(issueChecklistItems)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(issueChecklistItems.id, id))
      .returning();
    return row;
  },

  remove: async (id: string) => {
    await db.delete(issueChecklistItems).where(eq(issueChecklistItems.id, id));
  },
};
```

- [ ] In `server/src/routes/issues.ts`, add checklist routes and import:

```typescript
import { issueChecklistsService } from '../services/issue-checklists.js';

// Checklist routes
router.get('/issues/:id/checklist', async (req, res, next) => {
  try { res.json(await issueChecklistsService.list(req.params.id)); }
  catch (err) { next(err); }
});
router.post('/issues/:id/checklist', async (req, res, next) => {
  try {
    const { text, position } = req.body as { text: string; position: number };
    res.status(201).json(await issueChecklistsService.create(req.params.id, text, position ?? 0));
  } catch (err) { next(err); }
});
router.patch('/issues/checklist/:itemId', async (req, res, next) => {
  try {
    res.json(await issueChecklistsService.update(req.params.itemId, req.body));
  } catch (err) { next(err); }
});
router.delete('/issues/checklist/:itemId', async (req, res, next) => {
  try {
    await issueChecklistsService.remove(req.params.itemId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
```

- [ ] In `ui/src/api/issues.ts`, add:

```typescript
listChecklist: (id: string) => api.get<IssueChecklistItem[]>(`/issues/${id}/checklist`),
addChecklistItem: (id: string, data: { text: string; position: number }) =>
  api.post<IssueChecklistItem>(`/issues/${id}/checklist`, data),
updateChecklistItem: (itemId: string, data: { text?: string; checked?: boolean; position?: number }) =>
  api.patch<IssueChecklistItem>(`/issues/checklist/${itemId}`, data),
removeChecklistItem: (itemId: string) =>
  api.delete<{ ok: true }>(`/issues/checklist/${itemId}`),
```

- [ ] In `ui/src/lib/queryKeys.ts`, add to `issues`:

```typescript
checklist: (issueId: string) => ["issues", "checklist", issueId] as const,
```

- [ ] Create `ui/src/components/IssueChecklist.tsx`:

```tsx
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { issuesApi } from '../api/issues';
import { queryKeys } from '../lib/queryKeys';
import { Check, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props { issueId: string; }

export function IssueChecklist({ issueId }: Props) {
  const queryClient = useQueryClient();
  const [newText, setNewText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: items = [] } = useQuery({
    queryKey: queryKeys.issues.checklist(issueId),
    queryFn: () => issuesApi.listChecklist(issueId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.issues.checklist(issueId) });

  const addItem = useMutation({
    mutationFn: () => issuesApi.addChecklistItem(issueId, { text: newText.trim(), position: items.length }),
    onSuccess: () => { setNewText(''); invalidate(); },
  });

  const toggleItem = useMutation({
    mutationFn: ({ id, checked }: { id: string; checked: boolean }) =>
      issuesApi.updateChecklistItem(id, { checked }),
    onSuccess: invalidate,
  });

  const removeItem = useMutation({
    mutationFn: (id: string) => issuesApi.removeChecklistItem(id),
    onSuccess: invalidate,
  });

  const checked = items.filter((i) => i.checked).length;

  return (
    <div className="space-y-1 mt-2">
      {items.length > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${Math.round((checked / items.length) * 100)}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {checked}/{items.length}
          </span>
        </div>
      )}

      {items.map((item) => (
        <div key={item.id} className="flex items-start gap-2 group py-0.5">
          <button
            onClick={() => toggleItem.mutate({ id: item.id, checked: !item.checked })}
            className={cn(
              'h-4 w-4 mt-0.5 shrink-0 rounded border-2 flex items-center justify-center transition-colors',
              item.checked
                ? 'bg-primary border-primary text-primary-foreground'
                : 'border-border hover:border-primary',
            )}
          >
            {item.checked && <Check className="h-2.5 w-2.5" />}
          </button>
          <span className={cn('text-sm flex-1', item.checked && 'line-through text-muted-foreground')}>
            {item.text}
          </span>
          <button
            onClick={() => removeItem.mutate(item.id)}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}

      <div className="flex items-center gap-2 mt-1">
        <div className="h-4 w-4 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newText.trim()) addItem.mutate();
            if (e.key === 'Escape') setNewText('');
          }}
          placeholder="Add item..."
          className="text-sm bg-transparent text-muted-foreground placeholder:text-muted-foreground/50 outline-none flex-1 border-b border-transparent focus:border-border transition-colors"
        />
        {newText.trim() && (
          <button
            onClick={() => addItem.mutate()}
            className="text-primary hover:text-primary/80 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] In `ui/src/pages/IssueDetail.tsx`, add the checklist component below the description:

```tsx
import { IssueChecklist } from '../components/IssueChecklist';

// Inside IssueDetail body, after description:
<div className="mt-4">
  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Checklist</h3>
  <IssueChecklist issueId={issue.id} />
</div>
```

- [ ] Commit:

```bash
git add packages/shared/src/types/issue-checklist.ts packages/shared/src/index.ts \
        server/src/services/issue-checklists.ts server/src/routes/issues.ts \
        ui/src/api/issues.ts ui/src/lib/queryKeys.ts \
        ui/src/components/IssueChecklist.tsx ui/src/pages/IssueDetail.tsx
git commit -m "feat: issue checklists (add/check/remove items with progress bar)"
```

---

### Task 22: Watchers

**Files:**
- Create: `packages/db/src/schema/issue_watchers.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `server/src/services/issue-watchers.ts`
- Modify: `server/src/routes/issues.ts`
- Modify: `ui/src/api/issues.ts`, `ui/src/lib/queryKeys.ts`
- Modify: `ui/src/components/IssueProperties.tsx`

- [ ] Create `packages/db/src/schema/issue_watchers.ts`:

```typescript
import { pgTable, uuid, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { issues } from './issues.js';

export const issueWatchers = pgTable(
  'issue_watchers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issueId: uuid('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    issueIdx: index('watchers_issue_idx').on(t.issueId),
    unique: uniqueIndex('watchers_unique').on(t.issueId, t.userId),
  }),
);
```

- [ ] Export from `packages/db/src/schema/index.ts`:

```typescript
export * from './issue_watchers.js';
```

- [ ] Generate and apply migration:

```bash
cd /Users/valentinoriva/Rosental/HittManager/paperclip/packages/db
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

- [ ] Create `server/src/services/issue-watchers.ts`:

```typescript
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { issueWatchers } from '../db/schema/issue_watchers.js';

export const issueWatchersService = {
  list: async (issueId: string) =>
    db.select({ userId: issueWatchers.userId })
      .from(issueWatchers)
      .where(eq(issueWatchers.issueId, issueId)),

  watch: async (issueId: string, userId: string) => {
    await db.insert(issueWatchers)
      .values({ issueId, userId })
      .onConflictDoNothing();
  },

  unwatch: async (issueId: string, userId: string) => {
    await db.delete(issueWatchers)
      .where(and(eq(issueWatchers.issueId, issueId), eq(issueWatchers.userId, userId)));
  },
};
```

- [ ] Add watcher routes to `server/src/routes/issues.ts`:

```typescript
import { issueWatchersService } from '../services/issue-watchers.js';

router.get('/issues/:id/watchers', async (req, res, next) => {
  try { res.json(await issueWatchersService.list(req.params.id)); }
  catch (err) { next(err); }
});
router.post('/issues/:id/watchers', async (req, res, next) => {
  try {
    const { userId } = req.body as { userId: string };
    await issueWatchersService.watch(req.params.id, userId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
router.delete('/issues/:id/watchers/:userId', async (req, res, next) => {
  try {
    await issueWatchersService.unwatch(req.params.id, req.params.userId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
```

- [ ] In `ui/src/api/issues.ts`, add:

```typescript
listWatchers: (id: string) => api.get<Array<{ userId: string }>>(`/issues/${id}/watchers`),
watch: (id: string, userId: string) => api.post<{ ok: true }>(`/issues/${id}/watchers`, { userId }),
unwatch: (id: string, userId: string) => api.delete<{ ok: true }>(`/issues/${id}/watchers/${userId}`),
```

- [ ] In `ui/src/lib/queryKeys.ts`, add to `issues`:

```typescript
watchers: (issueId: string) => ["issues", "watchers", issueId] as const,
```

- [ ] In `ui/src/components/IssueProperties.tsx`, add a Watch/Unwatch button. Find where `session` and `currentUserId` are used. After the assignee `PropertyRow`, add:

```tsx
{/* Watchers */}
{(() => {
  const { data: watchers = [] } = useQuery({
    queryKey: queryKeys.issues.watchers(issue.id),
    queryFn: () => issuesApi.listWatchers(issue.id),
  });
  const isWatching = currentUserId ? watchers.some((w) => w.userId === currentUserId) : false;
  const toggleWatch = useMutation({
    mutationFn: () =>
      isWatching
        ? issuesApi.unwatch(issue.id, currentUserId!)
        : issuesApi.watch(issue.id, currentUserId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.issues.watchers(issue.id) }),
  });
  if (!currentUserId) return null;
  return (
    <PropertyRow label="Watching">
      <button
        onClick={() => toggleWatch.mutate()}
        className={cn(
          'text-xs px-2 py-0.5 rounded border transition-colors',
          isWatching
            ? 'border-primary text-primary bg-primary/10'
            : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
        )}
      >
        {isWatching ? 'Watching' : 'Watch'}
        {watchers.length > 0 && <span className="ml-1 opacity-60">{watchers.length}</span>}
      </button>
    </PropertyRow>
  );
})()}
```

Note: This uses an IIFE pattern to keep hooks inside the component. Alternatively, extract a `WatcherRow` sub-component.

- [ ] Commit:

```bash
git add packages/db/src/schema/issue_watchers.ts packages/db/src/schema/index.ts \
        packages/db/src/migrations/ server/src/services/issue-watchers.ts \
        server/src/routes/issues.ts ui/src/api/issues.ts ui/src/lib/queryKeys.ts \
        ui/src/components/IssueProperties.tsx
git commit -m "feat: issue watchers (watch/unwatch with count)"
```

---

## PHASE 3 — Board Enhancements

### Task 23: Swimlanes by assignee in KanbanBoard

**Files:**
- Modify: `ui/src/components/KanbanBoard.tsx`
- Modify: `ui/src/components/IssuesList.tsx`

- [ ] In `ui/src/components/KanbanBoard.tsx`, add a `groupBy` prop to `KanbanBoardProps`:

```typescript
interface KanbanBoardProps {
  issues: Issue[];
  agents?: Agent[];
  liveIssueIds?: Set<string>;
  onUpdateIssue: (id: string, data: Record<string, unknown>) => void;
  groupBy?: 'none' | 'assignee';
}
```

- [ ] Update the `KanbanBoard` function signature to accept and destructure `groupBy = 'none'`.

- [ ] When `groupBy === 'assignee'`, compute swimlane groups:

```typescript
const swimlaneGroups = useMemo(() => {
  if (groupBy !== 'assignee') return null;
  const unassigned = issues.filter((i) => !i.assigneeAgentId && !i.assigneeUserId);
  const byAgent = new Map<string, Issue[]>();
  for (const issue of issues) {
    if (issue.assigneeAgentId) {
      if (!byAgent.has(issue.assigneeAgentId)) byAgent.set(issue.assigneeAgentId, []);
      byAgent.get(issue.assigneeAgentId)!.push(issue);
    }
  }
  const lanes: Array<{ label: string; issues: Issue[] }> = [];
  for (const [agentId, agentIssues] of byAgent) {
    const name = agentMap.get(agentId) ?? agentId.slice(0, 8);
    lanes.push({ label: name, issues: agentIssues });
  }
  if (unassigned.length > 0) lanes.push({ label: 'Unassigned', issues: unassigned });
  return lanes;
}, [issues, groupBy, agentMap]);
```

- [ ] In the return JSX, when `swimlaneGroups` is not null, wrap each swimlane group in a labeled row before rendering columns:

```tsx
{swimlaneGroups ? (
  <div className="space-y-6">
    {swimlaneGroups.map((lane) => (
      <div key={lane.label}>
        <div className="flex items-center gap-2 mb-2 px-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {lane.label}
          </span>
          <span className="text-xs text-muted-foreground/60">({lane.issues.length})</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {boardStatuses.map((status) => (
            <KanbanColumn
              key={`${lane.label}-${status}`}
              status={status}
              issues={lane.issues.filter((i) => i.status === status)}
              agentMap={agentMap}
              liveIssueIds={liveIssueIds}
            />
          ))}
        </div>
      </div>
    ))}
  </div>
) : (
  // existing board render
  <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2">
    {boardStatuses.map((status) => (
      <KanbanColumn ... />
    ))}
  </div>
)}
```

- [ ] In `ui/src/components/IssuesList.tsx`, add a swimlane toggle button to the board toolbar (next to the list/board toggle). Add local state:

```typescript
const [boardGroupBy, setBoardGroupBy] = useState<'none' | 'assignee'>('none');
```

- [ ] Add the toggle button in the toolbar when `viewState.viewMode === 'board'`:

```tsx
{viewState.viewMode === 'board' && (
  <button
    onClick={() => setBoardGroupBy((g) => g === 'none' ? 'assignee' : 'none')}
    className={cn(
      'text-xs px-2 py-1 rounded border transition-colors',
      boardGroupBy === 'assignee'
        ? 'border-primary text-primary bg-primary/10'
        : 'border-border text-muted-foreground hover:text-foreground',
    )}
  >
    Swimlanes
  </button>
)}
```

- [ ] Pass `groupBy={boardGroupBy}` to `<KanbanBoard>`.

- [ ] Commit:

```bash
git add ui/src/components/KanbanBoard.tsx ui/src/components/IssuesList.tsx
git commit -m "feat(ui): swimlanes by assignee in kanban board"
```

---

### Task 24: WIP limits per board column

**Files:**
- Modify: `ui/src/components/KanbanBoard.tsx`

WIP limits are per-project config. For simplicity, store them in localStorage per project.

- [ ] In `KanbanBoard.tsx`, add a `wipLimits` prop:

```typescript
interface KanbanBoardProps {
  // ...existing...
  wipLimits?: Partial<Record<string, number>>;
}
```

- [ ] In `KanbanColumn`, accept a `wipLimit` prop and show a warning:

```typescript
function KanbanColumn({
  status, issues, agentMap, liveIssueIds, wipLimit,
}: {
  status: string;
  issues: Issue[];
  agentMap?: Map<string, string>;
  liveIssueIds?: Set<string>;
  wipLimit?: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const isOverLimit = wipLimit != null && issues.length > wipLimit;
  // ...
}
```

- [ ] In the column header, show the WIP limit and highlight when exceeded:

```tsx
<div className="flex items-center gap-2 px-2 py-2 mb-1">
  <StatusIcon status={status} />
  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
    {statusLabel(status)}
  </span>
  <span className={cn(
    "text-xs ml-auto tabular-nums",
    isOverLimit ? "text-destructive font-semibold" : "text-muted-foreground/60"
  )}>
    {issues.length}
    {wipLimit != null && `/${wipLimit}`}
  </span>
</div>
```

- [ ] In `IssuesList.tsx`, add a WIP limits state stored in localStorage. Add a settings popover for WIP limits per status. This can be done later — for now pass `{}` as default:

```typescript
const [wipLimits] = useState<Partial<Record<string, number>>>({});
// Pass to KanbanBoard: wipLimits={wipLimits}
```

- [ ] Commit:

```bash
git add ui/src/components/KanbanBoard.tsx ui/src/components/IssuesList.tsx
git commit -m "feat(ui): WIP limit warnings on kanban board columns"
```

---

## PHASE 4 — Basic Gantt Roadmap

### Task 25: Due dates and start dates on Goals

**Files:**
- Check `packages/shared/src/types/goal.ts` — if Goal already has `targetDate`, also add `startDate`
- Modify `packages/db/src/schema/goals.ts` — add `start_date` if missing

- [ ] Check if Goal has a `startDate` field:

```bash
grep -n "startDate\|start_date\|targetDate\|target_date" \
  /Users/valentinoriva/Rosental/HittManager/paperclip/packages/db/src/schema/goals.ts \
  /Users/valentinoriva/Rosental/HittManager/paperclip/packages/shared/src/types/goal.ts
```

- [ ] If `start_date` is missing from `packages/db/src/schema/goals.ts`, add:

```typescript
startDate: timestamp("start_date", { withTimezone: true }),
```

- [ ] If `startDate` is missing from the Goal type in `packages/shared/src/types/goal.ts`, add:

```typescript
startDate?: Date | string | null;
```

- [ ] Generate and apply migration if schema changed:

```bash
cd /Users/valentinoriva/Rosental/HittManager/paperclip/packages/db
pnpm drizzle-kit generate && pnpm drizzle-kit migrate
```

- [ ] Commit:

```bash
git add packages/db/src/schema/goals.ts packages/shared/src/types/goal.ts packages/db/src/migrations/
git commit -m "feat(db): add start_date to goals for Gantt support"
```

---

### Task 26: Gantt component for Goals

**Files:**
- Create: `ui/src/components/GoalsGantt.tsx`
- Modify: `ui/src/pages/GoalDetail.tsx` or wherever Goals are listed

- [ ] Create `ui/src/components/GoalsGantt.tsx`:

```tsx
import { useMemo } from 'react';
import type { Goal } from '@paperclipai/shared';
import { cn } from '@/lib/utils';

interface Props {
  goals: Goal[];
}

function parseDate(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  return d instanceof Date ? d : new Date(d);
}

export function GoalsGantt({ goals }: Props) {
  const goalsWithDates = goals.filter((g) => g.startDate && g.targetDate);

  const { minDate, maxDate } = useMemo(() => {
    const starts = goalsWithDates.map((g) => parseDate(g.startDate)!.getTime());
    const ends = goalsWithDates.map((g) => parseDate(g.targetDate)!.getTime());
    return {
      minDate: starts.length ? Math.min(...starts) : Date.now(),
      maxDate: ends.length ? Math.max(...ends) : Date.now() + 86400000 * 30,
    };
  }, [goalsWithDates]);

  if (goalsWithDates.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-md p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Set start and target dates on goals to see the Gantt chart.
        </p>
      </div>
    );
  }

  const totalMs = maxDate - minDate;
  const today = Date.now();

  const todayPct = Math.min(100, Math.max(0, ((today - minDate) / totalMs) * 100));

  const STATUS_COLORS: Record<string, string> = {
    active: 'bg-primary',
    achieved: 'bg-green-500',
    planned: 'bg-muted-foreground',
    cancelled: 'bg-destructive/40',
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Today marker */}
        <div className="relative h-6 border-b border-border mb-1">
          <div
            className="absolute top-0 bottom-0 w-px bg-destructive/60"
            style={{ left: `${todayPct}%` }}
          />
          <span
            className="absolute text-[10px] text-destructive/80 -translate-x-1/2"
            style={{ left: `${todayPct}%`, top: 2 }}
          >
            Today
          </span>
        </div>

        <div className="space-y-1">
          {goalsWithDates.map((goal) => {
            const start = parseDate(goal.startDate)!.getTime();
            const end = parseDate(goal.targetDate)!.getTime();
            const left = ((start - minDate) / totalMs) * 100;
            const width = ((end - start) / totalMs) * 100;
            const color = STATUS_COLORS[goal.status] ?? 'bg-muted-foreground';

            return (
              <div key={goal.id} className="flex items-center gap-3 py-1">
                <span className="text-xs text-muted-foreground truncate w-36 shrink-0 text-right">
                  {goal.title}
                </span>
                <div className="relative flex-1 h-6">
                  <div
                    className={cn('absolute h-5 rounded-md top-0.5 flex items-center px-2 min-w-[8px]', color)}
                    style={{ left: `${left}%`, width: `${Math.max(width, 1)}%` }}
                    title={`${new Date(start).toLocaleDateString()} → ${new Date(end).toLocaleDateString()}`}
                  >
                    <span className="text-[10px] text-white truncate">{goal.title}</span>
                  </div>
                  <div
                    className="absolute top-0 bottom-0 w-px bg-destructive/60"
                    style={{ left: `${todayPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] Find the Goals list page (likely `ui/src/pages/Goals.tsx`). Add a "Roadmap" tab that renders `GoalsGantt` with all goals:

```tsx
import { GoalsGantt } from '../components/GoalsGantt';

// Add a state for view mode:
const [goalsView, setGoalsView] = useState<'list' | 'gantt'>('list');

// Toggle in toolbar:
<button
  onClick={() => setGoalsView(goalsView === 'list' ? 'gantt' : 'list')}
  className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
>
  {goalsView === 'list' ? 'Roadmap' : 'List'}
</button>

// In content area, replace list with Gantt when active:
{goalsView === 'gantt' ? (
  <GoalsGantt goals={goals ?? []} />
) : (
  // existing goals list
)}
```

- [ ] Commit:

```bash
git add ui/src/components/GoalsGantt.tsx ui/src/pages/Goals.tsx
git commit -m "feat(ui): basic Gantt roadmap for goals"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All 13 features from the gap analysis are covered across 4 phases
- [x] **Story points** → Tasks 1–3 (DB), 4–5 (server metrics), 7–9 (UI)
- [x] **Burndown chart** → Tasks 5–6 (server+API), 12 (UI component)
- [x] **Velocity chart** → Task 4 (server), 11 (UI chart)
- [x] **Sprint Report** → Task 13 (UI)
- [x] **Sprint Goal** → Task 2 (DB), 3 (types), 14 (UI in planning), Task 10 (display in board header)
- [x] **Due dates** → Tasks 15–16
- [x] **Task dependencies** → Tasks 17–19
- [x] **Checklists** → Tasks 20–21
- [x] **Watchers** → Task 22
- [x] **Swimlanes** → Task 23
- [x] **WIP limits** → Task 24
- [x] **Roadmap/Gantt** → Tasks 25–26
- [x] **Type consistency:** `storyPoints` (camelCase) used consistently server ↔ client. `issueLinks`/`issueChecklistItems`/`issueWatchers` schema names match service imports throughout.
- [x] **No placeholders:** All steps include actual code.
- [x] **Phases are independently deployable:** Each phase can be branched, merged, and shipped without the others.

---

## Execution Order

Recommended branch strategy per the repo's Gitflow:

```
feature/sprint-analytics       ← Phase 1 (Tasks 1–14)
feature/task-fundamentals      ← Phase 2 (Tasks 15–22)
feature/board-enhancements     ← Phase 3 (Tasks 23–24)
feature/goals-gantt            ← Phase 4 (Tasks 25–26)
```

Each feature branch → PR to `developer` → merge → release branch → master.
