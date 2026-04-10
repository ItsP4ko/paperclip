import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { pipelinesApi } from "../api/pipelines";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { accessApi, type CompanyMember } from "../api/access";
import { issuesApi } from "../api/issues";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ArrowLeft, GitBranch, Play, X } from "lucide-react";
import { PipelineCanvas } from "../components/pipeline/PipelineCanvas";
import { StepSidePanel } from "../components/pipeline/StepSidePanel";

export function PipelineDetail() {
  const { pipelineId } = useParams<{ pipelineId: string }>();
  const { selectedCompanyId } = useCompany();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState("");
  const [runningWith, setRunningWith] = useState(false);

  const { data: pipeline, isLoading } = useQuery({
    queryKey: queryKeys.pipelines.detail(selectedCompanyId!, pipelineId!),
    queryFn: () => pipelinesApi.get(selectedCompanyId!, pipelineId!),
    enabled: !!selectedCompanyId && !!pipelineId,
  });

  const { data: runs = [] } = useQuery({
    queryKey: queryKeys.pipelines.runs(selectedCompanyId!, pipelineId),
    queryFn: () => pipelinesApi.listRuns(selectedCompanyId!, pipelineId!),
    enabled: !!selectedCompanyId && !!pipelineId,
  });

  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects = [] } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: members = [] } = useQuery({
    queryKey: queryKeys.access.members(selectedCompanyId!),
    queryFn: () => accessApi.listMembers(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: companyIssues = [] } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([
      { label: "Pipelines", href: "/pipelines" },
      { label: pipeline?.name ?? "Pipeline" },
    ]);
  }, [setBreadcrumbs, pipeline?.name]);

  const agentNames = Object.fromEntries(
    agents.map((a: { id: string; name: string }) => [a.id, a.name]),
  );

  const memberNames: Record<string, string> = Object.fromEntries(
    members
      .filter((m: CompanyMember) => m.principalType === "user")
      .map((m: CompanyMember) => [m.principalId, m.userDisplayName ?? m.userEmail ?? m.principalId.slice(0, 8)]),
  );

  const addStepMutation = useMutation({
    mutationFn: (type: "action" | "if_else") => {
      const lastStep = pipeline?.steps[pipeline.steps.length - 1];
      return pipelinesApi.createStep(selectedCompanyId!, pipelineId!, {
        name: type === "action" ? "New Action" : "New Condition",
        stepType: type,
        position: (pipeline?.steps.length ?? 0),
        dependsOn: lastStep ? [lastStep.id] : [],
        config: type === "if_else" ? {
          branches: [
            { id: "branch-yes", label: "Yes", condition: { field: "status", operator: "eq", value: "done" }, nextStepIds: [] },
            { id: "branch-no", label: "No", condition: null, nextStepIds: [] },
          ],
        } : {},
      });
    },
    onSuccess: (step) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.detail(selectedCompanyId!, pipelineId!) });
      setSelectedStepId(step.id);
    },
  });

  const updatePositionMutation = useMutation({
    mutationFn: ({ stepId, positionX, positionY }: { stepId: string; positionX: number; positionY: number }) =>
      pipelinesApi.updateStep(selectedCompanyId!, pipelineId!, stepId, { positionX, positionY }),
    // Do NOT invalidate query on position save — causes snap-back/ghost effect during drag
  });

  const batchPositionsMutation = useMutation({
    mutationFn: (positions: Array<{ stepId: string; positionX: number; positionY: number }>) =>
      pipelinesApi.batchUpdatePositions(selectedCompanyId!, pipelineId!, positions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.detail(selectedCompanyId!, pipelineId!) });
    },
  });

  const deleteStepMutation = useMutation({
    mutationFn: (stepId: string) =>
      pipelinesApi.deleteStep(selectedCompanyId!, pipelineId!, stepId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.detail(selectedCompanyId!, pipelineId!) });
      if (selectedStepId) setSelectedStepId(null);
    },
  });

  const updateStepMutation = useMutation({
    mutationFn: ({ stepId, data }: { stepId: string; data: Record<string, unknown> }) =>
      pipelinesApi.updateStep(selectedCompanyId!, pipelineId!, stepId, data as Parameters<typeof pipelinesApi.updateStep>[3]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.detail(selectedCompanyId!, pipelineId!) });
      setSelectedStepId(null);
    },
    onError: (err) => {
      console.error("updateStep failed:", err);
    },
  });

  const updateStepDepsMutation = useMutation({
    mutationFn: ({ stepId, dependsOn }: { stepId: string; dependsOn: string[] }) =>
      pipelinesApi.updateStep(selectedCompanyId!, pipelineId!, stepId, { dependsOn }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.detail(selectedCompanyId!, pipelineId!) });
    },
  });

  const handleAddStepBetween = useCallback(
    async (sourceId: string, targetId: string) => {
      const newStep = await pipelinesApi.createStep(selectedCompanyId!, pipelineId!, {
        name: "New Action",
        stepType: "action",
        position: (pipeline?.steps.length ?? 0),
        dependsOn: [sourceId],
        config: {},
      });
      // Update the target step to depend on the new step instead of the source
      const targetStep = pipeline?.steps.find((s) => s.id === targetId);
      if (targetStep) {
        const newDeps = targetStep.dependsOn.map((d) => (d === sourceId ? newStep.id : d));
        await pipelinesApi.updateStep(selectedCompanyId!, pipelineId!, targetId, { dependsOn: newDeps });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.detail(selectedCompanyId!, pipelineId!) });
      setSelectedStepId(newStep.id);
    },
    [selectedCompanyId, pipelineId, pipeline?.steps, queryClient],
  );

  const handleAddStepFromNode = useCallback(
    async (sourceNodeId: string) => {
      const newStep = await pipelinesApi.createStep(selectedCompanyId!, pipelineId!, {
        name: "New Action",
        stepType: "action",
        position: (pipeline?.steps.length ?? 0),
        dependsOn: [sourceNodeId],
        config: {},
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.detail(selectedCompanyId!, pipelineId!) });
      setSelectedStepId(newStep.id);
    },
    [selectedCompanyId, pipelineId, pipeline?.steps.length, queryClient],
  );

  const runMutation = useMutation({
    mutationFn: () =>
      pipelinesApi.triggerRun(selectedCompanyId!, pipelineId!, {
        projectId: selectedProject || undefined,
      }),
    onSuccess: (run) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.pipelines.runs(selectedCompanyId!, pipelineId),
      });
      navigate(`/pipelines/${pipelineId}/runs/${run.id}`);
    },
  });

  // If pipeline has any runs, redirect to the latest run
  const activeRun = runs.find((r: any) => r.status === "running") ?? (runs.length > 0 ? runs[runs.length - 1] : null);
  useEffect(() => {
    if (activeRun && pipeline) {
      navigate(`/pipelines/${pipelineId}/runs/${activeRun.id}`, { replace: true });
    }
  }, [activeRun, pipeline, pipelineId, navigate]);

  if (!selectedCompanyId) return null;
  if (isLoading) {
    return <div className="px-6 py-8 text-sm text-muted-foreground">Loading...</div>;
  }
  if (!pipeline) {
    return <div className="px-6 py-8 text-sm text-destructive">Pipeline not found.</div>;
  }
  // If redirecting to run, show loading
  if (activeRun) {
    return <div className="px-6 py-8 text-sm text-muted-foreground">Loading run...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => navigate("/pipelines")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <GitBranch className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-base font-semibold flex-1 truncate">{pipeline.name}</h1>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline">View Runs</Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-0">
            <div className="p-2 space-y-1 max-h-64 overflow-y-auto">
              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground p-2">No runs yet</p>
              ) : (
                runs.slice().reverse().map(run => (
                  <button
                    key={run.id}
                    className="flex items-center justify-between w-full px-3 py-2 text-sm rounded-md hover:bg-accent"
                    onClick={() => navigate(`/pipelines/${pipelineId}/runs/${run.id}`)}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant={run.status === "completed" ? "outline" : run.status === "failed" ? "destructive" : "default"} className="text-[10px] capitalize">
                        {run.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{run.triggeredBy ?? "manual"}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(run.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
        {runningWith ? (
          <div className="flex items-center gap-2">
            <select
              className="text-sm border border-border rounded px-2 py-1 bg-background outline-none"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
            >
              <option value="">No project</option>
              {projects.map((p: { id: string; name: string }) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={runMutation.isPending}
              onClick={() => {
                // Validate all steps are connected (except first)
                const steps = pipeline.steps;
                if (steps.length > 1) {
                  const disconnected = steps.filter((s, i) => i > 0 && s.dependsOn.length === 0);
                  if (disconnected.length > 0) {
                    alert(`All steps must be connected. Disconnected: ${disconnected.map(s => s.name).join(", ")}`);
                    return;
                  }
                }
                if (steps.length === 0) {
                  alert("Add at least one step before running.");
                  return;
                }
                runMutation.mutate();
              }}
            >
              <Play className="h-3.5 w-3.5 mr-1.5" />
              Run
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRunningWith(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={() => setRunningWith(true)}>
            <Play className="h-3.5 w-3.5 mr-1.5" />
            Run
          </Button>
        )}
      </div>

      {/* Canvas + Side Panel */}
      <div className="flex-1 flex overflow-hidden">
        <PipelineCanvas
          steps={pipeline.steps}
          agents={agents}
          members={members}
          agentNames={agentNames}
          memberNames={memberNames}
          onUpdateStepPosition={(stepId, positionX, positionY) =>
            updatePositionMutation.mutate({ stepId, positionX, positionY })
          }
          onUpdateStepDeps={(stepId, dependsOn) =>
            updateStepDepsMutation.mutate({ stepId, dependsOn })
          }
          onDeleteStep={(stepId) => deleteStepMutation.mutate(stepId)}
          onSelectStep={setSelectedStepId}
          onAddStep={(type) => addStepMutation.mutate(type)}
          onAddStepBetween={handleAddStepBetween}
          onAddStepFromNode={handleAddStepFromNode}
          onUnlinkSteps={(sourceId, targetId) => {
            const targetStep = pipeline.steps.find(s => s.id === targetId);
            if (targetStep) {
              const newDeps = targetStep.dependsOn.filter(d => d !== sourceId);
              updateStepDepsMutation.mutate({ stepId: targetId, dependsOn: newDeps });
            }
          }}
          onAutoLayout={(positions) => batchPositionsMutation.mutate(positions)}
        />
        {selectedStepId && pipeline.steps.find((s) => s.id === selectedStepId) && (
          <StepSidePanel
            step={pipeline.steps.find((s) => s.id === selectedStepId)!}
            allSteps={pipeline.steps}
            agents={agents}
            members={members}
            issues={companyIssues}
            onSave={(stepId, data) => {
              updateStepMutation.mutate({ stepId, data });
            }}
            onClose={() => setSelectedStepId(null)}
          />
        )}
      </div>
    </div>
  );
}
