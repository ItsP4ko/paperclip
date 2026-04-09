import { useEffect, useState } from "react";
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
    mutationFn: (type: "action" | "if_else") =>
      pipelinesApi.createStep(selectedCompanyId!, pipelineId!, {
        name: type === "action" ? "New Action" : "New Condition",
        stepType: type,
        position: (pipeline?.steps.length ?? 0),
        config: type === "if_else" ? {
          branches: [
            { id: "branch-yes", label: "Yes", condition: { field: "status", operator: "eq", value: "done" }, nextStepIds: [] },
            { id: "branch-no", label: "No", condition: null, nextStepIds: [] },
          ],
        } : {},
      }),
    onSuccess: (step) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.detail(selectedCompanyId!, pipelineId!) });
      setSelectedStepId(step.id);
    },
  });

  const updatePositionMutation = useMutation({
    mutationFn: ({ stepId, positionX, positionY }: { stepId: string; positionX: number; positionY: number }) =>
      pipelinesApi.updateStep(selectedCompanyId!, pipelineId!, stepId, { positionX, positionY }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.detail(selectedCompanyId!, pipelineId!) });
    },
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

  if (!selectedCompanyId) return null;
  if (isLoading) {
    return <div className="px-6 py-8 text-sm text-muted-foreground">Loading...</div>;
  }
  if (!pipeline) {
    return <div className="px-6 py-8 text-sm text-destructive">Pipeline not found.</div>;
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
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate(`/pipelines/${pipelineId}/runs`)}
        >
          View Runs
        </Button>
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
              onClick={() => runMutation.mutate()}
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
            pipelinesApi.updateStep(selectedCompanyId!, pipelineId!, stepId, { dependsOn }).then(() =>
              queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.detail(selectedCompanyId!, pipelineId!) })
            )
          }
          onDeleteStep={(stepId) => deleteStepMutation.mutate(stepId)}
          onSelectStep={setSelectedStepId}
          onAddStep={(type) => addStepMutation.mutate(type)}
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
              pipelinesApi.updateStep(selectedCompanyId!, pipelineId!, stepId, data).then(() => {
                queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.detail(selectedCompanyId!, pipelineId!) });
                setSelectedStepId(null);
              });
            }}
            onClose={() => setSelectedStepId(null)}
          />
        )}
      </div>
    </div>
  );
}
