import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { costRecommendationsApi, type CostRecommendation } from "../api/cost-recommendations";
import { Button } from "@/ui/components/ui/button";
import { Badge } from "@/ui/components/ui/badge";
import { Zap, RefreshCw, Check, X, TrendingDown } from "lucide-react";

const TYPE_LABELS: Record<CostRecommendation["type"], string> = {
  downgrade_model: "Downgrade Model",
  pause_idle: "Pause Idle Agent",
  switch_adapter: "Switch Adapter",
  high_failure_rate: "High Failure Rate",
  budget_underutilized: "Budget Underutilized",
};

const TYPE_DESCRIPTIONS: Record<CostRecommendation["type"], string> = {
  downgrade_model: "This agent is using an expensive model. Switching to a cheaper model could reduce costs significantly.",
  pause_idle: "This agent has not been active recently but still has a budget allocation. Consider pausing it.",
  switch_adapter: "This agent uses a high-cost adapter. Switching to a local or cheaper adapter may reduce spend.",
  high_failure_rate: "This agent has a high run failure rate, wasting budget on unsuccessful runs.",
  budget_underutilized: "This agent's budget is barely being used. Consider reallocating funds to higher-priority agents.",
};

const SEVERITY_VARIANT: Record<CostRecommendation["severity"], "destructive" | "secondary" | "outline"> = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

function formatCents(cents: number) {
  if (cents === 0) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function RecommendationCard({
  rec,
  onAccept,
  onDismiss,
  loading,
}: {
  rec: CostRecommendation;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  loading: boolean;
}) {
  const isPending = rec.status === "pending";
  const details = rec.details as Record<string, unknown> | null;
  const agentName = details?.agentName as string | undefined;

  return (
    <div className={`px-4 py-3 ${!isPending ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{TYPE_LABELS[rec.type]}</span>
            <Badge variant={SEVERITY_VARIANT[rec.severity]} className="text-[10px] px-1.5 py-0 capitalize">
              {rec.severity}
            </Badge>
            {rec.status !== "pending" && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                {rec.status}
              </Badge>
            )}
          </div>
          {agentName && (
            <p className="text-xs text-muted-foreground mt-0.5">Agent: {agentName}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">{TYPE_DESCRIPTIONS[rec.type]}</p>
          {rec.estimatedSavingsCents > 0 && (
            <div className="flex items-center gap-1 mt-1.5 text-xs text-green-600">
              <TrendingDown className="h-3 w-3" />
              Est. savings: {formatCents(rec.estimatedSavingsCents)}/mo
            </div>
          )}
        </div>
        {isPending && (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onAccept(rec.id)}
              disabled={loading}
              title="Accept"
            >
              <Check className="h-3.5 w-3.5 text-green-600" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onDismiss(rec.id)}
              disabled={loading}
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function CostRecommendations() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([{ label: "Cost Optimizer" }]);
  }, [setBreadcrumbs]);

  const listQuery = useQuery({
    queryKey: queryKeys.costRecommendations.list(selectedCompanyId!),
    queryFn: () => costRecommendationsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const recs = listQuery.data ?? [];
  const pending = recs.filter((r) => r.status === "pending");
  const resolved = recs.filter((r) => r.status !== "pending");

  function invalidate() {
    void queryClient.invalidateQueries({
      queryKey: ["cost-recommendations", selectedCompanyId!],
    });
  }

  const generateMutation = useMutation({
    mutationFn: () => costRecommendationsApi.generate(selectedCompanyId!),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "accepted" | "dismissed" }) =>
      costRecommendationsApi.update(selectedCompanyId!, id, status),
    onSuccess: invalidate,
  });

  const totalPotentialSavings = pending.reduce(
    (sum, r) => sum + r.estimatedSavingsCents,
    0,
  );

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Cost Optimizer</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-generated recommendations to reduce agent spend
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${generateMutation.isPending ? "animate-spin" : ""}`} />
          {generateMutation.isPending ? "Analyzing..." : "Analyze"}
        </Button>
      </div>

      {/* Summary banner */}
      {pending.length > 0 && totalPotentialSavings > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-green-600 shrink-0" />
            <p className="text-sm text-green-800 dark:text-green-300">
              <span className="font-semibold">{pending.length} recommendations</span> could save up to{" "}
              <span className="font-semibold">{formatCents(totalPotentialSavings)}/mo</span>
            </p>
          </div>
        </div>
      )}

      {/* Pending recommendations */}
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {listQuery.isLoading && (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
        )}

        {!listQuery.isLoading && pending.length === 0 && (
          <div className="py-12 text-center">
            <Zap className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No pending recommendations</p>
            <p className="text-xs text-muted-foreground mt-1">
              Click Analyze to scan your agents for cost savings
            </p>
          </div>
        )}

        {pending.map((rec) => (
          <RecommendationCard
            key={rec.id}
            rec={rec}
            onAccept={(id) => updateMutation.mutate({ id, status: "accepted" })}
            onDismiss={(id) => updateMutation.mutate({ id, status: "dismissed" })}
            loading={updateMutation.isPending}
          />
        ))}
      </div>

      {/* Resolved recommendations */}
      {resolved.length > 0 && (
        <div>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Resolved
          </h2>
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {resolved.map((rec) => (
              <RecommendationCard
                key={rec.id}
                rec={rec}
                onAccept={(id) => updateMutation.mutate({ id, status: "accepted" })}
                onDismiss={(id) => updateMutation.mutate({ id, status: "dismissed" })}
                loading={updateMutation.isPending}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
