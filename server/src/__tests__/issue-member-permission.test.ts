import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/index.js";
import { issueRoutes } from "../routes/issues.js";

const ISSUE_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_ID = "22222222-2222-4222-8222-222222222222";

const mockIssueService = vi.hoisted(() => ({
  getById: vi.fn(),
  getByIdentifier: vi.fn(),
  update: vi.fn(),
  assertCheckoutOwner: vi.fn(),
  addComment: vi.fn(),
  findMentionedAgents: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(),
  hasPermission: vi.fn(),
  getMembership: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("../services/index.js", () => ({
  accessService: () => mockAccessService,
  agentService: () => ({
    getById: vi.fn(),
  }),
  documentService: () => ({}),
  executionWorkspaceService: () => ({}),
  feedbackService: () => ({
    listIssueVotesForUser: vi.fn(async () => []),
    saveIssueVote: vi.fn(),
  }),
  goalService: () => ({}),
  heartbeatService: () => ({
    wakeup: vi.fn(async () => undefined),
    reportRunActivity: vi.fn(async () => undefined),
    getRun: vi.fn(async () => null),
    getActiveRunForAgent: vi.fn(async () => null),
    cancelRun: vi.fn(async () => null),
  }),
  instanceSettingsService: () => ({
    get: vi.fn(async () => ({
      id: "instance-settings-1",
      general: {
        censorUsernameInLogs: false,
        feedbackDataSharingPreference: "prompt",
      },
    })),
    listCompanyIds: vi.fn(async () => [COMPANY_ID]),
  }),
  issueApprovalService: () => ({}),
  issueService: () => mockIssueService,
  logActivity: mockLogActivity,
  projectService: () => ({}),
  routineService: () => ({
    syncRunStatusForIssue: vi.fn(async () => undefined),
  }),
  workProductService: () => ({}),
}));

const baseExistingIssue = {
  id: ISSUE_ID,
  companyId: COMPANY_ID,
  title: "Test issue",
  status: "todo",
  priority: "medium",
  assigneeUserId: "user-b",
  assigneeAgentId: null,
  createdByUserId: "user-b",
  identifier: "TEST-1",
};

function createApp(actor: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  const mockDb = { insert: () => ({ values: async () => [] }) };
  app.use("/api", issueRoutes(mockDb as any, {} as any));
  app.use(errorHandler);
  return app;
}

describe("PATCH /issues/:id member permission gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: update succeeds
    mockIssueService.update.mockResolvedValue({ ...baseExistingIssue, status: "in_progress" });
    mockAccessService.getMembership.mockResolvedValue(null);
    mockAccessService.canUser.mockResolvedValue(true);
    mockAccessService.hasPermission.mockResolvedValue(false);
    // assertCheckoutOwner returns no prior run conflict by default
    mockIssueService.assertCheckoutOwner.mockResolvedValue({ adoptedFromRunId: null });
  });

  it("returns 403 when non-owner member patches another user's task", async () => {
    mockIssueService.getById.mockResolvedValue({ ...baseExistingIssue, assigneeUserId: "user-b" });
    mockAccessService.getMembership.mockResolvedValue({ membershipRole: "member", status: "active" });

    const actor = {
      type: "board",
      userId: "user-a",
      companyIds: [COMPANY_ID],
      source: "board_session",
      isInstanceAdmin: false,
    };

    const res = await request(createApp(actor))
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ status: "in_progress" });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Members can only mutate their own tasks/);
  });

  it("returns 200 when non-owner member patches their own task", async () => {
    mockIssueService.getById.mockResolvedValue({ ...baseExistingIssue, assigneeUserId: "user-a" });
    mockAccessService.getMembership.mockResolvedValue({ membershipRole: "member", status: "active" });

    const actor = {
      type: "board",
      userId: "user-a",
      companyIds: [COMPANY_ID],
      source: "board_session",
      isInstanceAdmin: false,
    };

    const res = await request(createApp(actor))
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ status: "in_progress" });

    expect(res.status).toBe(200);
  });

  it("returns 200 when owner patches any task", async () => {
    mockIssueService.getById.mockResolvedValue({ ...baseExistingIssue, assigneeUserId: "user-b" });
    mockAccessService.getMembership.mockResolvedValue({ membershipRole: "owner", status: "active" });

    const actor = {
      type: "board",
      userId: "owner-1",
      companyIds: [COMPANY_ID],
      source: "board_session",
      isInstanceAdmin: false,
    };

    const res = await request(createApp(actor))
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ status: "in_progress" });

    expect(res.status).toBe(200);
  });

  it("bypasses gate for local_implicit actor", async () => {
    mockIssueService.getById.mockResolvedValue({ ...baseExistingIssue, assigneeUserId: "user-b" });

    const actor = {
      type: "board",
      userId: "local-board",
      companyIds: [COMPANY_ID],
      source: "local_implicit",
      isInstanceAdmin: false,
    };

    const res = await request(createApp(actor))
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ status: "in_progress" });

    expect(res.status).toBe(200);
    // getMembership should NOT be called for local_implicit
    expect(mockAccessService.getMembership).not.toHaveBeenCalled();
  });

  it("does not affect agent actors", async () => {
    mockIssueService.getById.mockResolvedValue({ ...baseExistingIssue, assigneeUserId: "user-b" });

    const actor = {
      type: "agent",
      agentId: "33333333-3333-4333-8333-333333333333",
      companyId: COMPANY_ID,
      source: "agent_key",
    };

    const res = await request(createApp(actor))
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ status: "in_progress" });

    expect(res.status).toBe(200);
    // Gate only fires for board actors — getMembership must not be called
    expect(mockAccessService.getMembership).not.toHaveBeenCalled();
  });
});
