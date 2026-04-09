# Pipeline Improvements: Assignee Mix + Issue Linking

**Date:** 2026-04-09
**Status:** Approved
**Branch:** feature/pipeline-assignee-issues (from developer)

---

## Problem

Pipeline steps can only be assigned to AI agents. Users cannot:
1. Assign steps to human team members (mixed agent/human workflows)
2. Link existing issues to pipeline steps (steps always create new issues)
3. Create pipelines from a selection of existing issues

## Solution: Approach C — Direct Fields + Explicit Type

Maintain existing `agent_id` FK, add `assignee_user_id`, `issue_id`, and `assignee_type` to `pipeline_steps`.

---

## 1. Database Schema Changes

### New columns on `pipeline_steps`:

| Column | Type | Nullable | Description |
|---|---|---|---|
| `assignee_type` | `text` | yes | `"agent"` \| `"user"` \| null |
| `assignee_user_id` | `text` | yes | `companyMemberships.principalId` of the human member |
| `issue_id` | `uuid` (FK -> issues.id, ON DELETE SET NULL) | yes | Pre-linked issue for this step |

### Consistency rules:
- `assignee_type = "agent"` -> `agent_id` NOT NULL, `assignee_user_id` NULL
- `assignee_type = "user"` -> `assignee_user_id` NOT NULL, `agent_id` NULL
- `assignee_type = null` -> both assignee fields may be null

### Migration (non-destructive):

```sql
ALTER TABLE pipeline_steps
  ADD COLUMN assignee_type text,
  ADD COLUMN assignee_user_id text,
  ADD COLUMN issue_id uuid REFERENCES issues(id) ON DELETE SET NULL;

CREATE INDEX pipeline_steps_issue_idx ON pipeline_steps(issue_id);

-- Backfill existing steps that have an agent
UPDATE pipeline_steps
  SET assignee_type = 'agent'
  WHERE agent_id IS NOT NULL;
```

Runs automatically via CI/CD on push.

---

## 2. Execution Logic (`evaluateReadySteps`)

When a step's dependencies are met and it transitions to `running`:

| `assignee_type` | `issue_id` set? | Behavior |
|---|---|---|
| `"agent"` | yes | Update existing issue: set `status = "todo"` (only if currently `backlog`), assign to agent -> agent works it -> done -> step done |
| `"agent"` | no | Create new issue assigned to agent (current behavior) |
| `"user"` | yes | Update existing issue: set `status = "todo"` (only if currently `backlog`), assign to user -> human completes it -> step done |
| `"user"` | no | Create new issue assigned to human user |
| null | yes | Update existing issue: set `status = "todo"` (only if currently `backlog`), no assignee change -> someone completes it -> step done |
| null | no | Create new issue without assignee (current behavior) |

**Note:** When linking an existing issue, the status is only moved to `"todo"` if it's currently in `"backlog"`. If the issue is already in `"todo"` or beyond, the status is not regressed.

### Issue creation for human assignees:

When creating a new issue for a `"user"` step, use `assigneeUserId` instead of `assigneeAgentId`:

```typescript
const issue = await issueSvc.create(run.companyId, {
  projectId: run.projectId,
  title: step.name,
  assigneeUserId: step.assigneeUserId ?? undefined,  // human
  priority: "medium",
  status: "todo",
});
```

### `onIssueStatusChange` — no changes:

Works the same for both agents and humans. When the linked issue reaches `done`, the run step is marked `completed` and `evaluateReadySteps` cascades.

---

## 3. Create Pipeline from Issues

### New endpoint:

`POST /companies/:companyId/pipelines/from-issues`

```typescript
// Request body
{
  name: string;
  description?: string;
  issueIds: string[];  // ordered
}
```

### Behavior:
1. Validate all issues exist and belong to the company
2. Create pipeline with given name
3. For each issue (in order), create a `pipelineStep`:
   - `name` = issue.title
   - `issueId` = issue.id
   - `position` = array index
   - `agentId` = issue.assigneeAgentId (if present)
   - `assigneeUserId` = issue.assigneeUserId (if present)
   - `assigneeType` = `"agent"` if has agentId, `"user"` if has userId, null otherwise
   - `dependsOn` = [previous step id] (sequential by default)
4. Return pipeline with steps

### Wrapped in a DB transaction.

---

## 4. API Changes

