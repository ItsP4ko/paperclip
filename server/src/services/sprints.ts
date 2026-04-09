import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issues, sprints, sprintIssueHistory } from "@paperclipai/db";
import type { SprintMetrics } from "@paperclipai/shared";
import { conflict, notFound } from "../errors.js";

export function sprintService(db: Db) {
  return {
    list: (companyId: string) =>
      db
        .select()
        .from(sprints)
        .where(eq(sprints.companyId, companyId))
        .orderBy(desc(sprints.createdAt)),

    getById: (id: string) =>
      db
        .select()
        .from(sprints)
        .where(eq(sprints.id, id))
        .then((rows) => rows[0] ?? null),

    getActive: (companyId: string) =>
      db
        .select()
        .from(sprints)
        .where(and(eq(sprints.companyId, companyId), eq(sprints.status, "active")))
        .then((rows) => rows[0] ?? null),

    create: (companyId: string, data: Omit<typeof sprints.$inferInsert, "companyId" | "status">) =>
      db
        .insert(sprints)
        .values({ ...data, companyId, status: "planning" })
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
      const sprint = await db
        .select()
        .from(sprints)
        .where(eq(sprints.id, id))
        .then((rows) => rows[0] ?? null);
      if (!sprint) throw notFound("Sprint not found");
      if (sprint.status !== "planning") {
        throw conflict("Only a planning sprint can be activated");
      }
      const existing = await db
        .select({ id: sprints.id })
        .from(sprints)
        .where(and(eq(sprints.companyId, sprint.companyId), eq(sprints.status, "active")))
        .then((rows) => rows[0] ?? null);
      if (existing) {
        throw conflict("There is already an active sprint. Complete it before activating a new one.");
      }
      return db
        .update(sprints)
        .set({ status: "active", startedAt: new Date(), updatedAt: new Date() })
        .where(eq(sprints.id, id))
        .returning()
        .then((rows) => rows[0]);
    },

    complete: async (
      id: string,
      spillStrategy: "backlog" | "next_sprint",
      nextSprintId?: string,
    ) => {
      const sprint = await db
        .select()
        .from(sprints)
        .where(eq(sprints.id, id))
        .then((rows) => rows[0] ?? null);
      if (!sprint) throw notFound("Sprint not found");
      if (sprint.status !== "active") {
        throw conflict("Only an active sprint can be completed");
      }

      // Find incomplete issues in this sprint
      const incompleteIssues = await db
        .select({ id: issues.id })
        .from(issues)
        .where(
          and(
            eq(issues.sprintId, id),
            ne(issues.status, "done"),
            ne(issues.status, "cancelled"),
          ),
        );

      const incompleteIds = incompleteIssues.map((r) => r.id);

      // Record spill-over history
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
        // Move issues
        await db
          .update(issues)
          .set({
            sprintId: spillStrategy === "next_sprint" && nextSprintId ? nextSprintId : null,
            updatedAt: new Date(),
          })
          .where(inArray(issues.id, incompleteIds));
      }

      // Mark completed issues in history
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
        .then((rows) => rows[0]);
    },

    addIssue: async (sprintId: string, issueId: string) => {
      // Remove from previous sprint if any
      const issue = await db
        .select({ sprintId: issues.sprintId })
        .from(issues)
        .where(eq(issues.id, issueId))
        .then((rows) => rows[0] ?? null);
      if (!issue) throw notFound("Issue not found");

      if (issue.sprintId && issue.sprintId !== sprintId) {
        await db.insert(sprintIssueHistory).values({
          sprintId: issue.sprintId,
          issueId,
          removalReason: "removed",
          removedAt: new Date(),
          nextSprintId: sprintId,
        });
      }

      await db
        .update(issues)
        .set({ sprintId, updatedAt: new Date() })
        .where(eq(issues.id, issueId));

      await db.insert(sprintIssueHistory).values({
        sprintId,
        issueId,
        addedAt: new Date(),
      });

      return db
        .select()
        .from(issues)
        .where(eq(issues.id, issueId))
        .then((rows) => rows[0]);
    },

    removeIssue: async (sprintId: string, issueId: string, reason: "removed" | "spilled_over" = "removed") => {
      await db
        .update(issues)
        .set({ sprintId: null, updatedAt: new Date() })
        .where(and(eq(issues.id, issueId), eq(issues.sprintId, sprintId)));

      await db.insert(sprintIssueHistory).values({
        sprintId,
        issueId,
        removalReason: reason,
        removedAt: new Date(),
      });
    },

    getMetrics: async (sprintId: string): Promise<SprintMetrics> => {
      const sprintIssues = await db
        .select({
          id: issues.id,
          identifier: issues.identifier,
          title: issues.title,
          status: issues.status,
          startedAt: issues.startedAt,
          completedAt: issues.completedAt,
        })
        .from(issues)
        .where(eq(issues.sprintId, sprintId));

      // Also get issues that were in this sprint but moved out (spilled over)
      const historyRows = await db
        .select()
        .from(sprintIssueHistory)
        .where(
          and(
            eq(sprintIssueHistory.sprintId, sprintId),
            eq(sprintIssueHistory.removalReason, "spilled_over"),
          ),
        );

      const spilledOver = historyRows.length;

      const byStatus: Record<string, number> = {};
      for (const issue of sprintIssues) {
        byStatus[issue.status] = (byStatus[issue.status] ?? 0) + 1;
      }

      const total = sprintIssues.length;
      const done = byStatus["done"] ?? 0;
      const cancelled = byStatus["cancelled"] ?? 0;
      const completionRate = total - cancelled > 0 ? (done / (total - cancelled)) * 100 : 0;

      // Next sprint names for spill-over entries
      const nextSprintIds = [...new Set(historyRows.map((r) => r.nextSprintId).filter(Boolean))] as string[];
      const nextSprints = nextSprintIds.length > 0
        ? await db.select({ id: sprints.id, name: sprints.name }).from(sprints).where(inArray(sprints.id, nextSprintIds))
        : [];
      const nextSprintMap = Object.fromEntries(nextSprints.map((s) => [s.id, s.name]));

      // Spill count per issue (how many sprints it has been in)
      const spillCounts: Record<string, number> = {};
      const nextSprintForIssue: Record<string, { id: string | null; name: string | null }> = {};
      for (const row of historyRows) {
        spillCounts[row.issueId] = (spillCounts[row.issueId] ?? 0) + 1;
        nextSprintForIssue[row.issueId] = {
          id: row.nextSprintId,
          name: row.nextSprintId ? (nextSprintMap[row.nextSprintId] ?? null) : null,
        };
      }

      const cycleTimes: number[] = [];
      const issueTimings = sprintIssues.map((issue) => {
        const cycleTimeMs =
          issue.startedAt && issue.completedAt
            ? issue.completedAt.getTime() - issue.startedAt.getTime()
            : null;
        if (cycleTimeMs !== null) cycleTimes.push(cycleTimeMs);
        return {
          issueId: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          status: issue.status,
          cycleTimeMs,
          spillCount: spillCounts[issue.id] ?? 0,
          nextSprintId: nextSprintForIssue[issue.id]?.id ?? null,
          nextSprintName: nextSprintForIssue[issue.id]?.name ?? null,
        };
      });

      const avgCycleTimeMs =
        cycleTimes.length > 0
          ? Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length)
          : null;

      return {
        total,
        byStatus,
        completionRate: Math.round(completionRate * 10) / 10,
        spilledOver,
        avgCycleTimeMs,
        issueTimings,
      };
    },

    remove: async (id: string) => {
      const sprint = await db
        .select()
        .from(sprints)
        .where(eq(sprints.id, id))
        .then((rows) => rows[0] ?? null);
      if (!sprint) throw notFound("Sprint not found");
      if (sprint.status !== "planning") {
        throw conflict("Only a planning sprint can be deleted");
      }
      return db
        .delete(sprints)
        .where(eq(sprints.id, id))
        .returning()
        .then((rows) => rows[0] ?? null);
    },
  };
}
