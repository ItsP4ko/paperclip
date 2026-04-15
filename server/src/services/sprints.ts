import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issues, sprints, sprintIssueHistory, issueStateHistory } from "@paperclipai/db";
import type { ProjectSprintMetrics, SprintMetrics } from "@paperclipai/shared";
import { conflict, notFound } from "../errors.js";

export function sprintService(db: Db) {
  return {
    list: (projectId: string) =>
      db
        .select()
        .from(sprints)
        .where(eq(sprints.projectId, projectId))
        .orderBy(desc(sprints.createdAt)),

    listForGroup: (groupId: string) =>
      db
        .select()
        .from(sprints)
        .where(eq(sprints.groupId, groupId))
        .orderBy(desc(sprints.createdAt)),

    getById: (id: string) =>
      db
        .select()
        .from(sprints)
        .where(eq(sprints.id, id))
        .then((rows) => rows[0] ?? null),

    getActive: (projectId: string) =>
      db
        .select()
        .from(sprints)
        .where(and(eq(sprints.projectId, projectId), eq(sprints.status, "active")))
        .then((rows) => rows[0] ?? null),

    create: (projectId: string, data: Omit<typeof sprints.$inferInsert, "projectId" | "status">) =>
      db
        .insert(sprints)
        .values({ ...data, projectId, status: "planning" })
        .returning()
        .then((rows) => rows[0]),

    update: (id: string, data: Partial<typeof sprints.$inferInsert>) =>
      db
        .update(sprints)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(sprints.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    activate: async (id: string) => {
      const sprint = await db.select().from(sprints).where(eq(sprints.id, id)).then((r) => r[0] ?? null);
      if (!sprint) throw notFound("Sprint not found");
      if (sprint.status !== "planning") throw conflict("Only a planning sprint can be activated");

      if (sprint.groupId) {
        const existing = await db
          .select({ id: sprints.id })
          .from(sprints)
          .where(and(eq(sprints.groupId, sprint.groupId), eq(sprints.status, "active")))
          .then((r) => r[0] ?? null);
        if (existing) throw conflict("This group already has an active sprint.");
      } else {
        const existing = await db
          .select({ id: sprints.id })
          .from(sprints)
          .where(and(eq(sprints.projectId, sprint.projectId), eq(sprints.status, "active")))
          .then((r) => r[0] ?? null);
        if (existing) throw conflict("There is already an active sprint in this project.");
      }

      return db
        .update(sprints)
        .set({ status: "active", startedAt: new Date(), updatedAt: new Date() })
        .where(eq(sprints.id, id))
        .returning()
        .then((r) => r[0]);
    },

    complete: async (id: string, spillStrategy: "backlog" | "next_sprint", nextSprintId?: string) => {
      const sprint = await db.select().from(sprints).where(eq(sprints.id, id)).then((r) => r[0] ?? null);
      if (!sprint) throw notFound("Sprint not found");
      if (sprint.status !== "active") throw conflict("Only an active sprint can be completed");

      const incompleteIssues = await db
        .select({ id: issues.id })
        .from(issues)
        .where(and(eq(issues.sprintId, id), ne(issues.status, "done"), ne(issues.status, "cancelled")));

      const incompleteIds = incompleteIssues.map((r) => r.id);

      if (incompleteIds.length > 0) {
        await db.insert(sprintIssueHistory).values(
          incompleteIds.map((issueId) => ({
            sprintId: id,
            issueId,
            removalReason: "spilled_over" as const,
            removedAt: new Date(),
            nextSprintId: spillStrategy === "next_sprint" ? (nextSprintId ?? null) : null,
          })),
        );
        await db
          .update(issues)
          .set({ sprintId: spillStrategy === "next_sprint" && nextSprintId ? nextSprintId : null, updatedAt: new Date() })
          .where(inArray(issues.id, incompleteIds));
      }

      const completedIssues = await db
        .select({ id: issues.id })
        .from(issues)
        .where(and(eq(issues.sprintId, id), eq(issues.status, "done")));

      if (completedIssues.length > 0) {
        await db.insert(sprintIssueHistory).values(
          completedIssues.map((r) => ({
            sprintId: id,
            issueId: r.id,
            removalReason: "completed" as const,
            removedAt: new Date(),
            nextSprintId: null,
          })),
        );
      }

      return db
        .update(sprints)
        .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(sprints.id, id))
        .returning()
        .then((r) => r[0]);
    },

    addIssue: async (sprintId: string, issueId: string) => {
      const issue = await db.select({ sprintId: issues.sprintId }).from(issues).where(eq(issues.id, issueId)).then((r) => r[0] ?? null);
      if (!issue) throw notFound("Issue not found");

      if (issue.sprintId && issue.sprintId !== sprintId) {
        await db.insert(sprintIssueHistory).values({ sprintId: issue.sprintId, issueId, removalReason: "removed", removedAt: new Date(), nextSprintId: sprintId });
      }

      await db.update(issues).set({ sprintId, updatedAt: new Date() }).where(eq(issues.id, issueId));
      await db.insert(sprintIssueHistory).values({ sprintId, issueId, addedAt: new Date() });

      return db.select().from(issues).where(eq(issues.id, issueId)).then((r) => r[0]);
    },

    removeIssue: async (sprintId: string, issueId: string) => {
      await db.update(issues).set({ sprintId: null, updatedAt: new Date() }).where(and(eq(issues.id, issueId), eq(issues.sprintId, sprintId)));
      await db.insert(sprintIssueHistory).values({ sprintId, issueId, removalReason: "removed", removedAt: new Date() });
    },

    getMetrics: async (sprintId: string): Promise<SprintMetrics> => {
      const sprintIssues = await db
        .select({ id: issues.id, identifier: issues.identifier, title: issues.title, status: issues.status, startedAt: issues.startedAt, completedAt: issues.completedAt })
        .from(issues)
        .where(eq(issues.sprintId, sprintId));

      const historyRows = await db
        .select()
        .from(sprintIssueHistory)
        .where(and(eq(sprintIssueHistory.sprintId, sprintId), eq(sprintIssueHistory.removalReason, "spilled_over")));

      const spilledOver = historyRows.length;
      const byStatus: Record<string, number> = {};
      for (const issue of sprintIssues) byStatus[issue.status] = (byStatus[issue.status] ?? 0) + 1;

      const total = sprintIssues.length;
      const done = byStatus["done"] ?? 0;
      const cancelled = byStatus["cancelled"] ?? 0;
      const completionRate = total - cancelled > 0 ? (done / (total - cancelled)) * 100 : 0;

      const nextSprintIds = [...new Set(historyRows.map((r) => r.nextSprintId).filter(Boolean))] as string[];
      const nextSprints = nextSprintIds.length > 0
        ? await db.select({ id: sprints.id, name: sprints.name }).from(sprints).where(inArray(sprints.id, nextSprintIds))
        : [];
      const nextSprintMap = Object.fromEntries(nextSprints.map((s) => [s.id, s.name]));

      const spillCounts: Record<string, number> = {};
      const nextSprintForIssue: Record<string, { id: string | null; name: string | null }> = {};
      for (const row of historyRows) {
        spillCounts[row.issueId] = (spillCounts[row.issueId] ?? 0) + 1;
        nextSprintForIssue[row.issueId] = { id: row.nextSprintId, name: row.nextSprintId ? (nextSprintMap[row.nextSprintId] ?? null) : null };
      }

      const cycleTimes: number[] = [];
      const issueTimings = sprintIssues.map((issue) => {
        const cycleTimeMs = issue.startedAt && issue.completedAt ? issue.completedAt.getTime() - issue.startedAt.getTime() : null;
        if (cycleTimeMs !== null) cycleTimes.push(cycleTimeMs);
        return { issueId: issue.id, identifier: issue.identifier, title: issue.title, status: issue.status, cycleTimeMs, spillCount: spillCounts[issue.id] ?? 0, nextSprintId: nextSprintForIssue[issue.id]?.id ?? null, nextSprintName: nextSprintForIssue[issue.id]?.name ?? null };
      });

      const avgCycleTimeMs = cycleTimes.length > 0 ? Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length) : null;

      return { total, byStatus, completionRate: Math.round(completionRate * 10) / 10, spilledOver, avgCycleTimeMs, issueTimings };
    },

    getProjectMetrics: async (projectId: string): Promise<ProjectSprintMetrics> => {
      const allSprints = await db.select().from(sprints).where(eq(sprints.projectId, projectId)).orderBy(sprints.createdAt);
      const completedSprints = allSprints.filter((s) => s.status === "completed");

      const sprintIds = allSprints.map((s) => s.id);
      const historyRows = sprintIds.length > 0
        ? await db.select().from(sprintIssueHistory).where(inArray(sprintIssueHistory.sprintId, sprintIds))
        : [];

      const sprintIssueMap: Record<string, { completed: number; spilled: number; total: number; nextId: string | null }> = {};
      for (const s of allSprints) sprintIssueMap[s.id] = { completed: 0, spilled: 0, total: 0, nextId: null };
      for (const row of historyRows) {
        if (!sprintIssueMap[row.sprintId]) continue;
        sprintIssueMap[row.sprintId].total++;
        if (row.removalReason === "completed") sprintIssueMap[row.sprintId].completed++;
        if (row.removalReason === "spilled_over") {
          sprintIssueMap[row.sprintId].spilled++;
          sprintIssueMap[row.sprintId].nextId = row.nextSprintId;
        }
      }

      const sprintNameMap = Object.fromEntries(allSprints.map((s) => [s.id, s.name]));
      const sprintSummaries = allSprints.map((s) => {
        const m = sprintIssueMap[s.id];
        return { sprintId: s.id, name: s.name, completed: m.completed, spilledOver: m.spilled, total: m.total, spilledToSprintId: m.nextId, spilledToSprintName: m.nextId ? (sprintNameMap[m.nextId] ?? null) : null };
      });

      const totalSpilled = sprintSummaries.reduce((acc, s) => acc + s.spilledOver, 0);
      const totalIssues = sprintSummaries.reduce((acc, s) => acc + s.total, 0);
      const spillOverRate = totalIssues > 0 ? Math.round((totalSpilled / totalIssues) * 1000) / 10 : 0;
      const totalCompleted = sprintSummaries.reduce((acc, s) => acc + s.completed, 0);
      const avgVelocity = completedSprints.length > 0 ? Math.round((totalCompleted / completedSprints.length) * 10) / 10 : 0;

      const stateRows = sprintIds.length > 0
        ? await db.select().from(issueStateHistory).where(inArray(issueStateHistory.sprintId, sprintIds))
        : [];

      const statusDurations: Record<string, number[]> = {};
      for (const row of stateRows) {
        if (row.fromStatus && row.durationMs) {
          if (!statusDurations[row.fromStatus]) statusDurations[row.fromStatus] = [];
          statusDurations[row.fromStatus].push(row.durationMs);
        }
      }
      const avgTimePerStatus: Record<string, number> = {};
      for (const [status, durations] of Object.entries(statusDurations)) {
        avgTimePerStatus[status] = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
      }

      const cycleTimes = stateRows.filter((r) => r.toStatus === "done" && r.durationMs).map((r) => r.durationMs!);
      const avgCycleTimeMs = cycleTimes.length > 0 ? Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length) : null;

      const userMoves: Record<string, { completed: number; cycleTimes: number[]; totalMoves: number }> = {};
      for (const row of stateRows) {
        const key = row.changedById;
        if (!userMoves[key]) userMoves[key] = { completed: 0, cycleTimes: [], totalMoves: 0 };
        userMoves[key].totalMoves++;
        if (row.toStatus === "done") {
          userMoves[key].completed++;
          if (row.durationMs) userMoves[key].cycleTimes.push(row.durationMs);
        }
      }
      const userActivity = Object.entries(userMoves).map(([userId, data]) => ({
        userId,
        name: null as string | null,
        completed: data.completed,
        avgCycleTimeMs: data.cycleTimes.length > 0 ? Math.round(data.cycleTimes.reduce((a, b) => a + b, 0) / data.cycleTimes.length) : null,
        totalMoves: data.totalMoves,
      }));

      const issueSprintCount: Record<string, { count: number; issueId: string }> = {};
      for (const row of historyRows) {
        if (!issueSprintCount[row.issueId]) issueSprintCount[row.issueId] = { count: 0, issueId: row.issueId };
        issueSprintCount[row.issueId].count++;
      }
      const alertIssueIds = Object.values(issueSprintCount).filter((e) => e.count >= 2).map((e) => e.issueId);
      const alertIssues = alertIssueIds.length > 0
        ? await db.select({ id: issues.id, identifier: issues.identifier, title: issues.title }).from(issues).where(inArray(issues.id, alertIssueIds))
        : [];
      const spillOverAlerts = alertIssues.map((i) => ({
        issueId: i.id,
        identifier: i.identifier,
        title: i.title,
        sprintCount: issueSprintCount[i.id]?.count ?? 0,
      }));

      const recentStateLog = stateRows
        .sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime())
        .slice(0, 50)
        .map((r) => ({ ...r, changedByName: null as string | null }));

      return { totalSprints: allSprints.length, completedSprints: completedSprints.length, avgVelocity, spillOverRate, avgCycleTimeMs, totalCompleted, sprintSummaries, avgTimePerStatus, userActivity, recentStateLog, spillOverAlerts };
    },

    remove: async (id: string) => {
      const sprint = await db.select().from(sprints).where(eq(sprints.id, id)).then((r) => r[0] ?? null);
      if (!sprint) throw notFound("Sprint not found");
      if (sprint.status !== "planning") throw conflict("Only a planning sprint can be deleted");
      return db.delete(sprints).where(eq(sprints.id, id)).returning().then((r) => r[0] ?? null);
    },
  };
}
