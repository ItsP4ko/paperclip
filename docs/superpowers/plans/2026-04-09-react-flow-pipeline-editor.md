# React Flow Pipeline Editor + If/Else Branching — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static vertical CSS pipeline editor with an interactive React Flow canvas supporting drag & drop, auto-layout, and if/else branching steps.

**Architecture:** Add `position_x`, `position_y`, `step_type` to `pipeline_steps`. Build 7 new frontend components in `ui/src/components/pipeline/` using `@xyflow/react` + dagre for auto-layout. Add if/else execution logic with condition evaluation and cascade skip in the backend service. Replace PipelineDetail body with the canvas + side panel, and PipelineRunDetail with a read-only status canvas.

**Tech Stack:** @xyflow/react v12, dagre, Drizzle ORM, Express + Zod, React + TanStack Query, Tailwind/shadcn

---

## File Map

### Create:
- `packages/db/src/migrations/0061_pipeline_react_flow.sql` — migration
- `ui/src/components/pipeline/utils.ts` — steps-to-nodes/edges conversion
- `ui/src/components/pipeline/useAutoLayout.ts` — dagre layout hook
- `ui/src/components/pipeline/StepNode.tsx` — action step node
- `ui/src/components/pipeline/IfElseNode.tsx` — if/else branching node
- `ui/src/components/pipeline/AddStepEdge.tsx` — edge with "+" button
- `ui/src/components/pipeline/StepSidePanel.tsx` — slide-in edit panel
- `ui/src/components/pipeline/PipelineCanvas.tsx` — main canvas editor

### Modify:
- `packages/db/src/schema/pipelines.ts` — add 3 columns
- `server/src/services/pipelines.ts` — if/else logic, condition evaluator, cascade skip, batch positions
- `server/src/routes/pipelines.ts` — updated schemas, batch positions endpoint
- `ui/src/api/pipelines.ts` — updated types + batch positions method
- `ui/src/pages/PipelineDetail.tsx` — replace body with PipelineCanvas
- `ui/src/pages/PipelineRunDetail.tsx` — replace list with read-only canvas
- `ui/package.json` — add dependencies

---

## Task 1: Install Dependencies + Migration + Schema

**Files:**
- Create: `packages/db/src/migrations/0061_pipeline_react_flow.sql`
- Modify: `packages/db/src/schema/pipelines.ts:1-54`
- Modify: `ui/package.json`

- [ ] **Step 1: Install frontend dependencies**

```bash
cd /Users/pacosemino/Desktop/Paperclip/paperclip/ui && npm install @xyflow/react dagre @types/dagre
```

- [ ] **Step 2: Create the migration SQL file**

Write to `packages/db/src/migrations/0061_pipeline_react_flow.sql`:

```sql
-- 0061_pipeline_react_flow.sql
-- Add canvas position + step type for React Flow editor

ALTER TABLE pipeline_steps
  ADD COLUMN position_x real,
  ADD COLUMN position_y real,
  ADD COLUMN step_type text NOT NULL DEFAULT 'action';
```

- [ ] **Step 3: Update the Drizzle schema**

In `packages/db/src/schema/pipelines.ts`, add `real` to the import from `drizzle-orm/pg-core` (line 1):

```typescript
import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
```

Then add 3 new columns to `pipelineSteps` after `issueId` (after line 47):

```typescript
    positionX: real("position_x"),
    positionY: real("position_y"),
    stepType: text("step_type").notNull().default("action"),
```

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/migrations/0061_pipeline_react_flow.sql packages/db/src/schema/pipelines.ts ui/package.json ui/package-lock.json
git commit -m "feat(db): add position_x, position_y, step_type to pipeline_steps + install react flow deps"
```

---

## Task 2: Backend — Schema Updates, Batch Positions Endpoint

**Files:**
- Modify: `server/src/routes/pipelines.ts`
- Modify: `server/src/services/pipelines.ts`

- [ ] **Step 1: Update Zod schemas in routes**

In `server/src/routes/pipelines.ts`, update `createPipelineStepSchema` (line 25) to add 3 fields:

```typescript
const createPipelineStepSchema = z.object({
  name:           z.string().min(1),
  agentId:        z.string().optional(),
  assigneeType:   z.enum(["agent", "user"]).optional(),
  assigneeUserId: z.string().optional(),
  issueId:        z.string().optional(),
  dependsOn:      z.array(z.string()).optional(),
  position:       z.number().optional(),
  positionX:      z.number().optional(),
  positionY:      z.number().optional(),
  stepType:       z.enum(["action", "if_else"]).optional(),
  config:         z.record(z.unknown()).optional(),
});
```

Add a new schema after `createPipelineFromIssuesSchema`:

```typescript
const batchPositionsSchema = z.object({
  positions: z.array(z.object({
    stepId: z.string(),
    positionX: z.number(),
    positionY: z.number(),
  })).min(1),
});
```

- [ ] **Step 2: Add batch positions endpoint**

Add this route in `server/src/routes/pipelines.ts`, after the delete-step route and before the trigger-run route:

```typescript
  // Batch update step positions
  router.patch(
    "/companies/:companyId/pipelines/:pipelineId/steps/positions",
    validate(batchPositionsSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const pipelineId = req.params.pipelineId as string;
      assertCompanyAccess(req, companyId);
      const { positions } = req.body;
      await svc.batchUpdatePositions(companyId, pipelineId, positions);
      await redisClient?.del(`paperclip:pipeline:detail:${pipelineId}`).catch(() => null);
      res.json({ updated: positions.length });
    },
  );
