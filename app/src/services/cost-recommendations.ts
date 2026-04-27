import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, costEvents, costRecommendations, heartbeatRuns } from "@paperclipai/db";

const EXPENSIVE_MODEL_KEYWORDS = ["opus", "claude-3-5", "sonnet-3-5", "gpt-4", "o1-", "o3-"];
const EXPENSIVE_ADAPTERS = ["openclaw_gateway", "http"];
const HIGH_FAILURE_THRESHOLD = 0.5;
const IDLE_DAYS_MEDIUM = 14;
const IDLE_DAYS_HIGH = 30;
const MIN_RUNS_FOR_FAILURE_RULE = 5;

export function costRecommendationService(db: Db) {
  return {
    list: async (
      companyId: string,
      opts?: { status?: string; limit?: number; offset?: number },
    ) => {
      const limit = Math.min(opts?.limit ?? 50, 200);
      const offset = opts?.offset ?? 0;

      const conditions: ReturnType<typeof eq>[] = [
        eq(costRecommendations.companyId, companyId),
      ];
      if (opts?.status) {
        conditions.push(eq(costRecommendations.status, opts.status));
      }

      return db
        .select()
        .from(costRecommendations)
        .where(and(...conditions))
        .orderBy(
          sql`case ${costRecommendations.severity} when 'high' then 0 when 'medium' then 1 else 2 end`,
          desc(costRecommendations.estimatedSavingsCents),
          desc(costRecommendations.createdAt),
        )
        .limit(limit)
        .offset(offset);
    },

    update: async (companyId: string, id: string, status: "accepted" | "dismissed") => {
      const rows = await db
        .update(costRecommendations)
        .set({ status, updatedAt: new Date() })
        .where(
          and(
            eq(costRecommendations.id, id),
            eq(costRecommendations.companyId, companyId),
          ),
        )
        .returning();
      return rows[0] ?? null;
    },

    /**
     * Run all 5 analysis rules against the company's data for the last 30 days.
     * Clears existing pending recommendations first, then inserts fresh ones.
     * Dismissed/accepted recommendations are preserved as history.
     */
    generate: async (companyId: string) => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // --- Fetch agents, costs, models, and run metrics in parallel ---
      const [allAgents, costRows, modelRows, runRows] = await Promise.all([
        db
          .select()
          .from(agents)
          .where(eq(agents.companyId, companyId)),
        db
          .select({
            agentId: costEvents.agentId,
            totalCostCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
          })
          .from(costEvents)
          .where(
            and(
              eq(costEvents.companyId, companyId),
              gte(costEvents.occurredAt, thirtyDaysAgo),
            ),
          )
          .groupBy(costEvents.agentId),
        db
          .select({
            agentId: costEvents.agentId,
            model: costEvents.model,
            modelCost: sql<number>`sum(${costEvents.costCents})::int`,
          })
          .from(costEvents)
          .where(
            and(
              eq(costEvents.companyId, companyId),
              gte(costEvents.occurredAt, thirtyDaysAgo),
            ),
          )
          .groupBy(costEvents.agentId, costEvents.model),
        db
          .select({
            agentId: heartbeatRuns.agentId,
            totalRuns: sql<number>`count(*)::int`,
            succeededRuns: sql<number>`count(*) filter (where ${heartbeatRuns.status} = 'succeeded')::int`,
            failedRuns: sql<number>`count(*) filter (where ${heartbeatRuns.status} = 'failed')::int`,
          })
          .from(heartbeatRuns)
          .where(
            and(
              eq(heartbeatRuns.companyId, companyId),
              gte(heartbeatRuns.startedAt, thirtyDaysAgo),
            ),
          )
          .groupBy(heartbeatRuns.agentId),
      ]);

      if (allAgents.length === 0) return 0;

      const costByAgent = new Map(costRows.map((r) => [r.agentId, r.totalCostCents]));

      const topModelByAgent = new Map<string, { model: string; modelCost: number }>();
      for (const row of modelRows) {
        const existing = topModelByAgent.get(row.agentId);
        if (!existing || row.modelCost > existing.modelCost) {
          topModelByAgent.set(row.agentId, { model: row.model, modelCost: row.modelCost });
        }
      }

      const runsByAgent = new Map(runRows.map((r) => [r.agentId, r]));

      // --- Clear existing pending recommendations ---
      await db
        .delete(costRecommendations)
        .where(
          and(
            eq(costRecommendations.companyId, companyId),
            eq(costRecommendations.status, "pending"),
          ),
        );

      // --- Apply rules and build new recommendations ---
      const recs: (typeof costRecommendations.$inferInsert)[] = [];
      const now = new Date();

      for (const agent of allAgents) {
        const totalCost = costByAgent.get(agent.id) ?? 0;
        const runs = runsByAgent.get(agent.id);
        const topModel = topModelByAgent.get(agent.id);

        // Rule 1: high_failure_rate
        if (runs && runs.totalRuns >= MIN_RUNS_FOR_FAILURE_RULE) {
          const successRate = runs.succeededRuns / runs.totalRuns;
          if (successRate < HIGH_FAILURE_THRESHOLD) {
            const wastedCost =
              runs.totalRuns > 0
                ? Math.round(totalCost * (runs.failedRuns / runs.totalRuns))
                : 0;
            recs.push({
              companyId,
              agentId: agent.id,
              type: "high_failure_rate",
              severity: successRate < 0.25 ? "high" : "medium",
              estimatedSavingsCents: wastedCost,
              details: {
                agentName: agent.name,
                totalRuns: runs.totalRuns,
                failedRuns: runs.failedRuns,
                successRate: Math.round(successRate * 100),
                totalCostCents: totalCost,
              },
            });
          }
        }

        // Rule 2: pause_idle
        if (agent.status !== "paused" && agent.budgetMonthlyCents > 0) {
          const lastActivity = agent.lastHeartbeatAt;
          const daysSinceActivity = lastActivity
            ? Math.floor((now.getTime() - lastActivity.getTime()) / 86_400_000)
            : 999;

          if (daysSinceActivity >= IDLE_DAYS_MEDIUM) {
            recs.push({
              companyId,
              agentId: agent.id,
              type: "pause_idle",
              severity: daysSinceActivity >= IDLE_DAYS_HIGH ? "high" : "medium",
              estimatedSavingsCents: agent.budgetMonthlyCents,
              details: {
                agentName: agent.name,
                lastHeartbeatAt: lastActivity?.toISOString() ?? null,
                daysSinceLastRun: daysSinceActivity < 999 ? daysSinceActivity : null,
                budgetMonthlyCents: agent.budgetMonthlyCents,
              },
            });
          }
        }

        // Rule 3: downgrade_model
        if (totalCost > 1000 && topModel) {
          const isExpensive = EXPENSIVE_MODEL_KEYWORDS.some((k) =>
            topModel.model.toLowerCase().includes(k),
          );
          if (isExpensive) {
            recs.push({
              companyId,
              agentId: agent.id,
              type: "downgrade_model",
              severity: totalCost > 5000 ? "high" : "medium",
              estimatedSavingsCents: Math.round(totalCost * 0.3),
              details: {
                agentName: agent.name,
                topModel: topModel.model,
                totalCostCents: totalCost,
                estimatedSavingsPercent: 30,
              },
            });
          }
        }

        // Rule 4: switch_adapter
        if (EXPENSIVE_ADAPTERS.includes(agent.adapterType) && totalCost > 500) {
          recs.push({
            companyId,
            agentId: agent.id,
            type: "switch_adapter",
            severity: "medium",
            estimatedSavingsCents: Math.round(totalCost * 0.2),
            details: {
              agentName: agent.name,
              adapterType: agent.adapterType,
              totalCostCents: totalCost,
              estimatedSavingsPercent: 20,
            },
          });
        }

        // Rule 5: budget_underutilized
        if (agent.budgetMonthlyCents > 1000) {
          const utilizationPct = Math.round(
            (agent.spentMonthlyCents / agent.budgetMonthlyCents) * 100,
          );
          if (utilizationPct < 10) {
            recs.push({
              companyId,
              agentId: agent.id,
              type: "budget_underutilized",
              severity: "low",
              estimatedSavingsCents: 0,
              details: {
                agentName: agent.name,
                budgetMonthlyCents: agent.budgetMonthlyCents,
                spentMonthlyCents: agent.spentMonthlyCents,
                utilizationPercent: utilizationPct,
              },
            });
          }
        }
      }

      if (recs.length > 0) {
        await db.insert(costRecommendations).values(recs);
      }

      return recs.length;
    },
  };
}