### Updated Zod schemas:

**`createPipelineStepSchema`:**
```typescript
z.object({
  name:           z.string().min(1),
  agentId:        z.string().optional(),
  assigneeType:   z.enum(["agent", "user"]).optional(),
  assigneeUserId: z.string().optional(),
  issueId:        z.string().optional(),
  dependsOn:      z.array(z.string()).optional(),
  position:       z.number().optional(),
  config:         z.record(z.unknown()).optional(),
})
```

**`updatePipelineStepSchema`:** same fields, all optional.

### New endpoint schema:

**`createPipelineFromIssuesSchema`:**
```typescript
z.object({
  name:        z.string().min(1),
  description: z.string().optional(),
  issueIds:    z.array(z.string()).min(1),
})
```

### Service validation:
- `assigneeType = "agent"` without `agentId` -> 400
- `assigneeType = "user"` without `assigneeUserId` -> 400
- `issueId` referencing non-existent or wrong-company issue -> 400

### `getRunById` enrichment:

Return `assigneeType` and `assigneeUserId` in each run step so the UI can render the correct type.

---

## 5. UI Changes

### PipelineDetail — Vertical flowchart layout:

Replace current flat list with vertical flow:

```
┌─────────────────────────┐
│  Issue #12 - Login fix  │
│  Agent: Code            │
└─────────────────────────┘
            |
            |
┌─────────────────────────┐
│  Test login flow        │
│  User: Paco             │
└─────────────────────────┘
            |
            |
┌─────────────────────────┐
│  Issue #15 - UI update  │
│  Agent: Front           │
└─────────────────────────┘
```

**Card content:**
- Step name (with issue prefix if linked)
- Assignee type + name: `Agent: name` or `User: name`
- Status badge during execution (pending, running, completed, failed)

**Connector:** solid vertical line between cards. Branching lines for non-linear dependencies.

**Depth effect:** subtle offset shadow on cards (stacked appearance).

### Add Step form changes:

1. Assignee type toggle: `Agent` | `User` | `None`
2. If Agent -> agent selector (existing)
3. If User -> company members selector (from `companyMemberships`)
4. Optional issue search/selector to link an existing issue

### Issues page — multi-select + "Create Pipeline":

- Checkbox on each issue row in list view
- On 2+ selected: floating action bar with "Create Pipeline" button
- Modal: pipeline name input + reorderable list of selected issues
- Confirm -> calls `POST /pipelines/from-issues` -> navigates to PipelineDetail

---

## 6. Redis Caching

### Cached queries:
- `pipeline:detail:{pipelineId}` — pipeline + steps (frequent detail page access)
- `pipeline:runs:{companyId}:{pipelineId?}` — run listings
- `pipeline:run:{runId}` — run detail with step statuses

### Strategy: TTL + active invalidation

- **TTL:** 5 minutes as fallback expiry
- **Active invalidation:** bust cache on:
  - Step create/update/delete -> invalidate `pipeline:detail:{pipelineId}`
  - Run trigger -> invalidate `pipeline:runs:*` for that company/pipeline
  - Run step status change -> invalidate `pipeline:run:{runId}`
  - `onIssueStatusChange` -> invalidate affected run cache

### Cache key pattern:
```
paperclip:pipeline:detail:{pipelineId}
paperclip:pipeline:runs:{companyId}
paperclip:pipeline:runs:{companyId}:{pipelineId}
paperclip:pipeline:run:{runId}
```

---

## Files to modify

### Database:
- `packages/db/src/schema/pipelines.ts` — add 3 columns to `pipelineSteps`
- `packages/db/src/migrations/XXXX_pipeline_assignee_issues.sql` — new migration

### Backend:
- `server/src/services/pipelines.ts` — update evaluateReadySteps, createStep, updateStep, add createFromIssues
- `server/src/routes/pipelines.ts` — update schemas, add from-issues endpoint

### Frontend:
- `ui/src/api/pipelines.ts` — update types + add createFromIssues method
- `ui/src/pages/PipelineDetail.tsx` — vertical flowchart layout, updated add-step form
- `ui/src/pages/PipelineRunDetail.tsx` — show assignee type in run view
- `ui/src/components/IssuesList.tsx` — multi-select mode + "Create Pipeline" action
- `ui/src/pages/Pipelines.tsx` — minor: show linked issue count if relevant