```

**IMPORTANT:** This route must go BEFORE the `/:pipelineId/run` route since Express matches in order.

- [ ] **Step 3: Update service — createStep/updateStep to accept new fields**

In `server/src/services/pipelines.ts`, update `createStep` data parameter type to include:

```typescript
positionX?: number | null;
positionY?: number | null;
stepType?: "action" | "if_else" | null;
```

And add these to the insert values:

```typescript
positionX: data.positionX ?? null,
positionY: data.positionY ?? null,
stepType: data.stepType ?? "action",
```

Same for `updateStep` — add to both the data parameter type and ensure they get spread into the update set.

- [ ] **Step 4: Add `batchUpdatePositions` method to service**

Add after the `deleteStep` method:

```typescript
    batchUpdatePositions: async (
      companyId: string,
      pipelineId: string,
      positions: Array<{ stepId: string; positionX: number; positionY: number }>,
    ) => {
      // Verify pipeline belongs to company
      const [pipeline] = await db
        .select({ id: pipelines.id })
        .from(pipelines)
        .where(and(eq(pipelines.id, pipelineId), eq(pipelines.companyId, companyId)));
      if (!pipeline) return;

      for (const pos of positions) {
        await db
          .update(pipelineSteps)
          .set({ positionX: pos.positionX, positionY: pos.positionY, updatedAt: new Date() })
          .where(and(eq(pipelineSteps.id, pos.stepId), eq(pipelineSteps.pipelineId, pipelineId)));
      }
    },
```

- [ ] **Step 5: Update `getRunById` to include new fields**

In the `getRunById` method, add to the step mapping:

```typescript
stepType: s.step.stepType,
positionX: s.step.positionX,
positionY: s.step.positionY,
```

- [ ] **Step 6: Update route handlers for createStep/updateStep to pass new fields**

In the createStep route handler, add `positionX`, `positionY`, `stepType` to both the destructuring and the service call. Same for updateStep.

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/pipelines.ts server/src/services/pipelines.ts
git commit -m "feat(backend): batch positions endpoint, step type + position fields"
```

---

## Task 3: Backend — If/Else Execution Logic

**Files:**
- Modify: `server/src/services/pipelines.ts`

- [ ] **Step 1: Add `evaluateCondition` helper function**

Add inside `pipelineService`, before `evaluateReadySteps`:

```typescript
  function evaluateCondition(
    condition: { field: string; operator: string; value: unknown } | null,
    context: Record<string, unknown>,
  ): boolean {
    if (!condition) return true; // null = else branch, always matches as fallback
    const fieldValue = context[condition.field];
    switch (condition.operator) {
      case "eq":
        return fieldValue === condition.value;
      case "neq":
        return fieldValue !== condition.value;
      case "in":
        return Array.isArray(condition.value) && condition.value.includes(fieldValue);
      case "not_in":
        return Array.isArray(condition.value) && !condition.value.includes(fieldValue);
      default:
        return false;
    }
  }
```

- [ ] **Step 2: Add `cascadeSkip` helper function**

Add after `evaluateCondition`:

```typescript
  async function cascadeSkip(runId: string, stepIdsToSkip: string[]) {
    if (stepIdsToSkip.length === 0) return;

    // Mark these steps as skipped
    for (const stepId of stepIdsToSkip) {
      await db
        .update(pipelineRunSteps)
        .set({ status: "skipped", completedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(pipelineRunSteps.pipelineRunId, runId),
            eq(pipelineRunSteps.pipelineStepId, stepId),
            eq(pipelineRunSteps.status, "pending"),
          ),
        );
    }

    // Find downstream dependents that ONLY depend on skipped steps
    const allRunSteps = await db
      .select({ runStep: pipelineRunSteps, step: pipelineSteps })
      .from(pipelineRunSteps)
      .innerJoin(pipelineSteps, eq(pipelineRunSteps.pipelineStepId, pipelineSteps.id))
      .where(eq(pipelineRunSteps.pipelineRunId, runId));

    const skippedSet = new Set(stepIdsToSkip);
    const allSkippedAndCompleted = new Set(
      allRunSteps
        .filter((r) => r.runStep.status === "skipped" || r.runStep.status === "completed")
        .map((r) => r.runStep.pipelineStepId),
    );
    for (const id of stepIdsToSkip) allSkippedAndCompleted.add(id);

    const nextToSkip: string[] = [];
    for (const { runStep, step } of allRunSteps) {
      if (runStep.status !== "pending") continue;
      const deps = step.dependsOn ?? [];
      if (deps.length === 0) continue;
      // Skip if ALL dependencies are either skipped or in the skip set
      const allDepsSkipped = deps.every((d) => skippedSet.has(d) ||
        allRunSteps.find((r) => r.runStep.pipelineStepId === d && r.runStep.status === "skipped"));
      if (allDepsSkipped) {
        nextToSkip.push(step.id);
      }
    }

    if (nextToSkip.length > 0) {
      await cascadeSkip(runId, nextToSkip);
    }
  }
```

