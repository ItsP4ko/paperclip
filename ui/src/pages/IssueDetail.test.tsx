// @vitest-environment jsdom

import { act } from "react";
import type { ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/router", () => ({
  Link: ({ children, className, ...props }: ComponentProps<"a">) => (
    <a className={className} {...props}>{children}</a>
  ),
  useParams: () => ({ issueId: "PAP-100" }),
  useLocation: () => ({ pathname: "/issues/PAP-100", search: "", hash: "", state: null }),
  useNavigate: () => () => {},
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: vi.fn(),
}));

vi.mock("../context/PanelContext", () => ({
  usePanel: () => ({ panelContent: null, openPanel: vi.fn(), closePanel: vi.fn() }),
}));

vi.mock("../context/ToastContext", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ breadcrumbs: [], setBreadcrumbs: () => {} }),
}));

vi.mock("../api/issues", () => ({
  issuesApi: {
    get: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    listComments: vi.fn().mockResolvedValue([]),
    listApprovals: vi.fn().mockResolvedValue([]),
    listAttachments: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({}),
    addComment: vi.fn().mockResolvedValue({}),
    updateComment: vi.fn().mockResolvedValue({}),
    deleteComment: vi.fn().mockResolvedValue({}),
    addAttachment: vi.fn().mockResolvedValue({}),
    removeAttachment: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("../api/activity", () => ({
  activityApi: {
    forIssue: vi.fn().mockResolvedValue([]),
    runsForIssue: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../api/heartbeats", () => ({
  heartbeatsApi: {
    liveRunsForIssue: vi.fn().mockResolvedValue([]),
    activeRunForIssue: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("../api/instanceSettings", () => ({
  instanceSettingsApi: {
    getGeneralSettings: vi.fn().mockResolvedValue({}),
    getExperimentalSettings: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("../api/agents", () => ({
  agentsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../api/auth", () => ({
  authApi: {
    getSession: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("../api/projects", () => ({
  projectsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../hooks/useProjectOrder", () => ({
  useProjectOrder: () => ({ orderedProjects: [], moveProject: vi.fn() }),
}));

vi.mock("../lib/issueDetailBreadcrumb", () => ({
  readIssueDetailBreadcrumb: () => null,
  createIssueDetailPath: () => "/",
  shouldArmIssueDetailInboxQuickArchive: () => false,
}));

vi.mock("../lib/keyboardShortcuts", () => ({
  hasBlockingShortcutDialog: () => false,
  resolveInboxQuickArchiveKeyAction: () => null,
}));

// Mock heavy components that pull in @mdxeditor / sandpack (stitches CSS causes jsdom errors)
vi.mock("../components/InlineEditor", () => ({
  InlineEditor: () => <div />,
}));

vi.mock("../components/IssueDocumentsSection", () => ({
  IssueDocumentsSection: () => <div />,
}));

vi.mock("../components/CommentThread", () => ({
  CommentThread: () => <div />,
}));

vi.mock("../components/IssueWorkspaceCard", () => ({
  IssueWorkspaceCard: () => <div />,
}));

vi.mock("../components/LiveRunWidget", () => ({
  LiveRunWidget: () => <div />,
}));

vi.mock("../components/ImageGalleryModal", () => ({
  ImageGalleryModal: () => <div />,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { IssueDetail } from "./IssueDetail";
import { queryKeys } from "../lib/queryKeys";

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn().mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    useQueryClient: vi.fn().mockReturnValue({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
    useIsMutating: vi.fn().mockReturnValue(0),
  };
});

describe("IssueDetail", () => {
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

  it("issue detail query passes staleTime 120_000", () => {
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
      root.render(<IssueDetail />);
    });

    // Find the issues.detail call with queryKey ["issues", "detail", "PAP-100"]
    const detailCall = capturedCalls.find((opts) => {
      const key = opts.queryKey as unknown[];
      return Array.isArray(key) && key[0] === "issues" && key[1] === "detail" && key[2] === "PAP-100";
    });

    expect(detailCall).toBeDefined();
    expect(detailCall.staleTime).toBe(120_000);

    act(() => {
      root.unmount();
    });
  });

  it("polling queries do NOT have staleTime 120_000", () => {
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
      root.render(<IssueDetail />);
    });

    // Polling queries: liveRuns, activeRun, linkedRuns (runs) — these have refetchInterval
    const pollingCalls = capturedCalls.filter((opts) => {
      const key = opts.queryKey as unknown[];
      return (
        Array.isArray(key) &&
        (
          (key[0] === "issues" && key[1] === "live-runs") ||
          (key[0] === "issues" && key[1] === "active-run") ||
          (key[0] === "issues" && key[1] === "runs")
        )
      );
    });

    for (const call of pollingCalls) {
      expect(call.staleTime).not.toBe(120_000);
    }

    act(() => {
      root.unmount();
    });
  });

  it("invalidateIssue includes listAssignedToMe invalidation", () => {
    vi.mocked(useCompany).mockReturnValue({
      selectedCompanyId: "company-1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const invalidations: unknown[] = [];
    const mockQueryClient = {
      invalidateQueries: vi.fn((input: unknown) => { invalidations.push(input); }),
      setQueryData: vi.fn(),
      getQueryData: vi.fn(),
      cancelQueries: vi.fn(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const capturedMutations: any[] = [];
    vi.mocked(useMutation).mockImplementation((options: unknown) => {
      capturedMutations.push(options);
      return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof useMutation>;
    });

    vi.mocked(useQueryClient).mockReturnValue(mockQueryClient as unknown as ReturnType<typeof useQueryClient>);

    const root = createRoot(container);
    act(() => {
      root.render(<IssueDetail />);
    });

    // Find the updateIssue mutation (mutationKey: ["issue-update", "PAP-100"])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateIssueMutation = capturedMutations.find((opts: any) => {
      const key = opts?.mutationKey as unknown[];
      return Array.isArray(key) && key[0] === "issue-update" && key[1] === "PAP-100";
    });

    expect(updateIssueMutation).toBeDefined();

    // Invoke onSettled which calls invalidateIssue()
    invalidations.length = 0;
    updateIssueMutation.onSettled();

    expect(invalidations).toContainEqual({
      queryKey: queryKeys.issues.listAssignedToMe("company-1"),
    });

    act(() => {
      root.unmount();
    });
  });
});
