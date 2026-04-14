import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pipelineRoutes } from "../routes/pipelines.js";
import { errorHandler } from "../middleware/index.js";

const companyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const pipelineId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const stepId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const agentId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const userId = "user-owner-1";
const runId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const runStepId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const basePipeline = {
  id: pipelineId,
  companyId,
  name: "Test Pipeline",
  description: null,
  status: "draft",
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

const basePipelineWithSteps = { ...basePipeline, steps: [] };

const baseStep = {
  id: stepId,
  pipelineId,
  name: "Step 1",
  agentId,
  dependsOn: [],
  config: {},
  position: 0,
  assigneeType: "agent",
  assigneeUserId: null,
  issueId: null,
  positionX: null,
  positionY: null,
  stepType: "action",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseRun = {
  id: runId,
  pipelineId,
  companyId,
  status: "running",
  triggeredBy: "manual",
  startedAt: new Date(),
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── Mocked service ───────────────────────────────────────────────────────────

const mockPipelineService = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  createFromIssues: vi.fn(),
  createStep: vi.fn(),
  updateStep: vi.fn(),
  deleteStep: vi.fn(),
  batchUpdatePositions: vi.fn(),
  triggerRun: vi.fn(),
  listRuns: vi.fn(),
  getRunById: vi.fn(),
  completeRunStep: vi.fn(),
  onIssueStatusChange: vi.fn(),
}));

vi.mock("../services/pipelines.js", () => ({
  pipelineService: () => mockPipelineService,
}));

function createDbStub() {
  return {};
}

function createApp(actor: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", pipelineRoutes(createDbStub() as any));
  app.use(errorHandler);
  return app;
}

const memberActor = {
  type: "board",
  userId,
  source: "session",
  isInstanceAdmin: false,
  companyIds: [companyId],
};

const outsiderActor = {
  type: "board",
  userId: "outsider",
  source: "session",
  isInstanceAdmin: false,
  companyIds: [],
};

