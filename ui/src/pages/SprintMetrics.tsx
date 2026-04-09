import { useEffect } from "react";
import { useParams, useNavigate } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, Clock, TrendingUp, ArrowRight } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { sprintsApi } from "../api/sprints";
import { Button } from "@/components/ui/button";
import { MetricCard } from "../components/MetricCard";
import { StatusBadge } from "../components/StatusBadge";
import { cn } from "@/lib/utils";

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h`;
  return `${Math.floor(ms / 60_000)}m`;
}

export function SprintMetrics() {
  const { sprintId } = useParams<{ sprintId: string }>();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();

  const { data: sprint } = useQuery({
    queryKey: queryKeys.sprints.detail(sprintId!),
    queryFn: () => sprintsApi.get(sprintId!),
    enabled: !!sprintId,
  });

  const { data: metrics, isLoading } = useQuery({
    queryKey: queryKeys.sprints.metrics(sprintId!),
    queryFn: () => sprintsApi.getMetrics(sprintId!),
    enabled: !!sprintId,
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: "Sprints", href: "/sprints" },
      { label: sprint?.name ?? "Sprint" },
      { label: "Métricas" },
    ]);
  }, [setBreadcrumbs, sprint]);

  if (isLoading || !metrics) {
    return <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">Cargando métricas...</div>;
  }

  const done = metrics.byStatus["done"] ?? 0;
  const inProgress = metrics.byStatus["in_progress"] ?? 0;
  const blocked = metrics.byStatus["blocked"] ?? 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-xl font-bold">{sprint?.name} — Métricas</h1>
          {sprint?.startedAt && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(sprint.startedAt).toLocaleDateString()}
              {sprint.completedAt && ` → ${new Date(sprint.completedAt).toLocaleDateString()}`}
            </p>
          )}
        </div>
        {sprint?.status === "active" && (
          <Button size="sm" variant="outline" onClick={() => navigate(`/sprints/${sprintId!}/plan`)}>
            Ver Planning
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Metric cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard icon={TrendingUp} value={metrics.total} label="Total issues" />
          <MetricCard icon={CheckCircle2} value={done} label="Completadas" description={`${metrics.completionRate}% completion`} />
          <MetricCard icon={AlertTriangle} value={metrics.spilledOver} label="Spill-over" description="Movidas sin completar" />
          <MetricCard icon={Clock} value={formatDuration(metrics.avgCycleTimeMs)} label="Avg cycle time" />
        </div>

        {/* Completion bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Completion rate</span>
            <span className="text-sm font-bold">{metrics.completionRate}%</span>
          </div>
          <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                metrics.completionRate >= 85 ? "bg-green-500" : metrics.completionRate >= 60 ? "bg-yellow-500" : "bg-red-500",
              )}
              style={{ width: `${metrics.completionRate}%` }}
            />
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            {Object.entries(metrics.byStatus).map(([status, count]) => (
              <span key={status} className="flex items-center gap-1">
                <StatusBadge status={status} size="xs" />
                {count}
              </span>
            ))}
          </div>
        </div>

        {/* Issue timings table */}
        <div>
          <h2 className="text-sm font-semibold mb-3">Tiempo por tarea</h2>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Issue</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Estado</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Cycle time</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Spill-over</th>
                </tr>
              </thead>
              <tbody>
                {metrics.issueTimings.map((t) => (
                  <tr key={t.issueId} className="border-b border-border last:border-0 hover:bg-accent/30">
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-0.5">
                        {t.identifier && (
                          <span className="font-mono text-muted-foreground">{t.identifier}</span>
                        )}
                        <span className="text-foreground truncate max-w-[200px]">{t.title}</span>
                        {t.nextSprintName && (
                          <span className="flex items-center gap-1 text-orange-400">
                            <ArrowRight className="h-3 w-3" />
                            {t.nextSprintName}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={t.status} size="xs" />
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{formatDuration(t.cycleTimeMs)}</td>
                    <td className="px-3 py-2 text-right">
                      {t.spillCount > 0 ? (
                        <span className="text-orange-400 font-medium">{t.spillCount}x</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
