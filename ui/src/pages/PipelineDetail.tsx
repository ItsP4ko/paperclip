import { useEffect, useState } from "react";
import { useParams, useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { pipelinesApi, type PipelineStep } from "../api/pipelines";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { accessApi, type CompanyMember } from "../api/access";
import { issuesApi } from "../api/issues";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, GitBranch, Play, Plus, Trash2, X } from "lucide-react";

interface StepFormData {
  name: string;
  assigneeType: "agent" | "user" | "";
  agentId: string;
  assigneeUserId: string;
  issueId: string;
  dependsOn: string[];
}

const EMPTY_FORM: StepFormData = { name: "", assigneeType: "", agentId: "", assigneeUserId: "", issueId: "", dependsOn: [] };

function StepCard({
  step,
  allSteps,
  agentNames,
  memberNames,
  isLast,
  onDelete,
}: {
  step: PipelineStep;
  allSteps: PipelineStep[];
  agentNames: Record<string, string>;
  memberNames: Record<string, string>;
  isLast: boolean;
  onDelete: (id: string) => void;
}) {
  const deps = step.dependsOn
    .map((depId) => allSteps.find((s) => s.id === depId)?.name ?? depId.slice(0, 8))
    .join(", ");

  let assigneeLabel: string | null = null;
  if (step.assigneeType === "agent" && step.agentId) {
    assigneeLabel = `Agent: ${agentNames[step.agentId] ?? step.agentId.slice(0, 8)}`;
  } else if (step.assigneeType === "user" && step.assigneeUserId) {
    assigneeLabel = `User: ${memberNames[step.assigneeUserId] ?? step.assigneeUserId.slice(0, 8)}`;
  } else if (step.agentId) {
    assigneeLabel = `Agent: ${agentNames[step.agentId] ?? step.agentId.slice(0, 8)}`;
  }

  return (
    <>
      <div className="w-full max-w-md">
        <div className="flex items-start gap-3 px-4 py-3 border border-border rounded-lg bg-card group shadow-[2px_2px_0px_0px_rgba(0,0,0,0.05)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.03)]">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{step.name}</span>
            </div>
            {assigneeLabel && (
              <p className="text-xs text-muted-foreground mt-0.5">{assigneeLabel}</p>
            )}
            {step.issueId && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Issue: <span className="font-mono">{step.issueId.slice(0, 8)}...</span>
              </p>
            )}
            {deps && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Depends on: {deps}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onDelete(step.id)}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>
      {!isLast && <div className="w-px h-8 bg-border" />}
    </>
  );
}

