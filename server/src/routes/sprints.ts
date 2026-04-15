import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  addIssueToSprintSchema,
  completeSprintSchema,
  createSprintSchema,
  updateSprintSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { sprintService, logActivity, projectService, groupService, accessService } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

async function resolveProject(db: Db, projectId: string) {
  const project = await projectService(db).getById(projectId);
  if (!project) throw Object.assign(new Error("Project not found"), { status: 404 });
  return project;
}

export function sprintRoutes(db: Db) {
  const router = Router();
  const svc = sprintService(db);

  // ── Project-scoped routes ──────────────────────────────────────────────

  router.get("/projects/:projectId/sprints", async (req, res) => {
    const { projectId } = req.params as { projectId: string };
    const project = await resolveProject(db, projectId);
    assertCompanyAccess(req, project.companyId);
    const result = await svc.list(projectId);
    res.json(result);
  });

  router.get("/projects/:projectId/sprints/active", async (req, res) => {
    const { projectId } = req.params as { projectId: string };
    const project = await resolveProject(db, projectId);
    assertCompanyAccess(req, project.companyId);
    const sprint = await svc.getActive(projectId);
    res.json(sprint ?? null);
  });

  router.get("/projects/:projectId/sprints/board", async (req, res) => {
    const { projectId } = req.params as { projectId: string };
    const project = await resolveProject(db, projectId);
    assertCompanyAccess(req, project.companyId);

    const actor = getActorInfo(req);
    const userId = actor.actorId;

    const groupSvc = groupService(db);
    const access = accessService(db);

    let isAdminOrOwner = false;
    if (userId) {
      const membership = await access.getMembership(project.companyId, "user", userId);
      isAdminOrOwner = membership?.membershipRole === "owner";
    }

    const projectGroups = await groupSvc.listGroupsForProject(projectId);
    let userGroupIds: string[] = [];

    if (userId && !isAdminOrOwner) {
      for (const g of projectGroups) {
        const gm = await groupSvc.getMembership(g.id, "user", userId);
        if (gm) userGroupIds.push(g.id);
      }
    }

    const board = await svc.getBoard(projectId, userGroupIds, isAdminOrOwner);
    res.json(board);
  });

  router.get("/projects/:projectId/sprints/metrics", async (req, res) => {
    const { projectId } = req.params as { projectId: string };
    const project = await resolveProject(db, projectId);
    assertCompanyAccess(req, project.companyId);
    const metrics = await svc.getProjectMetrics(projectId);
    res.json(metrics);
  });

  router.post("/projects/:projectId/sprints", validate(createSprintSchema), async (req, res) => {
    const { projectId } = req.params as { projectId: string };
    const project = await resolveProject(db, projectId);
    assertCompanyAccess(req, project.companyId);

    const { groupId } = req.body;
    if (groupId) {
      const groupSvc = groupService(db);
      const isLinked = await groupSvc.isGroupInProject(groupId, projectId);
      if (!isLinked) {
        res.status(400).json({ error: "Group is not associated with this project" });
        return;
      }
    }

    const sprint = await svc.create(projectId, req.body);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "sprint.created",
      entityType: "sprint",
      entityId: sprint.id,
      details: { name: sprint.name, groupId },
    });
    res.status(201).json(sprint);
  });

  // ── Sprint-scoped routes (authorization via sprint → project → company) ──

  router.get("/sprints/:id", async (req, res) => {
    const id = req.params.id as string;
    const sprint = await svc.getById(id);
    if (!sprint) { res.status(404).json({ error: "Sprint not found" }); return; }
    const project = await resolveProject(db, sprint.projectId);
    assertCompanyAccess(req, project.companyId);
    res.json(sprint);
  });

  router.get("/sprints/:id/metrics", async (req, res) => {
    const id = req.params.id as string;
    const sprint = await svc.getById(id);
    if (!sprint) { res.status(404).json({ error: "Sprint not found" }); return; }
    const project = await resolveProject(db, sprint.projectId);
    assertCompanyAccess(req, project.companyId);
    const metrics = await svc.getMetrics(id);
    res.json(metrics);
  });

  router.patch("/sprints/:id", validate(updateSprintSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) { res.status(404).json({ error: "Sprint not found" }); return; }
    const project = await resolveProject(db, existing.projectId);
    assertCompanyAccess(req, project.companyId);
    const sprint = await svc.update(id, req.body);
    if (!sprint) { res.status(404).json({ error: "Sprint not found" }); return; }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
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
    if (!existing) { res.status(404).json({ error: "Sprint not found" }); return; }
    const project = await resolveProject(db, existing.projectId);
    assertCompanyAccess(req, project.companyId);
    const sprint = await svc.activate(id);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
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
    if (!existing) { res.status(404).json({ error: "Sprint not found" }); return; }
    const project = await resolveProject(db, existing.projectId);
    assertCompanyAccess(req, project.companyId);
    const { spillStrategy, nextSprintId } = req.body as { spillStrategy: "backlog" | "next_sprint"; nextSprintId?: string };
    const sprint = await svc.complete(id, spillStrategy, nextSprintId);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
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
    if (!sprint) { res.status(404).json({ error: "Sprint not found" }); return; }
    const project = await resolveProject(db, sprint.projectId);
    assertCompanyAccess(req, project.companyId);
    const { issueId } = req.body as { issueId: string };
    const issue = await svc.addIssue(id, issueId);
    res.json(issue);
  });

  router.delete("/sprints/:sprintId/issues/:issueId", async (req, res) => {
    const { sprintId, issueId } = req.params as { sprintId: string; issueId: string };
    const sprint = await svc.getById(sprintId);
    if (!sprint) { res.status(404).json({ error: "Sprint not found" }); return; }
    const project = await resolveProject(db, sprint.projectId);
    assertCompanyAccess(req, project.companyId);
    await svc.removeIssue(sprintId, issueId);
    res.json({ ok: true });
  });

  router.delete("/sprints/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) { res.status(404).json({ error: "Sprint not found" }); return; }
    const project = await resolveProject(db, existing.projectId);
    assertCompanyAccess(req, project.companyId);
    const sprint = await svc.remove(id);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
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
