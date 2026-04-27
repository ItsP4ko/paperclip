# Sprints per Project — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move sprints from organization scope to project scope, with a full backlog→planning→board→close flow and a per-project metrics panel.

**Architecture:** DB gets `project_id` on `sprints` and a new `issue_state_history` table. Backend routes migrate from `/companies/:companyId/sprints` to `/projects/:projectId/sprints`. Frontend adds a "Sprints" tab inside `ProjectDetail` with a three-panel layout (sidebar, planning/board, metrics); global Sprints pages are removed.

**Tech Stack:** PostgreSQL + Drizzle ORM, Express, React 19, TanStack Query, Tailwind CSS 4, shadcn/ui components, TypeScript

**Visual identity rules (enforce in every UI task):**
- Colors: use CSS vars only — `bg-background`, `bg-card`, `bg-muted`, `border-border`, `text-foreground`, `text-muted-foreground`, `text-primary` (neon green `#4ade80` in dark), `text-accent` (cyan `#67e8f9` in dark), `text-destructive`
- Fonts: `font-sans` (Space Grotesk), `font-display` (Syne) for headings, `font-mono` (JetBrains Mono)
- Radius: `rounded-sm` / `rounded-md` / `rounded-lg` (never hardcode px)
- Use existing components: `Button`, `Badge`, `Dialog`, `Input`, `Select`, `Tabs`, `ScrollArea`, `Skeleton`, `Tooltip` from `@/components/ui/*`
- Never use hardcoded hex colors like `#6366f1` — those are from mockups only

---

## File Map

### New files
| File | Purpose |
|---|---|
| `packages/db/src/migrations/0063_sprints_per_project.sql` | DB migration |
| `packages/db/src/schema/issue_state_history.ts` | Drizzle schema for state history |
| `packages/shared/src/types/sprint.ts` | Updated — `projectId` replaces `companyId`, new types |
| `server/src/services/sprints.ts` | Updated — scoped to projectId |
| `server/src/routes/sprints.ts` | Updated — project-scoped routes + metrics endpoint |
| `ui/src/api/sprints.ts` | Updated — project-scoped API calls |
| `ui/src/lib/queryKeys.ts` | Updated — sprint keys use projectId |
| `ui/src/pages/ProjectDetail.tsx` | Updated — add "sprints" tab |
| `ui/src/pages/SprintTab.tsx` | NEW — main container (sidebar + view routing) |
| `ui/src/pages/SprintPlanning.tsx` | REPLACED — project-scoped planning view |
| `ui/src/pages/SprintBoard.tsx` | NEW — kanban board for active sprint |
| `ui/src/pages/SprintMetricsPanel.tsx` | NEW — project metrics dashboard |
| `ui/src/components/CreateSprintModal.tsx` | NEW — create/edit sprint form |
| `ui/src/components/CloseSprintModal.tsx` | NEW — close sprint with spill strategy |
| `ui/src/pages/Sprints.tsx` | DELETED |
| `ui/src/pages/SprintMetrics.tsx` | DELETED |

---

## Task 1: DB Migration

**Files:**
- Create: `packages/db/src/migrations/0063_sprints_per_project.sql`
- Create: `packages/db/src/schema/issue_state_history.ts`
- Modify: `packages/db/src/schema/sprints.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/migrations/meta/_journal.json`

- [ ] **Step 1: Write the migration SQL**

Create `packages/db/src/migrations/0063_sprints_per_project.sql`:

```sql
-- Remove existing sprints data (no prod data yet) and restructure
DELETE FROM sprints;
--> statement-breakpoint

-- Add project_id
ALTER TABLE "sprints" ADD COLUMN "project_id" uuid NOT NULL REFERENCES "public"."projects"("id") ON DELETE cascade;
--> statement-breakpoint

-- Drop company_id FK and column
ALTER TABLE "sprints" DROP CONSTRAINT IF EXISTS "sprints_company_id_fk";
--> statement-breakpoint
ALTER TABLE "sprints" DROP COLUMN IF EXISTS "company_id";
--> statement-breakpoint

-- Replace index
DROP INDEX IF EXISTS "sprints_company_status_idx";
--> statement-breakpoint
CREATE INDEX "sprints_project_status_idx" ON "sprints" ("project_id", "status");
--> statement-breakpoint

-- New table: issue state history
CREATE TABLE IF NOT EXISTS "issue_state_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "issue_id" uuid NOT NULL,
  "sprint_id" uuid,
  "from_status" text,
  "to_status" text NOT NULL,
  "changed_by_type" text NOT NULL,
  "changed_by_id" uuid NOT NULL,
  "duration_ms" bigint,
  "changed_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

ALTER TABLE "issue_state_history"
  ADD CONSTRAINT "issue_state_history_issue_id_fk"
  FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade;
--> statement-breakpoint

ALTER TABLE "issue_state_history"
  ADD CONSTRAINT "issue_state_history_sprint_id_fk"
  FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE set null;
--> statement-breakpoint

CREATE INDEX "issue_state_history_issue_idx" ON "issue_state_history" ("issue_id");
--> statement-breakpoint
CREATE INDEX "issue_state_history_sprint_idx" ON "issue_state_history" ("sprint_id");
--> statement-breakpoint
CREATE INDEX "issue_state_history_changed_by_idx" ON "issue_state_history" ("changed_by_id");
```

- [ ] **Step 2: Update Drizzle schema — sprints.ts**

Replace `packages/db/src/schema/sprints.ts`:

```typescript
import { pgTable, uuid, text, timestamp, date, index } from "drizzle-orm/pg-core";
import { projects } from "./projects.js";

export const sprints = pgTable(
  "sprints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("planning"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectStatusIdx: index("sprints_project_status_idx").on(table.projectId, table.status),
  }),
);
```

- [ ] **Step 3: Create issue_state_history schema**

Create `packages/db/src/schema/issue_state_history.ts`:

```typescript
import { pgTable, uuid, text, timestamp, bigint, index } from "drizzle-orm/pg-core";
import { issues } from "./issues.js";
import { sprints } from "./sprints.js";

export const issueStateHistory = pgTable(
  "issue_state_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    sprintId: uuid("sprint_id").references(() => sprints.id, { onDelete: "set null" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    changedByType: text("changed_by_type").notNull(),
    changedById: uuid("changed_by_id").notNull(),
    durationMs: bigint("duration_ms", { mode: "number" }),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    issueIdx: index("issue_state_history_issue_idx").on(table.issueId),
    sprintIdx: index("issue_state_history_sprint_idx").on(table.sprintId),
    changedByIdx: index("issue_state_history_changed_by_idx").on(table.changedById),
  }),
);
```

- [ ] **Step 4: Export from schema index**

In `packages/db/src/schema/index.ts`, add:
```typescript
export { issueStateHistory } from "./issue_state_history.js";
```

- [ ] **Step 5: Add journal entry**

In `packages/db/src/migrations/meta/_journal.json`, append to the `entries` array:
```json
{"idx": 63,"version": "7","when": 1775850000000,"tag": "0063_sprints_per_project","breakpoints": true}
```

- [ ] **Step 6: Verify migration check passes**

```bash
pnpm --filter @paperclipai/db run check:migrations
```
Expected: no output (success).

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/migrations/0063_sprints_per_project.sql \
        packages/db/src/schema/sprints.ts \
        packages/db/src/schema/issue_state_history.ts \
        packages/db/src/schema/index.ts \
        packages/db/src/migrations/meta/_journal.json
git commit -m "feat(db): sprints scoped to projects + issue_state_history table"
```

---

## Task 2: Shared Types

**Files:**
- Modify: `packages/shared/src/types/sprint.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Update Sprint type and add new types**

Replace `packages/shared/src/types/sprint.ts`:

