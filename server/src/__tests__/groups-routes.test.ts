import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { groupRoutes } from "../routes/groups.js";
import { errorHandler } from "../middleware/index.js";

const companyId = "22222222-2222-4222-8222-222222222222";
const groupId = "33333333-3333-4333-8333-333333333333";
const userId = "user-owner-1";
const memberId = "user-member-1";
const projectId = "44444444-4444-4444-8444-444444444444";

const baseGroup = {
  id: groupId,
  companyId,
  name: "Engineering",
  description: "The eng team",
  createdByUserId: userId,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseGroupDetail = {
  ...baseGroup,
  memberCount: 1,
  projectCount: 0,
  members: [
    {
      principalType: "user",
      principalId: userId,
      role: "admin",
      addedByUserId: userId,
      createdAt: new Date(),
      name: "Owner",
      email: "owner@test.com",
      image: null,
    },
  ],
  projects: [],
};

// --- Mocked services ---

const mockGroupService = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  getById: vi.fn(),
  getDetail: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  addMembers: vi.fn(),
  removeMember: vi.fn(),
  updateMemberRole: vi.fn(),
  getMembership: vi.fn(),
  countAdmins: vi.fn(),
  addProjects: vi.fn(),
  removeProject: vi.fn(),
  listGroupsForProject: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  getMembership: vi.fn(),
}));

vi.mock("../services/groups.js", () => ({
  groupService: () => mockGroupService,
}));

vi.mock("../services/access.js", () => ({
  accessService: () => mockAccessService,
}));

function createDbStub() {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ companyId }]),
      }),
    }),
  };
}

function createApp(actor: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", groupRoutes(createDbStub() as any));
  app.use(errorHandler);
  return app;
}

const ownerActor = {
  type: "board",
  userId,
  source: "cookie",
  isInstanceAdmin: false,
  companyIds: [companyId],
};

const memberActor = {
  type: "board",
  userId: memberId,
  source: "cookie",
  isInstanceAdmin: false,
  companyIds: [companyId],
};

const localActor = {
  type: "board",
  userId,
  source: "local_implicit",
  isInstanceAdmin: false,
  companyIds: [companyId],
};

