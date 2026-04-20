import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  companies,
  companyMemberships,
  groups,
  groupMemberships,
  groupProjects,
  projects,
  createDb,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { groupService } from "../services/groups.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres group service tests on this host: ${embeddedPostgresSupport.reason}`,
  );
}

describeEmbeddedPostgres("groupService", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof groupService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  const companyId = randomUUID();
  const userId = "user-1";
  const userId2 = "user-2";
  const issuePrefix = `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-groups-service-");
    db = createDb(tempDb.connectionString);
    svc = groupService(db);

    // Seed company
    await db.insert(companies).values({
      id: companyId,
      name: "TestCo",
      issuePrefix,
      requireBoardApprovalForNewAgents: false,
    });
  }, 30_000);

  afterEach(async () => {
    await db.delete(groupProjects);
    await db.delete(groupMemberships);
    await db.delete(groups);
    await db.delete(projects);
    await db.delete(companyMemberships);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  // --- CREATE ---

  describe("create", () => {
    it("creates a group and auto-adds creator as admin", async () => {
      const group = await svc.create(companyId, "Engineering", "The eng team", userId);

      expect(group.name).toBe("Engineering");
      expect(group.description).toBe("The eng team");
      expect(group.companyId).toBe(companyId);
      expect(group.createdByUserId).toBe(userId);

      // Verify auto-added as admin
      const membership = await svc.getMembership(group.id, "user", userId);
      expect(membership).not.toBeNull();
      expect(membership!.role).toBe("admin");
    });

    it("rejects duplicate group names within same company", async () => {
      await svc.create(companyId, "Duplicate", null, userId);

      await expect(svc.create(companyId, "Duplicate", null, userId)).rejects.toThrow();
    });
  });

  // --- LIST ---

  describe("list", () => {
    it("returns groups with member and project counts", async () => {
      const group = await svc.create(companyId, "DevOps", null, userId);

      await svc.addMembers(group.id, [{ principalType: "user", principalId: userId2 }], userId);

      const projectId = randomUUID();
      await db.insert(projects).values({ id: projectId, companyId, name: "ProjX", status: "active" });
      await svc.addProjects(group.id, [projectId], userId);

      const listed = await svc.list(companyId);

      expect(listed).toHaveLength(1);
      expect(listed[0].name).toBe("DevOps");
      expect(listed[0].memberCount).toBe(2);
      expect(listed[0].projectCount).toBe(1);
      expect(listed[0].projectNames).toEqual(["ProjX"]);
    });

    it("returns empty array for company with no groups", async () => {
      const listed = await svc.list(companyId);
      expect(listed).toEqual([]);
    });
  });

  // --- GET DETAIL ---

  describe("getDetail", () => {
    it("returns group with members and projects", async () => {
      const group = await svc.create(companyId, "Frontend", null, userId);

      // Add a project
      const projectId = randomUUID();
      await db.insert(projects).values({
        id: projectId,
        companyId,
        name: "Project Alpha",
        status: "active",
      });
      await svc.addProjects(group.id, [projectId], userId);

      const detail = await svc.getDetail(group.id);

      expect(detail).not.toBeNull();
      expect(detail!.name).toBe("Frontend");
      expect(detail!.members).toHaveLength(1);
      expect(detail!.members[0].principalId).toBe(userId);
      expect(detail!.members[0].role).toBe("admin");
      expect(detail!.projects).toHaveLength(1);
      expect(detail!.projects[0].name).toBe("Project Alpha");
    });

    it("returns null for non-existent group", async () => {
      const detail = await svc.getDetail(randomUUID());
      expect(detail).toBeNull();
    });
  });

  // --- UPDATE ---

  describe("update", () => {
    it("updates group name and description", async () => {
      const group = await svc.create(companyId, "Old Name", "Old desc", userId);

      const updated = await svc.update(group.id, { name: "New Name", description: "New desc" });

      expect(updated!.name).toBe("New Name");
      expect(updated!.description).toBe("New desc");
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(group.updatedAt.getTime());
    });
  });

  // --- REMOVE ---

  describe("remove", () => {
    it("deletes group and cascades to memberships and project associations", async () => {
      const group = await svc.create(companyId, "ToDelete", null, userId);

      const projectId = randomUUID();
      await db.insert(projects).values({ id: projectId, companyId, name: "P1", status: "active" });
      await svc.addProjects(group.id, [projectId], userId);

      const deleted = await svc.remove(group.id);
      expect(deleted!.id).toBe(group.id);

      // Verify cascade
      const membership = await svc.getMembership(group.id, "user", userId);
      expect(membership).toBeNull();

      const detail = await svc.getDetail(group.id);
      expect(detail).toBeNull();
    });
  });

  // --- MEMBERS ---

  describe("addMembers", () => {
    it("adds members to a group", async () => {
      const group = await svc.create(companyId, "Team", null, userId);

      const added = await svc.addMembers(group.id, [{ principalType: "user", principalId: userId2 }], userId);

      expect(added).toHaveLength(1);
      expect(added[0].principalId).toBe(userId2);
      expect(added[0].role).toBe("member");
    });

    it("silently ignores duplicate members (onConflictDoNothing)", async () => {
      const group = await svc.create(companyId, "DedupTest", null, userId);

      // userId is already admin from create
      const added = await svc.addMembers(group.id, [{ principalType: "user", principalId: userId }], userId);

      // Should return empty since conflict was ignored
      expect(added).toHaveLength(0);
    });

    it("returns empty array for empty input", async () => {
      const group = await svc.create(companyId, "EmptyTest", null, userId);
      const added = await svc.addMembers(group.id, [], userId);
      expect(added).toEqual([]);
    });
  });

  describe("removeMember", () => {
    it("removes a member from the group", async () => {
      const group = await svc.create(companyId, "RemoveTest", null, userId);
      await svc.addMembers(group.id, [{ principalType: "user", principalId: userId2 }], userId);

      const removed = await svc.removeMember(group.id, "user", userId2);

      expect(removed).not.toBeNull();
      const check = await svc.getMembership(group.id, "user", userId2);
      expect(check).toBeNull();
    });

    it("returns null when member does not exist", async () => {
      const group = await svc.create(companyId, "NoMember", null, userId);
      const removed = await svc.removeMember(group.id, "user", "non-existent");
      expect(removed).toBeNull();
    });
  });

  describe("updateMemberRole", () => {
    it("promotes member to admin", async () => {
      const group = await svc.create(companyId, "RoleTest", null, userId);
      await svc.addMembers(group.id, [{ principalType: "user", principalId: userId2 }], userId);

      const updated = await svc.updateMemberRole(group.id, "user", userId2, "admin");

      expect(updated!.role).toBe("admin");
    });

    it("demotes admin to member", async () => {
      const group = await svc.create(companyId, "DemoteTest", null, userId);
      await svc.addMembers(group.id, [{ principalType: "user", principalId: userId2 }], userId);
      await svc.updateMemberRole(group.id, "user", userId2, "admin");

      const demoted = await svc.updateMemberRole(group.id, "user", userId2, "member");
      expect(demoted!.role).toBe("member");
    });
  });

  describe("countAdmins", () => {
    it("counts admin members in a group", async () => {
      const group = await svc.create(companyId, "AdminCount", null, userId);
      // Creator is auto-admin
      expect(await svc.countAdmins(group.id)).toBe(1);

      // Add another admin
      await svc.addMembers(group.id, [{ principalType: "user", principalId: userId2 }], userId);
      await svc.updateMemberRole(group.id, "user", userId2, "admin");

      expect(await svc.countAdmins(group.id)).toBe(2);
    });
  });

  // --- PROJECTS ---

  describe("addProjects", () => {
    it("associates projects with a group", async () => {
      const group = await svc.create(companyId, "ProjTest", null, userId);
      const projectId = randomUUID();
      await db.insert(projects).values({ id: projectId, companyId, name: "P1", status: "active" });

      const added = await svc.addProjects(group.id, [projectId], userId);

      expect(added).toHaveLength(1);
      expect(added[0].projectId).toBe(projectId);
    });

    it("ignores duplicate project associations", async () => {
      const group = await svc.create(companyId, "DupProj", null, userId);
      const projectId = randomUUID();
      await db.insert(projects).values({ id: projectId, companyId, name: "P2", status: "active" });

      await svc.addProjects(group.id, [projectId], userId);
      const second = await svc.addProjects(group.id, [projectId], userId);

      expect(second).toHaveLength(0); // conflict ignored
    });
  });

  describe("removeProject", () => {
    it("removes project association", async () => {
      const group = await svc.create(companyId, "RemoveProj", null, userId);
      const projectId = randomUUID();
      await db.insert(projects).values({ id: projectId, companyId, name: "P3", status: "active" });
      await svc.addProjects(group.id, [projectId], userId);

      const removed = await svc.removeProject(group.id, projectId);
      expect(removed).not.toBeNull();

      // Verify removed
      const detail = await svc.getDetail(group.id);
      expect(detail!.projects).toHaveLength(0);
    });
  });

  describe("listGroupsForProject", () => {
    it("returns all groups associated with a project", async () => {
      const group1 = await svc.create(companyId, "Group1", null, userId);
      const group2 = await svc.create(companyId, "Group2", null, userId);
      const projectId = randomUUID();
      await db.insert(projects).values({ id: projectId, companyId, name: "Shared", status: "active" });

      await svc.addProjects(group1.id, [projectId], userId);
      await svc.addProjects(group2.id, [projectId], userId);

      const result = await svc.listGroupsForProject(projectId);

      expect(result).toHaveLength(2);
      const names = result.map((g) => g.name).sort();
      expect(names).toEqual(["Group1", "Group2"]);
    });
  });
});
