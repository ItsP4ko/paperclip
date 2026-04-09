# React Flow Pipeline Editor + If/Else Branching

**Date:** 2026-04-09
**Status:** Approved
**Branch:** feature/pipeline-react-flow (from developer)
**Depends on:** feature/pipeline-assignee-issues (merged first)

---

## Problem

The current pipeline editor uses a static vertical CSS layout. It cannot handle:
- Branching workflows (if/else paths)
- Drag & drop repositioning of steps
- Visual connections between steps (edges/cables)
- Complex dependency graphs beyond linear sequences

## Solution

Replace the vertical layout with `@xyflow/react` (React Flow) canvas editor. Add dagre auto-layout with manual override. Introduce `if_else` as the first branching step type.

---

## 1. Database Schema Changes

### New columns on `pipeline_steps`:

| Column | Type | Nullable | Description |
|---|---|---|---|
| `position_x` | `real` (float) | yes | X coordinate on canvas. null = auto-layout |
| `position_y` | `real` (float) | yes | Y coordinate on canvas. null = auto-layout |
| `step_type` | `text` (NOT NULL, default `'action'`) | no | `"action"` \| `"if_else"` |

### Migration (non-destructive):

```sql
ALTER TABLE pipeline_steps
  ADD COLUMN position_x real,
  ADD COLUMN position_y real,
  ADD COLUMN step_type text NOT NULL DEFAULT 'action';
```

Existing steps remain as `action` with null positions (dagre auto-calculates).

### If/Else branch config:

Stored in the existing `config` jsonb field:

```typescript
// config for step_type = "if_else"
{
  branches: [
    {
      id: "branch-1",
      label: "Yes",
      condition: { field: "status", operator: "eq", value: "done" },
      nextStepIds: ["step-uuid-1"]
    },
    {
      id: "branch-2",
      label: "No",
      condition: null,  // default/else branch
      nextStepIds: ["step-uuid-2"]
    }
  ]
}
```

Steps downstream of an if/else have the if/else step ID in their `dependsOn`. The specific branch is resolved at execution time by evaluating conditions.

---

## 2. React Flow Editor — Component Architecture

### New components (all in `ui/src/components/pipeline/`):

**`PipelineCanvas.tsx`** — main component wrapping `<ReactFlow>`:
- Receives `steps: PipelineStep[]` and mutation callbacks
- Converts steps to React Flow nodes and edges via `utils.ts`
- Handles: `onNodeDragStop` (auto-save position), `onConnect` (create dependency), `onNodesDelete`
- Uses dagre for auto-layout of nodes without saved positions

**`StepNode.tsx`** — custom node for `action` steps:
- Shows: name, assignee type/name, linked issue
- Output handle (bottom), input handle (top)
- Hover buttons: edit, delete
- Card style with depth shadow (matching current design)

**`IfElseNode.tsx`** — custom node for `if_else` steps:
- Visual indicator of branching (diamond shape or labeled card)
- Multiple output handles (one per branch: "Yes", "No")
- Single input handle (top)
- Shows condition summary

**`AddStepEdge.tsx`** — custom edge with "+" button at midpoint:
- Click "+" opens add-step panel to insert a step at that position in the flow

**`StepSidePanel.tsx`** — slide-in panel from right on node selection:
- Edit step name, assignee (agent/user toggle), linked issue
- For if/else: edit branch conditions
- Dependency checkboxes (fallback alongside drag-to-connect)
- Closes on click outside or X button

**`useAutoLayout.ts`** — hook for dagre layout calculation:
- `dagre.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 100 })`
- Only calculates positions for nodes where `positionX === null`
- Nodes with saved positions are placed at their coordinates
- Returns positioned nodes array

**`utils.ts`** — conversion functions:
- `stepsToNodes(steps)` — converts PipelineStep[] to React Flow Node[]
- `stepsToEdges(steps)` — converts dependsOn + if/else branches to Edge[]
- `nodeChangeToPosition(change)` — extracts position from drag event

### Layout engine behavior:

- Default: dagre auto-layout (TB direction) for all nodes without saved positions
- On drag-end: save positionX/Y to DB via PATCH
- "Auto-layout" button: recalculates all positions via dagre, saves via batch endpoint
- Mix allowed: some nodes auto-positioned, some manually placed

### Data flow:

```
DB steps --> stepsToNodes(steps) --> dagre layout (null positions) --> ReactFlow renders
User drags --> onNodeDragStop --> PATCH /steps/:id { positionX, positionY }
User connects --> onConnect --> PATCH source step { dependsOn: [..., targetId] }
User adds step --> click "+" on edge or toolbar --> side panel --> POST /steps
Auto-layout button --> dagre all --> PATCH /steps/positions (batch)
```

---

## 3. If/Else Step — Execution Logic

### In `evaluateReadySteps`:

When a step with `step_type = "if_else"` is ready (dependencies met):

