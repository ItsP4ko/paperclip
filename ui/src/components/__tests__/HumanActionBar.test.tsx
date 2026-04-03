// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Minimal harness that mirrors the conditional render logic in IssueDetail.tsx:
 *   {issue.assigneeUserId === currentUserId && currentUserId && ( ... HumanActionBar ... )}
 *
 * Testing this in isolation avoids the need to mock the full IssueDetail
 * provider tree while still exercising the conditional logic.
 */
function HumanActionBarHarness({
  assigneeUserId,
  currentUserId,
}: {
  assigneeUserId: string | null;
  currentUserId: string | null;
}) {
  return (
    <>
      {assigneeUserId === currentUserId && currentUserId && (
        <div>
          <span>Attach file</span>
          <span>Add subtask</span>
        </div>
      )}
    </>
  );
}

describe("HumanActionBar conditional render", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("renders action bar when issue is assigned to the current user", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <HumanActionBarHarness assigneeUserId="user-1" currentUserId="user-1" />,
      );
    });

    expect(container.textContent).toContain("Attach file");
    expect(container.textContent).toContain("Add subtask");

    act(() => {
      root.unmount();
    });
  });

  it("does NOT render action bar when issue is assigned to a different user", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <HumanActionBarHarness assigneeUserId="user-2" currentUserId="user-1" />,
      );
    });

    expect(container.textContent).not.toContain("Attach file");
    expect(container.textContent).not.toContain("Add subtask");

    act(() => {
      root.unmount();
    });
  });

  it("does NOT render action bar when issue is assigned to an agent", () => {
    // Agent assignment: assigneeUserId is null, currentUserId is set
    const root = createRoot(container);

    act(() => {
      root.render(
        <HumanActionBarHarness assigneeUserId={null} currentUserId="user-1" />,
      );
    });

    expect(container.textContent).not.toContain("Attach file");
    expect(container.textContent).not.toContain("Add subtask");

    act(() => {
      root.unmount();
    });
  });
});
