import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  addIssueToSprintSchema,
  completeSprintSchema,
  createSprintSchema,
  updateSprintSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { sprintService, logActivity } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

export function sprintRoutes(db: Db) {
  const router = Router();
  const svc = sprintService(db);

  router.get("/companies/:companyId/sprints", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await svc.list(companyId);
    res.json(result);
  });

  router.get("/companies/:companyId/sprints/active", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const sprint = await svc.getActive(companyId);
    res.json(sprint ?? null);
  });

  router.get("/sprints/:id", async (req, res) => {
    const id = req.params.id as string;
    const sprint = await svc.getById(id);
    if (!sprint) {
      res.status(404).json({ error: "Sprint not found" });
      return;
    }
    assertCompanyAccess(req, sprint.companyId);
    res.json(sprint);
  });

  router.get("/sprints/:id/metrics", async (req, res) => {
    const id = req.params.id as string;
    const sprint = await svc.getById(id);
    if (!sprint) {
      res.status(404).json({ error: "Sprint not found" });
      return;
    }
    assertCompanyAccess(req, sprint.companyId);
    const metrics = await svc.getMetrics(id);
    res.json(metrics);
  });

  router.post("/companies/:companyId/sprints", validate(createSprintSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const sprint = await svc.create(companyId, req.body);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "sprint.created",
      entityType: "sprint",
      entityId: sprint.id,
      details: { name: sprint.name },
    });
    res.status(201).json(sprint);
  });

  router.patch("/sprints/:id", validate(updateSprintSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Sprint not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const sprint = await svc.update(id, req.body);
    if (!sprint) {
      res.status(404).json({ error: "Sprint not found" });
      return;
    }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: sprint.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "sprint.updated",
      entityType: "sprint",
      entityId: sprint.id,
      details: req.body,
    });
    res.json(sprint);
  });

  router.post("/sprints/:id/activate", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Sprint not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const sprint = await svc.activate(id);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "sprint.activated",
      entityType: "sprint",
      entityId: id,
    });
    res.json(sprint);
  });

  router.post("/sprints/:id/complete", validate(completeSprintSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Sprint not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const { spillStrategy, nextSprintId } = req.body as { spillStrategy: "backlog" | "next_sprint"; nextSprintId?: string };
    const sprint = await svc.complete(id, spillStrategy, nextSprintId);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "sprint.completed",
      entityType: "sprint",
      entityId: id,
      details: { spillStrategy, nextSprintId },
    });
    res.json(sprint);
  });

  router.post("/sprints/:id/issues", validate(addIssueToSprintSchema), async (req, res) => {
    const id = req.params.id as string;
    const sprint = await svc.getById(id);
    if (!sprint) {
      res.status(404).json({ error: "Sprint not found" });
      return;
    }
    assertCompanyAccess(req, sprint.companyId);
    const { issueId } = req.body as { issueId: string };
    const issue = await svc.addIssue(id, issueId);
    res.json(issue);
  });

  router.delete("/sprints/:sprintId/issues/:issueId", async (req, res) => {
    const { sprintId, issueId } = req.params as { sprintId: string; issueId: string };
    const sprint = await svc.getById(sprintId);
    if (!sprint) {
      res.status(404).json({ error: "Sprint not found" });
      return;
    }
    assertCompanyAccess(req, sprint.companyId);
    await svc.removeIssue(sprintId, issueId);
    res.json({ ok: true });
  });

  router.delete("/sprints/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Sprint not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const sprint = await svc.remove(id);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "sprint.deleted",
      entityType: "sprint",
      entityId: id,
    });
    res.json(sprint);
  });

  return router;
}
