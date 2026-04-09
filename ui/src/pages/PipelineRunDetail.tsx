import { useEffect, useMemo } from "react";
import { useParams, useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { pipelinesApi, type PipelineRunStep } from "../api/pipelines";
import { accessApi, type CompanyMember } from "../api/access";
import { agentsApi } from "../api/agents";
import { authApi } from "../api/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { ReactFlow, Background, Controls, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { stepsToEdges } from "../components/pipeline/utils";
import { useAutoLayout } from "../components/pipeline/useAutoLayout";
import { StepNode } from "../components/pipeline/StepNode";
import { IfElseNode } from "../components/pipeline/IfElseNode";

const nodeTypes = { stepNode: StepNode, ifElse: IfElseNode };

const RUN_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  running: "default",
  completed: "outline",
  failed: "destructive",
};

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

  const { data: members = [] } = useQuery({
    queryKey: queryKeys.access.members(selectedCompanyId!),
    queryFn: () => accessApi.listMembers(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agentNames: Record<string, string> = Object.fromEntries(
    agents.map((a: { id: string; name: string }) => [a.id, a.name]),
  );

  const memberNames: Record<string, string> = Object.fromEntries(
    members
      .filter((m: CompanyMember) => m.principalType === "user")
      .map((m: CompanyMember) => [m.principalId, m.userDisplayName ?? m.userEmail ?? m.principalId.slice(0, 8)]),
  );

  const queryClient = useQueryClient();
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });
  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;

  const completeStepMutation = useMutation({
    mutationFn: (runStepId: string) =>
      pipelinesApi.completeRunStep(selectedCompanyId!, runId!, runStepId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.run(selectedCompanyId!, runId!) });
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

  // No-op handlers for read-only node rendering
  const noop = useMemo(() => () => {}, []);

  const runNodes: Node[] = useMemo(() => {
    if (!run) return [];
    return run.steps.map((step: PipelineRunStep) => ({
      id: step.pipelineStepId,
      type: step.stepType === "if_else" ? "ifElse" : "stepNode",
      position: { x: step.positionX ?? 0, y: step.positionY ?? 0 },
      data: {
        step: {
          ...step,
          id: step.pipelineStepId,
          name: step.stepName,
          dependsOn: step.dependsOn,
          config: {},
        },
        agentNames,
        memberNames,
        onEdit: noop,
        onDelete: noop,
        runStatus: step.status,
        canComplete: step.status === "running" && step.assigneeType === "user" && step.assigneeUserId === currentUserId,
        onComplete: () => completeStepMutation.mutate(step.id),
      },
      className:
        step.status === "running"
          ? "ring-2 ring-blue-500 rounded-lg animate-pulse"
          : step.status === "completed"
            ? "ring-2 ring-green-500 rounded-lg"
            : step.status === "failed"
              ? "ring-2 ring-destructive rounded-lg"
              : step.status === "skipped"
                ? "opacity-40"
                : "",
    }));
  }, [run, agentNames, memberNames, noop]);

  const runEdges: Edge[] = useMemo(() => {
    if (!run) return [];
    // Build pseudo-steps from run steps to use stepsToEdges
    const pseudoSteps = run.steps.map((s: PipelineRunStep) => ({
      id: s.pipelineStepId,
      pipelineId: "",
      name: s.stepName,
      agentId: s.agentId,
      assigneeType: s.assigneeType,
      assigneeUserId: s.assigneeUserId,
      issueId: s.issueId,
      dependsOn: s.dependsOn,
      config: {},
      position: s.position,
      positionX: s.positionX,
      positionY: s.positionY,
      stepType: s.stepType,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
    return stepsToEdges(pseudoSteps);
  }, [run]);

  const layoutNodes = useAutoLayout(runNodes, runEdges);

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
            {run.id.slice(0, 12)}...
          </p>
        </div>
        {totalCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {completedCount}/{totalCount} completed
          </span>
        )}
      </div>

      {/* Read-only React Flow canvas */}
      <div className="flex-1 overflow-hidden">
        {run.steps.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No steps in this run.</p>
          </div>
        ) : (
          <ReactFlow
            nodes={layoutNodes}
            edges={runEdges}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            className="bg-background"
          >
            <Background gap={20} size={1} className="!bg-muted/30" />
            <Controls className="!bg-card !border-border !shadow-sm" />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
