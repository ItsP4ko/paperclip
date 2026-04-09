# Pipeline Improvements: Assignee Mix + Issue Linking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow pipeline steps to be assigned to human team members (not just AI agents), link existing issues to steps, and create pipelines from selected issues — with a vertical flowchart UI and Redis caching.

**Architecture:** Add 3 columns (`assignee_type`, `assignee_user_id`, `issue_id`) to `pipeline_steps`. Update `evaluateReadySteps` to handle mixed agent/human execution and existing-issue linking. Add `POST /pipelines/from-issues` endpoint. Rebuild PipelineDetail UI as vertical flowchart. Cache pipeline reads in Redis with TTL + active invalidation.

**Tech Stack:** Drizzle ORM (PostgreSQL), Express + Zod, React + TanStack Query, Redis (`redis` package), Tailwind CSS + shadcn/ui

---

## File Map

### Database
- **Modify:** `packages/db/src/schema/pipelines.ts` — add 3 columns to `pipelineSteps`
- **Create:** `packages/db/src/migrations/0060_pipeline_assignee_issues.sql` — migration + backfill

### Backend
- **Modify:** `server/src/services/pipelines.ts` — update `evaluateReadySteps`, `createStep`, `updateStep`, `getRunById`; add `createFromIssues`
- **Modify:** `server/src/routes/pipelines.ts` — update schemas, add `from-issues` endpoint, wire Redis
- **Modify:** `server/src/app.ts` — pass `redisClient` to `pipelineRoutes`

### Frontend
- **Modify:** `ui/src/api/pipelines.ts` — update types, add `createFromIssues` method
- **Modify:** `ui/src/pages/PipelineDetail.tsx` — vertical flowchart layout, updated add-step form
- **Modify:** `ui/src/pages/PipelineRunDetail.tsx` — show assignee type in run step view
- **Modify:** `ui/src/components/IssuesList.tsx` — multi-select mode + "Create Pipeline" action

---

## Task 1: Database Migration + Schema

**Files:**
- Create: `packages/db/src/migrations/0060_pipeline_assignee_issues.sql`
- Modify: `packages/db/src/schema/pipelines.ts:33-51`

- [ ] **Step 1: Create the migration SQL file**

```sql
-- 0060_pipeline_assignee_issues.sql
-- Add mixed assignee support and issue linking to pipeline steps

ALTER TABLE pipeline_steps
  ADD COLUMN assignee_type text,
  ADD COLUMN assignee_user_id text,
  ADD COLUMN issue_id uuid REFERENCES issues(id) ON DELETE SET NULL;

CREATE INDEX pipeline_steps_issue_idx ON pipeline_steps(issue_id);

-- Backfill: existing steps with agent_id get assignee_type = 'agent'
UPDATE pipeline_steps
  SET assignee_type = 'agent'
  WHERE agent_id IS NOT NULL;
```

Write this to `packages/db/src/migrations/0060_pipeline_assignee_issues.sql`.

- [ ] **Step 2: Update the Drizzle schema**

In `packages/db/src/schema/pipelines.ts`, add the import for `issues` (already exists on line 12) and add 3 new columns to the `pipelineSteps` table definition. After the existing `position` field (line 44), add:

```typescript
    assigneeType: text("assignee_type"),
    assigneeUserId: text("assignee_user_id"),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/migrations/0060_pipeline_assignee_issues.sql packages/db/src/schema/pipelines.ts
git commit -m "feat(db): add assignee_type, assignee_user_id, issue_id to pipeline_steps"
```

---

## Task 2: Backend Service — Updated Step CRUD + Validation

**Files:**
- Modify: `server/src/services/pipelines.ts:148-215` (createStep, updateStep)

- [ ] **Step 1: Update `createStep` to accept new fields**

In `server/src/services/pipelines.ts`, update the `createStep` method signature (line 148). Change the `data` parameter type to include the new fields:

```typescript
    createStep: async (
      companyId: string,
      pipelineId: string,
      data: {
        name: string;
        agentId?: string | null;
        assigneeType?: "agent" | "user" | null;
        assigneeUserId?: string | null;
        issueId?: string | null;
        dependsOn?: string[];
        position?: number;
        config?: Record<string, unknown>;
      },
    ) => {
      const [pipeline] = await db
        .select({ id: pipelines.id })
        .from(pipelines)
        .where(and(eq(pipelines.id, pipelineId), eq(pipelines.companyId, companyId)));
      if (!pipeline) return null;

      // Validate assignee consistency
      if (data.assigneeType === "agent" && !data.agentId) {
        throw new Error("agentId required when assigneeType is 'agent'");
      }
      if (data.assigneeType === "user" && !data.assigneeUserId) {
        throw new Error("assigneeUserId required when assigneeType is 'user'");
      }

      // Validate issueId belongs to company if provided
      if (data.issueId) {
        const [issue] = await db
          .select({ id: issues.id })
          .from(issues)
          .where(and(eq(issues.id, data.issueId), eq(issues.companyId, companyId)));
        if (!issue) throw new Error("Issue not found in this company");
      }

      const [step] = await db
        .insert(pipelineSteps)
        .values({
          pipelineId,
          name: data.name,
          agentId: data.agentId ?? null,
          assigneeType: data.assigneeType ?? null,
          assigneeUserId: data.assigneeUserId ?? null,
          issueId: data.issueId ?? null,
          dependsOn: data.dependsOn ?? [],
          position: data.position ?? 0,
          config: data.config ?? {},
        })
        .returning();
      return step;
    },
```

