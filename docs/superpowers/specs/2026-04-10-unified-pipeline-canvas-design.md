# Unified Pipeline Canvas

## Goal
Merge the pipeline editor (`PipelineDetail`) and run viewer (`PipelineRunDetail`) into a single page with two modes: **edit mode** and **run mode**. Eliminate the separate run detail page entirely.

## Modes

### Edit Mode (no active run)
- Full editor: drag nodes, connect handles, add/delete steps, side panel editing
- Header: `+ Action`, `If/Else`, `Auto-layout`, **Run** button
- Edges: `AddStepEdge` with add-between (+) and unlink (trash) buttons
- Node click opens side panel for editing

### Run Mode (active run in progress)
- Canvas is **edit-locked**: `nodesDraggable=false`, `nodesConnectable=false`, no delete, no side panel
- Nodes show status rings: blue+pulse=running, green=completed, red=failed, dimmed=skipped
- Running user-assigned steps show green checkmark button (existing `canComplete` logic)
- Edges: `smoothstep` type (no interactive buttons)
- Header: run status badge (`Running`/`Completed`/`Failed`) + progress counter (`2/5 completed`)
- Toolbar buttons (`+ Action`, `If/Else`, `Auto-layout`) hidden

### Transition: Run Completes
- Canvas instantly unlocks to edit mode
- Green completed rings stay visible as feedback (fade on next interaction)
- Run button reappears

## Run Trigger
- Simple **Run** button click (no project picker)
- Calls `triggerRun` API, switches canvas to run mode immediately
- 3-second polling on active run (existing `refetchInterval` pattern)

## Data Flow
- `PipelineDetail` fetches pipeline detail + runs list (existing queries)
- Derives `activeRun` from runs (first `running` run, or null)
- If `activeRun` exists, fetches run detail with step statuses
- Merges run step statuses into canvas nodes (adds `runStatus`, `canComplete`, `onComplete` to node data)
- `completeStepMutation` lives in `PipelineDetail` (moved from deleted `PipelineRunDetail`)

## File Changes

### Delete
- `ui/src/pages/PipelineRunDetail.tsx` — entire file
- Run detail route in router config

### Modify
- `ui/src/pages/PipelineDetail.tsx`:
  - Remove redirect-to-run useEffect
  - Add run detail query (when activeRun exists)
  - Add `completeStepMutation` and auth session query
  - Derive `isRunMode` from activeRun
  - Pass run mode props to PipelineCanvas
  - Simplify Run button (no project picker, no expand state)

- `ui/src/components/pipeline/PipelineCanvas.tsx`:
  - Accept optional `runMode` prop (boolean)
  - Accept optional `runSteps` data for status overlay
  - Accept optional `onCompleteStep` callback
  - When `runMode=true`:
    - Disable drag, connect, delete
    - Hide toolbar buttons (+ Action, If/Else, Auto-layout)
    - Use `smoothstep` edges instead of `addStep` edges
    - Add status rings to nodes via className
    - Pass `canComplete`/`onComplete` to StepNode data
  - When `runMode=false`: existing editor behavior

### Keep (no changes)
- `ui/src/components/pipeline/StepNode.tsx` — already supports both modes
- `ui/src/components/pipeline/AddStepEdge.tsx`
- `ui/src/components/pipeline/utils.ts`
- `server/src/services/pipelines.ts`
- `server/src/routes/pipelines.ts`

## Navigation
- Back button always goes to `/pipelines` list
- No run-specific URL — pipeline URL shows whichever mode is active
- Breadcrumbs: `Pipelines > {pipeline name}` (no "Run" crumb)
