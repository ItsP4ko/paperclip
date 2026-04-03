import { describe, expect, it } from "vitest";
import {
  assigneeValueFromSelection,
  currentUserAssigneeOption,
  formatAssigneeUserLabel,
  parseAssigneeValue,
  resolveAssigneePatch,
  suggestedCommentAssigneeValue,
} from "./assignees";

describe("resolveAssigneePatch", () => {
  it("returns agent field for agent: prefix", () => {
    expect(resolveAssigneePatch("agent:abc")).toEqual({ assigneeAgentId: "abc", assigneeUserId: null });
  });

  it("returns user field for user: prefix", () => {
    expect(resolveAssigneePatch("user:xyz")).toEqual({ assigneeAgentId: null, assigneeUserId: "xyz" });
  });

  it("returns both null for empty string", () => {
    expect(resolveAssigneePatch("")).toEqual({ assigneeAgentId: null, assigneeUserId: null });
  });

  it("returns both null for agent: with empty id", () => {
    expect(resolveAssigneePatch("agent:")).toEqual({ assigneeAgentId: null, assigneeUserId: null });
  });

  it("returns both null for user: with empty id", () => {
    expect(resolveAssigneePatch("user:")).toEqual({ assigneeAgentId: null, assigneeUserId: null });
  });

  it("treats raw string as legacy agent id", () => {
    expect(resolveAssigneePatch("raw-legacy-id")).toEqual({ assigneeAgentId: "raw-legacy-id", assigneeUserId: null });
  });
});

describe("parseAssigneeValue", () => {
  it("parses agent: prefix", () => {
    expect(parseAssigneeValue("agent:abc")).toEqual({ assigneeAgentId: "abc", assigneeUserId: null });
  });

  it("parses user: prefix", () => {
    expect(parseAssigneeValue("user:xyz")).toEqual({ assigneeAgentId: null, assigneeUserId: "xyz" });
  });
});

describe("assignee selection helpers", () => {
  it("encodes and parses agent assignees", () => {
    const value = assigneeValueFromSelection({ assigneeAgentId: "agent-123" });

    expect(value).toBe("agent:agent-123");
    expect(parseAssigneeValue(value)).toEqual({
      assigneeAgentId: "agent-123",
      assigneeUserId: null,
    });
  });

  it("encodes and parses current-user assignees", () => {
    const [option] = currentUserAssigneeOption("local-board");

    expect(option).toEqual({
      id: "user:local-board",
      label: "Me",
      searchText: "me board human local-board",
    });
    expect(parseAssigneeValue(option.id)).toEqual({
      assigneeAgentId: null,
      assigneeUserId: "local-board",
    });
  });

  it("treats an empty selection as no assignee", () => {
    expect(parseAssigneeValue("")).toEqual({
      assigneeAgentId: null,
      assigneeUserId: null,
    });
  });

  it("keeps backward compatibility for raw agent ids in saved drafts", () => {
    expect(parseAssigneeValue("legacy-agent-id")).toEqual({
      assigneeAgentId: "legacy-agent-id",
      assigneeUserId: null,
    });
  });

  it("formats current and board user labels consistently", () => {
    expect(formatAssigneeUserLabel("user-1", "user-1")).toBe("Me");
    expect(formatAssigneeUserLabel("local-board", "someone-else")).toBe("Board");
    expect(formatAssigneeUserLabel("user-abcdef", "someone-else")).toBe("user-");
  });

  it("suggests the last non-me commenter without changing the actual assignee encoding", () => {
    expect(
      suggestedCommentAssigneeValue(
        { assigneeUserId: "board-user" },
        [
          { authorUserId: "board-user" },
          { authorAgentId: "agent-123" },
        ],
        "board-user",
      ),
    ).toBe("agent:agent-123");
  });

  it("falls back to the actual assignee when there is no better commenter hint", () => {
    expect(
      suggestedCommentAssigneeValue(
        { assigneeUserId: "board-user" },
        [{ authorUserId: "board-user" }],
        "board-user",
      ),
    ).toBe("user:board-user");
  });

  it("skips the current agent when choosing a suggested commenter assignee", () => {
    expect(
      suggestedCommentAssigneeValue(
        { assigneeUserId: "board-user" },
        [
          { authorUserId: "board-user" },
          { authorAgentId: "agent-self" },
          { authorAgentId: "agent-123" },
        ],
        null,
        "agent-self",
      ),
    ).toBe("agent:agent-123");
  });
});
