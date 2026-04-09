import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import type { RedisClientType } from "redis";
import { notFound } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";
import { pipelineService } from "../services/pipelines.js";
import { validate } from "../middleware/validate.js";

const PIPELINE_DETAIL_TTL = 300;
const PIPELINE_RUN_TTL = 300;

const createPipelineSchema = z.object({
  name:        z.string().min(1),
  description: z.string().optional(),
  status:      z.string().optional(),
});

const updatePipelineSchema = z.object({
  name:        z.string().min(1).optional(),
  description: z.string().optional(),
  status:      z.string().optional(),
});

const createPipelineStepSchema = z.object({
  name:           z.string().min(1),
  agentId:        z.string().nullable().optional(),
  assigneeType:   z.enum(["agent", "user"]).nullable().optional(),
  assigneeUserId: z.string().nullable().optional(),
  issueId:        z.string().nullable().optional(),
  dependsOn:      z.array(z.string()).optional(),
  position:       z.number().optional(),
  config:         z.record(z.unknown()).optional(),
  positionX:      z.number().nullable().optional(),
  positionY:      z.number().nullable().optional(),
  stepType:       z.enum(["action", "if_else"]).optional(),
});

const updatePipelineStepSchema = createPipelineStepSchema.partial();

const createPipelineFromIssuesSchema = z.object({
  name:        z.string().min(1),
  description: z.string().optional(),
  issueIds:    z.array(z.string()).min(1),
});

const batchPositionsSchema = z.object({
  positions: z.array(z.object({
    stepId: z.string(),
    positionX: z.number(),
    positionY: z.number(),
  })).min(1),
});

const triggerPipelineRunSchema = z.object({
  projectId:   z.string().optional(),
  triggeredBy: z.string().optional(),
});

