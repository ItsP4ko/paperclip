import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, costEvents, heartbeatRuns, issues } from "@paperclipai/db";

export interface AnalyticsDateRange {
  from?: Date;
  to?: Date;
}

type Granularity = "day" | "week" | "month";
type GroupBy = "agent" | "provider" | "model";

function dateConditions(range?: AnalyticsDateRange) {
  const conds: ReturnType<typeof eq>[] = [];
  if (range?.from) conds.push(gte(costEvents.occurredAt, range.from));
  if (range?.to) conds.push(lte(costEvents.occurredAt, range.to));
  return conds;
}

function runDateConditions(range?: AnalyticsDateRange) {
  const conds: ReturnType<typeof eq>[] = [];
  if (range?.from) conds.push(gte(heartbeatRuns.startedAt, range.from));
  if (range?.to) conds.push(lte(heartbeatRuns.startedAt, range.to));
  return conds;
}

export function analyticsService(db: Db) {
  return {
    /**
     * Time-series cost bucketing. Returns rows like:
     * { bucket: "2026-04-01", groupKey: "agent-name", costCents, inputTokens, outputTokens, runCount }
     */
    spendOverTime: async (
      companyId: string,
      granularity: Granularity = "day",
      groupBy: GroupBy = "agent",
      range?: AnalyticsDateRange,
    ) => {
      const truncExpr = sql`date_trunc(${sql.raw(`'${granularity}'`)}, ${costEvents.occurredAt})`;

      const groupExpr =
        groupBy === "agent"
          ? sql`${agents.name}`
          : groupBy === "provider"
            ? sql`${costEvents.provider}`
            : sql`${costEvents.model}`;

      const groupIdExpr =
        groupBy === "agent"
          ? sql`${costEvents.agentId}::text`
          : groupBy === "provider"
            ? sql`${costEvents.provider}`
            : sql`${costEvents.model}`;

      const conditions = [
        eq(costEvents.companyId, companyId),
        ...dateConditions(range),
      ];

      const needsJoin = groupBy === "agent";

      const baseQuery = db
        .select({
          bucket: sql<string>`${truncExpr}::text`.as("bucket"),
          groupKey: sql<string>`${groupExpr}`.as("group_key"),
          groupId: sql<string>`${groupIdExpr}`.as("group_id"),
          costCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
          inputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)::int`,
          outputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)::int`,
          runCount: sql<number>`count(distinct ${costEvents.heartbeatRunId})::int`,
        })
        .from(costEvents);

      const joined = needsJoin
        ? baseQuery.leftJoin(agents, eq(costEvents.agentId, agents.id))
        : baseQuery;

      return joined
        .where(and(...conditions))
        .groupBy(truncExpr, groupExpr, groupIdExpr)
        .orderBy(truncExpr, desc(sql`coalesce(sum(${costEvents.costCents}), 0)::int`));
    },

    /**
     * Per-agent performance metrics: tasks done, avg cycle time, success rate, cost/task.
     */
    agentPerformance: async (
      companyId: string,
      range?: AnalyticsDateRange,
      agentId?: string,
    ) => {
      // Task metrics from issues
      const issueConditions: ReturnType<typeof eq>[] = [eq(issues.companyId, companyId)];
      if (range?.from) issueConditions.push(gte(issues.createdAt, range.from));
      if (range?.to) issueConditions.push(lte(issues.createdAt, range.to));
      if (agentId) issueConditions.push(eq(issues.assigneeAgentId, agentId));

      const taskMetrics = await db
        .select({
          agentId: issues.assigneeAgentId,
          agentName: agents.name,
          agentIcon: agents.icon,
          agentStatus: agents.status,
          adapterType: agents.adapterType,
          totalTasks: sql<number>`count(*)::int`,
          completedTasks: sql<number>`count(*) filter (where ${issues.status} = 'done')::int`,
          cancelledTasks: sql<number>`count(*) filter (where ${issues.status} = 'cancelled')::int`,
          inProgressTasks: sql<number>`count(*) filter (where ${issues.status} = 'in_progress')::int`,
          avgCycleTimeMinutes: sql<number>`
            coalesce(
              avg(
                extract(epoch from (${issues.completedAt} - ${issues.startedAt})) / 60.0
              ) filter (where ${issues.completedAt} is not null and ${issues.startedAt} is not null),
              0
            )::int`,
          avgLeadTimeMinutes: sql<number>`
            coalesce(
              avg(
                extract(epoch from (${issues.completedAt} - ${issues.createdAt})) / 60.0
              ) filter (where ${issues.completedAt} is not null),
              0
            )::int`,
        })
        .from(issues)
        .innerJoin(agents, eq(issues.assigneeAgentId, agents.id))
        .where(and(...issueConditions, sql`${issues.assigneeAgentId} is not null`))
        .groupBy(issues.assigneeAgentId, agents.name, agents.icon, agents.status, agents.adapterType);

      // Run metrics from heartbeat_runs
      const runConditions: ReturnType<typeof eq>[] = [eq(heartbeatRuns.companyId, companyId)];
      runConditions.push(...runDateConditions(range));
      if (agentId) runConditions.push(eq(heartbeatRuns.agentId, agentId));

      const runMetrics = await db
        .select({
          agentId: heartbeatRuns.agentId,
          totalRuns: sql<number>`count(*)::int`,
          succeededRuns: sql<number>`count(*) filter (where ${heartbeatRuns.status} = 'succeeded')::int`,
          failedRuns: sql<number>`count(*) filter (where ${heartbeatRuns.status} = 'failed')::int`,
          cancelledRuns: sql<number>`count(*) filter (where ${heartbeatRuns.status} = 'cancelled')::int`,
          avgRunDurationMinutes: sql<number>`
            coalesce(
              avg(
                extract(epoch from (${heartbeatRuns.finishedAt} - ${heartbeatRuns.startedAt})) / 60.0
              ) filter (where ${heartbeatRuns.finishedAt} is not null and ${heartbeatRuns.startedAt} is not null),
              0
            )::int`,
        })
        .from(heartbeatRuns)
        .where(and(...runConditions))
        .groupBy(heartbeatRuns.agentId);

      // Cost metrics
      const costConditions: ReturnType<typeof eq>[] = [eq(costEvents.companyId, companyId)];
      costConditions.push(...dateConditions(range));
      if (agentId) costConditions.push(eq(costEvents.agentId, agentId));

      const costMetrics = await db
        .select({
          agentId: costEvents.agentId,
          totalCostCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
          totalInputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)::int`,
          totalOutputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)::int`,
        })
        .from(costEvents)
        .where(and(...costConditions))
        .groupBy(costEvents.agentId);

      // Merge all metrics by agentId
      const runMap = new Map(runMetrics.map((r) => [r.agentId, r]));
      const costMap = new Map(costMetrics.map((c) => [c.agentId, c]));

      return taskMetrics.map((t) => {
        const runs = runMap.get(t.agentId!) ?? {
          totalRuns: 0, succeededRuns: 0, failedRuns: 0, cancelledRuns: 0, avgRunDurationMinutes: 0,
        };
        const costs = costMap.get(t.agentId!) ?? {
          totalCostCents: 0, totalInputTokens: 0, totalOutputTokens: 0,
        };
        const successRate = runs.totalRuns > 0
          ? Number(((runs.succeededRuns / runs.totalRuns) * 100).toFixed(1))
          : 0;
        const costPerTask = t.completedTasks > 0
          ? Math.round(costs.totalCostCents / t.completedTasks)
          : 0;

        return {
          agentId: t.agentId,
          agentName: t.agentName,
          agentIcon: t.agentIcon,
          agentStatus: t.agentStatus,
          adapterType: t.adapterType,
          // Task metrics
          totalTasks: t.totalTasks,
          completedTasks: t.completedTasks,
          cancelledTasks: t.cancelledTasks,
          inProgressTasks: t.inProgressTasks,
          avgCycleTimeMinutes: t.avgCycleTimeMinutes,
          avgLeadTimeMinutes: t.avgLeadTimeMinutes,
          // Run metrics
          totalRuns: runs.totalRuns,
          succeededRuns: runs.succeededRuns,
          failedRuns: runs.failedRuns,
          successRate,
          avgRunDurationMinutes: runs.avgRunDurationMinutes,
          // Cost metrics
          totalCostCents: costs.totalCostCents,
          totalInputTokens: costs.totalInputTokens,
          totalOutputTokens: costs.totalOutputTokens,
          costPerTask,
        };
      });
    },

    /**
     * Compare adapter types: for each adapterType used in the company,
     * show avg cost/task, avg time/task, success rate.
     */
    adapterComparison: async (
      companyId: string,
      range?: AnalyticsDateRange,
    ) => {
      const runConditions: ReturnType<typeof eq>[] = [eq(heartbeatRuns.companyId, companyId)];
      runConditions.push(...runDateConditions(range));

      return db
        .select({
          adapterType: agents.adapterType,
          totalRuns: sql<number>`count(*)::int`,
          succeededRuns: sql<number>`count(*) filter (where ${heartbeatRuns.status} = 'succeeded')::int`,
          failedRuns: sql<number>`count(*) filter (where ${heartbeatRuns.status} = 'failed')::int`,
          successRate: sql<number>`
            case when count(*) > 0
              then round(count(*) filter (where ${heartbeatRuns.status} = 'succeeded') * 100.0 / count(*), 1)
              else 0
            end`,
          avgRunDurationMinutes: sql<number>`
            coalesce(
              avg(
                extract(epoch from (${heartbeatRuns.finishedAt} - ${heartbeatRuns.startedAt})) / 60.0
              ) filter (where ${heartbeatRuns.finishedAt} is not null and ${heartbeatRuns.startedAt} is not null),
              0
            )::numeric(10,1)`,
          totalCostCents: sql<number>`coalesce(sum(ce.cost_cents), 0)::int`,
          totalInputTokens: sql<number>`coalesce(sum(ce.input_tokens), 0)::int`,
          totalOutputTokens: sql<number>`coalesce(sum(ce.output_tokens), 0)::int`,
          avgCostPerRun: sql<number>`
            case when count(*) filter (where ${heartbeatRuns.status} = 'succeeded') > 0
              then round(coalesce(sum(ce.cost_cents), 0)::numeric / count(*) filter (where ${heartbeatRuns.status} = 'succeeded'), 0)
              else 0
            end::int`,
        })
        .from(heartbeatRuns)
        .innerJoin(agents, eq(heartbeatRuns.agentId, agents.id))
        .leftJoin(
          sql`${costEvents} ce`,
          sql`ce.heartbeat_run_id = ${heartbeatRuns.id}`,
        )
        .where(and(...runConditions))
        .groupBy(agents.adapterType)
        .orderBy(desc(sql`count(*)::int`));
    },
  };
}
