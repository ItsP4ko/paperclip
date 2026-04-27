import type { Issue } from "@paperclipai/shared";

/**
 * Fields that are safe to merge directly from a mutation payload onto a cached
 * Issue for optimistic UI. We intentionally allow only scalar/serializable
 * fields the server actually accepts on PATCH /issues/:id and that the
 * frontend renders directly. Anything else (comment side-effects, interrupt
 * flags, attachments, etc.) is ignored here and reconciled on invalidation.
 */
const OPTIMISTIC_PATCH_KEYS = new Set<keyof Issue>([
  "title",
  "description",
  "status",
  "priority",
  "assigneeAgentId",
  "assigneeUserId",
  "projectId",
  "goalId",
  "parentId",
  "billingCode",
  "labelIds",
]);

export function applyOptimisticIssuePatch(
  issue: Issue | undefined,
  data: Record<string, unknown>,
): Issue | undefined {
  if (!issue) return issue;
  const patch: Partial<Issue> = {};
  let touched = false;
  for (const key of Object.keys(data) as (keyof Issue)[]) {
    if (!OPTIMISTIC_PATCH_KEYS.has(key)) continue;
    (patch as Record<string, unknown>)[key as string] = data[key as string];
    touched = true;
  }
  if (!touched) return issue;
  return { ...issue, ...patch, updatedAt: new Date() };
}

/**
 * Patch a single issue inside a cached `Issue[]` list query, returning a new
 * array reference only if something actually changed (so React Query can skip
 * unnecessary re-renders).
 */
export function mergeIssueInList(
  list: Issue[] | undefined,
  issueId: string,
  data: Record<string, unknown>,
): Issue[] | undefined {
  if (!list) return list;
  let changed = false;
  const next = list.map((issue) => {
    if (issue.id !== issueId) return issue;
    const patched = applyOptimisticIssuePatch(issue, data);
    if (patched !== issue) changed = true;
    return patched ?? issue;
  });
  return changed ? next : list;
}

export function applyOptimisticStatus(
  issue: Issue | undefined,
  status: Issue["status"],
): Issue | undefined {
  if (!issue) return issue;
  return { ...issue, status };
}

export function applyOptimisticAssignee(
  issue: Issue | undefined,
  assignee: { assigneeAgentId: string | null; assigneeUserId: string | null },
): Issue | undefined {
  if (!issue) return issue;
  return { ...issue, assigneeAgentId: assignee.assigneeAgentId, assigneeUserId: assignee.assigneeUserId };
}

export function createOptimisticSubtaskStub(params: {
  title: string;
  companyId: string;
  parentId: string;
  projectId: string | null;
  goalId: string | null;
}): Issue {
  const now = new Date();
  return {
    id: `optimistic-subtask-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    companyId: params.companyId,
    projectId: params.projectId,
    projectWorkspaceId: null,
    goalId: params.goalId,
    parentId: params.parentId,
    title: params.title,
    description: null,
    status: "todo",
    priority: "medium",
    assigneeAgentId: null,
    assigneeUserId: null,
    checkoutRunId: null,
    executionRunId: null,
    executionAgentNameKey: null,
    executionLockedAt: null,
    createdByAgentId: null,
    createdByUserId: null,
    issueNumber: null,
    identifier: "",
    requestDepth: 0,
    billingCode: null,
    assigneeAdapterOverrides: null,
    executionWorkspaceId: null,
    executionWorkspacePreference: null,
    executionWorkspaceSettings: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    hiddenAt: null,
    createdAt: now,
    updatedAt: now,
  };
}