describe("pipeline routes (unit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPipelineService.list.mockResolvedValue([]);
    mockPipelineService.getById.mockResolvedValue(basePipelineWithSteps);
    mockPipelineService.create.mockResolvedValue(basePipeline);
    mockPipelineService.update.mockResolvedValue({ ...basePipeline, name: "Updated" });
    mockPipelineService.delete.mockResolvedValue(undefined);
    mockPipelineService.createStep.mockResolvedValue(baseStep);
    mockPipelineService.updateStep.mockResolvedValue(baseStep);
    mockPipelineService.deleteStep.mockResolvedValue(undefined);
    mockPipelineService.batchUpdatePositions.mockResolvedValue(undefined);
    mockPipelineService.triggerRun.mockResolvedValue(baseRun);
    mockPipelineService.listRuns.mockResolvedValue([baseRun]);
    mockPipelineService.getRunById.mockResolvedValue({ ...baseRun, steps: [] });
    mockPipelineService.completeRunStep.mockResolvedValue(runId);
  });

  // ─── LIST ──────────────────────────────────────────────────────────────────

  describe("GET /companies/:companyId/pipelines", () => {
    it("returns pipeline list for company member", async () => {
      mockPipelineService.list.mockResolvedValue([basePipeline]);
      const app = createApp(memberActor);

      const res = await request(app).get(`/api/companies/${companyId}/pipelines`);

      expect(res.status).toBe(200);
      expect(mockPipelineService.list).toHaveBeenCalledWith(companyId);
    });

    it("returns 403 for outsider", async () => {
      const app = createApp(outsiderActor);

      const res = await request(app).get(`/api/companies/${companyId}/pipelines`);

      expect(res.status).toBe(403);
      expect(mockPipelineService.list).not.toHaveBeenCalled();
    });
  });

  // ─── CREATE ────────────────────────────────────────────────────────────────

  describe("POST /companies/:companyId/pipelines", () => {
    it("creates pipeline and returns 201", async () => {
      const app = createApp(memberActor);

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "My Pipeline" });

      expect(res.status).toBe(201);
      expect(mockPipelineService.create).toHaveBeenCalledWith(companyId, {
        name: "My Pipeline",
        description: undefined,
        status: undefined,
      });
    });

    it("validates name is required (Zod → 400)", async () => {
      const app = createApp(memberActor);

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({});

      expect(res.status).toBe(400);
      expect(mockPipelineService.create).not.toHaveBeenCalled();
    });

    it("validates name is non-empty (Zod → 400)", async () => {
      const app = createApp(memberActor);

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "" });

      expect(res.status).toBe(400);
    });
  });

  // ─── GET DETAIL ────────────────────────────────────────────────────────────

  describe("GET /companies/:companyId/pipelines/:pipelineId", () => {
    it("returns pipeline with steps", async () => {
      const app = createApp(memberActor);

      const res = await request(app).get(
        `/api/companies/${companyId}/pipelines/${pipelineId}`,
      );

      expect(res.status).toBe(200);
      expect(mockPipelineService.getById).toHaveBeenCalledWith(companyId, pipelineId);
    });

    it("returns 404 when service returns null", async () => {
      mockPipelineService.getById.mockResolvedValue(null);
      const app = createApp(memberActor);

      const res = await request(app).get(
        `/api/companies/${companyId}/pipelines/${pipelineId}`,
      );

      expect(res.status).toBe(404);
    });
  });

  // ─── UPDATE ────────────────────────────────────────────────────────────────

  describe("PATCH /companies/:companyId/pipelines/:pipelineId", () => {
    it("updates pipeline and returns 200", async () => {
      const app = createApp(memberActor);

      const res = await request(app)
        .patch(`/api/companies/${companyId}/pipelines/${pipelineId}`)
        .send({ name: "Updated", status: "active" });

      expect(res.status).toBe(200);
      expect(mockPipelineService.update).toHaveBeenCalledWith(companyId, pipelineId, {
        name: "Updated",
        description: undefined,
        status: "active",
      });
    });

    it("returns 404 when service returns null", async () => {
      mockPipelineService.update.mockResolvedValue(null);
      const app = createApp(memberActor);

      const res = await request(app)
        .patch(`/api/companies/${companyId}/pipelines/${pipelineId}`)
        .send({ name: "Ghost" });

      expect(res.status).toBe(404);
    });

    it("validates update body (empty name fails Zod)", async () => {
      const app = createApp(memberActor);

      const res = await request(app)
        .patch(`/api/companies/${companyId}/pipelines/${pipelineId}`)
        .send({ name: "" });

      expect(res.status).toBe(400);
    });
  });

  // ─── DELETE ────────────────────────────────────────────────────────────────

  describe("DELETE /companies/:companyId/pipelines/:pipelineId", () => {
    it("deletes pipeline and returns 204", async () => {
      const app = createApp(memberActor);

      const res = await request(app).delete(
        `/api/companies/${companyId}/pipelines/${pipelineId}`,
      );

      expect(res.status).toBe(204);
      expect(mockPipelineService.delete).toHaveBeenCalledWith(companyId, pipelineId);
    });
  });

  // ─── CREATE STEP ───────────────────────────────────────────────────────────

  describe("POST /companies/:companyId/pipelines/:pipelineId/steps", () => {
    it("creates a step and returns 201", async () => {
      const app = createApp(memberActor);

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Build", agentId, assigneeType: "agent" });

      expect(res.status).toBe(201);
      expect(mockPipelineService.createStep).toHaveBeenCalledWith(
        companyId,
        pipelineId,
        expect.objectContaining({ name: "Build", agentId, assigneeType: "agent" }),
      );
    });

    it("validates step name is required (Zod)", async () => {
      const app = createApp(memberActor);

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ agentId });

      expect(res.status).toBe(400);
    });

    it("validates stepType enum (Zod → 400)", async () => {
      const app = createApp(memberActor);

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Step", stepType: "unknown_type" });

      expect(res.status).toBe(400);
    });

    it("returns 404 when service returns null (pipeline not found)", async () => {
      mockPipelineService.createStep.mockResolvedValue(null);
      const app = createApp(memberActor);

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Ghost Step", agentId, assigneeType: "agent" });

      expect(res.status).toBe(404);
    });
  });

  // ─── UPDATE STEP ───────────────────────────────────────────────────────────

  describe("PATCH /companies/:companyId/pipelines/:pipelineId/steps/:stepId", () => {
    it("updates step and returns 200", async () => {
      const app = createApp(memberActor);

      const res = await request(app)
        .patch(`/api/companies/${companyId}/pipelines/${pipelineId}/steps/${stepId}`)
        .send({ name: "Renamed Step" });

      expect(res.status).toBe(200);
    });

    it("returns 404 when service returns null", async () => {
      mockPipelineService.updateStep.mockResolvedValue(null);
      const app = createApp(memberActor);

      const res = await request(app)
        .patch(`/api/companies/${companyId}/pipelines/${pipelineId}/steps/${stepId}`)
        .send({ name: "Ghost" });

      expect(res.status).toBe(404);
    });
  });

  // ─── DELETE STEP ───────────────────────────────────────────────────────────

  describe("DELETE /companies/:companyId/pipelines/:pipelineId/steps/:stepId", () => {
    it("deletes step and returns 204", async () => {
      const app = createApp(memberActor);

      const res = await request(app).delete(
        `/api/companies/${companyId}/pipelines/${pipelineId}/steps/${stepId}`,
      );

      expect(res.status).toBe(204);
      expect(mockPipelineService.deleteStep).toHaveBeenCalledWith(companyId, pipelineId, stepId);
    });
  });

  // ─── BATCH POSITIONS ───────────────────────────────────────────────────────

  describe("PATCH /companies/:companyId/pipelines/:pipelineId/steps/positions", () => {
    it("batch updates positions and returns updated count", async () => {
      const app = createApp(memberActor);

      const res = await request(app)
        .patch(`/api/companies/${companyId}/pipelines/${pipelineId}/steps/positions`)
        .send({
          positions: [{ stepId, positionX: 10, positionY: 20 }],
        });

      expect(res.status).toBe(200);
      expect(res.body.updated).toBe(1);
    });

    it("returns 400 when positions array is empty (Zod min(1))", async () => {
      const app = createApp(memberActor);

      const res = await request(app)
        .patch(`/api/companies/${companyId}/pipelines/${pipelineId}/steps/positions`)
        .send({ positions: [] });

      expect(res.status).toBe(400);
    });
  });

  // ─── TRIGGER RUN ───────────────────────────────────────────────────────────

  describe("POST /companies/:companyId/pipelines/:pipelineId/run", () => {
    it("triggers run and returns 201", async () => {
      const app = createApp(memberActor);

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/run`)
        .send({ triggeredBy: "test-suite" });

      expect(res.status).toBe(201);
      expect(mockPipelineService.triggerRun).toHaveBeenCalledWith(
        companyId,
        pipelineId,
        expect.objectContaining({ triggeredBy: "test-suite" }),
      );
    });

    it("returns 404 when pipeline not found (service returns null)", async () => {
      mockPipelineService.triggerRun.mockResolvedValue(null);
      const app = createApp(memberActor);

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/run`)
        .send({});

      expect(res.status).toBe(404);
    });

    it("returns 403 for outsider", async () => {
      const app = createApp(outsiderActor);

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/run`)
        .send({});

      expect(res.status).toBe(403);
      expect(mockPipelineService.triggerRun).not.toHaveBeenCalled();
    });
  });

  // ─── LIST RUNS ─────────────────────────────────────────────────────────────

  describe("GET /companies/:companyId/pipeline-runs", () => {
    it("lists runs for company", async () => {
      const app = createApp(memberActor);

      const res = await request(app).get(`/api/companies/${companyId}/pipeline-runs`);

      expect(res.status).toBe(200);
      expect(mockPipelineService.listRuns).toHaveBeenCalledWith(companyId, undefined);
    });

    it("filters by pipelineId when query param is provided", async () => {
      const app = createApp(memberActor);

      const res = await request(app).get(
        `/api/companies/${companyId}/pipeline-runs?pipelineId=${pipelineId}`,
      );

      expect(res.status).toBe(200);
      expect(mockPipelineService.listRuns).toHaveBeenCalledWith(companyId, pipelineId);
    });
  });

  // ─── GET RUN ───────────────────────────────────────────────────────────────

  describe("GET /companies/:companyId/pipeline-runs/:runId", () => {
    it("returns run detail", async () => {
      const app = createApp(memberActor);

      const res = await request(app).get(
        `/api/companies/${companyId}/pipeline-runs/${runId}`,
      );

      expect(res.status).toBe(200);
      expect(mockPipelineService.getRunById).toHaveBeenCalledWith(companyId, runId);
    });

    it("returns 404 when run not found", async () => {
      mockPipelineService.getRunById.mockResolvedValue(null);
      const app = createApp(memberActor);

      const res = await request(app).get(
        `/api/companies/${companyId}/pipeline-runs/${runId}`,
      );

      expect(res.status).toBe(404);
    });
  });

  // ─── COMPLETE RUN STEP ─────────────────────────────────────────────────────

  describe("POST /companies/:companyId/pipeline-runs/:runId/steps/:runStepId/complete", () => {
    it("completes step and returns 200", async () => {
      const app = createApp(memberActor);

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipeline-runs/${runId}/steps/${runStepId}/complete`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.completed).toBe(true);
      expect(mockPipelineService.completeRunStep).toHaveBeenCalledWith(
        companyId,
        runId,
        runStepId,
        userId,
      );
    });

    it("returns 404 when service returns null (wrong user or step not running)", async () => {
      mockPipelineService.completeRunStep.mockResolvedValue(null);
      const app = createApp(memberActor);

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipeline-runs/${runId}/steps/${runStepId}/complete`)
        .send({});

      expect(res.status).toBe(404);
    });

    it("returns 401 when actor has no userId", async () => {
      const app = createApp({
        type: "board",
        source: "local_implicit",
        isInstanceAdmin: false,
        companyIds: [companyId],
      });

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipeline-runs/${runId}/steps/${runStepId}/complete`)
        .send({});

      expect(res.status).toBe(401);
    });
  });
});
