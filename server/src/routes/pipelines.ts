import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { notFound } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";
import { pipelineService } from "../services/pipelines.js";

export function pipelineRoutes(db: Db) {
  const router = Router();
  const svc = pipelineService(db);

  // List pipelines
  router.get("/companies/:companyId/pipelines", async (req, res) => {
    const { companyId } = req.params;
    assertCompanyAccess(req, companyId);
    const rows = await svc.list(companyId);
    res.json(rows);
  });

  // Create pipeline
  router.post("/companies/:companyId/pipelines", async (req, res) => {
    const { companyId } = req.params;
    assertCompanyAccess(req, companyId);
    const { name, description, status } = req.body;
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const pipeline = await svc.create(companyId, { name, description, status });
    res.status(201).json(pipeline);
  });

  // Get pipeline detail (with steps)
  router.get("/companies/:companyId/pipelines/:pipelineId", async (req, res) => {
    const { companyId, pipelineId } = req.params;
    assertCompanyAccess(req, companyId);
    const pipeline = await svc.getById(companyId, pipelineId);
    if (!pipeline) throw notFound("Pipeline not found");
    res.json(pipeline);
  });

  // Update pipeline
  router.patch("/companies/:companyId/pipelines/:pipelineId", async (req, res) => {
    const { companyId, pipelineId } = req.params;
    assertCompanyAccess(req, companyId);
    const { name, description, status } = req.body;
    const pipeline = await svc.update(companyId, pipelineId, { name, description, status });
    if (!pipeline) throw notFound("Pipeline not found");
    res.json(pipeline);
  });

  // Delete pipeline
  router.delete("/companies/:companyId/pipelines/:pipelineId", async (req, res) => {
    const { companyId, pipelineId } = req.params;
    assertCompanyAccess(req, companyId);
    await svc.delete(companyId, pipelineId);
    res.status(204).send();
  });

  // Create step
  router.post("/companies/:companyId/pipelines/:pipelineId/steps", async (req, res) => {
    const { companyId, pipelineId } = req.params;
    assertCompanyAccess(req, companyId);
    const { name, agentId, dependsOn, position, config } = req.body;
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "name is required" });
      return;
    }
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
    async (req, res) => {
      const { companyId, pipelineId, stepId } = req.params;
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
      const { companyId, pipelineId, stepId } = req.params;
      assertCompanyAccess(req, companyId);
      await svc.deleteStep(companyId, pipelineId, stepId);
      res.status(204).send();
    },
  );

  // Trigger run
  router.post(
    "/companies/:companyId/pipelines/:pipelineId/run",
    async (req, res) => {
      const { companyId, pipelineId } = req.params;
      assertCompanyAccess(req, companyId);
      const { projectId, triggeredBy } = req.body;
      const run = await svc.triggerRun(companyId, pipelineId, { projectId, triggeredBy });
      if (!run) throw notFound("Pipeline not found");
      res.status(201).json(run);
    },
  );

  // List runs for company (optionally filtered by pipeline)
  router.get("/companies/:companyId/pipeline-runs", async (req, res) => {
    const { companyId } = req.params;
    assertCompanyAccess(req, companyId);
    const pipelineId = typeof req.query.pipelineId === "string" ? req.query.pipelineId : undefined;
    const rows = await svc.listRuns(companyId, pipelineId);
    res.json(rows);
  });

  // Get run detail (with step statuses)
  router.get("/companies/:companyId/pipeline-runs/:runId", async (req, res) => {
    const { companyId, runId } = req.params;
    assertCompanyAccess(req, companyId);
    const run = await svc.getRunById(companyId, runId);
    if (!run) throw notFound("Run not found");
    res.json(run);
  });

  return router;
}
