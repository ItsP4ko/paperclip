import type { Issue } from "@paperclipai/shared";

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