Note: add `import { issues } from "@paperclipai/db";` to the imports at line 5 if not already imported (it is already imported via `pipelineRunSteps` referencing issues, but verify the `issues` table is in the import).

- [ ] **Step 2: Update `updateStep` to accept new fields**

Update the `updateStep` method (line 178) data parameter type:

```typescript
    updateStep: async (
      companyId: string,
      pipelineId: string,
      stepId: string,
      data: {
        name?: string;
        agentId?: string | null;
        assigneeType?: "agent" | "user" | null;
        assigneeUserId?: string | null;
        issueId?: string | null;
        dependsOn?: string[];
        position?: number;
        config?: Record<string, unknown>;
      },
    ) => {
      const [pipeline] = await db
        .select({ id: pipelines.id })
        .from(pipelines)
        .where(and(eq(pipelines.id, pipelineId), eq(pipelines.companyId, companyId)));
      if (!pipeline) return null;

      // Validate assignee consistency if assigneeType is being set
      if (data.assigneeType === "agent" && data.agentId === undefined) {
        // If changing to agent type, need to check if agentId is already set or being provided
        const [existing] = await db
          .select({ agentId: pipelineSteps.agentId })
          .from(pipelineSteps)
          .where(eq(pipelineSteps.id, stepId));
        if (!existing?.agentId && !data.agentId) {
          throw new Error("agentId required when assigneeType is 'agent'");
        }
      }
      if (data.assigneeType === "user" && !data.assigneeUserId) {
        const [existing] = await db
          .select({ assigneeUserId: pipelineSteps.assigneeUserId })
          .from(pipelineSteps)
          .where(eq(pipelineSteps.id, stepId));
        if (!existing?.assigneeUserId) {
          throw new Error("assigneeUserId required when assigneeType is 'user'");
        }
      }

      // Validate issueId if provided
      if (data.issueId) {
        const [issue] = await db
          .select({ id: issues.id })
          .from(issues)
          .where(and(eq(issues.id, data.issueId), eq(issues.companyId, companyId)));
        if (!issue) throw new Error("Issue not found in this company");
      }

      const [step] = await db
        .update(pipelineSteps)
        .set({ ...data, updatedAt: new Date() })
        .where(
          and(eq(pipelineSteps.id, stepId), eq(pipelineSteps.pipelineId, pipelineId)),
        )
        .returning();
      return step ?? null;
    },
```

- [ ] **Step 3: Commit**

```bash
git add server/src/services/pipelines.ts
git commit -m "feat(service): update pipeline step CRUD for mixed assignees + issue linking"
```

---

## Task 3: Backend Service — Updated `evaluateReadySteps`

**Files:**
- Modify: `server/src/services/pipelines.ts:14-93` (evaluateReadySteps)

- [ ] **Step 1: Update `evaluateReadySteps` to handle mixed assignees and existing issues**

Replace the `evaluateReadySteps` function (lines 14-93) with this updated version:

```typescript
  async function evaluateReadySteps(runId: string) {
    const runStepRows = await db
      .select({
        runStep: pipelineRunSteps,
        step: pipelineSteps,
      })
      .from(pipelineRunSteps)
      .innerJoin(pipelineSteps, eq(pipelineRunSteps.pipelineStepId, pipelineSteps.id))
      .where(eq(pipelineRunSteps.pipelineRunId, runId));

    const completedStepIds = new Set(
      runStepRows
        .filter(
          (rs) => rs.runStep.status === "completed" || rs.runStep.status === "skipped",
        )
        .map((rs) => rs.runStep.pipelineStepId),
    );

    const [run] = await db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.id, runId));
    if (!run) return;

    for (const { runStep, step } of runStepRows) {
      if (runStep.status !== "pending") continue;

      const deps = step.dependsOn ?? [];
      const allDepsCompleted = deps.every((depStepId) => completedStepIds.has(depStepId));
      if (!allDepsCompleted) continue;

      let issueId: string | null = runStep.issueId ?? null;

      // If step has a pre-linked issue, use it; otherwise create a new one
      if (step.issueId && !issueId) {
        // Use the pre-linked issue from the step definition
        issueId = step.issueId;

        try {
          // Update existing issue: move to "todo" only if in "backlog", assign based on type
          const [existingIssue] = await db
            .select({ id: issues.id, status: issues.status })
            .from(issues)
            .where(eq(issues.id, step.issueId));

          if (existingIssue) {
            const patch: Record<string, unknown> = { updatedAt: new Date() };

            // Only advance status if currently in backlog
            if (existingIssue.status === "backlog") {
              patch.status = "todo";
            }

            // Assign based on assignee type
            if (step.assigneeType === "agent" && step.agentId) {
              patch.assigneeAgentId = step.agentId;
              patch.assigneeUserId = null;
            } else if (step.assigneeType === "user" && step.assigneeUserId) {
              patch.assigneeUserId = step.assigneeUserId;
              patch.assigneeAgentId = null;
            }

            await db
              .update(issues)
              .set(patch)
              .where(eq(issues.id, step.issueId));
          }
        } catch {
          // proceed even if issue update fails
        }
      } else if (!issueId && run.projectId) {
        // No pre-linked issue — create a new one (existing behavior, extended for user assignees)
        try {
          const createData: {
            projectId: string;
            title: string;
            assigneeAgentId?: string;
            assigneeUserId?: string;
            priority: string;
            status: string;
          } = {
            projectId: run.projectId,
            title: step.name,
            priority: "medium",
            status: "todo",
          };

          if (step.assigneeType === "agent" && step.agentId) {
            createData.assigneeAgentId = step.agentId;
          } else if (step.assigneeType === "user" && step.assigneeUserId) {
            createData.assigneeUserId = step.assigneeUserId;
          } else if (step.agentId) {
            // Backwards compat: if no assigneeType but agentId is set
            createData.assigneeAgentId = step.agentId;
          }

          const issue = await issueSvc.create(run.companyId, createData);
          issueId = issue.id;
        } catch {
          // proceed without issue
        }
      }

      await db
        .update(pipelineRunSteps)
        .set({
          status: "running",
          startedAt: new Date(),
          ...(issueId ? { issueId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(pipelineRunSteps.id, runStep.id));
    }

    // Re-check if all steps are terminal
    const updatedSteps = await db
      .select()
      .from(pipelineRunSteps)
      .where(eq(pipelineRunSteps.pipelineRunId, runId));

    const allTerminal =
      updatedSteps.length > 0 &&
      updatedSteps.every(
        (rs) =>
          rs.status === "completed" ||
          rs.status === "skipped" ||
          rs.status === "failed",
      );

    if (allTerminal) {
      await db
        .update(pipelineRuns)
        .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(pipelineRuns.id, runId));
    }
  }
```