```typescript
import type { SprintStatus } from "../constants.js";

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  status: SprintStatus;
  startDate: string | null;
  endDate: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SprintIssueHistoryEntry {
  id: string;
  sprintId: string;
  issueId: string;
  addedAt: Date;
  removedAt: Date | null;
  removalReason: "completed" | "spilled_over" | "removed" | null;
  nextSprintId: string | null;
}

export interface IssueStateHistoryEntry {
  id: string;
  issueId: string;
  sprintId: string | null;
  fromStatus: string | null;
  toStatus: string;
  changedByType: string;
  changedById: string;
  changedByName: string | null;
  durationMs: number | null;
  changedAt: Date;
}

export interface SprintIssueTiming {
  issueId: string;
  identifier: string | null;
  title: string;
  status: string;
  cycleTimeMs: number | null;
  spillCount: number;
  nextSprintId: string | null;
  nextSprintName: string | null;
}

export interface SprintMetrics {
  total: number;
  byStatus: Record<string, number>;
  completionRate: number;
  spilledOver: number;
  avgCycleTimeMs: number | null;
  issueTimings: SprintIssueTiming[];
}

export interface SprintSpillSummary {
  sprintId: string;
  name: string;
  completed: number;
  spilledOver: number;
  total: number;
  spilledToSprintId: string | null;
  spilledToSprintName: string | null;
}

export interface UserSprintActivity {
  userId: string;
  name: string | null;
  completed: number;
  avgCycleTimeMs: number | null;
  totalMoves: number;
}

export interface ProjectSprintMetrics {
  totalSprints: number;
  completedSprints: number;
  avgVelocity: number;
  spillOverRate: number;
  avgCycleTimeMs: number | null;
  totalCompleted: number;
  sprintSummaries: SprintSpillSummary[];
  avgTimePerStatus: Record<string, number>;
  userActivity: UserSprintActivity[];
  recentStateLog: IssueStateHistoryEntry[];
  spillOverAlerts: Array<{ issueId: string; identifier: string | null; title: string; sprintCount: number }>;
}
```

- [ ] **Step 2: Export new types from shared index**

In `packages/shared/src/index.ts`, ensure these are exported (add if missing):
```typescript
export type {
  Sprint,
  SprintIssueHistoryEntry,
  IssueStateHistoryEntry,
  SprintIssueTiming,
  SprintMetrics,
  SprintSpillSummary,
  UserSprintActivity,
  ProjectSprintMetrics,
} from "./types/sprint.js";
```

- [ ] **Step 3: Build shared to catch type errors**

```bash
pnpm --filter @paperclipai/shared build
```
Expected: `Done` with no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/sprint.ts packages/shared/src/index.ts
git commit -m "feat(shared): update Sprint type to projectId, add ProjectSprintMetrics"
```

---

## Task 3: Backend — Sprint Service

**Files:**
- Modify: `server/src/services/sprints.ts`

- [ ] **Step 1: Replace sprint service with project-scoped version**

Replace `server/src/services/sprints.ts`:

```typescript
import { and, avg, count, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issues, sprints, sprintIssueHistory, issueStateHistory } from "@paperclipai/db";
import type { ProjectSprintMetrics, SprintMetrics } from "@paperclipai/shared";
import { conflict, notFound } from "../errors.js";