export function pipelineRoutes(db: Db, redisClient?: RedisClientType) {
  const router = Router();
  const svc = pipelineService(db);

  // List pipelines
  router.get("/companies/:companyId/pipelines", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const rows = await svc.list(companyId);
    res.json(rows);
  });

  // Create pipeline
  router.post("/companies/:companyId/pipelines", validate(createPipelineSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { name, description, status } = req.body;
    const pipeline = await svc.create(companyId, { name, description, status });
    res.status(201).json(pipeline);
  });

  // Create pipeline from issues (MUST be before /:pipelineId routes)
  router.post("/companies/:companyId/pipelines/from-issues", validate(createPipelineFromIssuesSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { name, description, issueIds } = req.body;
    const pipeline = await svc.createFromIssues(companyId, { name, description, issueIds });
    res.status(201).json(pipeline);
  });

  // Get pipeline detail (with steps)
  router.get("/companies/:companyId/pipelines/:pipelineId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const pipelineId = req.params.pipelineId as string;
    assertCompanyAccess(req, companyId);

    const cacheKey = `paperclip:pipeline:detail:${pipelineId}`;
    if (redisClient?.isReady) {
      const cached = await redisClient.get(cacheKey).catch(() => null);
      if (cached) { res.json(JSON.parse(cached)); return; }
    }

    const pipeline = await svc.getById(companyId, pipelineId);
    if (!pipeline) throw notFound("Pipeline not found");

    if (redisClient?.isReady) {
      await redisClient.set(cacheKey, JSON.stringify(pipeline), { EX: PIPELINE_DETAIL_TTL }).catch(() => null);
    }

    res.json(pipeline);
  });

  // Update pipeline
  router.patch("/companies/:companyId/pipelines/:pipelineId", validate(updatePipelineSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const pipelineId = req.params.pipelineId as string;
    assertCompanyAccess(req, companyId);
    const { name, description, status } = req.body;
    const pipeline = await svc.update(companyId, pipelineId, { name, description, status });
    if (!pipeline) throw notFound("Pipeline not found");
    await redisClient?.del(`paperclip:pipeline:detail:${pipelineId}`).catch(() => null);
    res.json(pipeline);
  });

  // Delete pipeline
  router.delete("/companies/:companyId/pipelines/:pipelineId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const pipelineId = req.params.pipelineId as string;
    assertCompanyAccess(req, companyId);
    await svc.delete(companyId, pipelineId);
    await redisClient?.del(`paperclip:pipeline:detail:${pipelineId}`).catch(() => null);
    res.status(204).send();
  });

  // Create step
  router.post("/companies/:companyId/pipelines/:pipelineId/steps", validate(createPipelineStepSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const pipelineId = req.params.pipelineId as string;
    assertCompanyAccess(req, companyId);
    const { name, agentId, assigneeType, assigneeUserId, issueId, dependsOn, position, config, positionX, positionY, stepType } = req.body;
    const step = await svc.createStep(companyId, pipelineId, {
      name,
      agentId,
      assigneeType,
      assigneeUserId,
      issueId,
      dependsOn,
      position,
      config,
      positionX,
      positionY,
      stepType,
    });
    if (!step) throw notFound("Pipeline not found");
    await redisClient?.del(`paperclip:pipeline:detail:${pipelineId}`).catch(() => null);
    res.status(201).json(step);
  });

  // Update step
  router.patch(
    "/companies/:companyId/pipelines/:pipelineId/steps/:stepId",
    validate(updatePipelineStepSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const pipelineId = req.params.pipelineId as string;
      const stepId = req.params.stepId as string;
      assertCompanyAccess(req, companyId);
      const { name, agentId, assigneeType, assigneeUserId, issueId, dependsOn, position, config, positionX, positionY, stepType } = req.body;
      const step = await svc.updateStep(companyId, pipelineId, stepId, {
        name,
        agentId,
        assigneeType,
        assigneeUserId,
        issueId,
        dependsOn,
        position,
        config,
        positionX,
        positionY,
        stepType,
      });
      if (!step) throw notFound("Step not found");
      await redisClient?.del(`paperclip:pipeline:detail:${pipelineId}`).catch(() => null);
      res.json(step);
    },
  );

  // Delete step
  router.delete(
    "/companies/:companyId/pipelines/:pipelineId/steps/:stepId",
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const pipelineId = req.params.pipelineId as string;
      const stepId = req.params.stepId as string;
      assertCompanyAccess(req, companyId);
      await svc.deleteStep(companyId, pipelineId, stepId);
      await redisClient?.del(`paperclip:pipeline:detail:${pipelineId}`).catch(() => null);
      res.status(204).send();
    },
  );

  // Batch update step positions
  router.patch(
    "/companies/:companyId/pipelines/:pipelineId/steps/positions",
    validate(batchPositionsSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const pipelineId = req.params.pipelineId as string;
      assertCompanyAccess(req, companyId);
      const { positions } = req.body;
      await svc.batchUpdatePositions(companyId, pipelineId, positions);
      await redisClient?.del(`paperclip:pipeline:detail:${pipelineId}`).catch(() => null);
      res.json({ updated: positions.length });
    },
  );

  // Trigger run
  router.post(
    "/companies/:companyId/pipelines/:pipelineId/run",
    validate(triggerPipelineRunSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const pipelineId = req.params.pipelineId as string;
      assertCompanyAccess(req, companyId);
      const { projectId, triggeredBy } = req.body;
      const run = await svc.triggerRun(companyId, pipelineId, { projectId, triggeredBy });
      if (!run) throw notFound("Pipeline not found");
      res.status(201).json(run);
    },
  );

  // List runs for company (optionally filtered by pipeline)
  router.get("/companies/:companyId/pipeline-runs", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const pipelineId = typeof req.query.pipelineId === "string" ? req.query.pipelineId : undefined;
    const rows = await svc.listRuns(companyId, pipelineId);
    res.json(rows);
  });

  // Get run detail (with step statuses)
  router.get("/companies/:companyId/pipeline-runs/:runId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const runId = req.params.runId as string;
    assertCompanyAccess(req, companyId);

    const cacheKey = `paperclip:pipeline:run:${runId}`;
    if (redisClient?.isReady) {
      const cached = await redisClient.get(cacheKey).catch(() => null);
      if (cached) { res.json(JSON.parse(cached)); return; }
    }

    const run = await svc.getRunById(companyId, runId);
    if (!run) throw notFound("Run not found");

    if (redisClient?.isReady) {
      const isRunning = run.status === "running" || run.status === "pending";
      const ttl = isRunning ? 5 : PIPELINE_RUN_TTL;
      await redisClient.set(cacheKey, JSON.stringify(run), { EX: ttl }).catch(() => null);
    }

    res.json(run);
  });

  // Complete a run step (human assignee marks their step as done)
  router.post(
    "/companies/:companyId/pipeline-runs/:runId/steps/:runStepId/complete",
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const runId = req.params.runId as string;
      const runStepId = req.params.runStepId as string;
      assertCompanyAccess(req, companyId);
      const userId = (req as any).user?.id ?? (req as any).session?.userId;
      if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
      const result = await svc.completeRunStep(companyId, runId, runStepId, userId);
      if (!result) { res.status(404).json({ error: "Step not found or not assignable" }); return; }
      await redisClient?.del(`paperclip:pipeline:run:${runId}`).catch(() => null);
      res.json({ completed: true });
    },
  );

  return router;
}
