// @vitest-environment jsdom

import { act } from "react";
import type { ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/router", () => ({
  Link: ({ children, className, ...props }: ComponentProps<"a">) => (
    <a className={className} {...props}>{children}</a>
  ),
  useLocation: () => ({ pathname: "/", search: "", hash: "" }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useNavigate: () => () => {},
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: vi.fn(),
}));

vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ breadcrumbs: [], setBreadcrumbs: () => {} }),
}));

vi.mock("../api/issues", () => ({
  issuesApi: {
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("../api/agents", () => ({
  agentsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../api/projects", () => ({
  projectsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../api/heartbeats", () => ({
  heartbeatsApi: {
    liveRunsForCompany: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../lib/issueDetailBreadcrumb", () => ({
  createIssueDetailLocationState: () => ({}),
}));

// Mock IssuesList to avoid rendering complexity (useDialog, etc.)
vi.mock("../components/IssuesList", () => ({
  IssuesList: () => <div data-testid="issues-list" />,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { Issues } from "./Issues";
import { queryKeys } from "../lib/queryKeys";

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn().mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn() }),
    useQueryClient: vi.fn().mockReturnValue({ invalidateQueries: vi.fn() }),
  };
});

describe("Issues", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  afterEach(() => {
    container.remove();
    vi.clearAllMocks();
  });

  it("issues list query passes staleTime 120_000", () => {
    vi.mocked(useCompany).mockReturnValue({
      selectedCompanyId: "company-1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const capturedCalls: any[] = [];

    vi.mocked(useQuery).mockImplementation((options) => {
      capturedCalls.push(options);
      return { data: undefined, isLoading: false, error: null } as ReturnType<typeof useQuery>;
    });

    const root = createRoot(container);
    act(() => {
      root.render(<Issues />);
    });

    // Find the issues.list call whose queryKey starts with ["issues", "company-1"]
    const issuesListCall = capturedCalls.find((opts) => {
      const key = opts.queryKey as unknown[];
      return Array.isArray(key) && key[0] === "issues" && key[1] === "company-1" && key[2] === "participant-agent";
    });

    expect(issuesListCall).toBeDefined();
    expect(issuesListCall.staleTime).toBe(120_000);

    act(() => {
      root.unmount();
    });
  });

  it("updateIssue onSuccess invalidates listAssignedToMe", () => {
    vi.mocked(useCompany).mockReturnValue({
      selectedCompanyId: "company-1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const invalidations: unknown[] = [];
    const mockQueryClient = { invalidateQueries: vi.fn((input: unknown) => { invalidations.push(input); }) };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const capturedMutations: any[] = [];
    vi.mocked(useMutation).mockImplementation((options: unknown) => {
      capturedMutations.push(options);
      return { mutate: vi.fn(), mutateAsync: vi.fn() } as ReturnType<typeof useMutation>;
    });

    vi.mocked(useQueryClient).mockReturnValue(mockQueryClient as ReturnType<typeof useQueryClient>);

    const root = createRoot(container);
    act(() => {
      root.render(<Issues />);
    });

    // The first (and only) useMutation call in Issues.tsx is updateIssue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateIssueMutation = capturedMutations[0] as any;
    expect(updateIssueMutation).toBeDefined();

    // Invoke onSuccess which should invalidate listAssignedToMe
    invalidations.length = 0;
    updateIssueMutation.onSuccess();

    expect(invalidations).toContainEqual({
      queryKey: queryKeys.issues.listAssignedToMe("company-1"),
    });

    act(() => {
      root.unmount();
    });
  });
});