Note: The `issues` table is already imported at line 12 of `pipelines.ts` via `import { issues } from "@paperclipai/db";` — verify this is the case. If not, add it to the import block at line 5.

- [ ] **Step 2: Commit**

```bash
git add server/src/services/pipelines.ts
git commit -m "feat(service): evaluateReadySteps handles mixed assignees + existing issues"
```

---

## Task 4: Backend Service — `createFromIssues` + `getRunById` Enrichment

**Files:**
- Modify: `server/src/services/pipelines.ts` — add `createFromIssues` method, update `getRunById`

- [ ] **Step 1: Add `createFromIssues` method**

Add this method to the returned object in `pipelineService`, after the `delete` method (after line 146):

```typescript
    createFromIssues: async (
      companyId: string,
      data: { name: string; description?: string; issueIds: string[] },
    ) => {
      // Validate all issues exist and belong to the company
      const issueRows = await db
        .select({ id: issues.id, title: issues.title, assigneeAgentId: issues.assigneeAgentId, assigneeUserId: issues.assigneeUserId })
        .from(issues)
        .where(and(eq(issues.companyId, companyId), inArray(issues.id, data.issueIds)));

      if (issueRows.length !== data.issueIds.length) {
        throw new Error("One or more issues not found in this company");
      }

      // Create pipeline
      const [pipeline] = await db
        .insert(pipelines)
        .values({ companyId, name: data.name, description: data.description ?? null })
        .returning();

      // Create steps in order, with sequential dependencies
      const createdSteps: Array<typeof pipelineSteps.$inferSelect> = [];
      for (let i = 0; i < data.issueIds.length; i++) {
        const issueId = data.issueIds[i];
        const issue = issueRows.find((r) => r.id === issueId)!;

        let assigneeType: string | null = null;
        if (issue.assigneeAgentId) assigneeType = "agent";
        else if (issue.assigneeUserId) assigneeType = "user";

        const [step] = await db
          .insert(pipelineSteps)
          .values({
            pipelineId: pipeline.id,
            name: issue.title,
            issueId: issue.id,
            agentId: issue.assigneeAgentId ?? null,
            assigneeType,
            assigneeUserId: issue.assigneeUserId ?? null,
            dependsOn: i > 0 ? [createdSteps[i - 1].id] : [],
            position: i,
          })
          .returning();
        createdSteps.push(step);
      }

      return { ...pipeline, steps: createdSteps };
    },
```

Note: `inArray` needs to be imported from `drizzle-orm`. Add it to the import on line 1:

```typescript
import { and, eq, inArray } from "drizzle-orm";
```

- [ ] **Step 2: Update `getRunById` to return assignee info**

Update the `getRunById` method (around line 282). In the `steps` mapping at the end, add `assigneeType` and `assigneeUserId`:

```typescript
    getRunById: async (companyId: string, runId: string) => {
      const [run] = await db
        .select()
        .from(pipelineRuns)
        .where(and(eq(pipelineRuns.id, runId), eq(pipelineRuns.companyId, companyId)));
      if (!run) return null;

      const stepRows = await db
        .select({
          runStep: pipelineRunSteps,
          step: pipelineSteps,
        })
        .from(pipelineRunSteps)
        .innerJoin(pipelineSteps, eq(pipelineRunSteps.pipelineStepId, pipelineSteps.id))
        .where(eq(pipelineRunSteps.pipelineRunId, runId))
        .orderBy(pipelineSteps.position);

      return {
        ...run,
        steps: stepRows.map((s) => ({
          ...s.runStep,
          stepName: s.step.name,
          agentId: s.step.agentId,
          assigneeType: s.step.assigneeType,
          assigneeUserId: s.step.assigneeUserId,
          issueId: s.runStep.issueId ?? s.step.issueId,
          dependsOn: s.step.dependsOn,
          position: s.step.position,
        })),
      };
    },
```

- [ ] **Step 3: Commit**

```bash
git add server/src/services/pipelines.ts
git commit -m "feat(service): add createFromIssues + enrich getRunById with assignee info"
```

