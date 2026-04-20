import { and, eq, sql, count, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  groups,
  groupMemberships,
  groupProjects,
  projects,
  authUsers,
} from "@paperclipai/db";
import type { GroupMembershipRole } from "@paperclipai/shared";

export function groupService(db: Db) {
  async function create(
    companyId: string,
    name: string,
    description: string | null,
    createdByUserId: string,
  ) {
    return db.transaction(async (tx) => {
      const [group] = await tx
        .insert(groups)
        .values({ companyId, name, description, createdByUserId })
        .returning();
      // Auto-add creator as admin
      await tx.insert(groupMemberships).values({
        groupId: group!.id,
        principalType: "user",
        principalId: createdByUserId,
        role: "admin",
        addedByUserId: createdByUserId,
      });
      return group!;
    });
  }

  async function list(companyId: string) {
    const rows = await db
      .select({
        id: groups.id,
        companyId: groups.companyId,
        name: groups.name,
        description: groups.description,
        createdByUserId: groups.createdByUserId,
        createdAt: groups.createdAt,
        updatedAt: groups.updatedAt,
        memberCount: sql<number>`(SELECT count(*)::int FROM group_memberships WHERE group_id = ${groups.id})`.as("member_count"),
        projectCount: sql<number>`(SELECT count(*)::int FROM group_projects WHERE group_id = ${groups.id})`.as("project_count"),
      })
      .from(groups)
      .where(eq(groups.companyId, companyId))
      .orderBy(groups.name);

    if (rows.length === 0) return rows.map((r) => ({ ...r, projectNames: [] as string[] }));

    // Fetch up to 5 project names per group (non-archived) in a single query
    const groupIds = rows.map((r) => r.id);
    const projectRows = await db
      .select({
        groupId: groupProjects.groupId,
        name: projects.name,
      })
      .from(groupProjects)
      .innerJoin(projects, eq(groupProjects.projectId, projects.id))
      .where(
        and(
          inArray(groupProjects.groupId, groupIds),
        ),
      )
      .orderBy(groupProjects.groupId, projects.name);

    // Group project names by groupId, capping at 5
    const namesByGroup = new Map<string, string[]>();
    for (const row of projectRows) {
      const existing = namesByGroup.get(row.groupId) ?? [];
      if (existing.length < 5) existing.push(row.name);
      namesByGroup.set(row.groupId, existing);
    }

    return rows.map((r) => ({
      ...r,
      projectNames: namesByGroup.get(r.id) ?? [],
    }));
  }

  async function getById(groupId: string) {
    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId));
    return group ?? null;
  }

  async function getDetail(groupId: string) {
    const group = await getById(groupId);
    if (!group) return null;

    const members = await db
      .select({
        principalType: groupMemberships.principalType,
        principalId: groupMemberships.principalId,
        role: groupMemberships.role,
        addedByUserId: groupMemberships.addedByUserId,
        createdAt: groupMemberships.createdAt,
        name: authUsers.name,
        email: authUsers.email,
        image: authUsers.image,
      })
      .from(groupMemberships)
      .leftJoin(
        authUsers,
        and(
          eq(groupMemberships.principalType, "user"),
          eq(groupMemberships.principalId, authUsers.id),
        ),
      )
      .where(eq(groupMemberships.groupId, groupId))
      .orderBy(groupMemberships.createdAt);

    const associatedProjects = await db
      .select({
        projectId: groupProjects.projectId,
        addedByUserId: groupProjects.addedByUserId,
        createdAt: groupProjects.createdAt,
        name: projects.name,
        status: projects.status,
      })
      .from(groupProjects)
      .innerJoin(projects, eq(groupProjects.projectId, projects.id))
      .where(eq(groupProjects.groupId, groupId))
      .orderBy(projects.name);

    return {
      ...group,
      memberCount: members.length,
      projectCount: associatedProjects.length,
      members,
      projects: associatedProjects,
    };
  }

  async function update(groupId: string, data: { name?: string; description?: string | null }) {
    const [updated] = await db
      .update(groups)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(groups.id, groupId))
      .returning();
    return updated ?? null;
  }

  async function remove(groupId: string) {
    const [deleted] = await db
      .delete(groups)
      .where(eq(groups.id, groupId))
      .returning();
    return deleted ?? null;
  }

  async function addMembers(
    groupId: string,
    members: Array<{ principalType: string; principalId: string }>,
    addedByUserId: string,
  ) {
    if (members.length === 0) return [];
    const values = members.map((m) => ({
      groupId,
      principalType: m.principalType,
      principalId: m.principalId,
      role: "member" as const,
      addedByUserId,
    }));
    return db
      .insert(groupMemberships)
      .values(values)
      .onConflictDoNothing()
      .returning();
  }

  async function removeMember(groupId: string, principalType: string, principalId: string) {
    const [deleted] = await db
      .delete(groupMemberships)
      .where(
        and(
          eq(groupMemberships.groupId, groupId),
          eq(groupMemberships.principalType, principalType),
          eq(groupMemberships.principalId, principalId),
        ),
      )
      .returning();
    return deleted ?? null;
  }

  async function updateMemberRole(
    groupId: string,
    principalType: string,
    principalId: string,
    role: GroupMembershipRole,
  ) {
    const [updated] = await db
      .update(groupMemberships)
      .set({ role })
      .where(
        and(
          eq(groupMemberships.groupId, groupId),
          eq(groupMemberships.principalType, principalType),
          eq(groupMemberships.principalId, principalId),
        ),
      )
      .returning();
    return updated ?? null;
  }

  async function getMembership(groupId: string, principalType: string, principalId: string) {
    const [row] = await db
      .select()
      .from(groupMemberships)
      .where(
        and(
          eq(groupMemberships.groupId, groupId),
          eq(groupMemberships.principalType, principalType),
          eq(groupMemberships.principalId, principalId),
        ),
      );
    return row ?? null;
  }

  async function countAdmins(groupId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(groupMemberships)
      .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.role, "admin")));
    return result?.count ?? 0;
  }

  async function addProjects(groupId: string, projectIds: string[], addedByUserId: string) {
    if (projectIds.length === 0) return [];
    const values = projectIds.map((projectId) => ({
      groupId,
      projectId,
      addedByUserId,
    }));
    return db
      .insert(groupProjects)
      .values(values)
      .onConflictDoNothing()
      .returning();
  }

  async function removeProject(groupId: string, projectId: string) {
    const [deleted] = await db
      .delete(groupProjects)
      .where(and(eq(groupProjects.groupId, groupId), eq(groupProjects.projectId, projectId)))
      .returning();
    return deleted ?? null;
  }

  async function listGroupsForProject(projectId: string) {
    return db
      .select({
        id: groups.id,
        name: groups.name,
        description: groups.description,
      })
      .from(groupProjects)
      .innerJoin(groups, eq(groupProjects.groupId, groups.id))
      .where(eq(groupProjects.projectId, projectId))
      .orderBy(groups.name);
  }

  async function isGroupInProject(groupId: string, projectId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: groupProjects.id })
      .from(groupProjects)
      .where(and(eq(groupProjects.groupId, groupId), eq(groupProjects.projectId, projectId)));
    return !!row;
  }

  return {
    create,
    list,
    getById,
    getDetail,
    update,
    remove,
    addMembers,
    removeMember,
    updateMemberRole,
    getMembership,
    countAdmins,
    addProjects,
    removeProject,
    listGroupsForProject,
    isGroupInProject,
  };
}
