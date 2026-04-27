import { useQuery } from "@tanstack/react-query";
import { sprintsApi } from "../api/sprints";
import { queryKeys } from "../lib/queryKeys";
import { ScrollArea } from "@/ui/components/ui/scroll-area";
import { Skeleton } from "@/ui/components/ui/skeleton";
import { Badge } from "@/ui/components/ui/badge";
import { cn } from "@/ui/lib/utils";

function msToReadable(ms: number | null): string {
  if (!ms) return "—";
  const h = ms / (1000 * 60 * 60);
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function KpiCard({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
      <p className={cn("text-2xl font-display font-bold", valueClass ?? "text-foreground")}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function SprintMetricsPanel({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.sprints.projectMetrics(projectId),
    queryFn: () => sprintsApi.getProjectMetrics(projectId),
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <ScrollArea className="flex-1 h-full">
      <div className="p-4 space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <KpiCard label="Sprints completados" value={String(data.completedSprints)} sub={`de ${data.totalSprints} totales`} />
          <KpiCard label="Velocidad promedio" value={`${data.avgVelocity}`} sub="tareas/sprint" />
          <KpiCard
            label="Spill-over rate"
            value={`${data.spillOverRate}%`}
            sub="tareas que pasan de sprint"
            valueClass={data.spillOverRate > 30 ? "text-destructive" : data.spillOverRate > 15 ? "text-yellow-500" : "text-primary"}
          />
          <KpiCard label="Cycle time prom." value={msToReadable(data.avgCycleTimeMs)} sub="todo → done" />
          <KpiCard label="Completadas total" value={String(data.totalCompleted)} valueClass="text-primary" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Spill-over por sprint */}
          <div className="bg-card border border-border rounded-lg p-4 space-y-3">
            <h3 className="font-display font-semibold text-sm text-foreground">Tareas pendientes por sprint</h3>
            {data.sprintSummaries.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin datos aún</p>
            ) : (
              <div className="space-y-2">
                {data.sprintSummaries.map((s) => (
                  <div key={s.sprintId} className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground w-24 truncate shrink-0">{s.name}</span>
                    <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", s.spilledOver === 0 ? "bg-primary" : s.spilledOver > s.total / 2 ? "bg-destructive" : "bg-yellow-500")}
                        style={{ width: s.total > 0 ? `${(s.spilledOver / s.total) * 100}%` : "0%" }}
                      />
                    </div>
                    <span className={cn("w-16 text-right shrink-0", s.spilledOver > 0 ? "text-destructive" : "text-primary")}>
                      {s.spilledOver} → {s.spilledToSprintName ?? "backlog"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {data.spillOverAlerts.length > 0 && (
              <div className="border-t border-border pt-3 space-y-1.5">
                <p className="text-xs text-yellow-500 font-medium">⚠ Tareas que rebotaron 2+ sprints</p>
                {data.spillOverAlerts.map((a) => (
                  <div key={a.issueId} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground truncate">{a.identifier && <span className="font-mono mr-1">{a.identifier}</span>}{a.title}</span>
                    <Badge variant="outline" className="text-destructive border-destructive/30 shrink-0 ml-2">{a.sprintCount} sprints</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tiempo por estado */}
          <div className="bg-card border border-border rounded-lg p-4 space-y-3">
            <h3 className="font-display font-semibold text-sm text-foreground">Tiempo promedio por estado</h3>
            {Object.keys(data.avgTimePerStatus).length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin datos aún</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(data.avgTimePerStatus).map(([status, ms]) => {
                  const maxMs = Math.max(...Object.values(data.avgTimePerStatus));
                  const pct = maxMs > 0 ? (ms / maxMs) * 100 : 0;
                  return (
                    <div key={status} className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground w-24 capitalize shrink-0">{status.replace("_", " ")}</span>
                      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-muted-foreground w-10 text-right shrink-0">{msToReadable(ms)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Recent state log */}
            {data.recentStateLog.length > 0 && (
              <div className="border-t border-border pt-3 space-y-1">
                <p className="text-xs text-muted-foreground font-medium mb-2">Últimos movimientos</p>
                {data.recentStateLog.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-xs items-center">
                    <span className="text-muted-foreground truncate font-mono">{(entry as { identifier?: string }).identifier ?? entry.issueId.slice(0, 8)}</span>
                    <Badge variant="secondary" className="text-xs">{entry.fromStatus ?? "—"}</Badge>
                    <span className="text-muted-foreground">→</span>
                    <Badge variant="secondary" className="text-xs text-primary">{entry.toStatus}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* User activity */}
        {data.userActivity.length > 0 && (
          <div className="bg-card border border-border rounded-lg p-4 space-y-3">
            <h3 className="font-display font-semibold text-sm text-foreground">Actividad por usuario</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {data.userActivity.map((u) => (
                <div key={u.userId} className="border border-border rounded-md p-3 space-y-2">
                  <p className="text-sm font-medium text-foreground truncate">{u.name ?? u.userId.slice(0, 8)}</p>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                    <span className="text-muted-foreground">Completadas</span>
                    <span className="text-primary text-right">{u.completed}</span>
                    <span className="text-muted-foreground">Cycle time</span>
                    <span className="text-right">{msToReadable(u.avgCycleTimeMs)}</span>
                    <span className="text-muted-foreground">Movimientos</span>
                    <span className="text-right">{u.totalMoves}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </ScrollArea>
  );
}