---

## Task 5: Backend Routes — Updated Schemas + New Endpoint

**Files:**
- Modify: `server/src/routes/pipelines.ts` — update Zod schemas, add `from-issues` route

- [ ] **Step 1: Update Zod schemas**

In `server/src/routes/pipelines.ts`, replace the `createPipelineStepSchema` (line 21) and `updatePipelineStepSchema` (line 29):

```typescript
const createPipelineStepSchema = z.object({
  name:           z.string().min(1),
  agentId:        z.string().optional(),
  assigneeType:   z.enum(["agent", "user"]).optional(),
  assigneeUserId: z.string().optional(),
  issueId:        z.string().optional(),
  dependsOn:      z.array(z.string()).optional(),
  position:       z.number().optional(),
  config:         z.record(z.unknown()).optional(),
});

const updatePipelineStepSchema = createPipelineStepSchema.partial();

const createPipelineFromIssuesSchema = z.object({
  name:        z.string().min(1),
  description: z.string().optional(),
  issueIds:    z.array(z.string()).min(1),
});
```

- [ ] **Step 2: Update `createStep` route handler to pass new fields**

Update the POST step handler (line 88) to destructure and pass the new fields:

```typescript
  // Create step
  router.post("/companies/:companyId/pipelines/:pipelineId/steps", validate(createPipelineStepSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const pipelineId = req.params.pipelineId as string;
    assertCompanyAccess(req, companyId);
    const { name, agentId, assigneeType, assigneeUserId, issueId, dependsOn, position, config } = req.body;
    const step = await svc.createStep(companyId, pipelineId, {
      name,
      agentId,
      assigneeType,
      assigneeUserId,
      issueId,
      dependsOn,
      position,
      config,
    });
    if (!step) throw notFound("Pipeline not found");
    res.status(201).json(step);
  });
```

- [ ] **Step 3: Update `updateStep` route handler similarly**

Update the PATCH step handler (line 105) to destructure and pass the new fields:

```typescript
  // Update step
  router.patch(
    "/companies/:companyId/pipelines/:pipelineId/steps/:stepId",
    validate(updatePipelineStepSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const pipelineId = req.params.pipelineId as string;
      const stepId = req.params.stepId as string;
      assertCompanyAccess(req, companyId);
      const { name, agentId, assigneeType, assigneeUserId, issueId, dependsOn, position, config } = req.body;
      const step = await svc.updateStep(companyId, pipelineId, stepId, {
        name,
        agentId,
        assigneeType,
        assigneeUserId,
        issueId,
        dependsOn,
        position,
        config,
      });
      if (!step) throw notFound("Step not found");
      res.json(step);
    },
  );
```

- [ ] **Step 4: Add `from-issues` endpoint**

Add this new route after the DELETE pipeline handler (after line 85) and before the step routes:

```typescript
  // Create pipeline from issues
  router.post("/companies/:companyId/pipelines/from-issues", validate(createPipelineFromIssuesSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { name, description, issueIds } = req.body;
    const pipeline = await svc.createFromIssues(companyId, { name, description, issueIds });
    res.status(201).json(pipeline);
  });
```

**Important:** This route MUST be placed before the `/:pipelineId` routes so Express doesn't interpret `from-issues` as a pipelineId parameter.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/pipelines.ts
git commit -m "feat(routes): update pipeline step schemas + add from-issues endpoint"
```

---

## Task 6: Backend — Redis Caching

**Files:**
- Modify: `server/src/routes/pipelines.ts` — add Redis cache reads/writes
- Modify: `server/src/app.ts:266` — pass `redisClient` to `pipelineRoutes`

- [ ] **Step 1: Update `pipelineRoutes` signature to accept Redis**

In `server/src/routes/pipelines.ts`, update the function signature (line 36) and add cache constants:

```typescript
import type { RedisClientType } from "redis";

const PIPELINE_DETAIL_TTL = 300;  // 5 minutes
const PIPELINE_RUN_TTL = 300;
const PIPELINE_RUNS_TTL = 300;

export function pipelineRoutes(db: Db, redisClient?: RedisClientType) {
  const router = Router();
  const svc = pipelineService(db);
```

- [ ] **Step 2: Add cache to `GET /pipelines/:pipelineId`**

Update the get-pipeline-detail handler (line 58):

```typescript
  // Get pipeline detail (with steps)
  router.get("/companies/:companyId/pipelines/:pipelineId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const pipelineId = req.params.pipelineId as string;
    assertCompanyAccess(req, companyId);

    const cacheKey = `paperclip:pipeline:detail:${pipelineId}`;
    if (redisClient?.isReady) {
      const cached = await redisClient.get(cacheKey).catch(() => null);
      if (cached) { res.json(JSON.parse(cached)); return; }
    }

    const pipeline = await svc.getById(companyId, pipelineId);
    if (!pipeline) throw notFound("Pipeline not found");

    if (redisClient?.isReady) {
      await redisClient.set(cacheKey, JSON.stringify(pipeline), { EX: PIPELINE_DETAIL_TTL }).catch(() => null);
    }

    res.json(pipeline);
  });
```

- [ ] **Step 3: Invalidate detail cache on step mutations**

After successful step create/update/delete, bust the detail cache. Add to each handler:

For `createStep` handler, after `res.status(201).json(step);`:
```typescript
    await redisClient?.del(`paperclip:pipeline:detail:${pipelineId}`).catch(() => null);
