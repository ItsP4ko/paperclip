import { Router } from "express";
import type { Request } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { projects } from "@paperclipai/db";
import {
  createGroupSchema,
  updateGroupSchema,
  addGroupMembersSchema,
  updateGroupMemberRoleSchema,
  addGroupProjectsSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { groupService } from "../services/groups.js";
import { accessService } from "../services/access.js";
import { badRequest, forbidden, notFound, conflict } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";

export function groupRoutes(db: Db) {
  const router = Router();
  const svc = groupService(db);
  const access = accessService(db);

  function getUserId(req: Request): string {
    if (req.actor.type === "board" && req.actor.userId) return req.actor.userId;
    throw forbidden("User authentication required");
  }

  async function assertOwner(req: Request, companyId: string) {
    if (req.actor.type === "board" && (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin)) return;
    const userId = getUserId(req);
    const membership = await access.getMembership(companyId, "user", userId);
    if (!membership || membership.status !== "active" || membership.membershipRole !== "owner") {
      throw forbidden("Owner role required");
    }
  }

  async function assertOwnerOrGroupAdmin(req: Request, companyId: string, groupId: string) {
    if (req.actor.type === "board" && (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin)) return;
    const userId = getUserId(req);
    const membership = await access.getMembership(companyId, "user", userId);
    if (!membership || membership.status !== "active") throw forbidden("Active company membership required");
    if (membership.membershipRole === "owner") return;
    const groupMember = await svc.getMembership(groupId, "user", userId);
    if (!groupMember || groupMember.role !== "admin") {
      throw forbidden("Owner or group admin role required");
    }
  }

  async function assertCompanyMember(req: Request, companyId: string) {
    if (req.actor.type === "board" && (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin)) return;
    const userId = getUserId(req);
    const membership = await access.getMembership(companyId, "user", userId);
    if (!membership || membership.status !== "active") {
      throw forbidden("Active company membership required");
    }
  }

  // --- Group CRUD ---

  // POST /companies/:companyId/groups
  router.post("/companies/:companyId/groups", validate(createGroupSchema), async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    await assertOwner(req, companyId);
    const userId = getUserId(req);
    try {
      const group = await svc.create(companyId, req.body.name, req.body.description ?? null, userId);
      res.status(201).json(group);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("unique")) {
        throw conflict("A group with this name already exists in this company");
      }
      throw err;
    }
  });

  // GET /companies/:companyId/groups
  router.get("/companies/:companyId/groups", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    await assertCompanyMember(req, companyId);
    const result = await svc.list(companyId);
    res.json(result);
  });

  // GET /companies/:companyId/groups/:groupId
  router.get("/companies/:companyId/groups/:groupId", async (req, res) => {
    const { companyId, groupId } = req.params as { companyId: string; groupId: string };
    assertCompanyAccess(req, companyId);
    await assertCompanyMember(req, companyId);
    const detail = await svc.getDetail(groupId);
    if (!detail || detail.companyId !== companyId) throw notFound("Group not found");
    res.json(detail);
  });

  // PATCH /companies/:companyId/groups/:groupId
  router.patch("/companies/:companyId/groups/:groupId", validate(updateGroupSchema), async (req, res) => {
    const { companyId, groupId } = req.params as { companyId: string; groupId: string };
    assertCompanyAccess(req, companyId);
    await assertOwnerOrGroupAdmin(req, companyId, groupId);
    const group = await svc.getById(groupId);
    if (!group || group.companyId !== companyId) throw notFound("Group not found");
    try {
      const updated = await svc.update(groupId, req.body);
      res.json(updated);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("unique")) {
        throw conflict("A group with this name already exists in this company");
      }
      throw err;
    }
  });

  // DELETE /companies/:companyId/groups/:groupId
  router.delete("/companies/:companyId/groups/:groupId", async (req, res) => {
    const { companyId, groupId } = req.params as { companyId: string; groupId: string };
    assertCompanyAccess(req, companyId);
    await assertOwner(req, companyId);
    const group = await svc.getById(groupId);
    if (!group || group.companyId !== companyId) throw notFound("Group not found");
    await svc.remove(groupId);
    res.status(204).end();
  });

  // --- Member Management ---

  // POST /companies/:companyId/groups/:groupId/members
  router.post("/companies/:companyId/groups/:groupId/members", validate(addGroupMembersSchema), async (req, res) => {
    const { companyId, groupId } = req.params as { companyId: string; groupId: string };
    assertCompanyAccess(req, companyId);
    await assertOwnerOrGroupAdmin(req, companyId, groupId);
    const group = await svc.getById(groupId);
    if (!group || group.companyId !== companyId) throw notFound("Group not found");
    const userId = getUserId(req);

    // Validate all principals have active company memberships
    for (const m of req.body.members) {
      const cm = await access.getMembership(companyId, m.principalType, m.principalId);
      if (!cm || cm.status !== "active") {
        throw badRequest(`Principal ${m.principalType}:${m.principalId} is not an active member of this company`);
      }
    }

    const added = await svc.addMembers(groupId, req.body.members, userId);
    res.status(201).json(added);
  });

  // DELETE /companies/:companyId/groups/:groupId/members/:principalType/:principalId
  router.delete("/companies/:companyId/groups/:groupId/members/:principalType/:principalId", async (req, res) => {
    const { companyId, groupId, principalType, principalId } = req.params as {
      companyId: string; groupId: string; principalType: string; principalId: string;
    };
    assertCompanyAccess(req, companyId);
    await assertOwnerOrGroupAdmin(req, companyId, groupId);
    const group = await svc.getById(groupId);
    if (!group || group.companyId !== companyId) throw notFound("Group not found");

    // Last-admin protection
    const existing = await svc.getMembership(groupId, principalType, principalId);
    if (existing?.role === "admin") {
      const adminCount = await svc.countAdmins(groupId);
      if (adminCount <= 1) {
        const userId = getUserId(req);
        const cm = await access.getMembership(companyId, "user", userId);
        if (cm?.membershipRole !== "owner") {
          throw badRequest("Cannot remove the last group admin. A company owner must perform this action.");
        }
      }
    }

    const deleted = await svc.removeMember(groupId, principalType, principalId);
    if (!deleted) throw notFound("Member not found in group");
    res.status(204).end();
  });

  // PATCH /companies/:companyId/groups/:groupId/members/:principalType/:principalId
  router.patch(
    "/companies/:companyId/groups/:groupId/members/:principalType/:principalId",
    validate(updateGroupMemberRoleSchema),
    async (req, res) => {
      const { companyId, groupId, principalType, principalId } = req.params as {
        companyId: string; groupId: string; principalType: string; principalId: string;
      };
      assertCompanyAccess(req, companyId);
      await assertOwner(req, companyId); // Only owner can change roles
      const group = await svc.getById(groupId);
      if (!group || group.companyId !== companyId) throw notFound("Group not found");

      const updated = await svc.updateMemberRole(groupId, principalType, principalId, req.body.role);
      if (!updated) throw notFound("Member not found in group");
      res.json(updated);
    },
  );

  // --- Project Association ---

  // POST /companies/:companyId/groups/:groupId/projects
  router.post("/companies/:companyId/groups/:groupId/projects", validate(addGroupProjectsSchema), async (req, res) => {
    const { companyId, groupId } = req.params as { companyId: string; groupId: string };
    assertCompanyAccess(req, companyId);
    await assertOwnerOrGroupAdmin(req, companyId, groupId);
    const group = await svc.getById(groupId);
    if (!group || group.companyId !== companyId) throw notFound("Group not found");
    const userId = getUserId(req);

    // Validate all projects belong to the same company
    for (const projectId of req.body.projectIds) {
      const [project] = await db
        .select({ companyId: projects.companyId })
        .from(projects)
        .where(eq(projects.id, projectId));
      if (!project || project.companyId !== companyId) {
        throw badRequest(`Project ${projectId} not found in this company`);
      }
    }

    const added = await svc.addProjects(groupId, req.body.projectIds, userId);
    res.status(201).json(added);
  });

  // DELETE /companies/:companyId/groups/:groupId/projects/:projectId
  router.delete("/companies/:companyId/groups/:groupId/projects/:projectId", async (req, res) => {
    const { companyId, groupId, projectId } = req.params as {
      companyId: string; groupId: string; projectId: string;
    };
    assertCompanyAccess(req, companyId);
    await assertOwnerOrGroupAdmin(req, companyId, groupId);
    const group = await svc.getById(groupId);
    if (!group || group.companyId !== companyId) throw notFound("Group not found");
    const deleted = await svc.removeProject(groupId, projectId);
    if (!deleted) throw notFound("Project not associated with this group");
    res.status(204).end();
  });

  // GET /projects/:projectId/groups
  router.get("/projects/:projectId/groups", async (req, res) => {
    const { projectId } = req.params as { projectId: string };
    const companyIdQuery = req.query.companyId;
    if (typeof companyIdQuery === "string" && companyIdQuery) {
      assertCompanyAccess(req, companyIdQuery);
    }
    const result = await svc.listGroupsForProject(projectId);
    res.json(result);
  });

  return router;
}