export function sprintService(db: Db) {
  return {
    list: (projectId: string) =>
      db
        .select()
        .from(sprints)
        .where(eq(sprints.projectId, projectId))
        .orderBy(desc(sprints.createdAt)),

    getById: (id: string) =>
      db
        .select()
        .from(sprints)
        .where(eq(sprints.id, id))
        .then((rows) => rows[0] ?? null),

    getActive: (projectId: string) =>
      db
        .select()
        .from(sprints)
        .where(and(eq(sprints.projectId, projectId), eq(sprints.status, "active")))
        .then((rows) => rows[0] ?? null),

    create: (projectId: string, data: Omit<typeof sprints.$inferInsert, "projectId" | "status">) =>
      db
        .insert(sprints)
        .values({ ...data, projectId, status: "planning" })
        .returning()
        .then((rows) => rows[0]),

    update: (id: string, data: Partial<typeof sprints.$inferInsert>) =>
      db
        .update(sprints)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(sprints.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    activate: async (id: string) => {
      const sprint = await db.select().from(sprints).where(eq(sprints.id, id)).then((r) => r[0] ?? null);
      if (!sprint) throw notFound("Sprint not found");
      if (sprint.status !== "planning") throw conflict("Only a planning sprint can be activated");

      const existing = await db
        .select({ id: sprints.id })
        .from(sprints)
        .where(and(eq(sprints.projectId, sprint.projectId), eq(sprints.status, "active")))
        .then((r) => r[0] ?? null);
      if (existing) throw conflict("There is already an active sprint in this project.");

      return db
        .update(sprints)
        .set({ status: "active", startedAt: new Date(), updatedAt: new Date() })
        .where(eq(sprints.id, id))
        .returning()
        .then((r) => r[0]);
    },

    complete: async (id: string, spillStrategy: "backlog" | "next_sprint", nextSprintId?: string) => {
      const sprint = await db.select().from(sprints).where(eq(sprints.id, id)).then((r) => r[0] ?? null);
      if (!sprint) throw notFound("Sprint not found");
      if (sprint.status !== "active") throw conflict("Only an active sprint can be completed");

      const incompleteIssues = await db
        .select({ id: issues.id })
        .from(issues)
        .where(and(eq(issues.sprintId, id), ne(issues.status, "done"), ne(issues.status, "cancelled")));

      const incompleteIds = incompleteIssues.map((r) => r.id);

      if (incompleteIds.length > 0) {
        await db.insert(sprintIssueHistory).values(
          incompleteIds.map((issueId) => ({
            sprintId: id,
            issueId,
            removalReason: "spilled_over" as const,
            removedAt: new Date(),
            nextSprintId: spillStrategy === "next_sprint" ? (nextSprintId ?? null) : null,
          })),
        );
        await db
          .update(issues)
          .set({ sprintId: spillStrategy === "next_sprint" && nextSprintId ? nextSprintId : null, updatedAt: new Date() })
          .where(inArray(issues.id, incompleteIds));
      }

      const completedIssues = await db
        .select({ id: issues.id })
        .from(issues)
        .where(and(eq(issues.sprintId, id), eq(issues.status, "done")));

      if (completedIssues.length > 0) {
        await db.insert(sprintIssueHistory).values(
          completedIssues.map((r) => ({
            sprintId: id,
            issueId: r.id,
            removalReason: "completed" as const,
            removedAt: new Date(),
            nextSprintId: null,
          })),
        );
      }

      return db
        .update(sprints)
        .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(sprints.id, id))
        .returning()
        .then((r) => r[0]);
    },

    addIssue: async (sprintId: string, issueId: string) => {
      const issue = await db.select({ sprintId: issues.sprintId }).from(issues).where(eq(issues.id, issueId)).then((r) => r[0] ?? null);
      if (!issue) throw notFound("Issue not found");

      if (issue.sprintId && issue.sprintId !== sprintId) {
        await db.insert(sprintIssueHistory).values({ sprintId: issue.sprintId, issueId, removalReason: "removed", removedAt: new Date(), nextSprintId: sprintId });
      }

      await db.update(issues).set({ sprintId, updatedAt: new Date() }).where(eq(issues.id, issueId));
      await db.insert(sprintIssueHistory).values({ sprintId, issueId, addedAt: new Date() });

      return db.select().from(issues).where(eq(issues.id, issueId)).then((r) => r[0]);
    },

    removeIssue: async (sprintId: string, issueId: string) => {
      await db.update(issues).set({ sprintId: null, updatedAt: new Date() }).where(and(eq(issues.id, issueId), eq(issues.sprintId, sprintId)));
      await db.insert(sprintIssueHistory).values({ sprintId, issueId, removalReason: "removed", removedAt: new Date() });
    },

    getMetrics: async (sprintId: string): Promise<SprintMetrics> => {
      const sprintIssues = await db
        .select({ id: issues.id, identifier: issues.identifier, title: issues.title, status: issues.status, startedAt: issues.startedAt, completedAt: issues.completedAt })
        .from(issues)
        .where(eq(issues.sprintId, sprintId));

      const historyRows = await db
        .select()
        .from(sprintIssueHistory)
        .where(and(eq(sprintIssueHistory.sprintId, sprintId), eq(sprintIssueHistory.removalReason, "spilled_over")));

      const spilledOver = historyRows.length;
      const byStatus: Record<string, number> = {};
      for (const issue of sprintIssues) byStatus[issue.status] = (byStatus[issue.status] ?? 0) + 1;

      const total = sprintIssues.length;
      const done = byStatus["done"] ?? 0;
      const cancelled = byStatus["cancelled"] ?? 0;
      const completionRate = total - cancelled > 0 ? (done / (total - cancelled)) * 100 : 0;

      const nextSprintIds = [...new Set(historyRows.map((r) => r.nextSprintId).filter(Boolean))] as string[];
      const nextSprints = nextSprintIds.length > 0
        ? await db.select({ id: sprints.id, name: sprints.name }).from(sprints).where(inArray(sprints.id, nextSprintIds))
        : [];
      const nextSprintMap = Object.fromEntries(nextSprints.map((s) => [s.id, s.name]));

      const spillCounts: Record<string, number> = {};
      const nextSprintForIssue: Record<string, { id: string | null; name: string | null }> = {};
      for (const row of historyRows) {
        spillCounts[row.issueId] = (spillCounts[row.issueId] ?? 0) + 1;
        nextSprintForIssue[row.issueId] = { id: row.nextSprintId, name: row.nextSprintId ? (nextSprintMap[row.nextSprintId] ?? null) : null };
      }

      const cycleTimes: number[] = [];
      const issueTimings = sprintIssues.map((issue) => {
        const cycleTimeMs = issue.startedAt && issue.completedAt ? issue.completedAt.getTime() - issue.startedAt.getTime() : null;
        if (cycleTimeMs !== null) cycleTimes.push(cycleTimeMs);
        return { issueId: issue.id, identifier: issue.identifier, title: issue.title, status: issue.status, cycleTimeMs, spillCount: spillCounts[issue.id] ?? 0, nextSprintId: nextSprintForIssue[issue.id]?.id ?? null, nextSprintName: nextSprintForIssue[issue.id]?.name ?? null };
      });

      const avgCycleTimeMs = cycleTimes.length > 0 ? Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length) : null;

      return { total, byStatus, completionRate: Math.round(completionRate * 10) / 10, spilledOver, avgCycleTimeMs, issueTimings };
    },

    getProjectMetrics: async (projectId: string): Promise<ProjectSprintMetrics> => {
      const allSprints = await db.select().from(sprints).where(eq(sprints.projectId, projectId)).orderBy(sprints.createdAt);
      const completedSprints = allSprints.filter((s) => s.status === "completed");

      // Spill-over per sprint
      const sprintIds = allSprints.map((s) => s.id);
      const historyRows = sprintIds.length > 0
        ? await db.select().from(sprintIssueHistory).where(inArray(sprintIssueHistory.sprintId, sprintIds))
        : [];

      // Build summaries
      const sprintIssueMap: Record<string, { completed: number; spilled: number; total: number; nextId: string | null }> = {};
      for (const s of allSprints) sprintIssueMap[s.id] = { completed: 0, spilled: 0, total: 0, nextId: null };
      for (const row of historyRows) {
        if (!sprintIssueMap[row.sprintId]) continue;
        sprintIssueMap[row.sprintId].total++;
        if (row.removalReason === "completed") sprintIssueMap[row.sprintId].completed++;
        if (row.removalReason === "spilled_over") {
          sprintIssueMap[row.sprintId].spilled++;
          sprintIssueMap[row.sprintId].nextId = row.nextSprintId;
        }
      }

      const sprintNameMap = Object.fromEntries(allSprints.map((s) => [s.id, s.name]));
      const sprintSummaries = allSprints.map((s) => {
        const m = sprintIssueMap[s.id];
        return { sprintId: s.id, name: s.name, completed: m.completed, spilledOver: m.spilled, total: m.total, spilledToSprintId: m.nextId, spilledToSprintName: m.nextId ? (sprintNameMap[m.nextId] ?? null) : null };
      });

      const totalSpilled = sprintSummaries.reduce((acc, s) => acc + s.spilledOver, 0);
      const totalIssues = sprintSummaries.reduce((acc, s) => acc + s.total, 0);
      const spillOverRate = totalIssues > 0 ? Math.round((totalSpilled / totalIssues) * 1000) / 10 : 0;
      const totalCompleted = sprintSummaries.reduce((acc, s) => acc + s.completed, 0);
      const avgVelocity = completedSprints.length > 0 ? Math.round((totalCompleted / completedSprints.length) * 10) / 10 : 0;

      // Avg time per status from issue_state_history
      const stateRows = sprintIds.length > 0
        ? await db.select().from(issueStateHistory).where(inArray(issueStateHistory.sprintId, sprintIds))
        : [];

      const statusDurations: Record<string, number[]> = {};
      for (const row of stateRows) {
        if (row.fromStatus && row.durationMs) {
          if (!statusDurations[row.fromStatus]) statusDurations[row.fromStatus] = [];
          statusDurations[row.fromStatus].push(row.durationMs);
        }
      }
      const avgTimePerStatus: Record<string, number> = {};
      for (const [status, durations] of Object.entries(statusDurations)) {
        avgTimePerStatus[status] = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
      }

      // Avg cycle time overall
      const cycleTimes = stateRows.filter((r) => r.toStatus === "done" && r.durationMs).map((r) => r.durationMs!);
      const avgCycleTimeMs = cycleTimes.length > 0 ? Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length) : null;

      // User activity
      const userMoves: Record<string, { completed: number; cycleTimes: number[]; totalMoves: number }> = {};
      for (const row of stateRows) {
        const key = row.changedById;
        if (!userMoves[key]) userMoves[key] = { completed: 0, cycleTimes: [], totalMoves: 0 };
        userMoves[key].totalMoves++;
        if (row.toStatus === "done") {
          userMoves[key].completed++;
          if (row.durationMs) userMoves[key].cycleTimes.push(row.durationMs);
        }
      }
      const userActivity = Object.entries(userMoves).map(([userId, data]) => ({
        userId,
        name: null as string | null, // resolved in route handler
        completed: data.completed,
        avgCycleTimeMs: data.cycleTimes.length > 0 ? Math.round(data.cycleTimes.reduce((a, b) => a + b, 0) / data.cycleTimes.length) : null,
        totalMoves: data.totalMoves,
      }));

      // Spill alerts (issues that appear in 2+ sprints)
      const issueSprintCount: Record<string, { count: number; issueId: string }> = {};
      for (const row of historyRows) {
        if (!issueSprintCount[row.issueId]) issueSprintCount[row.issueId] = { count: 0, issueId: row.issueId };
        issueSprintCount[row.issueId].count++;
      }
      const alertIssueIds = Object.values(issueSprintCount).filter((e) => e.count >= 2).map((e) => e.issueId);
      const alertIssues = alertIssueIds.length > 0
        ? await db.select({ id: issues.id, identifier: issues.identifier, title: issues.title }).from(issues).where(inArray(issues.id, alertIssueIds))
        : [];
      const spillOverAlerts = alertIssues.map((i) => ({
        issueId: i.id,
        identifier: i.identifier,
        title: i.title,
        sprintCount: issueSprintCount[i.id]?.count ?? 0,
      }));

      // Recent state log (last 50)
      const recentStateLog = stateRows
        .sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime())
        .slice(0, 50)
        .map((r) => ({ ...r, changedByName: null as string | null }));

      return { totalSprints: allSprints.length, completedSprints: completedSprints.length, avgVelocity, spillOverRate, avgCycleTimeMs, totalCompleted, sprintSummaries, avgTimePerStatus, userActivity, recentStateLog, spillOverAlerts };
    },

    remove: async (id: string) => {
      const sprint = await db.select().from(sprints).where(eq(sprints.id, id)).then((r) => r[0] ?? null);
      if (!sprint) throw notFound("Sprint not found");
      if (sprint.status !== "planning") throw conflict("Only a planning sprint can be deleted");
      return db.delete(sprints).where(eq(sprints.id, id)).returning().then((r) => r[0] ?? null);
    },
  };
}
```

- [ ] **Step 2: Build server to catch type errors**

```bash
pnpm --filter @paperclipai/server build 2>&1 | tail -20
```
Expected: no TypeScript errors (exit 0).

- [ ] **Step 3: Commit**

```bash
git add server/src/services/sprints.ts
git commit -m "feat(server): sprint service scoped to projectId + project metrics"
```

---

## Task 4: Backend — Sprint Routes

**Files:**
- Modify: `server/src/routes/sprints.ts`
- Modify: `server/src/routes/index.ts`

- [ ] **Step 1: Replace sprint routes with project-scoped version**

Replace `server/src/routes/sprints.ts`:

```typescript
import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { addIssueToSprintSchema, completeSprintSchema, createSprintSchema, updateSprintSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { sprintService, logActivity, projectService } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

async function assertProjectAccess(req: Parameters<typeof assertCompanyAccess>[0], db: Db, projectId: string) {
  const project = await projectService(db).getById(projectId);
  if (!project) {
    const res = (req as unknown as { res: { status: (n: number) => { json: (b: unknown) => void } } }).res;
    throw Object.assign(new Error("Project not found"), { status: 404 });
  }
  assertCompanyAccess(req, project.companyId);
  return project;
}

export function sprintRoutes(db: Db) {
  const router = Router();
  const svc = sprintService(db);

  // ── Project-scoped routes ──────────────────────────────────────────────

  router.get("/projects/:projectId/sprints", async (req, res) => {
    const { projectId } = req.params as { projectId: string };
    const project = await projectService(db).getById(projectId);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    assertCompanyAccess(req, project.companyId);
    const result = await svc.list(projectId);
    res.json(result);
  });

  router.get("/projects/:projectId/sprints/active", async (req, res) => {
    const { projectId } = req.params as { projectId: string };
    const project = await projectService(db).getById(projectId);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    assertCompanyAccess(req, project.companyId);
    const sprint = await svc.getActive(projectId);
    res.json(sprint ?? null);
  });

  router.get("/projects/:projectId/sprints/metrics", async (req, res) => {
    const { projectId } = req.params as { projectId: string };
    const project = await projectService(db).getById(projectId);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    assertCompanyAccess(req, project.companyId);
    const metrics = await svc.getProjectMetrics(projectId);
    res.json(metrics);
  });

  router.post("/projects/:projectId/sprints", validate(createSprintSchema), async (req, res) => {
    const { projectId } = req.params as { projectId: string };
    const project = await projectService(db).getById(projectId);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    assertCompanyAccess(req, project.companyId);
    const sprint = await svc.create(projectId, req.body);
    const actor = getActorInfo(req);
    await logActivity(db, { companyId: project.companyId, actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId, action: "sprint.created", entityType: "sprint", entityId: sprint.id, details: { name: sprint.name } });
    res.status(201).json(sprint);
  });

  // ── Sprint-level routes ────────────────────────────────────────────────

  router.get("/sprints/:id", async (req, res) => {
    const { id } = req.params as { id: string };
    const sprint = await svc.getById(id);
    if (!sprint) { res.status(404).json({ error: "Sprint not found" }); return; }
    const project = await projectService(db).getById(sprint.projectId);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    assertCompanyAccess(req, project.companyId);
    res.json(sprint);
  });

  router.get("/sprints/:id/metrics", async (req, res) => {
    const { id } = req.params as { id: string };
    const sprint = await svc.getById(id);
    if (!sprint) { res.status(404).json({ error: "Sprint not found" }); return; }
    const project = await projectService(db).getById(sprint.projectId);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    assertCompanyAccess(req, project.companyId);
    res.json(await svc.getMetrics(id));
  });

  router.patch("/sprints/:id", validate(updateSprintSchema), async (req, res) => {
    const { id } = req.params as { id: string };
    const existing = await svc.getById(id);
    if (!existing) { res.status(404).json({ error: "Sprint not found" }); return; }
    const project = await projectService(db).getById(existing.projectId);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    assertCompanyAccess(req, project.companyId);
    const sprint = await svc.update(id, req.body);
    if (!sprint) { res.status(404).json({ error: "Sprint not found" }); return; }
    const actor = getActorInfo(req);
    await logActivity(db, { companyId: project.companyId, actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId, action: "sprint.updated", entityType: "sprint", entityId: sprint.id, details: req.body });
    res.json(sprint);
  });

  router.post("/sprints/:id/activate", async (req, res) => {
    const { id } = req.params as { id: string };
    const existing = await svc.getById(id);
    if (!existing) { res.status(404).json({ error: "Sprint not found" }); return; }
    const project = await projectService(db).getById(existing.projectId);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    assertCompanyAccess(req, project.companyId);
    const sprint = await svc.activate(id);
    const actor = getActorInfo(req);
    await logActivity(db, { companyId: project.companyId, actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId, action: "sprint.activated", entityType: "sprint", entityId: id });
    res.json(sprint);
  });

  router.post("/sprints/:id/complete", validate(completeSprintSchema), async (req, res) => {
    const { id } = req.params as { id: string };
    const existing = await svc.getById(id);
    if (!existing) { res.status(404).json({ error: "Sprint not found" }); return; }
    const project = await projectService(db).getById(existing.projectId);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    assertCompanyAccess(req, project.companyId);
    const { spillStrategy, nextSprintId } = req.body as { spillStrategy: "backlog" | "next_sprint"; nextSprintId?: string };
    const sprint = await svc.complete(id, spillStrategy, nextSprintId);
    const actor = getActorInfo(req);
    await logActivity(db, { companyId: project.companyId, actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId, action: "sprint.completed", entityType: "sprint", entityId: id, details: { spillStrategy, nextSprintId } });
    res.json(sprint);
  });

  router.post("/sprints/:id/issues", validate({ body: { issueId: String } } as never), async (req, res) => {
    const { id } = req.params as { id: string };
    const sprint = await svc.getById(id);
    if (!sprint) { res.status(404).json({ error: "Sprint not found" }); return; }
    const project = await projectService(db).getById(sprint.projectId);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    assertCompanyAccess(req, project.companyId);
    const { issueId } = req.body as { issueId: string };
    const issue = await svc.addIssue(id, issueId);
    res.json(issue);
  });

  router.delete("/sprints/:sprintId/issues/:issueId", async (req, res) => {
    const { sprintId, issueId } = req.params as { sprintId: string; issueId: string };
    const sprint = await svc.getById(sprintId);
    if (!sprint) { res.status(404).json({ error: "Sprint not found" }); return; }
    const project = await projectService(db).getById(sprint.projectId);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    assertCompanyAccess(req, project.companyId);
    await svc.removeIssue(sprintId, issueId);
    res.json({ ok: true });
  });

  router.delete("/sprints/:id", async (req, res) => {
    const { id } = req.params as { id: string };
    const existing = await svc.getById(id);
    if (!existing) { res.status(404).json({ error: "Sprint not found" }); return; }
    const project = await projectService(db).getById(existing.projectId);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    assertCompanyAccess(req, project.companyId);
    const sprint = await svc.remove(id);
    const actor = getActorInfo(req);
    await logActivity(db, { companyId: project.companyId, actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId, action: "sprint.deleted", entityType: "sprint", entityId: id });
    res.json(sprint);
  });

  return router;
}
```

- [ ] **Step 2: Build server**

```bash
pnpm --filter @paperclipai/server build 2>&1 | tail -20
```
Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/sprints.ts
git commit -m "feat(server): sprint routes migrated to /projects/:projectId/sprints"
```

---

## Task 5: Backend — Issue State History Recording

**Files:**
- Modify: `server/src/services/issues.ts` (single location where `issues.status` is updated)

- [ ] **Step 1: Find the status update location**

```bash
grep -n "status.*updatedAt\|set.*status" server/src/services/issues.ts | head -20
```

Note the line number where `issues.status` is set via `db.update(issues).set({ status: ... })`.

- [ ] **Step 2: Add state history recording to the update function**

In `server/src/services/issues.ts`, import `issueStateHistory`:
```typescript
import { issues, sprints, issueStateHistory, /* ...existing... */ } from "@paperclipai/db";
```

Find the `update` function (or wherever `status` is set). After the `db.update(issues).set(...)` call that changes status, add:

```typescript
// Record state history if status changed
if (data.status && data.status !== existingIssue.status) {
  const durationMs = existingIssue.updatedAt
    ? Date.now() - new Date(existingIssue.updatedAt).getTime()
    : null;
  await db.insert(issueStateHistory).values({
    issueId: id,
    sprintId: existingIssue.sprintId ?? null,
    fromStatus: existingIssue.status,
    toStatus: data.status,
    changedByType: actorType,   // passed from route
    changedById: actorId,       // passed from route
    durationMs,
  });
}
```

The route already calls `getActorInfo(req)` — pass `actorType` and `actorId` into the service update call, or record it directly in the route handler after the update.

**Simpler approach — record in the route handler** (avoids touching the service signature):

In `server/src/routes/issues.ts`, after a successful `PATCH /issues/:id` that changes status:
```typescript
if (req.body.status && req.body.status !== existingIssue.status) {
  const actor = getActorInfo(req);
  const durationMs = existingIssue.updatedAt
    ? Date.now() - new Date(existingIssue.updatedAt).getTime()
    : null;
  await db.insert(issueStateHistory).values({
    issueId: id,
    sprintId: existingIssue.sprintId ?? null,
    fromStatus: existingIssue.status,
    toStatus: req.body.status as string,
    changedByType: actor.actorType,
    changedById: actor.actorId,
    durationMs,
  });
}
```

Find the `PATCH /issues/:id` handler in `server/src/routes/issues.ts` and add this block after the update succeeds.

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @paperclipai/server build 2>&1 | tail -10
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/issues.ts server/src/services/issues.ts
git commit -m "feat(server): record issue_state_history on status change"
```

---

## Task 6: Frontend — API Client + Query Keys

**Files:**
- Modify: `ui/src/api/sprints.ts`
- Modify: `ui/src/lib/queryKeys.ts`

- [ ] **Step 1: Update sprintsApi**

Replace `ui/src/api/sprints.ts`:

```typescript
import type { ProjectSprintMetrics, Sprint, SprintMetrics } from "@paperclipai/shared";
import { api } from "./client";

export const sprintsApi = {
  listByProject:      (projectId: string) => api.get<Sprint[]>(`/projects/${projectId}/sprints`),
  getActive:          (projectId: string) => api.get<Sprint | null>(`/projects/${projectId}/sprints/active`),
  getProjectMetrics:  (projectId: string) => api.get<ProjectSprintMetrics>(`/projects/${projectId}/sprints/metrics`),
  create:             (projectId: string, data: { name: string; description?: string; startDate?: string; endDate?: string }) =>
                        api.post<Sprint>(`/projects/${projectId}/sprints`, data),
  get:                (id: string) => api.get<Sprint>(`/sprints/${id}`),
  getMetrics:         (id: string) => api.get<SprintMetrics>(`/sprints/${id}/metrics`),
  update:             (id: string, data: Record<string, unknown>) => api.patch<Sprint>(`/sprints/${id}`, data),
  activate:           (id: string) => api.post<Sprint>(`/sprints/${id}/activate`, {}),
  complete:           (id: string, data: { spillStrategy: "backlog" | "next_sprint"; nextSprintId?: string }) =>
                        api.post<Sprint>(`/sprints/${id}/complete`, data),
  addIssue:           (sprintId: string, issueId: string) => api.post(`/sprints/${sprintId}/issues`, { issueId }),
  removeIssue:        (sprintId: string, issueId: string) => api.delete(`/sprints/${sprintId}/issues/${issueId}`),
  remove:             (id: string) => api.delete<Sprint>(`/sprints/${id}`),
};
```

- [ ] **Step 2: Update queryKeys**

In `ui/src/lib/queryKeys.ts`, replace the `sprints` section:

```typescript
sprints: {
  list:           (projectId: string) => ["sprints", "project", projectId] as const,
  active:         (projectId: string) => ["sprints", "project", projectId, "active"] as const,
  detail:         (id: string)        => ["sprints", "detail", id] as const,
  metrics:        (id: string)        => ["sprints", "metrics", id] as const,
  projectMetrics: (projectId: string) => ["sprints", "project", projectId, "metrics"] as const,
  issues:         (sprintId: string)  => ["issues", "sprint", sprintId] as const,
  backlog:        (projectId: string) => ["issues", "project", projectId, "backlog"] as const,
},
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @paperclipai/ui typecheck 2>&1 | tail -20
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add ui/src/api/sprints.ts ui/src/lib/queryKeys.ts
git commit -m "feat(ui): sprint API client and query keys scoped to project"
```

---

## Task 7: Frontend — ProjectDetail Tab

**Files:**
- Modify: `ui/src/pages/ProjectDetail.tsx`
- Modify: `ui/src/App.tsx`
- Modify: `ui/src/components/Sidebar.tsx`

- [ ] **Step 1: Add "sprints" to ProjectTab type and resolver**

In `ui/src/pages/ProjectDetail.tsx`:

```typescript
// Change:
type ProjectBaseTab = "overview" | "list" | "workspaces" | "configuration" | "budget" | "library";
// To:
type ProjectBaseTab = "overview" | "list" | "workspaces" | "configuration" | "budget" | "library" | "sprints";
```

In `resolveProjectTab`, add before the `return null`:
```typescript
if (tab === "sprints") return "sprints";
```

In `handleTabChange`, add the navigation case:
```typescript
case "sprints": navigate(`/w/${companyPrefix}/projects/${project.id}/sprints`); break;
```

- [ ] **Step 2: Add lazy import for SprintTab**

At the top of `ui/src/pages/ProjectDetail.tsx` with other lazy imports:
```typescript
const SprintTab = lazy(() => import("./SprintTab").then((m) => ({ default: m.SprintTab })));
```

- [ ] **Step 3: Add tab item to PageTabBar**

In the `PageTabBar` items array, add after `library`:
```typescript
{ value: "sprints", label: "Sprints" },
```

- [ ] **Step 4: Add tab render block**

After the last `{activeTab === "library" && ...}` block, add:
```tsx
{activeTab === "sprints" && project?.id && (
  <S><SprintTab projectId={project.id} /></S>
)}
```

- [ ] **Step 5: Add route in App.tsx**

In `ui/src/App.tsx`, add the lazy import:
```typescript
const SprintTab = lazy(() => import("./pages/SprintTab").then((m) => ({ default: m.SprintTab })));
```

Add under the project routes:
```tsx
<Route path="projects/:projectId/sprints" element={<S><ProjectDetail /></S>} />
<Route path="projects/:projectId/sprints/:sprintId/board" element={<S><ProjectDetail /></S>} />
<Route path="projects/:projectId/sprints/metrics" element={<S><ProjectDetail /></S>} />
```

- [ ] **Step 6: Remove global Sprints link from Sidebar**

In `ui/src/components/Sidebar.tsx`, remove:
```tsx
<SidebarNavItem to="/sprints" label="Sprints" icon={Milestone} />
```

- [ ] **Step 7: Remove global sprint routes from App.tsx**

Remove these routes:
```tsx
<Route path="sprints" element={<S><Sprints /></S>} />
<Route path="sprints/:sprintId/plan" element={<S><SprintPlanning /></S>} />
<Route path="sprints/:sprintId/metrics" element={<S><SprintMetrics /></S>} />
```
And their lazy imports (`Sprints`, `SprintPlanning`, `SprintMetrics`).

- [ ] **Step 8: Typecheck**

```bash
pnpm --filter @paperclipai/ui typecheck 2>&1 | tail -20
```
Expected: no errors (SprintTab doesn't exist yet — errors there are expected until Task 8).

- [ ] **Step 9: Commit**

```bash
git add ui/src/pages/ProjectDetail.tsx ui/src/App.tsx ui/src/components/Sidebar.tsx
git commit -m "feat(ui): add Sprints tab to ProjectDetail, remove global sprint routes"
```

---

## Task 8: Frontend — SprintTab Container

**Files:**
- Create: `ui/src/pages/SprintTab.tsx`

- [ ] **Step 1: Create the SprintTab container**

Create `ui/src/pages/SprintTab.tsx`:

```tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@/lib/router";
import { Milestone, Plus, BarChart2 } from "lucide-react";
import { sprintsApi } from "../api/sprints";
import { queryKeys } from "../lib/queryKeys";
import type { Sprint } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CreateSprintModal } from "../components/CreateSprintModal";
import { SprintPlanning } from "./SprintPlanning";
import { SprintBoard } from "./SprintBoard";
import { SprintMetricsPanel } from "./SprintMetricsPanel";