describe("groups routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Owner has "owner" role
    mockAccessService.getMembership.mockImplementation(
      async (_companyId: string, _principalType: string, principalId: string) => {
        if (principalId === userId) {
          return { status: "active", membershipRole: "owner" };
        }
        if (principalId === memberId) {
          return { status: "active", membershipRole: "member" };
        }
        return null;
      },
    );

    mockGroupService.getById.mockResolvedValue(baseGroup);
    mockGroupService.getDetail.mockResolvedValue(baseGroupDetail);
    mockGroupService.list.mockResolvedValue([{ ...baseGroup, memberCount: 1, projectCount: 0, projectNames: [] }]);
  });

  // --- CREATE ---

  describe("POST /companies/:companyId/groups", () => {
    it("allows owner to create a group", async () => {
      mockGroupService.create.mockResolvedValue(baseGroup);
      const app = createApp(ownerActor);

      const res = await request(app)
        .post(`/api/companies/${companyId}/groups`)
        .send({ name: "Engineering", description: "The eng team" });

      expect(res.status).toBe(201);
      expect(mockGroupService.create).toHaveBeenCalledWith(
        companyId,
        "Engineering",
        "The eng team",
        userId,
      );
    });

    it("rejects non-owner with 403", async () => {
      const app = createApp(memberActor);

      const res = await request(app)
        .post(`/api/companies/${companyId}/groups`)
        .send({ name: "Marketing" });

      expect(res.status).toBe(403);
      expect(mockGroupService.create).not.toHaveBeenCalled();
    });

    it("returns 409 on duplicate group name", async () => {
      mockGroupService.create.mockRejectedValue(new Error("unique constraint violated"));
      const app = createApp(ownerActor);

      const res = await request(app)
        .post(`/api/companies/${companyId}/groups`)
        .send({ name: "Engineering" });

      expect(res.status).toBe(409);
    });

    it("validates request body with Zod", async () => {
      const app = createApp(ownerActor);

      const res = await request(app)
        .post(`/api/companies/${companyId}/groups`)
        .send({ name: "" }); // min(1) fails

      expect(res.status).toBe(400);
    });
  });

  // --- LIST ---

  describe("GET /companies/:companyId/groups", () => {
    it("allows any company member to list groups", async () => {
      const app = createApp(memberActor);

      const res = await request(app).get(`/api/companies/${companyId}/groups`);

      expect(res.status).toBe(200);
      expect(mockGroupService.list).toHaveBeenCalledWith(companyId);
    });
  });

  // --- DETAIL ---

  describe("GET /companies/:companyId/groups/:groupId", () => {
    it("returns group detail with members and projects", async () => {
      const app = createApp(memberActor);

      const res = await request(app).get(`/api/companies/${companyId}/groups/${groupId}`);

      expect(res.status).toBe(200);
      expect(mockGroupService.getDetail).toHaveBeenCalledWith(groupId);
    });

    it("returns 404 when group not found", async () => {
      mockGroupService.getDetail.mockResolvedValue(null);
      const app = createApp(memberActor);

      const res = await request(app).get(`/api/companies/${companyId}/groups/${groupId}`);

      expect(res.status).toBe(404);
    });

    it("returns 404 when group belongs to different company", async () => {
      mockGroupService.getDetail.mockResolvedValue({ ...baseGroupDetail, companyId: "other-company" });
      const app = createApp(memberActor);

      const res = await request(app).get(`/api/companies/${companyId}/groups/${groupId}`);

      expect(res.status).toBe(404);
    });
  });

  // --- UPDATE ---

  describe("PATCH /companies/:companyId/groups/:groupId", () => {
    it("allows owner to update group", async () => {
      mockGroupService.update.mockResolvedValue({ ...baseGroup, name: "Eng" });
      const app = createApp(ownerActor);

      const res = await request(app)
        .patch(`/api/companies/${companyId}/groups/${groupId}`)
        .send({ name: "Eng" });

      expect(res.status).toBe(200);
      expect(mockGroupService.update).toHaveBeenCalledWith(groupId, { name: "Eng" });
    });

    it("allows group admin to update group", async () => {
      mockGroupService.getMembership.mockResolvedValue({ role: "admin" });
      const app = createApp(memberActor);

      const res = await request(app)
        .patch(`/api/companies/${companyId}/groups/${groupId}`)
        .send({ description: "Updated" });

      expect(res.status).toBe(200);
    });

    it("rejects regular member", async () => {
      mockGroupService.getMembership.mockResolvedValue({ role: "member" });
      const app = createApp(memberActor);

      const res = await request(app)
        .patch(`/api/companies/${companyId}/groups/${groupId}`)
        .send({ name: "Nope" });

      expect(res.status).toBe(403);
    });
  });

  // --- DELETE ---

  describe("DELETE /companies/:companyId/groups/:groupId", () => {
    it("allows owner to delete group", async () => {
      mockGroupService.remove.mockResolvedValue(baseGroup);
      const app = createApp(ownerActor);

      const res = await request(app).delete(`/api/companies/${companyId}/groups/${groupId}`);

      expect(res.status).toBe(204);
      expect(mockGroupService.remove).toHaveBeenCalledWith(groupId);
    });

    it("rejects non-owner with 403", async () => {
      const app = createApp(memberActor);

      const res = await request(app).delete(`/api/companies/${companyId}/groups/${groupId}`);

      expect(res.status).toBe(403);
    });
  });

  // --- ADD MEMBERS ---

  describe("POST /companies/:companyId/groups/:groupId/members", () => {
    it("allows owner to add members", async () => {
      mockGroupService.addMembers.mockResolvedValue([{ id: "new" }]);
      const app = createApp(ownerActor);

      const res = await request(app)
        .post(`/api/companies/${companyId}/groups/${groupId}/members`)
        .send({ members: [{ principalType: "user", principalId: memberId }] });

      expect(res.status).toBe(201);
      expect(mockGroupService.addMembers).toHaveBeenCalledWith(
        groupId,
        [{ principalType: "user", principalId: memberId }],
        userId,
      );
    });

    it("rejects adding non-company-member", async () => {
      const app = createApp(ownerActor);

      const res = await request(app)
        .post(`/api/companies/${companyId}/groups/${groupId}/members`)
        .send({ members: [{ principalType: "user", principalId: "non-existent" }] });

      expect(res.status).toBe(400);
    });

    it("validates body requires at least one member", async () => {
      const app = createApp(ownerActor);

      const res = await request(app)
        .post(`/api/companies/${companyId}/groups/${groupId}/members`)
        .send({ members: [] });

      expect(res.status).toBe(400);
    });
  });

  // --- REMOVE MEMBER ---

  describe("DELETE /companies/:companyId/groups/:groupId/members/:principalType/:principalId", () => {
    it("allows owner to remove a member", async () => {
      mockGroupService.getMembership.mockResolvedValue({ role: "member" });
      mockGroupService.removeMember.mockResolvedValue({ id: "deleted" });
      const app = createApp(ownerActor);

      const res = await request(app).delete(
        `/api/companies/${companyId}/groups/${groupId}/members/user/${memberId}`,
      );

      expect(res.status).toBe(204);
    });

    it("prevents removing last admin by non-owner", async () => {
      // The actor (memberId) is a group admin but not a company owner
      mockAccessService.getMembership.mockImplementation(
        async (_companyId: string, _principalType: string, principalId: string) => {
          if (principalId === memberId) return { status: "active", membershipRole: "developer" };
          return null;
        },
      );
      // For assertOwnerOrGroupAdmin: memberId is a group admin
      // For the removal target check: userId is also an admin
      mockGroupService.getMembership.mockImplementation(
        async (_groupId: string, _type: string, id: string) => {
          if (id === userId) return { role: "admin" };
          if (id === memberId) return { role: "admin" };
          return null;
        },
      );
      mockGroupService.countAdmins.mockResolvedValue(1);

      const app = createApp(memberActor);

      const res = await request(app).delete(
        `/api/companies/${companyId}/groups/${groupId}/members/user/${userId}`,
      );

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("last group admin");
    });

    it("allows owner to remove the last admin", async () => {
      mockGroupService.getMembership.mockResolvedValue({ role: "admin" });
      mockGroupService.countAdmins.mockResolvedValue(1);
      mockGroupService.removeMember.mockResolvedValue({ id: "deleted" });
      const app = createApp(ownerActor);

      const res = await request(app).delete(
        `/api/companies/${companyId}/groups/${groupId}/members/user/${memberId}`,
      );

      expect(res.status).toBe(204);
    });
  });

  // --- UPDATE MEMBER ROLE ---

  describe("PATCH /companies/:companyId/groups/:groupId/members/:principalType/:principalId", () => {
    it("allows owner to promote member to admin", async () => {
      mockGroupService.updateMemberRole.mockResolvedValue({ role: "admin" });
      const app = createApp(ownerActor);

      const res = await request(app)
        .patch(`/api/companies/${companyId}/groups/${groupId}/members/user/${memberId}`)
        .send({ role: "admin" });

      expect(res.status).toBe(200);
      expect(mockGroupService.updateMemberRole).toHaveBeenCalledWith(
        groupId,
        "user",
        memberId,
        "admin",
      );
    });

    it("rejects non-owner from changing roles", async () => {
      const app = createApp(memberActor);

      const res = await request(app)
        .patch(`/api/companies/${companyId}/groups/${groupId}/members/user/${userId}`)
        .send({ role: "admin" });

      expect(res.status).toBe(403);
    });

    it("validates role enum", async () => {
      const app = createApp(ownerActor);

      const res = await request(app)
        .patch(`/api/companies/${companyId}/groups/${groupId}/members/user/${memberId}`)
        .send({ role: "superadmin" });

      expect(res.status).toBe(400);
    });
  });

  // --- ADD PROJECTS ---

  describe("POST /companies/:companyId/groups/:groupId/projects", () => {
    it("allows owner to associate projects", async () => {
      mockGroupService.addProjects.mockResolvedValue([{ id: "assoc" }]);
      const app = createApp(ownerActor);

      const res = await request(app)
        .post(`/api/companies/${companyId}/groups/${groupId}/projects`)
        .send({ projectIds: [projectId] });

      expect(res.status).toBe(201);
      expect(mockGroupService.addProjects).toHaveBeenCalledWith(groupId, [projectId], userId);
    });

    it("validates projectIds are UUIDs", async () => {
      const app = createApp(ownerActor);

      const res = await request(app)
        .post(`/api/companies/${companyId}/groups/${groupId}/projects`)
        .send({ projectIds: ["not-a-uuid"] });

      expect(res.status).toBe(400);
    });
  });

  // --- REMOVE PROJECT ---

  describe("DELETE /companies/:companyId/groups/:groupId/projects/:projectId", () => {
    it("allows owner to disassociate project", async () => {
      mockGroupService.removeProject.mockResolvedValue({ id: "removed" });
      const app = createApp(ownerActor);

      const res = await request(app).delete(
        `/api/companies/${companyId}/groups/${groupId}/projects/${projectId}`,
      );

      expect(res.status).toBe(204);
    });

    it("returns 404 when association does not exist", async () => {
      mockGroupService.removeProject.mockResolvedValue(null);
      const app = createApp(ownerActor);

      const res = await request(app).delete(
        `/api/companies/${companyId}/groups/${groupId}/projects/${projectId}`,
      );

      expect(res.status).toBe(404);
    });
  });

  // --- LIST GROUPS FOR PROJECT ---

  describe("GET /projects/:projectId/groups", () => {
    it("returns groups for a project", async () => {
      mockGroupService.listGroupsForProject.mockResolvedValue([
        { id: groupId, name: "Engineering", description: null },
      ]);
      const app = createApp(ownerActor);

      const res = await request(app).get(`/api/projects/${projectId}/groups`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe("Engineering");
    });
  });

  // --- LOCAL IMPLICIT BYPASS ---

  describe("local_implicit actor bypasses ownership checks", () => {
    it("can create groups without ownership check", async () => {
      mockGroupService.create.mockResolvedValue(baseGroup);
      const app = createApp(localActor);

      const res = await request(app)
        .post(`/api/companies/${companyId}/groups`)
        .send({ name: "DevOps" });

      expect(res.status).toBe(201);
    });
  });
});
