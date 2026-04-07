import { api } from "./client";

export interface SpendOverTimeRow {
  bucket: string;
  groupKey: string;
  groupId: string;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
  runCount: number;
}

export interface AgentPerformanceRow {
  agentId: string;
  agentName: string;
  agentIcon: string | null;
  agentStatus: string;
  adapterType: string;
  totalTasks: number;
  completedTasks: number;
  cancelledTasks: number;
  inProgressTasks: number;
  avgCycleTimeMinutes: number;
  avgLeadTimeMinutes: number;
  totalRuns: number;
  succeededRuns: number;
  failedRuns: number;
  successRate: number;
  avgRunDurationMinutes: number;
  totalCostCents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  costPerTask: number;
}

export interface AdapterComparisonRow {
  adapterType: string;
  totalRuns: number;
  succeededRuns: number;
  failedRuns: number;
  successRate: number;
  avgRunDurationMinutes: number;
  totalCostCents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgCostPerRun: number;
}

function qs(params: Record<string, string | undefined>) {
  const entries = Object.entries(params).filter(([, v]) => v != null) as [string, string][];
  return entries.length ? "?" + new URLSearchParams(entries).toString() : "";
}

export const analyticsApi = {
  spendOverTime: (
    companyId: string,
    opts?: { granularity?: string; groupBy?: string; from?: string; to?: string },
  ) =>
    api.get<SpendOverTimeRow[]>(
      `/companies/${companyId}/analytics/spend-over-time${qs({
        granularity: opts?.granularity,
        groupBy: opts?.groupBy,
        from: opts?.from,
        to: opts?.to,
      })}`,
    ),

  agentPerformance: (companyId: string, opts?: { from?: string; to?: string; agentId?: string }) =>
    api.get<AgentPerformanceRow[]>(
      `/companies/${companyId}/analytics/agent-performance${qs({
        from: opts?.from,
        to: opts?.to,
        agentId: opts?.agentId,
      })}`,
    ),

  adapterComparison: (companyId: string, opts?: { from?: string; to?: string }) =>
    api.get<AdapterComparisonRow[]>(
      `/companies/${companyId}/analytics/adapter-comparison${qs({
        from: opts?.from,
        to: opts?.to,
      })}`,
    ),
};
