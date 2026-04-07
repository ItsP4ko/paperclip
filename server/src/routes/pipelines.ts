import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { notFound } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";
import { pipelineService } from "../services/pipelines.js";
import { validate } from "../middleware/validate.js";

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
  name:      z.string().min(1),
  agentId:   z.string().optional(),
  dependsOn: z.array(z.string()).optional(),
  position:  z.number().optional(),
  config:    z.record(z.unknown()).optional(),
});

const updatePipelineStepSchema = createPipelineStepSchema.partial();

const triggerPipelineRunSchema = z.object({
  projectId:   z.string().optional(),
  triggeredBy: z.string().optional(),
});

export function pipelineRoutes(db: Db) {
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

  // Get pipeline detail (with steps)
  router.get("/companies/:companyId/pipelines/:pipelineId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const pipelineId = req.params.pipelineId as string;
    assertCompanyAccess(req, companyId);
    const pipeline = await svc.getById(companyId, pipelineId);
    if (!pipeline) throw notFound("Pipeline not found");
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
    res.json(pipeline);
  });

  // Delete pipeline
  router.delete("/companies/:companyId/pipelines/:pipelineId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const pipelineId = req.params.pipelineId as string;
    assertCompanyAccess(req, companyId);
    await svc.delete(companyId, pipelineId);
    res.status(204).send();
  });

  // Create step
  router.post("/companies/:companyId/pipelines/:pipelineId/steps", validate(createPipelineStepSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const pipelineId = req.params.pipelineId as string;
    assertCompanyAccess(req, companyId);
    const { name, agentId, dependsOn, position, config } = req.body;
    const step = await svc.createStep(companyId, pipelineId, {
      name,
      agentId,
      dependsOn,
      position,
      config,
    });
    if (!step) throw notFound("Pipeline not found");
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
      const { name, agentId, dependsOn, position, config } = req.body;
      const step = await svc.updateStep(companyId, pipelineId, stepId, {
        name,
        agentId,
        dependsOn,
        position,
        config,
      });
      if (!step) throw notFound("Step not found");
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
      res.status(204).send();
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
    const run = await svc.getRunById(companyId, runId);
    if (!run) throw notFound("Run not found");
    res.json(run);
  });

  return router;
}
