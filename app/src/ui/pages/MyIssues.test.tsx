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
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { useQuery } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { issuesApi } from "../api/issues";
import { MyIssues } from "./MyIssues";

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: vi.fn(),
  };
});

describe("MyIssues", () => {
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

  it("calls issuesApi.list with assigneeUserId me", () => {
    vi.mocked(useCompany).mockReturnValue({
      selectedCompanyId: "company-1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    let capturedQueryKey: unknown;
    let capturedQueryFn: (() => unknown) | undefined;

    vi.mocked(useQuery).mockImplementation((options) => {
      capturedQueryKey = options.queryKey;
      capturedQueryFn = options.queryFn as (() => unknown) | undefined;
      return { data: undefined, isLoading: false, error: null } as ReturnType<typeof useQuery>;
    });

    const root = createRoot(container);
    act(() => {
      root.render(<MyIssues />);
    });

    expect(capturedQueryKey).toEqual(["issues", "company-1", "assigned-to-me"]);

    // Invoke the queryFn and assert it calls issuesApi.list with the correct args
    capturedQueryFn?.();
    expect(issuesApi.list).toHaveBeenCalledWith("company-1", { assigneeUserId: "me" });

    act(() => {
      root.unmount();
    });
  });

  it("shows empty company message when no company selected", () => {
    vi.mocked(useCompany).mockReturnValue({
      selectedCompanyId: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const root = createRoot(container);
    act(() => {
      root.render(<MyIssues />);
    });

    expect(container.textContent).toContain("Select a company to view your tasks.");

    act(() => {
      root.unmount();
    });
  });

  it("listAssignedToMe query passes staleTime 120_000", () => {
    vi.mocked(useCompany).mockReturnValue({
      selectedCompanyId: "company-1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedOptions: any;

    vi.mocked(useQuery).mockImplementation((options) => {
      capturedOptions = options;
      return { data: undefined, isLoading: false, error: null } as ReturnType<typeof useQuery>;
    });

    const root = createRoot(container);
    act(() => {
      root.render(<MyIssues />);
    });

    expect(capturedOptions).toBeDefined();
    expect(capturedOptions.staleTime).toBe(120_000);

    act(() => {
      root.unmount();
    });
  });
});
