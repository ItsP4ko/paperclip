import { describe, expect, it } from "vitest";
import {
  applyOptimisticStatus,
  applyOptimisticAssignee,
  createOptimisticSubtaskStub,
} from "./optimistic-issue-mutations";
import type { Issue } from "@paperclipai/shared";

const baseIssue: Issue = {
  id: "issue-1",
  companyId: "company-1",
  projectId: null,
  projectWorkspaceId: null,
  goalId: null,
  parentId: null,
  title: "Fix comment flow",
  description: null,
  status: "todo",
  priority: "medium",
  assigneeAgentId: "agent-1",
  assigneeUserId: null,
  checkoutRunId: null,
  executionRunId: null,
  executionAgentNameKey: null,
  executionLockedAt: null,
  createdByAgentId: null,
  createdByUserId: "board-1",
  issueNumber: 1,
  identifier: "PAP-1",
  originKind: "manual",
  originId: null,
  originRunId: null,
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
  createdAt: new Date("2026-03-28T14:00:00.000Z"),
  updatedAt: new Date("2026-03-28T14:00:00.000Z"),
};

describe("optimistic issue mutations", () => {
  it("applyOptimisticStatus returns new Issue with updated status", () => {
    const result = applyOptimisticStatus(baseIssue, "in_progress");
    expect(result?.status).toBe("in_progress");
    expect(result?.id).toBe(baseIssue.id);
    expect(result?.title).toBe(baseIssue.title);
  });

  it("applyOptimisticStatus returns a new object (does not mutate original)", () => {
    const result = applyOptimisticStatus(baseIssue, "done");
    expect(result).not.toBe(baseIssue);
    expect(baseIssue.status).toBe("todo");
  });

  it("applyOptimisticStatus returns undefined when issue is undefined", () => {
    const result = applyOptimisticStatus(undefined, "done");
    expect(result).toBeUndefined();
  });

  it("applyOptimisticAssignee returns new Issue with updated assignee (user)", () => {
    const result = applyOptimisticAssignee(baseIssue, {
      assigneeAgentId: null,
      assigneeUserId: "user-1",
    });
    expect(result?.assigneeAgentId).toBeNull();
    expect(result?.assigneeUserId).toBe("user-1");
    expect(result?.id).toBe(baseIssue.id);
  });

  it("applyOptimisticAssignee returns new Issue with updated assignee (agent)", () => {
    const issue = { ...baseIssue, assigneeUserId: "user-1", assigneeAgentId: null };
    const result = applyOptimisticAssignee(issue, {
      assigneeAgentId: "agent-2",
      assigneeUserId: null,
    });
    expect(result?.assigneeAgentId).toBe("agent-2");
    expect(result?.assigneeUserId).toBeNull();
  });

  it("applyOptimisticAssignee returns a new object (does not mutate original)", () => {
    const result = applyOptimisticAssignee(baseIssue, {
      assigneeAgentId: null,
      assigneeUserId: "user-1",
    });
    expect(result).not.toBe(baseIssue);
    expect(baseIssue.assigneeAgentId).toBe("agent-1");
  });

  it("applyOptimisticAssignee returns undefined when issue is undefined", () => {
    const result = applyOptimisticAssignee(undefined, {
      assigneeAgentId: null,
      assigneeUserId: "user-1",
    });
    expect(result).toBeUndefined();
  });

  it("createOptimisticSubtaskStub returns Issue with id starting with 'optimistic-subtask-'", () => {
    const stub = createOptimisticSubtaskStub({
      title: "Fix bug",
      companyId: "c1",
      parentId: "i1",
      projectId: "p1",
      goalId: null,
    });
    expect(stub.id).toMatch(/^optimistic-subtask-/);
  });

  it("createOptimisticSubtaskStub sets correct fields", () => {
    const stub = createOptimisticSubtaskStub({
      title: "Fix bug",
      companyId: "c1",
      parentId: "i1",
      projectId: "p1",
      goalId: null,
    });
    expect(stub.status).toBe("todo");
    expect(stub.priority).toBe("medium");
    expect(stub.title).toBe("Fix bug");
    expect(stub.parentId).toBe("i1");
    expect(stub.companyId).toBe("c1");
    expect(stub.projectId).toBe("p1");
    expect(stub.goalId).toBeNull();
    expect(stub.identifier).toBe("");
    expect(stub.issueNumber).toBeNull();
  });

  it("createOptimisticSubtaskStub returns different ids on successive calls", () => {
    const stub1 = createOptimisticSubtaskStub({
      title: "Fix bug",
      companyId: "c1",
      parentId: "i1",
      projectId: null,
      goalId: null,
    });
    const stub2 = createOptimisticSubtaskStub({
      title: "Fix bug",
      companyId: "c1",
      parentId: "i1",
      projectId: null,
      goalId: null,
    });
    expect(stub1.id).not.toBe(stub2.id);
  });
});
