import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/index.js";
import { sidebarBadgeRoutes } from "../routes/sidebar-badges.js";

const mockSidebarBadgeService = vi.hoisted(() => ({
  get: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(),
  hasPermission: vi.fn(),
}));

const mockDashboardService = vi.hoisted(() => ({
  summary: vi.fn(),
}));

vi.mock("../services/sidebar-badges.js", () => ({
  sidebarBadgeService: () => mockSidebarBadgeService,
}));

vi.mock("../services/access.js", () => ({
  accessService: () => mockAccessService,
}));

vi.mock("../services/dashboard.js", () => ({
  dashboardService: () => mockDashboardService,
}));

/**
 * Build a chainable mock db whose select chain resolves to `rows`.
 * The chain supports: select → from → where → then (Promise resolution).
 */
function makeMockDb(rows: unknown[] = [{ count: 0 }]) {
  const chain: Record<string, any> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  // Make chain thenable so `.then()` works (used in joinRequestCount query)
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
  return chain as any;
}

const defaultSvcResponse = {
  inbox: 0,
  approvals: 0,
  failedRuns: 0,
  joinRequests: 0,
  myTasks: 0,
};

function createApp(
  actorOverride?: Partial<{ type: string; userId: string; isInstanceAdmin: boolean; source: string }>,
  dbRows?: unknown[],
) {
  const actor = {
    type: "board",
    userId: "user-1",
    companyIds: ["company-1"],
    source: "session",
    isInstanceAdmin: false,
    ...actorOverride,
  };
  const mockDb = makeMockDb(dbRows);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", sidebarBadgeRoutes(mockDb));
  app.use(errorHandler);
  return app;
}

describe("sidebar badges route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccessService.canUser.mockResolvedValue(false);
    mockAccessService.hasPermission.mockResolvedValue(false);
    mockDashboardService.summary.mockResolvedValue({
      agents: { error: 0 },
      costs: { monthBudgetCents: 0, monthUtilizationPercent: 0 },
    });
    mockSidebarBadgeService.get.mockResolvedValue(defaultSvcResponse);
  });

  it("returns a response body with myTasks as a number", async () => {
    mockSidebarBadgeService.get.mockResolvedValue({
      ...defaultSvcResponse,
      myTasks: 3,
    });

    const res = await request(createApp()).get("/api/companies/company-1/sidebar-badges");

    expect(res.status).toBe(200);
    expect(typeof res.body.myTasks).toBe("number");
    expect(res.body.myTasks).toBe(3);
  });

  it("passes myTasks count to svc.get for board actors", async () => {
    // db query returns count = 5 for myTasksCount
    const res = await request(createApp(undefined, [{ count: 5 }])).get(
      "/api/companies/company-1/sidebar-badges",
    );

    expect(res.status).toBe(200);
    expect(mockSidebarBadgeService.get).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ myTasks: expect.any(Number) }),
    );
  });

  it("passes myTasks as 0 for agent actors", async () => {
    const mockDb = makeMockDb([{ count: 0 }]);
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).actor = {
        type: "agent",
        agentId: "agent-1",
        companyId: "company-1",
      };
      next();
    });
    app.use("/api", sidebarBadgeRoutes(mockDb));
    app.use(errorHandler);

    const res = await request(app).get("/api/companies/company-1/sidebar-badges");

    expect(res.status).toBe(200);
    expect(mockSidebarBadgeService.get).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ myTasks: 0 }),
    );
  });
});
