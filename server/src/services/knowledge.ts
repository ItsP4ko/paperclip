import { and, desc, eq, sql, ilike, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { knowledgeEntries, knowledgeInjections } from "@paperclipai/db";

export interface KnowledgeEntryInput {
  companyId: string;
  agentId?: string | null;
  title: string;
  content: string;
  category?: string | null;
  tags?: string[];
  pinned?: boolean;
  sourceType?: string;
  sourceRef?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface KnowledgeSearchFilters {
  companyId: string;
  agentId?: string | null;
  category?: string;
  pinned?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}

export function knowledgeService(db: Db) {
  return {
    list: async (filters: KnowledgeSearchFilters) => {
      const limit = Math.min(filters.limit ?? 50, 200);
      const offset = filters.offset ?? 0;

      const conditions: ReturnType<typeof eq>[] = [
        eq(knowledgeEntries.companyId, filters.companyId),
      ];

      if (filters.agentId) {
        conditions.push(eq(knowledgeEntries.agentId, filters.agentId));
      }
      if (filters.category) {
        conditions.push(eq(knowledgeEntries.category, filters.category));
      }
      if (typeof filters.pinned === "boolean") {
        conditions.push(eq(knowledgeEntries.pinned, filters.pinned));
      }

      const rows = await db
        .select({
          id: knowledgeEntries.id,
          companyId: knowledgeEntries.companyId,
          agentId: knowledgeEntries.agentId,
          title: knowledgeEntries.title,
          content: knowledgeEntries.content,
          category: knowledgeEntries.category,
          tags: knowledgeEntries.tags,
          pinned: knowledgeEntries.pinned,
          sourceType: knowledgeEntries.sourceType,
          sourceRef: knowledgeEntries.sourceRef,
          metadata: knowledgeEntries.metadata,
          createdAt: knowledgeEntries.createdAt,
          updatedAt: knowledgeEntries.updatedAt,
        })
        .from(knowledgeEntries)
        .where(and(...conditions))
        .orderBy(desc(knowledgeEntries.pinned), desc(knowledgeEntries.updatedAt))
        .limit(limit)
        .offset(offset);

      return rows;
    },

    search: async (companyId: string, query: string, opts?: { agentId?: string; limit?: number }) => {
      const limit = Math.min(opts?.limit ?? 20, 100);
      const tsQuery = query
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => `${w}:*`)
        .join(" & ");

      if (!tsQuery) return [];

      const conditions: ReturnType<typeof eq>[] = [
        eq(knowledgeEntries.companyId, companyId),
      ];
      if (opts?.agentId) {
        conditions.push(eq(knowledgeEntries.agentId, opts.agentId));
      }

      const rows = await db
        .select({
          id: knowledgeEntries.id,
          companyId: knowledgeEntries.companyId,
          agentId: knowledgeEntries.agentId,
          title: knowledgeEntries.title,
          content: knowledgeEntries.content,
          category: knowledgeEntries.category,
          tags: knowledgeEntries.tags,
          pinned: knowledgeEntries.pinned,
          sourceType: knowledgeEntries.sourceType,
          sourceRef: knowledgeEntries.sourceRef,
          metadata: knowledgeEntries.metadata,
          createdAt: knowledgeEntries.createdAt,
          updatedAt: knowledgeEntries.updatedAt,
          rank: sql<number>`ts_rank(${knowledgeEntries.searchVector}, to_tsquery('english', ${tsQuery}))`.as("rank"),
        })
        .from(knowledgeEntries)
        .where(
          and(
            ...conditions,
            sql`${knowledgeEntries.searchVector} @@ to_tsquery('english', ${tsQuery})`,
          ),
        )
        .orderBy(sql`rank DESC`)
        .limit(limit);

      return rows;
    },

    getById: async (companyId: string, id: string) => {
      const rows = await db
        .select()
        .from(knowledgeEntries)
        .where(
          and(
            eq(knowledgeEntries.id, id),
            eq(knowledgeEntries.companyId, companyId),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },

    create: async (input: KnowledgeEntryInput) => {
      const rows = await db
        .insert(knowledgeEntries)
        .values({
          companyId: input.companyId,
          agentId: input.agentId ?? null,
          title: input.title,
          content: input.content,
          category: input.category ?? null,
          tags: input.tags ?? [],
          pinned: input.pinned ?? false,
          sourceType: input.sourceType ?? "manual",
          sourceRef: input.sourceRef ?? null,
          metadata: input.metadata ?? null,
        })
        .returning();
      return rows[0]!;
    },

    update: async (companyId: string, id: string, input: Partial<KnowledgeEntryInput>) => {
      const sets: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title !== undefined) sets.title = input.title;
      if (input.content !== undefined) sets.content = input.content;
      if (input.category !== undefined) sets.category = input.category;
      if (input.tags !== undefined) sets.tags = input.tags;
      if (input.pinned !== undefined) sets.pinned = input.pinned;
      if (input.agentId !== undefined) sets.agentId = input.agentId;
      if (input.sourceType !== undefined) sets.sourceType = input.sourceType;
      if (input.sourceRef !== undefined) sets.sourceRef = input.sourceRef;
      if (input.metadata !== undefined) sets.metadata = input.metadata;

      const rows = await db
        .update(knowledgeEntries)
        .set(sets)
        .where(
          and(
            eq(knowledgeEntries.id, id),
            eq(knowledgeEntries.companyId, companyId),
          ),
        )
        .returning();
      return rows[0] ?? null;
    },

    delete: async (companyId: string, id: string) => {
      const rows = await db
        .delete(knowledgeEntries)
        .where(
          and(
            eq(knowledgeEntries.id, id),
            eq(knowledgeEntries.companyId, companyId),
          ),
        )
        .returning({ id: knowledgeEntries.id });
      return rows.length > 0;
    },

    distinctCategories: async (companyId: string) => {
      const rows = await db
        .selectDistinct({ category: knowledgeEntries.category })
        .from(knowledgeEntries)
        .where(
          and(
            eq(knowledgeEntries.companyId, companyId),
            sql`${knowledgeEntries.category} IS NOT NULL`,
          ),
        )
        .orderBy(knowledgeEntries.category);
      return rows.map((r) => r.category).filter(Boolean) as string[];
    },

    /**
     * Resolve KB entries to inject before a run:
     * 1. All pinned entries scoped to the agent (or company-wide)
     * 2. Optionally, top-ranked search results based on issue context
     */
    resolveForInjection: async (
      companyId: string,
      agentId: string,
      contextQuery?: string,
    ) => {
      // Pinned entries: agent-specific OR company-wide (agentId IS NULL)
      const pinned = await db
        .select()
        .from(knowledgeEntries)
        .where(
          and(
            eq(knowledgeEntries.companyId, companyId),
            eq(knowledgeEntries.pinned, true),
            sql`(${knowledgeEntries.agentId} = ${agentId} OR ${knowledgeEntries.agentId} IS NULL)`,
          ),
        )
        .orderBy(desc(knowledgeEntries.updatedAt))
        .limit(10);

      let contextual: typeof pinned = [];
      if (contextQuery && contextQuery.trim().length > 0) {
        const tsQuery = contextQuery
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 10) // limit words for perf
          .map((w) => `${w}:*`)
          .join(" & ");

        if (tsQuery) {
          const pinnedIds = pinned.map((p) => p.id);
          contextual = await db
            .select()
            .from(knowledgeEntries)
            .where(
              and(
                eq(knowledgeEntries.companyId, companyId),
                sql`(${knowledgeEntries.agentId} = ${agentId} OR ${knowledgeEntries.agentId} IS NULL)`,
                sql`${knowledgeEntries.searchVector} @@ to_tsquery('english', ${tsQuery})`,
                pinnedIds.length > 0
                  ? sql`${knowledgeEntries.id} NOT IN (${sql.join(pinnedIds.map((id) => sql`${id}::uuid`), sql`, `)})`
                  : sql`true`,
              ),
            )
            .orderBy(
              sql`ts_rank(${knowledgeEntries.searchVector}, to_tsquery('english', ${tsQuery})) DESC`,
            )
            .limit(5);
        }
      }

      return { pinned, contextual };
    },

    /**
     * Record which KB entries were injected into a run.
     */
    recordInjections: async (
      companyId: string,
      agentId: string,
      runId: string,
      entryIds: string[],
    ) => {
      if (entryIds.length === 0) return;
      await db.insert(knowledgeInjections).values(
        entryIds.map((entryId) => ({
          knowledgeEntryId: entryId,
          runId,
          agentId,
          companyId,
        })),
      );
    },

    /**
     * Get injections for a specific run (for audit/display).
     */
    getInjectionsForRun: async (runId: string) => {
      return db
        .select({
          id: knowledgeInjections.id,
          knowledgeEntryId: knowledgeInjections.knowledgeEntryId,
          entryTitle: knowledgeEntries.title,
          injectedAt: knowledgeInjections.injectedAt,
        })
        .from(knowledgeInjections)
        .leftJoin(
          knowledgeEntries,
          eq(knowledgeInjections.knowledgeEntryId, knowledgeEntries.id),
        )
        .where(eq(knowledgeInjections.runId, runId))
        .orderBy(knowledgeInjections.injectedAt);
    },
  };
}