1. **Does not create an issue** (it's logic, not a task)
2. **Evaluates conditions** against the execution context:
   - Context = data from the issue of the most recently completed predecessor step
   - Fields available: `status`, `priority`, `assigneeAgentId`, `assigneeUserId`
   - Also: pipeline run properties (`projectId`, `triggeredBy`)
3. **Determines winning branch**: first branch whose condition evaluates to true. If no condition matches, the branch with `condition: null` (else) wins.
4. **Marks the if/else step as `completed`** immediately
5. **Skips losing branches**: steps whose IDs appear in losing branch `nextStepIds` are marked `skipped`. Their downstream dependents are also marked `skipped` in cascade.
6. **Continues evaluation** for winning branch steps normally

### Condition operators (v1):

| Operator | Description | Example |
|---|---|---|
| `eq` | Equals | `{ field: "status", operator: "eq", value: "done" }` |
| `neq` | Not equals | `{ field: "priority", operator: "neq", value: "low" }` |
| `in` | Is in list | `{ field: "status", operator: "in", value: ["done", "cancelled"] }` |
| `not_in` | Not in list | `{ field: "priority", operator: "not_in", value: ["low"] }` |

### Helper function:

```typescript
function evaluateCondition(
  condition: { field: string; operator: string; value: unknown } | null,
  context: Record<string, unknown>
): boolean
```

Returns true if condition is null (else branch always matches as fallback).

### Cascade skip logic:

When marking steps as `skipped`, traverse the dependency graph: if a step depends on a skipped step (and has no other non-skipped dependency path), it is also skipped.

---

## 4. UI Layout

### PipelineDetail.tsx — restructured:

```
+---------------------------------------------+
|  Header (name, Run, View Runs buttons)      |
+---------------------------------------------+
|                    |                         |
|   React Flow      |   Side Panel            |
|   Canvas           |   (on node select)      |
|   (full height)   |   - Edit step           |
|                    |   - Conditions          |
|                    |   - Dependencies        |
|                    |                         |
+---------------------------------------------+
```

**Canvas toolbar** (top-left of canvas):
- "Add Action" button
- "Add If/Else" button
- Zoom controls (React Flow built-in minimap/controls)
- "Auto-layout" button (recalculates all positions via dagre)

**Side panel**: slides in from right when a node is selected. Contains the step edit form (what is currently the inline form). Closes on click outside or X.

### PipelineRunDetail.tsx — read-only canvas:

Same graph layout but:
- Not interactive (no drag, no connect, no delete)
- Node colors indicate status:
  - Pending: gray border
  - Running: blue border with pulse animation
  - Completed: green border
  - Failed: red border
  - Skipped: gray with reduced opacity
- Edges inherit color from source node status

---

## 5. Backend Changes

### Drizzle schema additions to `pipelineSteps`:

```typescript
positionX: real("position_x"),
positionY: real("position_y"),
stepType: text("step_type").notNull().default("action"),
```

### Zod schema updates:

`createPipelineStepSchema` adds:
- `positionX: z.number().optional()`
- `positionY: z.number().optional()`
- `stepType: z.enum(["action", "if_else"]).optional()`

### New endpoint — batch position update:

`PATCH /companies/:companyId/pipelines/:pipelineId/steps/positions`

```typescript
// Body
{ positions: Array<{ stepId: string; positionX: number; positionY: number }> }
```

Updates all positions in a single request (for auto-layout). Invalidates Redis cache `paperclip:pipeline:detail:{pipelineId}`.

### Service changes:

**`createStep` / `updateStep`**: accept and persist `positionX`, `positionY`, `stepType`.

**`evaluateReadySteps`** — new branch for if_else:
1. Check `step.stepType === "if_else"`
2. Build execution context from the most recently completed predecessor's issue data
3. Evaluate `config.branches` conditions via `evaluateCondition()`
4. Mark if_else step as `completed`
5. Mark losing branch steps + cascading dependents as `skipped`
6. Continue normal evaluation for winning branch

**New function**: `evaluateCondition(condition, context)` — evaluates a single condition object.

**New function**: `cascadeSkip(runId, stepIds)` — marks steps and their downstream dependents as `skipped`.

**`getRunById`** — includes `stepType`, `positionX`, `positionY` in step mapping.

### Redis invalidation:

Batch positions endpoint invalidates `paperclip:pipeline:detail:{pipelineId}`.

---

## 6. New Dependencies

### Frontend (ui/package.json):

```
@xyflow/react: ^12.x
dagre: ^0.8.x
@types/dagre: ^0.7.x
```

### No new backend dependencies.

---

## Files to Create

| File | Purpose |
|---|---|
| `ui/src/components/pipeline/PipelineCanvas.tsx` | Main React Flow canvas editor |
| `ui/src/components/pipeline/StepNode.tsx` | Custom node for action steps |
| `ui/src/components/pipeline/IfElseNode.tsx` | Custom node for if/else steps |
| `ui/src/components/pipeline/AddStepEdge.tsx` | Custom edge with "+" button |
| `ui/src/components/pipeline/StepSidePanel.tsx` | Slide-in edit panel |
| `ui/src/components/pipeline/useAutoLayout.ts` | Dagre layout hook |
| `ui/src/components/pipeline/utils.ts` | Steps to nodes/edges conversion |
| `packages/db/src/migrations/0061_pipeline_react_flow.sql` | Migration |

## Files to Modify

| File | Changes |
|---|---|
| `packages/db/src/schema/pipelines.ts` | Add positionX, positionY, stepType |
| `server/src/services/pipelines.ts` | if/else evaluation, condition evaluator, cascade skip, batch positions |
| `server/src/routes/pipelines.ts` | Updated schemas, batch positions endpoint |
| `ui/src/api/pipelines.ts` | Updated types, batch positions method |
| `ui/src/pages/PipelineDetail.tsx` | Replace body with PipelineCanvas + StepSidePanel |
| `ui/src/pages/PipelineRunDetail.tsx` | Replace list with read-only canvas |
| `ui/package.json` | Add @xyflow/react, dagre, @types/dagre |