```

Same for `updateStep` and `deleteStep` handlers — add the del call before the response. Also invalidate on pipeline update/delete.

- [ ] **Step 4: Add cache to `GET /pipeline-runs/:runId`**

Update the get-run-detail handler (line 164):

```typescript
  // Get run detail (with step statuses)
  router.get("/companies/:companyId/pipeline-runs/:runId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const runId = req.params.runId as string;
    assertCompanyAccess(req, companyId);

    const cacheKey = `paperclip:pipeline:run:${runId}`;
    if (redisClient?.isReady) {
      const cached = await redisClient.get(cacheKey).catch(() => null);
      if (cached) { res.json(JSON.parse(cached)); return; }
    }

    const run = await svc.getRunById(companyId, runId);
    if (!run) throw notFound("Run not found");

    if (redisClient?.isReady) {
      // Only cache completed runs for the full TTL; running runs get short TTL
      const ttl = run.status === "running" ? 5 : PIPELINE_RUN_TTL;
      await redisClient.set(cacheKey, JSON.stringify(run), { EX: ttl }).catch(() => null);
    }

    res.json(run);
  });
```

- [ ] **Step 5: Invalidate run cache in `onIssueStatusChange`**

In `server/src/services/pipelines.ts`, the `onIssueStatusChange` method needs to accept and use the redis client. Since the service doesn't currently have access to Redis, we need a different approach. Add a callback pattern — update the `onIssueStatusChange` to return the `pipelineRunId` that was affected:

```typescript
    onIssueStatusChange: async (issueId: string, _companyId: string) => {
      const [runStep] = await db
        .select()
        .from(pipelineRunSteps)
        .where(
          and(
            eq(pipelineRunSteps.issueId, issueId),
            eq(pipelineRunSteps.status, "running"),
          ),
        );
      if (!runStep) return null;

      await db
        .update(pipelineRunSteps)
        .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(pipelineRunSteps.id, runStep.id));

      await evaluateReadySteps(runStep.pipelineRunId);

      return runStep.pipelineRunId;  // caller can invalidate cache
    },
```

Then in the route/caller that invokes `onIssueStatusChange`, invalidate:
```typescript
const affectedRunId = await pipelineSvc.onIssueStatusChange(issueId, companyId);
if (affectedRunId && redisClient?.isReady) {
  await redisClient.del(`paperclip:pipeline:run:${affectedRunId}`).catch(() => null);
}
```

- [ ] **Step 6: Update `app.ts` to pass redisClient**

In `server/src/app.ts`, update line 266:

```typescript
  api.use(pipelineRoutes(db, opts.redisClient));
```

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/pipelines.ts server/src/services/pipelines.ts server/src/app.ts
git commit -m "feat(cache): add Redis caching for pipeline detail + run queries"
```

---

## Task 7: Frontend API Types + Methods

**Files:**
- Modify: `ui/src/api/pipelines.ts` — update interfaces, add `createFromIssues`

- [ ] **Step 1: Update `PipelineStep` interface**

In `ui/src/api/pipelines.ts`, update the `PipelineStep` interface (line 14):