- [ ] **Step 3: Add if/else handling in `evaluateReadySteps`**

In the `evaluateReadySteps` function, after the `if (!allDepsCompleted) continue;` check (around line 44) and before the issue handling, add this block:

```typescript
      // Handle if/else steps - evaluate conditions, skip losing branches
      if (step.stepType === "if_else") {
        const config = step.config as { branches?: Array<{ id: string; label: string; condition: { field: string; operator: string; value: unknown } | null; nextStepIds: string[] }> };
        const branches = config.branches ?? [];

        // Build context from the most recently completed predecessor's issue
        let context: Record<string, unknown> = { projectId: run.projectId, triggeredBy: run.triggeredBy };
        const completedPredecessors = runStepRows.filter(
          (r) => r.runStep.status === "completed" && r.runStep.issueId && (step.dependsOn ?? []).includes(r.step.id),
        );
        if (completedPredecessors.length > 0) {
          const predIssueId = completedPredecessors[completedPredecessors.length - 1].runStep.issueId;
          if (predIssueId) {
            const [predIssue] = await db.select().from(issues).where(eq(issues.id, predIssueId));
            if (predIssue) {
              context = { ...context, status: predIssue.status, priority: predIssue.priority, assigneeAgentId: predIssue.assigneeAgentId, assigneeUserId: predIssue.assigneeUserId };
            }
          }
        }

        // Evaluate branches - first match wins, null condition = else (fallback)
        let winningBranchIdx = -1;
        for (let i = 0; i < branches.length; i++) {
          if (branches[i].condition === null) continue; // skip else for now
          if (evaluateCondition(branches[i].condition, context)) {
            winningBranchIdx = i;
            break;
          }
        }
        // If no condition matched, use the else branch (condition === null)
        if (winningBranchIdx === -1) {
          winningBranchIdx = branches.findIndex((b) => b.condition === null);
        }

        // Mark this if/else step as completed
        await db
          .update(pipelineRunSteps)
          .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
          .where(eq(pipelineRunSteps.id, runStep.id));
        completedStepIds.add(step.id);

        // Skip steps in losing branches
        const losingStepIds: string[] = [];
        for (let i = 0; i < branches.length; i++) {
          if (i !== winningBranchIdx) {
            losingStepIds.push(...(branches[i].nextStepIds ?? []));
          }
        }
        if (losingStepIds.length > 0) {
          await cascadeSkip(runId, losingStepIds);
        }

        continue; // skip the normal issue-creation flow for if/else
      }
```

- [ ] **Step 4: Commit**

```bash
git add server/src/services/pipelines.ts
git commit -m "feat(service): if/else execution with condition evaluation + cascade skip"
```

---

## Task 4: Frontend API Types Update

**Files:**
- Modify: `ui/src/api/pipelines.ts`

- [ ] **Step 1: Update `PipelineStep` interface**

Add after `position` (line 24):

```typescript
  positionX: number | null;
  positionY: number | null;
  stepType: "action" | "if_else";
```

- [ ] **Step 2: Update `PipelineRunStep` interface**

Add after `position` (line 60):

```typescript
  positionX: number | null;
  positionY: number | null;
  stepType: "action" | "if_else";
```

- [ ] **Step 3: Update `createStep` data param**

Add to the data object in `createStep` (line 96):

```typescript
  positionX?: number;
  positionY?: number;
  stepType?: "action" | "if_else";
```

- [ ] **Step 4: Update `updateStep` data param**

Expand the data param in `updateStep` (line 112) to include all fields:

```typescript
  updateStep: (
    companyId: string,
    pipelineId: string,
    stepId: string,
    data: {
      name?: string;
      agentId?: string | null;
      assigneeType?: "agent" | "user";
      assigneeUserId?: string | null;
      issueId?: string | null;
      dependsOn?: string[];
      position?: number;
      positionX?: number;
      positionY?: number;
      stepType?: "action" | "if_else";
      config?: Record<string, unknown>;
    },
  ) =>
    api.patch<PipelineStep>(
      `/companies/${companyId}/pipelines/${pipelineId}/steps/${stepId}`,
      data,
    ),
```

- [ ] **Step 5: Add `batchUpdatePositions` method**

Add after `deleteStep`:

```typescript
  batchUpdatePositions: (
    companyId: string,
    pipelineId: string,
    positions: Array<{ stepId: string; positionX: number; positionY: number }>,
  ) =>
    api.patch<{ updated: number }>(
      `/companies/${companyId}/pipelines/${pipelineId}/steps/positions`,
      { positions },
    ),
```

- [ ] **Step 6: Commit**

```bash
git add ui/src/api/pipelines.ts
git commit -m "feat(ui-api): add stepType, positionX/Y, batchUpdatePositions"
```

---

## Task 5: Frontend — Utility Functions (utils.ts)

**Files:**
- Create: `ui/src/components/pipeline/utils.ts`

- [ ] **Step 1: Create the conversion utilities**

Write to `ui/src/components/pipeline/utils.ts`:

```typescript
import type { Node, Edge } from "@xyflow/react";
import type { PipelineStep } from "../../api/pipelines";

export type StepNodeData = {
  step: PipelineStep;
  agentNames: Record<string, string>;
  memberNames: Record<string, string>;
  onEdit: (stepId: string) => void;
  onDelete: (stepId: string) => void;
};

export type IfElseNodeData = {
  step: PipelineStep;
  onEdit: (stepId: string) => void;
  onDelete: (stepId: string) => void;
};

export function stepsToNodes(
  steps: PipelineStep[],
  agentNames: Record<string, string>,
  memberNames: Record<string, string>,
  onEdit: (stepId: string) => void,
  onDelete: (stepId: string) => void,
): Node[] {
  return steps.map((step) => ({
    id: step.id,
    type: step.stepType === "if_else" ? "ifElse" : "stepNode",
    position: { x: step.positionX ?? 0, y: step.positionY ?? 0 },
    data: step.stepType === "if_else"
      ? { step, onEdit, onDelete }
      : { step, agentNames, memberNames, onEdit, onDelete },
  }));
}

export function stepsToEdges(steps: PipelineStep[]): Edge[] {
  const edges: Edge[] = [];

  for (const step of steps) {
    // Regular dependsOn edges
    for (const depId of step.dependsOn) {
      const sourceStep = steps.find((s) => s.id === depId);

      // Check if this edge comes from a specific if/else branch
      let sourceHandle: string | undefined;
      if (sourceStep?.stepType === "if_else") {
        const config = sourceStep.config as { branches?: Array<{ id: string; nextStepIds: string[] }> };
        const branch = config.branches?.find((b) => b.nextStepIds.includes(step.id));
        if (branch) sourceHandle = branch.id;
      }

      edges.push({
        id: `${depId}-${step.id}`,
        source: depId,
        target: step.id,
        sourceHandle,
        type: "addStep",
        animated: false,
      });
    }
  }

  return edges;
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/pipeline/utils.ts
git commit -m "feat(ui): pipeline canvas utility functions"
```

---

## Task 6: Frontend — useAutoLayout Hook

**Files:**
- Create: `ui/src/components/pipeline/useAutoLayout.ts`

- [ ] **Step 1: Create the dagre auto-layout hook**

Write to `ui/src/components/pipeline/useAutoLayout.ts`:

```typescript
import { useMemo } from "react";
import dagre from "dagre";
import type { Node, Edge } from "@xyflow/react";

const NODE_WIDTH = 280;
const NODE_HEIGHT = 80;
const IF_ELSE_HEIGHT = 60;

export function useAutoLayout(nodes: Node[], edges: Edge[]): Node[] {
  return useMemo(() => {
    // Separate nodes that need layout (null positions) from manually placed ones
    const needsLayout = nodes.some((n) => n.position.x === 0 && n.position.y === 0);
    if (!needsLayout) return nodes;

    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 100 });
    g.setDefaultEdgeLabel(() => ({}));

    for (const node of nodes) {
      const height = node.type === "ifElse" ? IF_ELSE_HEIGHT : NODE_HEIGHT;
      g.setNode(node.id, { width: NODE_WIDTH, height });
    }
    for (const edge of edges) {
      g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    return nodes.map((node) => {
      // Only auto-layout nodes that have no saved position (both 0)
      if (node.position.x !== 0 || node.position.y !== 0) return node;

      const nodeWithPosition = g.node(node.id);
      if (!nodeWithPosition) return node;

      return {
        ...node,
        position: {
          x: nodeWithPosition.x - NODE_WIDTH / 2,
          y: nodeWithPosition.y - (node.type === "ifElse" ? IF_ELSE_HEIGHT : NODE_HEIGHT) / 2,
        },
      };
    });
  }, [nodes, edges]);
}

export function computeFullLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 100 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    const height = node.type === "ifElse" ? IF_ELSE_HEIGHT : NODE_HEIGHT;
    g.setNode(node.id, { width: NODE_WIDTH, height });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const np = g.node(node.id);
    if (!np) return node;
    const height = node.type === "ifElse" ? IF_ELSE_HEIGHT : NODE_HEIGHT;
    return { ...node, position: { x: np.x - NODE_WIDTH / 2, y: np.y - height / 2 } };
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/pipeline/useAutoLayout.ts
git commit -m "feat(ui): dagre auto-layout hook for pipeline canvas"
```

---

## Task 7: Frontend — StepNode + IfElseNode + AddStepEdge

**Files:**
- Create: `ui/src/components/pipeline/StepNode.tsx`
- Create: `ui/src/components/pipeline/IfElseNode.tsx`
- Create: `ui/src/components/pipeline/AddStepEdge.tsx`

- [ ] **Step 1: Create StepNode**

Write to `ui/src/components/pipeline/StepNode.tsx`:

