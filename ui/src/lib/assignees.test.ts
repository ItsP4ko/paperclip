import { describe, expect, it } from "vitest";
import {
  assigneeValueFromSelection,
  currentUserAssigneeOption,
  formatAssigneeUserLabel,
  parseAssigneeValue,
  resolveAssigneeName,
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

describe("resolveAssigneeName", () => {
  function stubMember(overrides: { principalId: string; userDisplayName?: string | null; userEmail?: string | null }) {
    return {
      id: "mem-1",
      companyId: "co-1",
      principalType: "user",
      principalId: overrides.principalId,
      membershipRole: "member",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
      userDisplayName: overrides.userDisplayName ?? null,
      userEmail: overrides.userEmail ?? null,
    };
  }

  it("returns agent name when assigneeAgentId matches", () => {
    expect(
      resolveAssigneeName(
        { assigneeAgentId: "a1", assigneeUserId: null },
        [{ id: "a1", name: "Coder" }],
        [],
        null,
      ),
    ).toBe("Coder");
  });

  it("returns 'Me' when assigneeUserId matches currentUserId", () => {
    expect(
      resolveAssigneeName(
        { assigneeAgentId: null, assigneeUserId: "u1" },
        [],
        [stubMember({ principalId: "u1", userDisplayName: "Alice", userEmail: "alice@x.com" })],
        "u1",
      ),
    ).toBe("Me");
  });

  it("returns userDisplayName for a different human member", () => {
    expect(
      resolveAssigneeName(
        { assigneeAgentId: null, assigneeUserId: "u2" },
        [],
        [stubMember({ principalId: "u2", userDisplayName: "Bob", userEmail: "bob@x.com" })],
        "u1",
      ),
    ).toBe("Bob");
  });

  it("falls back to userEmail when userDisplayName is null", () => {
    expect(
      resolveAssigneeName(
        { assigneeAgentId: null, assigneeUserId: "u3" },
        [],
        [stubMember({ principalId: "u3", userDisplayName: null, userEmail: "carl@x.com" })],
        "u1",
      ),
    ).toBe("carl@x.com");
  });

  it("falls back to truncated principalId when both name and email are null", () => {
    expect(
      resolveAssigneeName(
        { assigneeAgentId: null, assigneeUserId: "abcdefghij" },
        [],
        [stubMember({ principalId: "abcdefghij", userDisplayName: null, userEmail: null })],
        "u1",
      ),
    ).toBe("abcdefgh");
  });

  it("returns null when no assignee is set", () => {
    expect(
      resolveAssigneeName(
        { assigneeAgentId: null, assigneeUserId: null },
        [],
        [],
        "u1",
      ),
    ).toBeNull();
  });

  it("returns null when agent is not found in agents list", () => {
    expect(
      resolveAssigneeName(
        { assigneeAgentId: "missing", assigneeUserId: null },
        [{ id: "other", name: "Other" }],
        [],
        null,
      ),
    ).toBeNull();
  });
});
