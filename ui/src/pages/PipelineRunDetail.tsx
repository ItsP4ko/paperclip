import { useEffect } from "react";
import { useParams, useNavigate } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { pipelinesApi, type PipelineRunStep } from "../api/pipelines";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CircleDot, CheckCircle2, XCircle, Clock, SkipForward } from "lucide-react";

const STATUS_CONFIG: Record<
  PipelineRunStep["status"],
  { label: string; icon: React.ComponentType<{ className?: string }>; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "Pending", icon: Clock, variant: "secondary" },
  running: { label: "Running", icon: CircleDot, variant: "default" },
  completed: { label: "Completed", icon: CheckCircle2, variant: "outline" },
  failed: { label: "Failed", icon: XCircle, variant: "destructive" },
  skipped: { label: "Skipped", icon: SkipForward, variant: "secondary" },
};

const RUN_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  running: "default",
  completed: "outline",
  failed: "destructive",
};

function RunStepRow({
  step,
  allSteps,
}: {
  step: PipelineRunStep;
  allSteps: PipelineRunStep[];
}) {
  const cfg = STATUS_CONFIG[step.status];
  const Icon = cfg.icon;
  const deps = step.dependsOn
    .map((depId) => {
      const dep = allSteps.find((s) => s.pipelineStepId === depId);
      return dep?.stepName ?? depId.slice(0, 8);
    })
    .join(", ");

  return (
    <div className="flex items-start gap-3 px-4 py-3 border border-border rounded-lg">
      <Icon
        className={`h-4 w-4 mt-0.5 shrink-0 ${
          step.status === "running"
            ? "text-primary animate-pulse"
            : step.status === "completed"
              ? "text-green-500"
              : step.status === "failed"
                ? "text-destructive"
                : "text-muted-foreground"
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{step.stepName}</span>
          <Badge variant={cfg.variant} className="text-[10px] px-1.5 py-0">
            {cfg.label}
          </Badge>
        </div>
        {deps && (
          <p className="text-xs text-muted-foreground mt-0.5">Depends on: {deps}</p>
        )}
        {step.issueId && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Issue: <span className="font-mono">{step.issueId.slice(0, 8)}…</span>
          </p>
        )}
        {step.error && (
          <p className="text-xs text-destructive mt-0.5">{step.error}</p>
        )}
      </div>
    </div>
  );
}

export function PipelineRunDetail() {
  const { pipelineId, runId } = useParams<{ pipelineId: string; runId: string }>();
  const { selectedCompanyId } = useCompany();
  const navigate = useNavigate();

  const { data: run, isLoading } = useQuery({
    queryKey: queryKeys.pipelines.run(selectedCompanyId!, runId!),
    queryFn: () => pipelinesApi.getRun(selectedCompanyId!, runId!),
    enabled: !!selectedCompanyId && !!runId,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === "running" ? 3000 : false;
    },
  });

  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([
      { label: "Pipelines", href: "/pipelines" },
      { label: "Pipeline", href: `/pipelines/${pipelineId}` },
      { label: "Run" },
    ]);
  }, [setBreadcrumbs, pipelineId]);

  if (!selectedCompanyId) return null;
  if (isLoading) {
    return <div className="px-6 py-8 text-sm text-muted-foreground">Loading...</div>;
  }
  if (!run) {
    return <div className="px-6 py-8 text-sm text-destructive">Run not found.</div>;
  }

  const completedCount = run.steps.filter((s) => s.status === "completed").length;
  const totalCount = run.steps.length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => navigate(`/pipelines/${pipelineId}`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold">Run</span>
            <Badge
              variant={RUN_STATUS_VARIANT[run.status] ?? "secondary"}
              className="capitalize text-[11px]"
            >
              {run.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            {run.id.slice(0, 12)}…
          </p>
        </div>
        {totalCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {completedCount}/{totalCount} completed
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
        {run.steps.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No steps in this run.</p>
          </div>
        ) : (
          run.steps.map((step) => (
            <RunStepRow key={step.id} step={step} allSteps={run.steps} />
          ))
        )}
      </div>
    </div>
  );
}
