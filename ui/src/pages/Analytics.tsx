import { useState, useMemo, useEffect } from "react";
import { useAnimateIn } from "@/hooks/useAnimateIn";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from "recharts";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { analyticsApi, type AgentPerformanceRow } from "../api/analytics";
import { costRecommendationsApi, type CostRecommendation } from "../api/cost-recommendations";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { Link } from "@/lib/router";
import { TrendingDown, Zap, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TYPE_LABELS: Record<CostRecommendation["type"], string> = {
  downgrade_model: "Downgrade Model",
  pause_idle: "Pause Idle Agent",
  switch_adapter: "Switch Adapter",
  high_failure_rate: "High Failure Rate",
  budget_underutilized: "Budget Underutilized",
};

const SEVERITY_VARIANT: Record<CostRecommendation["severity"], "destructive" | "secondary" | "outline"> = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

const COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#a855f7",
];

const ADAPTER_LABELS: Record<string, string> = {
  claude_local: "Claude",
  codex_local: "Codex",
  gemini_local: "Gemini",
  cursor: "Cursor",
  opencode_local: "OpenCode",
  pi_local: "Pi",
  openclaw_gateway: "OpenClaw",
  process: "Process",
  http: "HTTP",
};

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function last30Days() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function Analytics() {
  const { scope: animateRef } = useAnimateIn({ preset: "fadeUp" });
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  useEffect(() => { setBreadcrumbs([{ label: "Analytics" }]); }, [setBreadcrumbs]);

  const recsQuery = useQuery({
    queryKey: queryKeys.costRecommendations.list(selectedCompanyId!, "pending"),
    queryFn: () => costRecommendationsApi.list(selectedCompanyId!, { status: "pending", limit: "3" }),
    enabled: !!selectedCompanyId,
  });

  const generateMutation = useMutation({
    mutationFn: () => costRecommendationsApi.generate(selectedCompanyId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cost-recommendations", selectedCompanyId!] });
    },
  });

  const topRecs = recsQuery.data ?? [];

  const [granularity, setGranularity] = useState<"day" | "week" | "month">("day");
  const [groupBy, setGroupBy] = useState<"agent" | "provider" | "model">("agent");
  const [dateRange] = useState(last30Days);

  const spendQuery = useQuery({
    queryKey: queryKeys.analytics.spendOverTime(selectedCompanyId!, granularity, groupBy, dateRange.from, dateRange.to),
    queryFn: () => analyticsApi.spendOverTime(selectedCompanyId!, {
      granularity, groupBy, from: dateRange.from, to: dateRange.to,
    }),
    enabled: !!selectedCompanyId,
  });

  const perfQuery = useQuery({
    queryKey: queryKeys.analytics.agentPerformance(selectedCompanyId!, dateRange.from, dateRange.to),
    queryFn: () => analyticsApi.agentPerformance(selectedCompanyId!, {
      from: dateRange.from, to: dateRange.to,
    }),
    enabled: !!selectedCompanyId,
  });

  const adapterQuery = useQuery({
    queryKey: queryKeys.analytics.adapterComparison(selectedCompanyId!, dateRange.from, dateRange.to),
    queryFn: () => analyticsApi.adapterComparison(selectedCompanyId!, {
      from: dateRange.from, to: dateRange.to,
    }),
    enabled: !!selectedCompanyId,
  });

  // Transform spend-over-time into recharts format: one row per bucket, one key per groupKey
  const { chartData, seriesKeys } = useMemo(() => {
    if (!spendQuery.data?.length) return { chartData: [], seriesKeys: [] };
    const bucketMap = new Map<string, Record<string, number>>();
    const keys = new Set<string>();
    for (const row of spendQuery.data) {
      const label = row.bucket.slice(0, 10);
      if (!bucketMap.has(label)) bucketMap.set(label, { bucket: 0 });
      const entry = bucketMap.get(label)!;
      (entry as Record<string, unknown>)["bucket"] = label;
      entry[row.groupKey ?? "unknown"] = (entry[row.groupKey ?? "unknown"] ?? 0) + row.costCents;
      keys.add(row.groupKey ?? "unknown");
    }
    return {
      chartData: Array.from(bucketMap.values()),
      seriesKeys: Array.from(keys),
    };
  }, [spendQuery.data]);

  const sortedPerf = useMemo(() => {
    if (!perfQuery.data?.length) return [];
    return [...perfQuery.data].sort((a, b) => b.completedTasks - a.completedTasks);
  }, [perfQuery.data]);

  const adapterData = useMemo(() => {
    if (!adapterQuery.data?.length) return [];
    return adapterQuery.data.map((r) => ({
      ...r,
      label: ADAPTER_LABELS[r.adapterType] ?? r.adapterType,
    }));
  }, [adapterQuery.data]);

  const isLoading = spendQuery.isLoading || perfQuery.isLoading || adapterQuery.isLoading;

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading analytics...</div>;
  }

  return (
    <div ref={animateRef} className="p-6 space-y-8 max-w-7xl">
      <div>
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Last 30 days</p>
      </div>

      {/* Cost Optimizer Widget */}
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-medium">Cost Optimizer</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="h-7 text-xs"
            >
              <RefreshCw className={`h-3 w-3 mr-1.5 ${generateMutation.isPending ? "animate-spin" : ""}`} />
              Analyze
            </Button>
            <Link to="../cost-recommendations" className="text-xs text-muted-foreground hover:text-foreground">
              View all →
            </Link>
          </div>
        </div>
        {topRecs.length > 0 ? (
          <div className="divide-y divide-border">
            {topRecs.map((rec) => (
              <div key={rec.id} className="py-2.5 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{TYPE_LABELS[rec.type]}</span>
                    <Badge variant={SEVERITY_VARIANT[rec.severity]} className="text-[10px] px-1.5 py-0 capitalize">
                      {rec.severity}
                    </Badge>
                  </div>
                  {rec.details?.agentName ? (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {rec.details.agentName as string}
                    </p>
                  ) : null}
                </div>
                {rec.estimatedSavingsCents > 0 && (
                  <div className="flex items-center gap-1 text-xs text-green-600 shrink-0">
                    <TrendingDown className="h-3 w-3" />
                    ${(rec.estimatedSavingsCents / 100).toFixed(2)}/mo
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">
            Click Analyze to get cost-saving recommendations
          </p>
        )}
      </section>

      {/* Spend Over Time */}
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium">Spend Over Time</h2>
          <div className="flex gap-2">
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as "day" | "week" | "month")}
              className="text-xs border border-border rounded px-2 py-1 bg-background"
            >
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
            </select>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as "agent" | "provider" | "model")}
              className="text-xs border border-border rounded px-2 py-1 bg-background"
            >
              <option value="agent">By Agent</option>
              <option value="provider">By Provider</option>
              <option value="model">By Model</option>
            </select>
          </div>
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCents(v)} className="text-muted-foreground" />
              <Tooltip formatter={(v) => formatCents(Number(v))} labelFormatter={(l) => `Date: ${l}`} />
              <Legend />
              {seriesKeys.map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">No cost data in this period</p>
        )}
      </section>

      {/* Agent Leaderboard */}
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-medium mb-4">Agent Performance</h2>
        {sortedPerf.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Agent</th>
                  <th className="pb-2 pr-4 font-medium text-right">Tasks Done</th>
                  <th className="pb-2 pr-4 font-medium text-right">Success Rate</th>
                  <th className="pb-2 pr-4 font-medium text-right">Avg Cycle</th>
                  <th className="pb-2 pr-4 font-medium text-right">Cost/Task</th>
                  <th className="pb-2 pr-4 font-medium text-right">Total Cost</th>
                  <th className="pb-2 font-medium text-right">Runs</th>
                </tr>
              </thead>
              <tbody>
                {sortedPerf.map((row: AgentPerformanceRow) => (
                  <tr key={row.agentId} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-4">
                      <span className="font-medium">{row.agentIcon ? `${row.agentIcon} ` : ""}{row.agentName}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{ADAPTER_LABELS[row.adapterType] ?? row.adapterType}</span>
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{row.completedTasks}/{row.totalTasks}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      <span className={row.successRate >= 80 ? "text-green-600" : row.successRate >= 50 ? "text-amber-600" : "text-red-600"}>
                        {row.successRate}%
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatMinutes(row.avgCycleTimeMinutes)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatCents(row.costPerTask)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatCents(row.totalCostCents)}</td>
                    <td className="py-2 text-right tabular-nums">{row.succeededRuns}/{row.totalRuns}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">No agent performance data</p>
        )}
      </section>

      {/* Adapter Comparison */}
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-medium mb-4">Adapter Comparison</h2>
        {adapterData.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-muted-foreground mb-2">Avg Cost per Run (cents)</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={adapterData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCents(v)} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip formatter={(v) => formatCents(Number(v))} />
                  <Bar dataKey="avgCostPerRun">
                    {adapterData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Success Rate (%)</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={adapterData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="successRate">
                    {adapterData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">No adapter comparison data</p>
        )}
      </section>
    </div>
  );
}
