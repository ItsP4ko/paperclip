import { and, desc, eq, gte, lte, lt, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  activityLog,
  agents,
  authUsers,
  issues,
  issueComments,
} from "@paperclipai/db";

export interface AuditTimelineFilters {
  companyId: string;
  from?: Date;
  to?: Date;
  actorType?: string;
  entityType?: string;
  action?: string;
  cursor?: string; // ISO timestamp for keyset pagination
  limit?: number;
}

export interface AuditExportFilters {
  companyId: string;
  from?: Date;
  to?: Date;
  actorType?: string;
  entityType?: string;
}

export function auditService(db: Db) {
  return {
    /**
     * Paginated, filterable audit timeline with actor name resolution.
     */
    timeline: async (filters: AuditTimelineFilters) => {
      const limit = Math.min(filters.limit ?? 50, 200);
      const conditions: ReturnType<typeof eq>[] = [
        eq(activityLog.companyId, filters.companyId),
      ];

      if (filters.from) conditions.push(gte(activityLog.createdAt, filters.from));
      if (filters.to) conditions.push(lte(activityLog.createdAt, filters.to));
      if (filters.actorType) conditions.push(eq(activityLog.actorType, filters.actorType));
      if (filters.entityType) conditions.push(eq(activityLog.entityType, filters.entityType));
      if (filters.action) conditions.push(eq(activityLog.action, filters.action));
      if (filters.cursor) conditions.push(lt(activityLog.createdAt, new Date(filters.cursor)));

      const rows = await db
        .select({
          id: activityLog.id,
          actorType: activityLog.actorType,
          actorId: activityLog.actorId,
          action: activityLog.action,
          entityType: activityLog.entityType,
          entityId: activityLog.entityId,
          agentId: activityLog.agentId,
          runId: activityLog.runId,
          details: activityLog.details,
          createdAt: activityLog.createdAt,
          // Resolve actor names
          actorAgentName: agents.name,
          actorUserName: authUsers.name,
        })
        .from(activityLog)
        .leftJoin(
          agents,
          and(
            eq(activityLog.actorType, sql`'agent'`),
            sql`${agents.id}::text = ${activityLog.actorId}`,
          ),
        )
        .leftJoin(
          authUsers,
          and(
            eq(activityLog.actorType, sql`'user'`),
            eq(authUsers.id, activityLog.actorId),
          ),
        )
        .where(and(...conditions))
        .orderBy(desc(activityLog.createdAt))
        .limit(limit + 1); // fetch one extra to check hasMore

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;

      return {
        items: items.map((row) => ({
          ...row,
          actorName: row.actorAgentName ?? row.actorUserName ?? (row.actorType === "system" ? "System" : row.actorId),
        })),
        nextCursor,
        hasMore,
      };
    },

    /**
     * Returns all rows matching filters for export. Streams-friendly — returns
     * an async generator that yields batches.
     */
    exportBatches: async function* (filters: AuditExportFilters, batchSize = 500) {
      let cursor: Date | null = null;
      let hasMore = true;

      while (hasMore) {
        const conditions: ReturnType<typeof eq>[] = [
          eq(activityLog.companyId, filters.companyId),
        ];
        if (filters.from) conditions.push(gte(activityLog.createdAt, filters.from));
        if (filters.to) conditions.push(lte(activityLog.createdAt, filters.to));
        if (filters.actorType) conditions.push(eq(activityLog.actorType, filters.actorType));
        if (filters.entityType) conditions.push(eq(activityLog.entityType, filters.entityType));
        if (cursor) conditions.push(lt(activityLog.createdAt, cursor));

        const batch = await db
          .select()
          .from(activityLog)
          .where(and(...conditions))
          .orderBy(desc(activityLog.createdAt))
          .limit(batchSize);

        if (batch.length === 0) break;
        yield batch;

        hasMore = batch.length === batchSize;
        cursor = batch[batch.length - 1].createdAt;
      }
    },

    /**
     * Distinct action values for filter dropdowns.
     */
    distinctActions: async (companyId: string) => {
      const rows = await db
        .selectDistinct({ action: activityLog.action })
        .from(activityLog)
        .where(eq(activityLog.companyId, companyId))
        .orderBy(activityLog.action);
      return rows.map((r) => r.action);
    },

    /**
     * Distinct entity types for filter dropdowns.
     */
    distinctEntityTypes: async (companyId: string) => {
      const rows = await db
        .selectDistinct({ entityType: activityLog.entityType })
        .from(activityLog)
        .where(eq(activityLog.companyId, companyId))
        .orderBy(activityLog.entityType);
      return rows.map((r) => r.entityType);
    },

    /**
     * GDPR data export: all activity + issues + comments for a specific user.
     */
    userDataExport: async (companyId: string, userId: string) => {
      const [userActivity, userIssues, userComments] = await Promise.all([
        db
          .select()
          .from(activityLog)
          .where(
            and(
              eq(activityLog.companyId, companyId),
              eq(activityLog.actorId, userId),
            ),
          )
          .orderBy(desc(activityLog.createdAt))
          .limit(10000),

        db
          .select({
            id: issues.id,
            title: issues.title,
            status: issues.status,
            createdAt: issues.createdAt,
            completedAt: issues.completedAt,
          })
          .from(issues)
          .where(
            and(
              eq(issues.companyId, companyId),
              eq(issues.createdByUserId, userId),
            ),
          )
          .orderBy(desc(issues.createdAt)),

        db
          .select({
            id: issueComments.id,
            issueId: issueComments.issueId,
            body: issueComments.body,
            createdAt: issueComments.createdAt,
          })
          .from(issueComments)
          .where(
            and(
              eq(issueComments.companyId, companyId),
              eq(issueComments.authorUserId, userId),
            ),
          )
          .orderBy(desc(issueComments.createdAt)),
      ]);

      return {
        userId,
        companyId,
        exportedAt: new Date().toISOString(),
        activity: userActivity,
        issues: userIssues,
        comments: userComments,
      };
    },

    /**
     * GDPR data erasure: anonymize user data in activity_log and comments.
     */
    userDataErasure: async (companyId: string, userId: string) => {
      const anonymizedId = `erased-${userId.slice(0, 8)}`;

      const [activityResult, commentsResult] = await Promise.all([
        db
          .update(activityLog)
          .set({ actorId: anonymizedId })
          .where(
            and(
              eq(activityLog.companyId, companyId),
              eq(activityLog.actorId, userId),
            ),
          ),

        db
          .update(issueComments)
          .set({ body: "[Content removed per data erasure request]" })
          .where(
            and(
              eq(issueComments.companyId, companyId),
              eq(issueComments.authorUserId, userId),
            ),
          ),
      ]);

      return {
        userId,
        anonymizedId,
        erasedAt: new Date().toISOString(),
      };
    },
  };
}