```tsx
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Trash2, Pencil } from "lucide-react";
import type { StepNodeData } from "./utils";

export const StepNode = memo(function StepNode({ data }: NodeProps) {
  const { step, agentNames, memberNames, onEdit, onDelete } = data as StepNodeData;

  let assigneeLabel: string | null = null;
  if (step.assigneeType === "agent" && step.agentId) {
    assigneeLabel = `Agent: ${agentNames[step.agentId] ?? step.agentId.slice(0, 8)}`;
  } else if (step.assigneeType === "user" && step.assigneeUserId) {
    assigneeLabel = `User: ${memberNames[step.assigneeUserId] ?? step.assigneeUserId.slice(0, 8)}`;
  }

  return (
    <div className="group w-[280px] border border-border rounded-lg bg-card shadow-[2px_2px_0px_0px_rgba(0,0,0,0.05)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.03)] px-4 py-3">
      <Handle type="target" position={Position.Top} className="!bg-border !w-2 !h-2" />
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium block truncate">{step.name}</span>
          {assigneeLabel && (
            <span className="text-xs text-muted-foreground block mt-0.5">{assigneeLabel}</span>
          )}
          {step.issueId && (
            <span className="text-xs text-muted-foreground block mt-0.5">
              Issue: {step.issueId.slice(0, 8)}...
            </span>
          )}
        </div>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(step.id)} className="p-1 rounded hover:bg-accent">
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </button>
          <button onClick={() => onDelete(step.id)} className="p-1 rounded hover:bg-accent">
            <Trash2 className="h-3 w-3 text-destructive" />
          </button>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-border !w-2 !h-2" />
    </div>
  );
});
```

- [ ] **Step 2: Create IfElseNode**

Write to `ui/src/components/pipeline/IfElseNode.tsx`:

```tsx
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Trash2, Pencil, GitFork } from "lucide-react";
import type { IfElseNodeData } from "./utils";

type Branch = { id: string; label: string; condition: { field: string; operator: string; value: unknown } | null };

export const IfElseNode = memo(function IfElseNode({ data }: NodeProps) {
  const { step, onEdit, onDelete } = data as IfElseNodeData;
  const config = step.config as { branches?: Branch[] };
  const branches = config.branches ?? [];

  return (
    <div className="group w-[280px] border-2 border-amber-500/50 rounded-lg bg-card shadow-[2px_2px_0px_0px_rgba(0,0,0,0.05)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.03)] px-4 py-3">
      <Handle type="target" position={Position.Top} className="!bg-amber-500 !w-2 !h-2" />
      <div className="flex items-start gap-2">
        <GitFork className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium block truncate">{step.name}</span>
          <span className="text-xs text-muted-foreground block mt-0.5">
            {branches.length} branches
          </span>
        </div>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(step.id)} className="p-1 rounded hover:bg-accent">
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </button>
          <button onClick={() => onDelete(step.id)} className="p-1 rounded hover:bg-accent">
            <Trash2 className="h-3 w-3 text-destructive" />
          </button>
        </div>
      </div>
      {/* One output handle per branch */}
      {branches.map((branch, idx) => (
        <Handle
          key={branch.id}
          type="source"
          position={Position.Bottom}
          id={branch.id}
          className="!bg-amber-500 !w-2 !h-2"
          style={{ left: `${((idx + 1) / (branches.length + 1)) * 100}%` }}
        />
      ))}
    </div>
  );
});
```

- [ ] **Step 3: Create AddStepEdge**

Write to `ui/src/components/pipeline/AddStepEdge.tsx`:

```tsx
import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { Plus } from "lucide-react";

interface AddStepEdgeData {
  onAddStep?: (sourceId: string, targetId: string) => void;
}

export const AddStepEdge = memo(function AddStepEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, source, target } = props;
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  });

  const edgeData = data as AddStepEdgeData | undefined;

  return (
    <>
      <BaseEdge id={id} path={edgePath} className="!stroke-border" />
      <EdgeLabelRenderer>
        <button
          className="absolute flex items-center justify-center w-5 h-5 rounded-full bg-background border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          onClick={() => edgeData?.onAddStep?.(source, target)}
        >
          <Plus className="h-3 w-3" />
        </button>
      </EdgeLabelRenderer>
    </>
  );
});
```

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/pipeline/StepNode.tsx ui/src/components/pipeline/IfElseNode.tsx ui/src/components/pipeline/AddStepEdge.tsx
git commit -m "feat(ui): custom React Flow nodes (StepNode, IfElseNode) and AddStepEdge"
```

---

## Task 8: Frontend — StepSidePanel

**Files:**
- Create: `ui/src/components/pipeline/StepSidePanel.tsx`

- [ ] **Step 1: Create the side panel component**

Write to `ui/src/components/pipeline/StepSidePanel.tsx`. This is a slide-in panel from the right that handles editing for both action and if/else steps. It receives the selected step, agents, members, issues, and all steps (for dependency checkboxes). It includes:

- Name input
- For action: assignee type toggle (Agent/User/None), agent/user selectors, issue selector
- For if_else: branch editor with condition fields (field, operator, value)
- Dependency checkboxes
- Save and Close buttons

```tsx
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { PipelineStep } from "../../api/pipelines";
import type { CompanyMember } from "../../api/access";

interface StepSidePanelProps {
  step: PipelineStep;
  allSteps: PipelineStep[];
  agents: Array<{ id: string; name: string }>;
  members: CompanyMember[];
  issues: Array<{ id: string; title: string; identifier?: string }>;
  onSave: (stepId: string, data: Record<string, unknown>) => void;
  onClose: () => void;
}