type SprintView = "planning" | "board" | "metrics";

function sprintStatusBadge(status: string) {
  if (status === "active") return <Badge variant="outline" className="text-xs border-primary/40 text-primary bg-primary/10">Activo</Badge>;
  if (status === "planning") return <Badge variant="outline" className="text-xs border-border text-muted-foreground">Planificando</Badge>;
  return <Badge variant="outline" className="text-xs border-border text-muted-foreground">Completado</Badge>;
}

export function SprintTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [view, setView] = useState<SprintView>("planning");

  const { data: sprints = [], isLoading } = useQuery({
    queryKey: queryKeys.sprints.list(projectId),
    queryFn: () => sprintsApi.listByProject(projectId),
  });

  // Auto-select first sprint or active sprint
  const effectiveSprintId = selectedSprintId ?? sprints.find((s) => s.status === "active")?.id ?? sprints[0]?.id ?? null;
  const selectedSprint = sprints.find((s) => s.id === effectiveSprintId) ?? null;

  // Switch to board view when active sprint is selected
  const handleSelectSprint = (sprint: Sprint) => {
    setSelectedSprintId(sprint.id);
    setView(sprint.status === "active" ? "board" : "planning");
  };

  return (
    <div className="flex h-full min-h-0 border border-border rounded-lg overflow-hidden">
      {/* Sidebar */}
      <div className="w-48 shrink-0 border-r border-border bg-sidebar flex flex-col">
        <div className="p-3 border-b border-border">
          <Button
            size="sm"
            variant="outline"
            className="w-full justify-start text-xs"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="h-3 w-3 mr-1.5" />
            Nuevo Sprint
          </Button>
        </div>

        <ScrollArea className="flex-1">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-3 py-2"><Skeleton className="h-8 w-full" /></div>
              ))
            : sprints.map((sprint) => (
                <button
                  key={sprint.id}
                  onClick={() => handleSelectSprint(sprint)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-xs transition-colors border-l-2",
                    effectiveSprintId === sprint.id
                      ? "bg-accent/10 border-l-primary text-foreground"
                      : "border-l-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Milestone className="h-3 w-3 shrink-0" />
                    <span className="font-medium truncate">{sprint.name}</span>
                  </div>
                  {sprintStatusBadge(sprint.status)}
                </button>
              ))}
        </ScrollArea>

        {/* Metrics link */}
        <div className="border-t border-border p-2">
          <button
            onClick={() => setView("metrics")}
            className={cn(
              "w-full text-left px-3 py-2 text-xs rounded-md flex items-center gap-1.5 transition-colors",
              view === "metrics" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            <BarChart2 className="h-3 w-3" />
            Métricas del proyecto
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {view === "metrics" ? (
          <SprintMetricsPanel projectId={projectId} />
        ) : !effectiveSprintId ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <div className="text-center">
              <Milestone className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>No hay sprints aún.</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowCreate(true)}>
                Crear primer sprint
              </Button>
            </div>
          </div>
        ) : selectedSprint?.status === "active" && view === "board" ? (
          <SprintBoard
            sprint={selectedSprint}
            projectId={projectId}
            onClosed={() => {
              queryClient.invalidateQueries({ queryKey: queryKeys.sprints.list(projectId) });
              setView("planning");
            }}
          />
        ) : (
          <SprintPlanning
            sprint={selectedSprint}
            projectId={projectId}
            onActivated={() => {
              queryClient.invalidateQueries({ queryKey: queryKeys.sprints.list(projectId) });
              setView("board");
            }}
            onCreateNew={() => setShowCreate(true)}
          />
        )}
      </div>

      {showCreate && (
        <CreateSprintModal
          projectId={projectId}
          onClose={() => setShowCreate(false)}
          onCreated={(sprint) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.sprints.list(projectId) });
            setSelectedSprintId(sprint.id);
            setView("planning");
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @paperclipai/ui typecheck 2>&1 | grep "SprintTab\|SprintPlanning\|SprintBoard\|SprintMetrics\|CreateSprint" | head -10
```
Expected: errors only about missing child components (SprintPlanning, SprintBoard, etc.) — not about SprintTab itself.

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/SprintTab.tsx
git commit -m "feat(ui): SprintTab container with sidebar and view routing"
```

---

## Task 9: Frontend — CreateSprintModal

**Files:**
- Create: `ui/src/components/CreateSprintModal.tsx`

- [ ] **Step 1: Create the modal**

Create `ui/src/components/CreateSprintModal.tsx`:

```tsx
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { sprintsApi } from "../api/sprints";
import type { Sprint } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface Props {
  projectId: string;
  onClose: () => void;
  onCreated: (sprint: Sprint) => void;
}

function daysBetween(a: string, b: string): number {
  const diff = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

export function CreateSprintModal({ projectId, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const duration = startDate && endDate && endDate > startDate ? daysBetween(startDate, endDate) : null;

  const create = useMutation({
    mutationFn: () =>
      sprintsApi.create(projectId, {
        name: name.trim(),
        description: description.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    onSuccess: (sprint) => onCreated(sprint),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Nuevo Sprint</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="sprint-name">Nombre</Label>
            <Input
              id="sprint-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sprint #1"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sprint-desc">Descripción (opcional)</Label>
            <Textarea
              id="sprint-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Objetivos del sprint..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sprint-start">Fecha de inicio</Label>
              <Input
                id="sprint-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sprint-end">Fecha de fin</Label>
              <Input
                id="sprint-end"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {duration !== null && (
            <p className="text-xs text-muted-foreground">
              Duración: <span className="text-foreground font-medium">{duration} días</span>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!name.trim() || create.isPending}
          >
            {create.isPending ? "Creando..." : "Crear Sprint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/CreateSprintModal.tsx
git commit -m "feat(ui): CreateSprintModal with date pickers and duration preview"
```

---

## Task 10: Frontend — CloseSprintModal

**Files:**
- Create: `ui/src/components/CloseSprintModal.tsx`

- [ ] **Step 1: Create the modal**

Create `ui/src/components/CloseSprintModal.tsx`:

```tsx
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { sprintsApi } from "../api/sprints";
import { queryKeys } from "../lib/queryKeys";
import type { Sprint } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Props {
  sprint: Sprint;
  projectId: string;
  totalIssues: number;
  doneIssues: number;
  onClose: () => void;
  onClosed: () => void;
}

export function CloseSprintModal({ sprint, projectId, totalIssues, doneIssues, onClose, onClosed }: Props) {
  const pendingIssues = totalIssues - doneIssues;
  const [strategy, setStrategy] = useState<"backlog" | "next_sprint">("backlog");
  const [nextSprintId, setNextSprintId] = useState<string>("");

  const { data: sprints = [] } = useQuery({
    queryKey: queryKeys.sprints.list(projectId),
    queryFn: () => sprintsApi.listByProject(projectId),
  });

  const planningSprintsForNext = sprints.filter((s) => s.status === "planning" && s.id !== sprint.id);

  const complete = useMutation({
    mutationFn: () =>
      sprintsApi.complete(sprint.id, {
        spillStrategy: strategy,
        nextSprintId: strategy === "next_sprint" && nextSprintId ? nextSprintId : undefined,
      }),
    onSuccess: () => onClosed(),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">Cerrar {sprint.name}</DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-primary/10 border border-primary/20 rounded-md p-2">
              <div className="text-lg font-bold text-primary">{doneIssues}</div>
              <div className="text-xs text-muted-foreground">Completadas</div>
            </div>
            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-2">
              <div className="text-lg font-bold text-destructive">{pendingIssues}</div>
              <div className="text-xs text-muted-foreground">Pendientes</div>
            </div>
            <div className="bg-muted border border-border rounded-md p-2">
              <div className="text-lg font-bold text-foreground">{totalIssues}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
          </div>

          {pendingIssues > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                ¿Qué hacemos con las <span className="text-destructive font-medium">{pendingIssues} tareas pendientes</span>?
              </p>

              <button
                onClick={() => setStrategy("backlog")}
                className={cn(
                  "w-full text-left p-3 rounded-md border text-sm transition-colors",
                  strategy === "backlog" ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:border-border/80",
                )}
              >
                <div className="font-medium">Volver al backlog</div>
                <div className="text-xs mt-0.5 opacity-70">Quedan sin sprint asignado</div>
              </button>

              <button
                onClick={() => setStrategy("next_sprint")}
                className={cn(
                  "w-full text-left p-3 rounded-md border text-sm transition-colors",
                  strategy === "next_sprint" ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:border-border/80",
                )}
              >
                <div className="font-medium">Mover al siguiente sprint</div>
                <div className="text-xs mt-0.5 opacity-70">Se asignan al sprint seleccionado</div>
              </button>

              {strategy === "next_sprint" && (
                <Select value={nextSprintId} onValueChange={setNextSprintId}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Seleccioná el sprint destino..." />
                  </SelectTrigger>
                  <SelectContent>
                    {planningSprintsForNext.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground border-t border-border pt-3">
            Todo queda registrado en métricas: tareas completadas, pendientes y a dónde fueron.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            variant="destructive"
            onClick={() => complete.mutate()}
            disabled={complete.isPending || (strategy === "next_sprint" && !nextSprintId && planningSprintsForNext.length > 0)}
          >
            {complete.isPending ? "Cerrando..." : "Cerrar Sprint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/CloseSprintModal.tsx
git commit -m "feat(ui): CloseSprintModal with spill strategy selector"
```

---

## Task 11: Frontend — SprintPlanning View

**Files:**
- Replace: `ui/src/pages/SprintPlanning.tsx`

- [ ] **Step 1: Replace SprintPlanning with project-scoped version**

Replace `ui/src/pages/SprintPlanning.tsx`:

```tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, X, Play } from "lucide-react";
import { useState } from "react";
import { sprintsApi } from "../api/sprints";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import type { Sprint, Issue } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PriorityIcon } from "../components/PriorityIcon";

interface Props {
  sprint: Sprint | null;
  projectId: string;
  onActivated: () => void;
  onCreateNew: () => void;
}

function priorityBadge(priority: string | null) {
  if (!priority) return null;
  const map: Record<string, string> = { urgent: "text-destructive", high: "text-orange-500", medium: "text-yellow-500", low: "text-muted-foreground" };
  return <span className={cn("text-xs font-medium capitalize", map[priority] ?? "text-muted-foreground")}>{priority}</span>;
}

function IssueCard({ issue, action, onAction }: { issue: Issue; action: "add" | "remove"; onAction: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card hover:bg-muted/40 transition-colors group">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{issue.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {priorityBadge(issue.priority)}
          {issue.identifier && <span className="text-xs text-muted-foreground font-mono">{issue.identifier}</span>}
        </div>
      </div>
      <Button
        size="icon"
        variant={action === "add" ? "outline" : "ghost"}
        className={cn("h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity", action === "remove" && "text-muted-foreground hover:text-destructive")}
        onClick={onAction}
      >
        {action === "add" ? <Plus className="h-3 w-3" /> : <X className="h-3 w-3" />}
      </Button>
    </div>
  );
}

export function SprintPlanning({ sprint, projectId, onActivated, onCreateNew }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: backlog = [], isLoading: backlogLoading } = useQuery({
    queryKey: queryKeys.sprints.backlog(projectId),
    queryFn: () => issuesApi.list({ projectId, noSprint: true }),
    enabled: !!projectId,
  });

  const { data: sprintIssues = [], isLoading: sprintLoading } = useQuery({
    queryKey: queryKeys.sprints.issues(sprint?.id ?? ""),
    queryFn: () => issuesApi.list({ projectId, sprintId: sprint?.id }),
    enabled: !!sprint?.id,
  });

  const addIssue = useMutation({
    mutationFn: (issueId: string) => sprintsApi.addIssue(sprint!.id, issueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sprints.backlog(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sprints.issues(sprint!.id) });
    },
  });

  const removeIssue = useMutation({
    mutationFn: (issueId: string) => sprintsApi.removeIssue(sprint!.id, issueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sprints.backlog(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sprints.issues(sprint!.id) });
    },
  });

  const activate = useMutation({
    mutationFn: () => sprintsApi.activate(sprint!.id),
    onSuccess: () => onActivated(),
  });

  const filteredBacklog = backlog.filter((i) =>
    !search || i.title.toLowerCase().includes(search.toLowerCase()) || (i.identifier ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  if (!sprint) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        <Button variant="outline" onClick={onCreateNew}>Crear sprint</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sprint header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h2 className="font-display font-semibold text-foreground">{sprint.name}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {sprint.startDate && sprint.endDate ? `${sprint.startDate} → ${sprint.endDate} · ` : ""}
            {sprintIssues.length} tareas asignadas
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => activate.mutate()}
          disabled={sprintIssues.length === 0 || activate.isPending}
        >
          <Play className="h-3.5 w-3.5 mr-1.5" />
          {activate.isPending ? "Activando..." : "Activar Sprint"}
        </Button>
      </div>

      {/* Two panels */}
      <div className="flex-1 min-h-0 grid grid-cols-2 divide-x divide-border">
        {/* Backlog */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Backlog</span>
            <Badge variant="secondary" className="text-xs">{backlog.length}</Badge>
            <div className="flex-1" />
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="h-6 pl-6 text-xs w-28"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {backlogLoading
                ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)
                : filteredBacklog.map((issue) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      action="add"
                      onAction={() => addIssue.mutate(issue.id)}
                    />
                  ))}
              {!backlogLoading && filteredBacklog.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Sin tareas en el backlog</p>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Sprint tasks */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{sprint.name}</span>
            <Badge variant="secondary" className="text-xs">{sprintIssues.length}</Badge>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {sprintLoading
                ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)
                : sprintIssues.map((issue) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      action="remove"
                      onAction={() => removeIssue.mutate(issue.id)}
                    />
                  ))}
              {!sprintLoading && sprintIssues.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Agregá tareas del backlog</p>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify `issuesApi.list` supports `noSprint` and `sprintId` params**

```bash
grep -n "noSprint\|sprintId" ui/src/api/issues.ts | head -10
```

If `noSprint` is not a supported param, add it to the `list` function signature.

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/SprintPlanning.tsx
git commit -m "feat(ui): SprintPlanning view — backlog + sprint task assignment"
```

---

## Task 12: Frontend — SprintBoard View

**Files:**
- Create: `ui/src/pages/SprintBoard.tsx`

- [ ] **Step 1: Create the board**

Create `ui/src/pages/SprintBoard.tsx`:

```tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Square } from "lucide-react";
import { sprintsApi } from "../api/sprints";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import type { Sprint, Issue } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CloseSprintModal } from "../components/CloseSprintModal";

const BOARD_COLUMNS = [
  { id: "todo",        label: "Todo",        color: "text-muted-foreground" },
  { id: "in_progress", label: "In Progress", color: "text-accent" },
  { id: "in_review",   label: "In Review",   color: "text-yellow-500" },
  { id: "done",        label: "Done",        color: "text-primary" },
] as const;

type ColId = typeof BOARD_COLUMNS[number]["id"];

interface Props {
  sprint: Sprint;
  projectId: string;
  onClosed: () => void;
}

function IssueCard({ issue, onStatusChange }: { issue: Issue; onStatusChange: (status: string) => void }) {
  return (
    <div className="bg-card border border-border rounded-md p-2.5 text-xs space-y-1.5 cursor-pointer hover:border-primary/40 transition-colors">
      <p className="text-foreground text-sm leading-snug">{issue.title}</p>
      <div className="flex items-center gap-2">
        {issue.priority && (
          <span className={cn("capitalize font-medium", {
            "text-destructive": issue.priority === "urgent",
            "text-orange-500": issue.priority === "high",
            "text-yellow-500": issue.priority === "medium",
            "text-muted-foreground": issue.priority === "low",
          })}>{issue.priority}</span>
        )}
        {issue.identifier && <span className="text-muted-foreground font-mono">{issue.identifier}</span>}
      </div>
    </div>
  );
}

export function SprintBoard({ sprint, projectId, onClosed }: Props) {
  const queryClient = useQueryClient();
  const [showClose, setShowClose] = useState(false);

  const { data: issues = [], isLoading } = useQuery({
    queryKey: queryKeys.sprints.issues(sprint.id),
    queryFn: () => issuesApi.list({ projectId, sprintId: sprint.id }),
  });

  const updateStatus = useMutation({
    mutationFn: ({ issueId, status }: { issueId: string; status: string }) =>
      issuesApi.update(issueId, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sprints.issues(sprint.id) }),
  });

  const byStatus: Record<ColId, Issue[]> = { todo: [], in_progress: [], in_review: [], done: [] };
  for (const issue of issues) {
    const col = BOARD_COLUMNS.find((c) => c.id === issue.status);
    if (col) byStatus[col.id].push(issue);
    else byStatus.todo.push(issue);
  }

  const done = byStatus.done.length;
  const total = issues.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sprint header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-semibold text-foreground">{sprint.name}</h2>
              <Badge variant="outline" className="text-xs border-primary/40 text-primary bg-primary/10">Activo</Badge>
            </div>
            {sprint.startDate && sprint.endDate && (
              <p className="text-xs text-muted-foreground mt-0.5">{sprint.startDate} → {sprint.endDate}</p>
            )}
          </div>
          {total > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs text-muted-foreground">{done}/{total}</span>
            </div>
          )}
        </div>
        <Button size="sm" variant="destructive" onClick={() => setShowClose(true)}>
          <Square className="h-3.5 w-3.5 mr-1.5" />
          Cerrar Sprint
        </Button>
      </div>

      {/* Board */}
      <div className="flex-1 min-h-0 grid grid-cols-4 divide-x divide-border overflow-hidden">
        {BOARD_COLUMNS.map((col) => (
          <div key={col.id} className="flex flex-col min-h-0">
            <div className="px-3 py-2 border-b border-border flex items-center gap-1.5">
              <span className={cn("text-xs font-semibold uppercase tracking-wide", col.color)}>{col.label}</span>
              <span className="text-xs text-muted-foreground">{byStatus[col.id].length}</span>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1.5">
                {isLoading
                  ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-md" />)
                  : byStatus[col.id].map((issue) => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        onStatusChange={(status) => updateStatus.mutate({ issueId: issue.id, status })}
                      />
                    ))}
                {!isLoading && byStatus[col.id].length === 0 && (
                  <div className="border border-dashed border-border rounded-md p-4 text-center text-xs text-muted-foreground/50">
                    vacío
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        ))}
      </div>

      {showClose && (
        <CloseSprintModal
          sprint={sprint}
          projectId={projectId}
          totalIssues={total}
          doneIssues={done}
          onClose={() => setShowClose(false)}
          onClosed={() => {
            setShowClose(false);
            queryClient.invalidateQueries({ queryKey: queryKeys.sprints.list(projectId) });
            onClosed();
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify `issuesApi.update` exists**

```bash
grep -n "update" ui/src/api/issues.ts | head -5
```

If it doesn't exist, add to `ui/src/api/issues.ts`:
```typescript
update: (id: string, data: Record<string, unknown>) => api.patch(`/issues/${id}`, data),
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/SprintBoard.tsx
git commit -m "feat(ui): SprintBoard kanban view with close sprint flow"
```

---

## Task 13: Frontend — SprintMetricsPanel

**Files:**
- Replace: `ui/src/pages/SprintMetrics.tsx` → `ui/src/pages/SprintMetricsPanel.tsx`

- [ ] **Step 1: Create SprintMetricsPanel**

Create `ui/src/pages/SprintMetricsPanel.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { sprintsApi } from "../api/sprints";
import { queryKeys } from "../lib/queryKeys";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function msToReadable(ms: number | null): string {
  if (!ms) return "—";
  const h = ms / (1000 * 60 * 60);
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function KpiCard({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
      <p className={cn("text-2xl font-display font-bold", valueClass ?? "text-foreground")}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function SprintMetricsPanel({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.sprints.projectMetrics(projectId),
    queryFn: () => sprintsApi.getProjectMetrics(projectId),
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <ScrollArea className="flex-1 h-full">
      <div className="p-4 space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <KpiCard label="Sprints completados" value={String(data.completedSprints)} sub={`de ${data.totalSprints} totales`} />
          <KpiCard label="Velocidad promedio" value={`${data.avgVelocity}`} sub="tareas/sprint" />
          <KpiCard
            label="Spill-over rate"
            value={`${data.spillOverRate}%`}
            sub="tareas que pasan de sprint"
            valueClass={data.spillOverRate > 30 ? "text-destructive" : data.spillOverRate > 15 ? "text-yellow-500" : "text-primary"}
          />
          <KpiCard label="Cycle time prom." value={msToReadable(data.avgCycleTimeMs)} sub="todo → done" />
          <KpiCard label="Completadas total" value={String(data.totalCompleted)} valueClass="text-primary" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Spill-over por sprint */}
          <div className="bg-card border border-border rounded-lg p-4 space-y-3">
            <h3 className="font-display font-semibold text-sm text-foreground">Tareas pendientes por sprint</h3>
            {data.sprintSummaries.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin datos aún</p>
            ) : (
              <div className="space-y-2">
                {data.sprintSummaries.map((s) => (
                  <div key={s.sprintId} className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground w-24 truncate shrink-0">{s.name}</span>
                    <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", s.spilledOver === 0 ? "bg-primary" : s.spilledOver > s.total / 2 ? "bg-destructive" : "bg-yellow-500")}
                        style={{ width: s.total > 0 ? `${(s.spilledOver / s.total) * 100}%` : "0%" }}
                      />
                    </div>
                    <span className={cn("w-16 text-right shrink-0", s.spilledOver > 0 ? "text-destructive" : "text-primary")}>
                      {s.spilledOver} → {s.spilledToSprintName ?? "backlog"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {data.spillOverAlerts.length > 0 && (
              <div className="border-t border-border pt-3 space-y-1.5">
                <p className="text-xs text-yellow-500 font-medium">⚠ Tareas que rebotaron 2+ sprints</p>
                {data.spillOverAlerts.map((a) => (
                  <div key={a.issueId} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground truncate">{a.identifier && <span className="font-mono mr-1">{a.identifier}</span>}{a.title}</span>
                    <Badge variant="outline" className="text-destructive border-destructive/30 shrink-0 ml-2">{a.sprintCount} sprints</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tiempo por estado */}
          <div className="bg-card border border-border rounded-lg p-4 space-y-3">
            <h3 className="font-display font-semibold text-sm text-foreground">Tiempo promedio por estado</h3>
            {Object.keys(data.avgTimePerStatus).length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin datos aún</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(data.avgTimePerStatus).map(([status, ms]) => {
                  const maxMs = Math.max(...Object.values(data.avgTimePerStatus));
                  const pct = maxMs > 0 ? (ms / maxMs) * 100 : 0;
                  return (
                    <div key={status} className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground w-24 capitalize shrink-0">{status.replace("_", " ")}</span>
                      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-muted-foreground w-10 text-right shrink-0">{msToReadable(ms)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Recent state log */}
            {data.recentStateLog.length > 0 && (
              <div className="border-t border-border pt-3 space-y-1">
                <p className="text-xs text-muted-foreground font-medium mb-2">Últimos movimientos</p>
                {data.recentStateLog.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-xs items-center">
                    <span className="text-muted-foreground truncate font-mono">{(entry as { identifier?: string }).identifier ?? entry.issueId.slice(0, 8)}</span>
                    <Badge variant="secondary" className="text-xs">{entry.fromStatus ?? "—"}</Badge>
                    <span className="text-muted-foreground">→</span>
                    <Badge variant="secondary" className="text-xs text-primary">{entry.toStatus}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* User activity */}
        {data.userActivity.length > 0 && (
          <div className="bg-card border border-border rounded-lg p-4 space-y-3">
            <h3 className="font-display font-semibold text-sm text-foreground">Actividad por usuario</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {data.userActivity.map((u) => (
                <div key={u.userId} className="border border-border rounded-md p-3 space-y-2">
                  <p className="text-sm font-medium text-foreground truncate">{u.name ?? u.userId.slice(0, 8)}</p>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                    <span className="text-muted-foreground">Completadas</span>
                    <span className="text-primary text-right">{u.completed}</span>
                    <span className="text-muted-foreground">Cycle time</span>
                    <span className="text-right">{msToReadable(u.avgCycleTimeMs)}</span>
                    <span className="text-muted-foreground">Movimientos</span>
                    <span className="text-right">{u.totalMoves}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 2: Delete old global metrics page**

```bash
rm ui/src/pages/SprintMetrics.tsx
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/SprintMetricsPanel.tsx
git rm ui/src/pages/SprintMetrics.tsx
git commit -m "feat(ui): SprintMetricsPanel with KPIs, spill-over, state log and user activity"
```

---

## Task 14: Cleanup — Remove Old Global Sprint Pages

**Files:**
- Delete: `ui/src/pages/Sprints.tsx`

- [ ] **Step 1: Delete old Sprints page**

```bash
rm ui/src/pages/Sprints.tsx
```

- [ ] **Step 2: Final typecheck**

```bash
pnpm --filter @paperclipai/ui typecheck 2>&1 | tail -30
```
Expected: 0 errors.

- [ ] **Step 3: Final build**

```bash
pnpm --filter @paperclipai/ui build 2>&1 | tail -10
```
Expected: `✓ built in Xs`

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: remove legacy global Sprints pages"
```

---

## Task 15: Feature Branch PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin feature/sprints-per-project
```

- [ ] **Step 2: Open PR to `developer`**

```bash
GH_TOKEN=<token> gh pr create \
  --title "Feature/sprints-per-project: sprints scoped to projects with backlog, board and metrics" \
  --base developer \
  --body "$(cat docs/superpowers/specs/2026-04-09-sprints-per-project-design.md | head -30)"
```