export function PipelineDetail() {
  const { pipelineId } = useParams<{ pipelineId: string }>();
  const { selectedCompanyId } = useCompany();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [addingStep, setAddingStep] = useState(false);
  const [form, setForm] = useState<StepFormData>(EMPTY_FORM);
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

  const createStepMutation = useMutation({
    mutationFn: (data: StepFormData) =>
      pipelinesApi.createStep(selectedCompanyId!, pipelineId!, {
        name: data.name,
        agentId: data.assigneeType === "agent" && data.agentId ? data.agentId : null,
        assigneeType: data.assigneeType === "" ? undefined : data.assigneeType,
        assigneeUserId: data.assigneeType === "user" && data.assigneeUserId ? data.assigneeUserId : null,
        issueId: data.issueId || null,
        dependsOn: data.dependsOn,
        position: (pipeline?.steps.length ?? 0),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.pipelines.detail(selectedCompanyId!, pipelineId!),
      });
      setAddingStep(false);
      setForm(EMPTY_FORM);
    },
  });

  const deleteStepMutation = useMutation({
    mutationFn: (stepId: string) =>
      pipelinesApi.deleteStep(selectedCompanyId!, pipelineId!, stepId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.pipelines.detail(selectedCompanyId!, pipelineId!),
      });
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

  function handleAddStep(e: React.FormEvent) {
    e.preventDefault();
    if (form.name.trim()) {
      createStepMutation.mutate({ ...form, name: form.name.trim() });
    }
  }

  function toggleDep(stepId: string) {
    setForm((f) => ({
      ...f,
      dependsOn: f.dependsOn.includes(stepId)
        ? f.dependsOn.filter((d) => d !== stepId)
        : [...f.dependsOn, stepId],
    }));
  }

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

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {pipeline.description && (
          <p className="text-sm text-muted-foreground">{pipeline.description}</p>
        )}

        {/* Steps */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Steps ({pipeline.steps.length})
          </span>
          <Button size="sm" variant="ghost" onClick={() => setAddingStep(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Step
          </Button>
        </div>

        {pipeline.steps.length === 0 && !addingStep && (
          <div className="py-8 text-center border border-dashed border-border rounded-lg">
            <p className="text-sm text-muted-foreground">No steps yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Add steps to define the pipeline workflow.
            </p>
          </div>
        )}

        <div className="flex flex-col items-center">
          {pipeline.steps.map((step, idx) => (
            <StepCard
              key={step.id}
              step={step}
              allSteps={pipeline.steps}
              agentNames={agentNames}
              memberNames={memberNames}
              isLast={idx === pipeline.steps.length - 1}
              onDelete={(id) => deleteStepMutation.mutate(id)}
            />
          ))}
        </div>

        {/* Add step form */}
        {addingStep && (
          <form
            onSubmit={handleAddStep}
            className="border border-border rounded-lg p-4 space-y-3 bg-card"
          >
            <p className="text-sm font-medium">New Step</p>
            <div className="space-y-2">
              <input
                autoFocus
                type="text"
                placeholder="Step name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full text-sm bg-background border border-border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-ring"
              />

              {/* Assignee type toggle */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Assignee:</p>
                <div className="flex gap-1">
                  {(["agent", "user", ""] as const).map((type) => (
                    <button
                      key={type || "none"}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, assigneeType: type, agentId: "", assigneeUserId: "" }))}
                      className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                        form.assigneeType === type
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:bg-accent"
                      }`}
                    >
                      {type === "agent" ? "Agent" : type === "user" ? "User" : "None"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Agent selector */}
              {form.assigneeType === "agent" && (
                <select
                  value={form.agentId}
                  onChange={(e) => setForm((f) => ({ ...f, agentId: e.target.value }))}
                  className="w-full text-sm bg-background border border-border rounded px-2 py-1.5 outline-none"
                >
                  <option value="">Select agent...</option>
                  {agents.map((a: { id: string; name: string }) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )}

              {/* User selector */}
              {form.assigneeType === "user" && (
                <select
                  value={form.assigneeUserId}
                  onChange={(e) => setForm((f) => ({ ...f, assigneeUserId: e.target.value }))}
                  className="w-full text-sm bg-background border border-border rounded px-2 py-1.5 outline-none"
                >
                  <option value="">Select user...</option>
                  {members
                    .filter((m: CompanyMember) => m.principalType === "user" && m.status === "active")
                    .map((m: CompanyMember) => (
                      <option key={m.principalId} value={m.principalId}>
                        {m.userDisplayName ?? m.userEmail ?? m.principalId.slice(0, 8)}
                      </option>
                    ))}
                </select>
              )}

              {/* Issue selector */}
              <select
                value={form.issueId}
                onChange={(e) => setForm((f) => ({ ...f, issueId: e.target.value }))}
                className="w-full text-sm bg-background border border-border rounded px-2 py-1.5 outline-none"
              >
                <option value="">No linked issue</option>
                {companyIssues.map((issue: { id: string; identifier?: string; title: string }) => (
                  <option key={issue.id} value={issue.id}>
                    {issue.identifier ? `${issue.identifier} - ` : ""}{issue.title}
                  </option>
                ))}
              </select>

              {pipeline.steps.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Depends on:</p>
                  <div className="flex flex-wrap gap-1">
                    {pipeline.steps.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleDep(s.id)}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                          form.dependsOn.includes(s.id)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:bg-accent"
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={!form.name.trim() || createStepMutation.isPending}
              >
                Add
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setAddingStep(false); setForm(EMPTY_FORM); }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