type BranchForm = {
  id: string;
  label: string;
  condition: { field: string; operator: string; value: string } | null;
  nextStepIds: string[];
};

const FIELDS = ["status", "priority", "assigneeAgentId", "assigneeUserId"];
const OPERATORS = [
  { value: "eq", label: "Equals" },
  { value: "neq", label: "Not equals" },
  { value: "in", label: "In list" },
  { value: "not_in", label: "Not in list" },
];

export function StepSidePanel({ step, allSteps, agents, members, issues, onSave, onClose }: StepSidePanelProps) {
  const [name, setName] = useState(step.name);
  const [assigneeType, setAssigneeType] = useState<"agent" | "user" | "">(step.assigneeType ?? "");
  const [agentId, setAgentId] = useState(step.agentId ?? "");
  const [assigneeUserId, setAssigneeUserId] = useState(step.assigneeUserId ?? "");
  const [issueId, setIssueId] = useState(step.issueId ?? "");
  const [dependsOn, setDependsOn] = useState<string[]>(step.dependsOn);
  const [branches, setBranches] = useState<BranchForm[]>(() => {
    const config = step.config as { branches?: BranchForm[] };
    return config.branches ?? [
      { id: "branch-yes", label: "Yes", condition: { field: "status", operator: "eq", value: "done" }, nextStepIds: [] },
      { id: "branch-no", label: "No", condition: null, nextStepIds: [] },
    ];
  });

  useEffect(() => {
    setName(step.name);
    setAssigneeType(step.assigneeType ?? "");
    setAgentId(step.agentId ?? "");
    setAssigneeUserId(step.assigneeUserId ?? "");
    setIssueId(step.issueId ?? "");
    setDependsOn(step.dependsOn);
    const config = step.config as { branches?: BranchForm[] };
    setBranches(config.branches ?? [
      { id: "branch-yes", label: "Yes", condition: { field: "status", operator: "eq", value: "done" }, nextStepIds: [] },
      { id: "branch-no", label: "No", condition: null, nextStepIds: [] },
    ]);
  }, [step]);

  function handleSave() {
    const data: Record<string, unknown> = { name, dependsOn };
    if (step.stepType === "action") {
      data.assigneeType = assigneeType || undefined;
      data.agentId = assigneeType === "agent" ? agentId || null : null;
      data.assigneeUserId = assigneeType === "user" ? assigneeUserId || null : null;
      data.issueId = issueId || null;
    } else {
      data.config = { branches };
    }
    onSave(step.id, data);
  }

  const otherSteps = allSteps.filter((s) => s.id !== step.id);

  return (
    <div className="w-80 border-l border-border bg-card h-full overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">
          {step.stepType === "if_else" ? "Edit Condition" : "Edit Step"}
        </span>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Name */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full text-sm bg-background border border-border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Action step fields */}
      {step.stepType === "action" && (
        <>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Assignee</label>
            <div className="flex gap-1">
              {(["agent", "user", ""] as const).map((type) => (
                <button
                  key={type || "none"}
                  onClick={() => { setAssigneeType(type); setAgentId(""); setAssigneeUserId(""); }}
                  className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                    assigneeType === type
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-accent"
                  }`}
                >
                  {type === "agent" ? "Agent" : type === "user" ? "User" : "None"}
                </button>
              ))}
            </div>
          </div>
          {assigneeType === "agent" && (
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="w-full text-sm bg-background border border-border rounded px-2 py-1.5 outline-none">
              <option value="">Select agent...</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          {assigneeType === "user" && (
            <select value={assigneeUserId} onChange={(e) => setAssigneeUserId(e.target.value)} className="w-full text-sm bg-background border border-border rounded px-2 py-1.5 outline-none">
              <option value="">Select member...</option>
              {members.filter((m) => m.principalType === "user" && m.status === "active").map((m) => (
                <option key={m.principalId} value={m.principalId}>{m.userDisplayName ?? m.userEmail ?? m.principalId.slice(0, 8)}</option>
              ))}
            </select>
          )}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Linked issue</label>
            <select value={issueId} onChange={(e) => setIssueId(e.target.value)} className="w-full text-sm bg-background border border-border rounded px-2 py-1.5 outline-none">
              <option value="">None</option>
              {issues.map((i) => <option key={i.id} value={i.id}>{i.identifier ? `${i.identifier} - ` : ""}{i.title}</option>)}
            </select>
          </div>
        </>
      )}

      {/* If/Else branch editor */}
      {step.stepType === "if_else" && (
        <div className="space-y-3">
          <label className="text-xs text-muted-foreground">Branches</label>
          {branches.map((branch, idx) => (
            <div key={branch.id} className="border border-border rounded p-2 space-y-2">
              <input
                type="text"
                value={branch.label}
                onChange={(e) => {
                  const next = [...branches];
                  next[idx] = { ...next[idx], label: e.target.value };
                  setBranches(next);
                }}
                className="w-full text-sm bg-background border border-border rounded px-2 py-1 outline-none"
                placeholder="Branch label"
              />
              {branch.condition !== null ? (
                <div className="flex gap-1">
                  <select value={branch.condition.field} onChange={(e) => {
                    const next = [...branches];
                    next[idx] = { ...next[idx], condition: { ...branch.condition!, field: e.target.value } };
                    setBranches(next);
                  }} className="flex-1 text-xs bg-background border border-border rounded px-1.5 py-1 outline-none">
                    {FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <select value={branch.condition.operator} onChange={(e) => {
                    const next = [...branches];
                    next[idx] = { ...next[idx], condition: { ...branch.condition!, operator: e.target.value } };
                    setBranches(next);
                  }} className="w-20 text-xs bg-background border border-border rounded px-1.5 py-1 outline-none">
                    {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input value={branch.condition.value} onChange={(e) => {
                    const next = [...branches];
                    next[idx] = { ...next[idx], condition: { ...branch.condition!, value: e.target.value } };
                    setBranches(next);
                  }} className="flex-1 text-xs bg-background border border-border rounded px-1.5 py-1 outline-none" placeholder="value" />
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">Else (default branch)</span>
              )}
              {/* nextStepIds selector */}
              <div>
                <span className="text-[10px] text-muted-foreground">Next steps:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {otherSteps.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        const next = [...branches];
                        const ids = next[idx].nextStepIds.includes(s.id)
                          ? next[idx].nextStepIds.filter((id) => id !== s.id)
                          : [...next[idx].nextStepIds, s.id];
                        next[idx] = { ...next[idx], nextStepIds: ids };
                        setBranches(next);
                      }}
                      className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        branch.nextStepIds.includes(s.id)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:bg-accent"
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dependencies (fallback) */}
      {otherSteps.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Depends on</label>
          <div className="flex flex-wrap gap-1">
            {otherSteps.map((s) => (
              <button
                key={s.id}
                onClick={() => setDependsOn((prev) =>
                  prev.includes(s.id) ? prev.filter((d) => d !== s.id) : [...prev, s.id]
                )}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                  dependsOn.includes(s.id)
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

      <Button size="sm" onClick={handleSave} disabled={!name.trim()}>Save</Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/pipeline/StepSidePanel.tsx
git commit -m "feat(ui): step side panel for action + if/else editing"
```

---

## Task 9: Frontend — PipelineCanvas (Main Component)

**Files:**
- Create: `ui/src/components/pipeline/PipelineCanvas.tsx`

- [ ] **Step 1: Create the main canvas component**

Write to `ui/src/components/pipeline/PipelineCanvas.tsx`:

```tsx
import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Connection,
  type NodeDragHandler,
  type OnConnect,
  type OnNodesDelete,
  addEdge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { PipelineStep } from "../../api/pipelines";
import type { CompanyMember } from "../../api/access";
import { stepsToNodes, stepsToEdges } from "./utils";
import { useAutoLayout, computeFullLayout } from "./useAutoLayout";
import { StepNode } from "./StepNode";
import { IfElseNode } from "./IfElseNode";
import { AddStepEdge } from "./AddStepEdge";
import { Button } from "@/components/ui/button";
import { LayoutGrid, Plus, GitFork } from "lucide-react";

const nodeTypes = { stepNode: StepNode, ifElse: IfElseNode };
const edgeTypes = { addStep: AddStepEdge };

interface PipelineCanvasProps {
  steps: PipelineStep[];
  agents: Array<{ id: string; name: string }>;
  members: CompanyMember[];
  agentNames: Record<string, string>;
  memberNames: Record<string, string>;
  onUpdateStepPosition: (stepId: string, positionX: number, positionY: number) => void;
  onUpdateStepDeps: (stepId: string, dependsOn: string[]) => void;
  onDeleteStep: (stepId: string) => void;
  onSelectStep: (stepId: string | null) => void;
  onAddStep: (type: "action" | "if_else") => void;
  onAutoLayout: (positions: Array<{ stepId: string; positionX: number; positionY: number }>) => void;
}

export function PipelineCanvas({
  steps,
  agents,
  members,
  agentNames,
  memberNames,
  onUpdateStepPosition,
  onUpdateStepDeps,
  onDeleteStep,
  onSelectStep,
  onAddStep,
  onAutoLayout,
}: PipelineCanvasProps) {
  const rawNodes = useMemo(
    () => stepsToNodes(steps, agentNames, memberNames, (id) => onSelectStep(id), onDeleteStep),
    [steps, agentNames, memberNames, onSelectStep, onDeleteStep],
  );
  const rawEdges = useMemo(() => stepsToEdges(steps), [steps]);

  const layoutNodes = useAutoLayout(rawNodes, rawEdges);
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rawEdges);

  // Sync when steps change externally
  useMemo(() => {
    setNodes(layoutNodes);
    setEdges(rawEdges);
  }, [layoutNodes, rawEdges, setNodes, setEdges]);

  const onNodeDragStop: NodeDragHandler = useCallback(
    (_event, node) => {
      onUpdateStepPosition(node.id, node.position.x, node.position.y);
    },
    [onUpdateStepPosition],
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.target) return;
      const targetStep = steps.find((s) => s.id === connection.target);
      if (targetStep) {
        const newDeps = [...new Set([...targetStep.dependsOn, connection.source])];
        onUpdateStepDeps(connection.target, newDeps);
      }
      setEdges((eds) => addEdge({ ...connection, type: "addStep" }, eds));
    },
    [steps, onUpdateStepDeps, setEdges],
  );

  const onNodesDelete: OnNodesDelete = useCallback(
    (deleted) => {
      for (const node of deleted) {
        onDeleteStep(node.id);
      }
    },
    [onDeleteStep],
  );

  const handleAutoLayout = useCallback(() => {
    const reLayout = computeFullLayout(nodes, edges);
    setNodes(reLayout);
    onAutoLayout(reLayout.map((n) => ({ stepId: n.id, positionX: n.position.x, positionY: n.position.y })));
  }, [nodes, edges, setNodes, onAutoLayout]);

  return (
    <div className="flex-1 h-full relative">
      {/* Toolbar */}
      <div className="absolute top-3 left-3 z-10 flex gap-1.5">
        <Button size="sm" variant="outline" onClick={() => onAddStep("action")}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Action
        </Button>
        <Button size="sm" variant="outline" onClick={() => onAddStep("if_else")}>
          <GitFork className="h-3.5 w-3.5 mr-1" />
          If/Else
        </Button>
        <Button size="sm" variant="ghost" onClick={handleAutoLayout}>
          <LayoutGrid className="h-3.5 w-3.5 mr-1" />
          Auto-layout
        </Button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onNodeClick={(_event, node) => onSelectStep(node.id)}
        onPaneClick={() => onSelectStep(null)}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode="Delete"
        className="bg-background"
      >
        <Background gap={20} size={1} className="!bg-muted/30" />
        <Controls className="!bg-card !border-border !shadow-sm" />
        <MiniMap className="!bg-card !border-border" />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/pipeline/PipelineCanvas.tsx
git commit -m "feat(ui): PipelineCanvas main React Flow editor component"
```

---

## Task 10: Frontend — Rewrite PipelineDetail + PipelineRunDetail

**Files:**
- Modify: `ui/src/pages/PipelineDetail.tsx`
- Modify: `ui/src/pages/PipelineRunDetail.tsx`

- [ ] **Step 1: Rewrite PipelineDetail.tsx**

This is a major rewrite. The key changes:

1. Remove the old `StepCard` component, old `StepFormData`, and the inline form
2. Import and use `PipelineCanvas` and `StepSidePanel`
3. Add state for `selectedStepId` and add-step mode
4. Wire up mutations for position updates, dependency updates, step creation, step editing
5. Layout: header + (canvas | side panel)

Read the current file, then replace the entire component body (keeping the header + breadcrumbs structure). The page structure becomes:

- Header with back button, name, View Runs, Run button (unchanged)
- Body: `flex` row with `PipelineCanvas` (flex-1) and optional `StepSidePanel` (w-80, shown when a step is selected)

Key mutations to add:
- `updatePositionMutation` — calls `pipelinesApi.updateStep` with positionX/Y
- `batchPositionsMutation` — calls `pipelinesApi.batchUpdatePositions`
- `updateDepsMutation` — calls `pipelinesApi.updateStep` with dependsOn
- `updateStepMutation` — calls `pipelinesApi.updateStep` with all fields from side panel
- Keep existing `createStepMutation` and `deleteStepMutation`, update createStep to accept `stepType`

The `onAddStep` callback should open the side panel with a new empty step form (pre-filled with `stepType`).

For creating new steps: when user clicks "Add Action" or "Add If/Else" in the toolbar, create the step immediately via API with a default name ("New Action" / "New Condition") and then select it for editing in the side panel.

- [ ] **Step 2: Rewrite PipelineRunDetail.tsx with read-only canvas**

Replace the list-based `RunStepRow` rendering with a read-only React Flow canvas. Import the same `stepsToNodes`/`stepsToEdges` utilities but:
- Pass `onEdit: () => {}` and `onDelete: () => {}` (no-ops)
- Use `useAutoLayout` for positioning
- Set `nodesDraggable={false}`, `nodesConnectable={false}`, `elementsSelectable={false}`
- Apply status-based styling to nodes via a wrapper that reads `step.status` and adds border color classes:
  - pending: `border-muted-foreground/30`
  - running: `border-blue-500 animate-pulse`
  - completed: `border-green-500`
  - failed: `border-destructive`
  - skipped: `opacity-50 border-muted-foreground/20`

Since nodes are custom components, the status coloring should be done by passing status info through the node data. Add a `RunStepNode` variant or pass a `runStatus` field in the node data.

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/PipelineDetail.tsx ui/src/pages/PipelineRunDetail.tsx
git commit -m "feat(ui): replace pipeline pages with React Flow canvas editor + read-only run view"
```

---

## Task 11: Final Integration Verification

- [ ] **Step 1: Verify TypeScript compilation**

```bash
cd /Users/pacosemino/Desktop/Paperclip/paperclip && npx tsc --noEmit 2>&1 | grep "error TS" | head -20
```

Fix any type errors.

- [ ] **Step 2: Verify migration number doesn't conflict**

```bash
ls packages/db/src/migrations/ | tail -3
```

If `0061` conflicts, rename.

- [ ] **Step 3: Commit any fixups**

```bash
git add -A
git commit -m "fix: address type errors from React Flow pipeline editor"
```