```typescript
export interface PipelineStep {
  id: string;
  pipelineId: string;
  name: string;
  agentId: string | null;
  assigneeType: "agent" | "user" | null;
  assigneeUserId: string | null;
  issueId: string | null;
  dependsOn: string[];
  config: Record<string, unknown>;
  position: number;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Update `PipelineRunStep` interface**

Update the `PipelineRunStep` interface (line 43) to include assignee info:

```typescript
export interface PipelineRunStep {
  id: string;
  pipelineRunId: string;
  pipelineStepId: string;
  issueId: string | null;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  stepName: string;
  agentId: string | null;
  assigneeType: "agent" | "user" | null;
  assigneeUserId: string | null;
  dependsOn: string[];
  position: number;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 3: Update `createStep` method and add `createFromIssues`**

Update the `createStep` call (line 83) to accept new fields:

```typescript
  createStep: (
    companyId: string,
    pipelineId: string,
    data: {
      name: string;
      agentId?: string | null;
      assigneeType?: "agent" | "user";
      assigneeUserId?: string | null;
      issueId?: string | null;
      dependsOn?: string[];
      position?: number;
      config?: Record<string, unknown>;
    },
  ) => api.post<PipelineStep>(`/companies/${companyId}/pipelines/${pipelineId}/steps`, data),
```

Add `createFromIssues` after `delete` (after line 81):

```typescript
  createFromIssues: (
    companyId: string,
    data: { name: string; description?: string; issueIds: string[] },
  ) => api.post<PipelineWithSteps>(`/companies/${companyId}/pipelines/from-issues`, data),
```

- [ ] **Step 4: Commit**

```bash
git add ui/src/api/pipelines.ts
git commit -m "feat(ui-api): update pipeline types for mixed assignees + createFromIssues"
```

---

## Task 8: Frontend — PipelineDetail Vertical Flowchart

**Files:**
- Modify: `ui/src/pages/PipelineDetail.tsx` — rewrite layout to vertical flowchart, update add-step form

- [ ] **Step 1: Rewrite `StepCard` as a vertical flow node**

Replace the `StepCard` component (lines 22-63) with a flowchart-style card:

```tsx
function StepCard({
  step,
  allSteps,
  agentNames,
  memberNames,
  isLast,
  onDelete,
}: {
  step: PipelineStep;
  allSteps: PipelineStep[];
  agentNames: Record<string, string>;
  memberNames: Record<string, string>;
  isLast: boolean;
  onDelete: (id: string) => void;
}) {
  const deps = step.dependsOn
    .map((depId) => allSteps.find((s) => s.id === depId)?.name ?? depId.slice(0, 8))
    .join(", ");

  let assigneeLabel: string | null = null;
  if (step.assigneeType === "agent" && step.agentId) {
    assigneeLabel = `Agent: ${agentNames[step.agentId] ?? step.agentId.slice(0, 8)}`;
  } else if (step.assigneeType === "user" && step.assigneeUserId) {
    assigneeLabel = `User: ${memberNames[step.assigneeUserId] ?? step.assigneeUserId.slice(0, 8)}`;
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full max-w-md border border-border rounded-lg bg-card shadow-[2px_2px_0px_0px_rgba(0,0,0,0.05)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.03)] group px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{step.name}</span>
            </div>
            {assigneeLabel && (
              <p className="text-xs text-muted-foreground mt-0.5">{assigneeLabel}</p>
            )}
            {step.issueId && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Linked issue: <span className="font-mono">{step.issueId.slice(0, 8)}...</span>
              </p>
            )}
            {deps && (
              <p className="text-xs text-muted-foreground mt-0.5">Depends on: {deps}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onDelete(step.id)}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>
      {/* Connector line */}
      {!isLast && (
        <div className="w-px h-8 bg-border" />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update the add-step form with assignee type toggle and issue selector**

Replace the `StepFormData` interface and `EMPTY_FORM` (lines 14-20) with:

```typescript
interface StepFormData {
  name: string;
  assigneeType: "agent" | "user" | "";
  agentId: string;
  assigneeUserId: string;
  issueId: string;
  dependsOn: string[];
}

const EMPTY_FORM: StepFormData = { name: "", assigneeType: "", agentId: "", assigneeUserId: "", issueId: "", dependsOn: [] };
```

- [ ] **Step 3: Add members query and issue search to `PipelineDetail`**

In the `PipelineDetail` component, add imports and queries. Add after the `projects` query (line 92):

```tsx
import { accessApi, type CompanyMember } from "../api/access";
import { issuesApi } from "../api/issues";

// Inside PipelineDetail, after the projects query:
  const { data: members = [] } = useQuery({
    queryKey: queryKeys.access.members(selectedCompanyId!),
    queryFn: () => accessApi.listMembers(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: companyIssues = [] } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const memberNames = Object.fromEntries(
    members
      .filter((m: CompanyMember) => m.principalType === "user")
      .map((m: CompanyMember) => [m.principalId, m.userDisplayName ?? m.userEmail ?? m.principalId.slice(0, 8)]),
  );
```

- [ ] **Step 4: Update the `createStepMutation` to pass new fields**

Update the mutation (line 106):

```tsx
  const createStepMutation = useMutation({
    mutationFn: (data: StepFormData) =>
      pipelinesApi.createStep(selectedCompanyId!, pipelineId!, {
        name: data.name,
        agentId: data.assigneeType === "agent" && data.agentId ? data.agentId : null,
        assigneeType: data.assigneeType === "" ? undefined : data.assigneeType,
        assigneeUserId: data.assigneeType === "user" && data.assigneeUserId ? data.assigneeUserId : null,
        issueId: data.issueId || null,
        dependsOn: data.dependsOn,
        position: (pipeline?.steps.length ?? 0),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.pipelines.detail(selectedCompanyId!, pipelineId!),
      });
      setAddingStep(false);
      setForm(EMPTY_FORM);
    },
  });
```

- [ ] **Step 5: Rewrite the steps list to use the vertical flowchart layout**

Replace the steps rendering section (lines 253-261) with:

```tsx
        <div className="flex flex-col items-center">
          {pipeline.steps.map((step, idx) => (
            <StepCard
              key={step.id}
              step={step}
              allSteps={pipeline.steps}
              agentNames={agentNames}
              memberNames={memberNames}
              isLast={idx === pipeline.steps.length - 1}
              onDelete={(id) => deleteStepMutation.mutate(id)}
            />
          ))}
        </div>
```

- [ ] **Step 6: Rewrite the add-step form with assignee type toggle + issue selector**

Replace the existing form (lines 265-330) with:

```tsx
        {addingStep && (
          <form
            onSubmit={handleAddStep}
            className="border border-border rounded-lg p-4 space-y-3 bg-card max-w-md mx-auto"
          >
            <p className="text-sm font-medium">New Step</p>
            <div className="space-y-2">
              <input
                autoFocus
                type="text"
                placeholder="Step name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full text-sm bg-background border border-border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-ring"
              />

              {/* Assignee type toggle */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Assignee</p>
                <div className="flex gap-1">
                  {(["agent", "user", ""] as const).map((type) => (
                    <button
                      key={type || "none"}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, assigneeType: type, agentId: "", assigneeUserId: "" }))}
                      className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                        form.assigneeType === type
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:bg-accent"
                      }`}
                    >
                      {type === "agent" ? "Agent" : type === "user" ? "User" : "None"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Agent selector */}
              {form.assigneeType === "agent" && (
                <select
                  value={form.agentId}
                  onChange={(e) => setForm((f) => ({ ...f, agentId: e.target.value }))}
                  className="w-full text-sm bg-background border border-border rounded px-2 py-1.5 outline-none"
                >
                  <option value="">Select agent...</option>
                  {agents.map((a: { id: string; name: string }) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}

              {/* User selector */}
              {form.assigneeType === "user" && (
                <select
                  value={form.assigneeUserId}
                  onChange={(e) => setForm((f) => ({ ...f, assigneeUserId: e.target.value }))}
                  className="w-full text-sm bg-background border border-border rounded px-2 py-1.5 outline-none"
                >
                  <option value="">Select member...</option>
                  {members
                    .filter((m: CompanyMember) => m.principalType === "user" && m.status === "active")
                    .map((m: CompanyMember) => (
                      <option key={m.principalId} value={m.principalId}>
                        {m.userDisplayName ?? m.userEmail ?? m.principalId.slice(0, 8)}
                      </option>
                    ))}
                </select>
              )}

              {/* Issue selector (optional) */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Link issue (optional)</p>
                <select
                  value={form.issueId}
                  onChange={(e) => setForm((f) => ({ ...f, issueId: e.target.value }))}
                  className="w-full text-sm bg-background border border-border rounded px-2 py-1.5 outline-none"
                >
                  <option value="">No linked issue</option>
                  {companyIssues.map((issue: { id: string; title: string; identifier?: string }) => (
                    <option key={issue.id} value={issue.id}>
                      {issue.identifier ? `${issue.identifier} - ` : ""}{issue.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dependencies */}
              {pipeline.steps.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Depends on:</p>
                  <div className="flex flex-wrap gap-1">
                    {pipeline.steps.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleDep(s.id)}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                          form.dependsOn.includes(s.id)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:bg-accent"
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={!form.name.trim() || createStepMutation.isPending}
              >
                Add
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setAddingStep(false); setForm(EMPTY_FORM); }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
```

- [ ] **Step 7: Commit**

```bash
git add ui/src/pages/PipelineDetail.tsx
git commit -m "feat(ui): vertical flowchart layout + mixed assignee form for pipeline detail"
```

---

## Task 9: Frontend — PipelineRunDetail Assignee Info

**Files:**
- Modify: `ui/src/pages/PipelineRunDetail.tsx:29-78` — update `RunStepRow`

- [ ] **Step 1: Add members query and show assignee type**

In `PipelineRunDetail`, add the members query and update `RunStepRow`. First, add the imports at the top:

```tsx
import { accessApi, type CompanyMember } from "../api/access";
```

Inside `PipelineRunDetail`, add after the `run` query (line 93):

```tsx
  const { data: members = [] } = useQuery({
    queryKey: queryKeys.access.members(selectedCompanyId!),
    queryFn: () => accessApi.listMembers(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agentNames: Record<string, string> = Object.fromEntries(
    agents.map((a: { id: string; name: string }) => [a.id, a.name]),
  );
  const memberNames: Record<string, string> = Object.fromEntries(
    members
      .filter((m: CompanyMember) => m.principalType === "user")
      .map((m: CompanyMember) => [m.principalId, m.userDisplayName ?? m.userEmail ?? m.principalId.slice(0, 8)]),
  );
```

Add the `agentsApi` import at the top:

```tsx
import { agentsApi } from "../api/agents";
```

- [ ] **Step 2: Update RunStepRow to show assignee label**

Update the `RunStepRow` component (line 29). Pass `agentNames` and `memberNames` as props, and add an assignee label after the step name badge:

```tsx
function RunStepRow({
  step,
  allSteps,
  agentNames,
  memberNames,
}: {
  step: PipelineRunStep;
  allSteps: PipelineRunStep[];
  agentNames: Record<string, string>;
  memberNames: Record<string, string>;
}) {
  const cfg = STATUS_CONFIG[step.status];
  const Icon = cfg.icon;
  const deps = step.dependsOn
    .map((depId) => {
      const dep = allSteps.find((s) => s.pipelineStepId === depId);
      return dep?.stepName ?? depId.slice(0, 8);
    })
    .join(", ");

  let assigneeLabel: string | null = null;
  if (step.assigneeType === "agent" && step.agentId) {
    assigneeLabel = `Agent: ${agentNames[step.agentId] ?? step.agentId.slice(0, 8)}`;
  } else if (step.assigneeType === "user" && step.assigneeUserId) {
    assigneeLabel = `User: ${memberNames[step.assigneeUserId] ?? step.assigneeUserId.slice(0, 8)}`;
  }

  return (
    <div className="flex items-start gap-3 px-4 py-3 border border-border rounded-lg">
      <Icon
        className={`h-4 w-4 mt-0.5 shrink-0 ${
          step.status === "running"
            ? "text-primary animate-pulse"
            : step.status === "completed"
              ? "text-green-500"
              : step.status === "failed"
                ? "text-destructive"
                : "text-muted-foreground"
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{step.stepName}</span>
          <Badge variant={cfg.variant} className="text-[10px] px-1.5 py-0">
            {cfg.label}
          </Badge>
        </div>
        {assigneeLabel && (
          <p className="text-xs text-muted-foreground mt-0.5">{assigneeLabel}</p>
        )}
        {deps && (
          <p className="text-xs text-muted-foreground mt-0.5">Depends on: {deps}</p>
        )}
        {step.issueId && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Issue: <span className="font-mono">{step.issueId.slice(0, 8)}...</span>
          </p>
        )}
        {step.error && (
          <p className="text-xs text-destructive mt-0.5">{step.error}</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update the RunStepRow invocations**

Update where `RunStepRow` is rendered (line 154-155) to pass the new props:

```tsx
          run.steps.map((step) => (
            <RunStepRow key={step.id} step={step} allSteps={run.steps} agentNames={agentNames} memberNames={memberNames} />
          ))
```

- [ ] **Step 4: Commit**

```bash
git add ui/src/pages/PipelineRunDetail.tsx
git commit -m "feat(ui): show assignee type in pipeline run detail"
```

---

## Task 10: Frontend — Create Pipeline from Issues

**Files:**
- Modify: `ui/src/components/IssuesList.tsx` — add multi-select + "Create Pipeline" action

- [ ] **Step 1: Add selection state and pipeline creation mutation**

In `IssuesList` component (after line 264 `currentUserId`), add:

```tsx
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<string>>(new Set());
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const [pipelineName, setPipelineName] = useState("");
  const navigate = useNavigate();

  const createPipelineMutation = useMutation({
    mutationFn: (data: { name: string; issueIds: string[] }) =>
      pipelinesApi.createFromIssues(selectedCompanyId!, data),
    onSuccess: (pipeline) => {
      setSelectedIssueIds(new Set());
      setShowPipelineModal(false);
      setPipelineName("");
      navigate(`/pipelines/${pipeline.id}`);
    },
  });

  const toggleIssueSelection = useCallback((issueId: string) => {
    setSelectedIssueIds((prev) => {
      const next = new Set(prev);
      if (next.has(issueId)) next.delete(issueId);
      else next.add(issueId);
      return next;
    });
  }, []);
```

Add the imports at the top of the file:

```tsx
import { useNavigate } from "@/lib/router";
import { pipelinesApi } from "../api/pipelines";
import { GitBranch } from "lucide-react";
```

- [ ] **Step 2: Add a select checkbox column to IssueRow rendering**

In the list rendering section (around line 718-744), wrap each `IssueRow` with a selection checkbox. Find where `IssueRow` is rendered inside `group.items.map` and add:

```tsx
              {group.items.map((issue) => (
                <div key={issue.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedIssueIds.has(issue.id)}
                    onCheckedChange={() => toggleIssueSelection(issue.id)}
                    className="shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <IssueRow
                      issue={issue}
                      agentName={agentName}
                      liveIssueIds={liveIssueIds}
                      issueLinkState={issueLinkState}
                      onUpdateIssue={onUpdateIssue}
                      assigneePickerIssueId={assigneePickerIssueId}
                      assigneeSearch={assigneeSearch}
                      onAssigneeSearchChange={setAssigneeSearch}
                      onToggleAssigneePicker={setAssigneePickerIssueId}
                      onAssign={assignIssue}
                      onDelete={(id) => deleteIssueMutation.mutate(id)}
                      agents={agents}
                      members={members}
                      currentUserId={currentUserId}
                    />
                  </div>
                </div>
              ))}
```

- [ ] **Step 3: Add floating action bar when issues are selected**

Add right before the closing `</div>` of the component (at the end of the return), before the final `</div>`:

```tsx
      {/* Floating action bar for multi-select */}
      {selectedIssueIds.size >= 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-card border border-border rounded-lg shadow-lg px-4 py-2.5">
          <span className="text-sm text-muted-foreground">
            {selectedIssueIds.size} issues selected
          </span>
          <Button
            size="sm"
            onClick={() => setShowPipelineModal(true)}
          >
            <GitBranch className="h-3.5 w-3.5 mr-1.5" />
            Create Pipeline
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedIssueIds(new Set())}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Create Pipeline Modal */}
      {showPipelineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-semibold">Create Pipeline from Issues</h3>
            <input
              autoFocus
              type="text"
              placeholder="Pipeline name"
              value={pipelineName}
              onChange={(e) => setPipelineName(e.target.value)}
              className="w-full text-sm bg-background border border-border rounded px-3 py-2 outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Steps (in order):</p>
              {Array.from(selectedIssueIds).map((id, idx) => {
                const issue = [...issues, ...searchedIssues].find((i) => i.id === id);
                return (
                  <div key={id} className="flex items-center gap-2 px-3 py-1.5 border border-border rounded text-sm">
                    <span className="text-muted-foreground text-xs w-5">{idx + 1}.</span>
                    <span className="flex-1 truncate">{issue?.title ?? id.slice(0, 8)}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowPipelineModal(false); setPipelineName(""); }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!pipelineName.trim() || createPipelineMutation.isPending}
                onClick={() => {
                  createPipelineMutation.mutate({
                    name: pipelineName.trim(),
                    issueIds: Array.from(selectedIssueIds),
                  });
                }}
              >
                Create
              </Button>
            </div>
          </div>
        </div>
      )}
```

Note: `searchedIssues` is already defined in the component at line 316.

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/IssuesList.tsx
git commit -m "feat(ui): multi-select issues + create pipeline from issues"
```

---

## Task 11: Final Integration Verification

- [ ] **Step 1: Verify TypeScript compilation**

Run:
```bash
cd /Users/pacosemino/Desktop/Paperclip/paperclip && npx tsc --noEmit
```

Fix any type errors that arise from the changes.

- [ ] **Step 2: Verify the migration file number doesn't conflict**

Check that `0060` is the next available number:
```bash
ls packages/db/src/migrations/ | tail -3
```

If `0060` already exists, rename the migration file to the next available number.

- [ ] **Step 3: Final commit with any fixups**

If any fixes were needed:
```bash
git add -A
git commit -m "fix: address type errors from pipeline improvements"
```
