import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "@/ui/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { pipelinesApi, type PipelineWithSteps, type PipelineRunStep, type PipelineRunWithSteps } from "../api/pipelines";
import { agentsApi } from "../api/agents";
import { accessApi, type CompanyMember } from "../api/access";
import { issuesApi } from "../api/issues";
import { authApi } from "../api/auth";
import { Button } from "@/ui/components/ui/button";
import { Badge } from "@/ui/components/ui/badge";
import { ArrowLeft, GitBranch, Play, CheckCircle2, Clock, Users, BarChart3 } from "lucide-react";
import { PipelineCanvas } from "../components/pipeline/PipelineCanvas";
import { StepSidePanel } from "../components/pipeline/StepSidePanel";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  running: "default",
  completed: "outline",
  failed: "destructive",
};

export function PipelineDetail() {
  const { pipelineId } = useParams<{ pipelineId: string }>();
  const { selectedCompanyId } = useCompany();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [shakingNodeIds, setShakingNodeIds] = useState<Set<string>>(new Set());
  const shakeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  function triggerShake(nodeId: string) {
    setShakingNodeIds(prev => new Set(prev).add(nodeId));
    const existing = shakeTimers.current.get(nodeId);
    if (existing) clearTimeout(existing);
    shakeTimers.current.set(nodeId, setTimeout(() => {
      setShakingNodeIds(prev => { const next = new Set(prev); next.delete(nodeId); return next; });
      shakeTimers.current.delete(nodeId);
    }, 400));
  }

  // Query key helpers
  const pipelineKey = queryKeys.pipelines.detail(selectedCompanyId!, pipelineId!);
  const runsKey = queryKeys.pipelines.runs(selectedCompanyId!, pipelineId);

  // --- Queries ---

  const { data: pipeline, isLoading } = useQuery({
    queryKey: pipelineKey,
    queryFn: () => pipelinesApi.get(selectedCompanyId!, pipelineId!),
    enabled: !!selectedCompanyId && !!pipelineId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "running" ? 3000 : false;
    },
  });

  const { data: runs = [] } = useQuery({
    queryKey: runsKey,
    queryFn: () => pipelinesApi.listRuns(selectedCompanyId!, pipelineId!),
    enabled: !!selectedCompanyId && !!pipelineId,
  });

  const latestRun = runs.length > 0 ? runs[runs.length - 1] : null;
  const activeRun = runs.find((r: { status: string }) => r.status === "running") ?? null;
  const runKey = queryKeys.pipelines.run(selectedCompanyId!, (activeRun?.id ?? latestRun?.id) || "");

  const { data: runDetail } = useQuery({
    queryKey: runKey,
    queryFn: () => pipelinesApi.getRun(selectedCompanyId!, (activeRun?.id ?? latestRun?.id)!),
    enabled: !!selectedCompanyId && !!(activeRun || latestRun),
    refetchInterval: activeRun ? 3000 : false,
  });

  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
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

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });
  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;

  // --- Derived state ---

  const pipelineStatus = pipeline?.status ?? "draft";
  const isDraft = pipelineStatus === "draft";
  const isRunning = pipelineStatus === "running";
  const isCompleted = pipelineStatus === "completed";

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

  // --- Position helper for new nodes ---

  function positionBelow(parentStepId?: string): { positionX: number; positionY: number } {
    const parent = pipeline?.steps.find(s => s.id === parentStepId);
    if (parent?.positionX != null && parent?.positionY != null) {
      return { positionX: parent.positionX, positionY: parent.positionY + 160 };
    }
    // Fallback: below the lowest node, centered
    const maxY = Math.max(0, ...(pipeline?.steps.map(s => s.positionY ?? 0) ?? []));
    const avgX = pipeline?.steps.length
      ? pipeline.steps.reduce((sum, s) => sum + (s.positionX ?? 0), 0) / pipeline.steps.length
      : 200;
    return { positionX: Math.round(avgX), positionY: maxY + 160 };
  }

  // --- Optimistic mutation helpers ---

  function snapshotPipeline() {
    return queryClient.getQueryData<PipelineWithSteps>(pipelineKey);
  }

  function setPipelineCache(updater: (old: PipelineWithSteps) => PipelineWithSteps) {
    queryClient.setQueryData<PipelineWithSteps>(pipelineKey, (old) => old ? updater(old) : old);
  }

  // --- Mutations with optimistic updates ---

  const deleteStepMutation = useMutation({
    mutationFn: (stepId: string) =>
      pipelinesApi.deleteStep(selectedCompanyId!, pipelineId!, stepId),
    onMutate: async (stepId) => {
      await queryClient.cancelQueries({ queryKey: pipelineKey });
      const snapshot = snapshotPipeline();
      setPipelineCache(old => ({
        ...old,
        steps: old.steps
          .filter(s => s.id !== stepId)
          .map(s => ({ ...s, dependsOn: s.dependsOn.filter(d => d !== stepId) })),
      }));
      if (selectedStepId === stepId) setSelectedStepId(null);
      return { snapshot };
    },
    onError: (_err, stepId, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(pipelineKey, ctx.snapshot);
      triggerShake(stepId);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: pipelineKey }),
  });

  const updateStepMutation = useMutation({
    mutationFn: ({ stepId, data }: { stepId: string; data: Record<string, unknown> }) =>
      pipelinesApi.updateStep(selectedCompanyId!, pipelineId!, stepId, data as Parameters<typeof pipelinesApi.updateStep>[3]),
    onMutate: async ({ stepId, data }) => {
      await queryClient.cancelQueries({ queryKey: pipelineKey });
      const snapshot = snapshotPipeline();
      setPipelineCache(old => ({
        ...old,
        steps: old.steps.map(s => s.id === stepId ? { ...s, ...data } as typeof s : s),
      }));
      setSelectedStepId(null);
      return { snapshot };
    },
    onError: (_err, { stepId }, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(pipelineKey, ctx.snapshot);
      triggerShake(stepId);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: pipelineKey }),
  });

  const updateStepDepsMutation = useMutation({
    mutationFn: ({ stepId, dependsOn }: { stepId: string; dependsOn: string[] }) =>
      pipelinesApi.updateStep(selectedCompanyId!, pipelineId!, stepId, { dependsOn }),
    onMutate: async ({ stepId, dependsOn }) => {
      await queryClient.cancelQueries({ queryKey: pipelineKey });
      const snapshot = snapshotPipeline();
      setPipelineCache(old => ({
        ...old,
        steps: old.steps.map(s => s.id === stepId ? { ...s, dependsOn } : s),
      }));
      return { snapshot };
    },
    onError: (_err, { stepId }, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(pipelineKey, ctx.snapshot);
      triggerShake(stepId);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: pipelineKey }),
  });

  const addStepMutation = useMutation({
    mutationFn: (type: "action" | "if_else") => {
      const lastStep = pipeline?.steps[pipeline.steps.length - 1];
      const pos = positionBelow(lastStep?.id);
      return pipelinesApi.createStep(selectedCompanyId!, pipelineId!, {
        name: type === "action" ? "New Action" : "New Condition",
        stepType: type,
        position: (pipeline?.steps.length ?? 0),
        dependsOn: lastStep ? [lastStep.id] : [],
        positionX: pos.positionX,
        positionY: pos.positionY,
        config: type === "if_else" ? {
          branches: [
            { id: "branch-yes", label: "Yes", condition: { field: "status", operator: "eq", value: "done" }, nextStepIds: [] },
            { id: "branch-no", label: "No", condition: null, nextStepIds: [] },
          ],
        } : {},
      });
    },
    onMutate: async (type) => {
      await queryClient.cancelQueries({ queryKey: pipelineKey });
      const snapshot = snapshotPipeline();
      const tempId = `temp-${Date.now()}`;
      const lastStep = pipeline?.steps[pipeline.steps.length - 1];
      const now = new Date().toISOString();
      setPipelineCache(old => ({
        ...old,
        steps: [...old.steps, {
          id: tempId,
          pipelineId: pipelineId!,
          name: type === "action" ? "New Action" : "New Condition",
          agentId: null,
          assigneeType: null,
          assigneeUserId: null,
          issueId: null,
          dependsOn: lastStep ? [lastStep.id] : [],
          config: {},
          position: old.steps.length,
          ...positionBelow(lastStep?.id),
          stepType: type,
          createdAt: now,
          updatedAt: now,
        }],
      }));
      return { snapshot, tempId };
    },
    onSuccess: (step, _type, ctx) => {
      queryClient.invalidateQueries({ queryKey: pipelineKey });
      setSelectedStepId(step.id);
    },
    onError: (_err, _type, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(pipelineKey, ctx.snapshot);
    },
  });

  const updatePositionMutation = useMutation({
    mutationFn: ({ stepId, positionX, positionY }: { stepId: string; positionX: number; positionY: number }) =>
      pipelinesApi.updateStep(selectedCompanyId!, pipelineId!, stepId, { positionX, positionY }),
  });

  const batchPositionsMutation = useMutation({
    mutationFn: (positions: Array<{ stepId: string; positionX: number; positionY: number }>) =>
      pipelinesApi.batchUpdatePositions(selectedCompanyId!, pipelineId!, positions),
    onSettled: () => queryClient.invalidateQueries({ queryKey: pipelineKey }),
  });

  const runMutation = useMutation({
    mutationFn: () => pipelinesApi.triggerRun(selectedCompanyId!, pipelineId!),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: pipelineKey });
      const snapshot = snapshotPipeline();
      setPipelineCache(old => ({ ...old, status: "running" as const }));
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(pipelineKey, ctx.snapshot);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKey });
      queryClient.invalidateQueries({ queryKey: runsKey });
    },
  });

  const completeStepMutation = useMutation({
    mutationFn: (runStepId: string) =>
      pipelinesApi.completeRunStep(selectedCompanyId!, activeRun!.id, runStepId),
    onMutate: async (runStepId) => {
      await queryClient.cancelQueries({ queryKey: runKey });
      const snapshot = queryClient.getQueryData<PipelineRunWithSteps>(runKey);
      queryClient.setQueryData<PipelineRunWithSteps>(runKey, (old) => {
        if (!old) return old;
        const completedStepPipelineId = old.steps.find(s => s.id === runStepId)?.pipelineStepId;
        return {
          ...old,
          steps: old.steps.map(s => {
            if (s.id === runStepId) return { ...s, status: "completed" as const, completedAt: new Date().toISOString() };
            // Cascade: if this step's deps are all completed, mark as running
            if (s.status === "pending" && completedStepPipelineId && s.dependsOn.includes(completedStepPipelineId)) {
              const allDepsCompleted = s.dependsOn.every(depId => {
                if (depId === completedStepPipelineId) return true;
                return old.steps.some(os => os.pipelineStepId === depId && (os.status === "completed" || os.status === "skipped"));
              });
              if (allDepsCompleted) return { ...s, status: "running" as const, startedAt: new Date().toISOString() };
            }
            return s;
          }),
        };
      });
      return { snapshot, runStepId };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(runKey, ctx.snapshot);
      // Find the pipeline step id to shake
      const step = ctx?.snapshot?.steps.find(s => s.id === ctx.runStepId);
      if (step) triggerShake(step.pipelineStepId);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: runKey });
      queryClient.invalidateQueries({ queryKey: runsKey });
      queryClient.invalidateQueries({ queryKey: pipelineKey });
    },
  });

  // --- Callbacks ---

  const handleAddStepBetween = useCallback(
    async (sourceId: string, targetId: string) => {
      // Optimistic: add temp node + rewire deps
      const snapshot = snapshotPipeline();
      const tempId = `temp-${Date.now()}`;
      const now = new Date().toISOString();
      setPipelineCache(old => ({
        ...old,
        steps: [
          ...old.steps.map(s => s.id === targetId
            ? { ...s, dependsOn: s.dependsOn.map(d => d === sourceId ? tempId : d) }
            : s
          ),
          { id: tempId, pipelineId: pipelineId!, name: "New Action", agentId: null, assigneeType: null, assigneeUserId: null, issueId: null, dependsOn: [sourceId], config: {}, position: old.steps.length, ...positionBelow(sourceId), stepType: "action" as const, createdAt: now, updatedAt: now },
        ],
      }));
      try {
        const pos = positionBelow(sourceId);
        const newStep = await pipelinesApi.createStep(selectedCompanyId!, pipelineId!, {
          name: "New Action", stepType: "action", position: (pipeline?.steps.length ?? 0), dependsOn: [sourceId], positionX: pos.positionX, positionY: pos.positionY, config: {},
        });
        const targetStep = pipeline?.steps.find((s) => s.id === targetId);
        if (targetStep) {
          const newDeps = targetStep.dependsOn.map((d) => (d === sourceId ? newStep.id : d));
          await pipelinesApi.updateStep(selectedCompanyId!, pipelineId!, targetId, { dependsOn: newDeps });
        }
        queryClient.invalidateQueries({ queryKey: pipelineKey });
        setSelectedStepId(newStep.id);
      } catch {
        if (snapshot) queryClient.setQueryData(pipelineKey, snapshot);
      }
    },
    [selectedCompanyId, pipelineId, pipeline?.steps, queryClient, pipelineKey],
  );

  const handleAddStepFromNode = useCallback(
    async (sourceNodeId: string) => {
      // Optimistic: add temp node
      const snapshot = snapshotPipeline();
      const tempId = `temp-${Date.now()}`;
      const now = new Date().toISOString();
      setPipelineCache(old => ({
        ...old,
        steps: [
          ...old.steps,
          { id: tempId, pipelineId: pipelineId!, name: "New Action", agentId: null, assigneeType: null, assigneeUserId: null, issueId: null, dependsOn: [sourceNodeId], config: {}, position: old.steps.length, ...positionBelow(sourceNodeId), stepType: "action" as const, createdAt: now, updatedAt: now },
        ],
      }));
      try {
        const pos = positionBelow(sourceNodeId);
        const newStep = await pipelinesApi.createStep(selectedCompanyId!, pipelineId!, {
          name: "New Action", stepType: "action", position: (pipeline?.steps.length ?? 0), dependsOn: [sourceNodeId], positionX: pos.positionX, positionY: pos.positionY, config: {},
        });
        queryClient.invalidateQueries({ queryKey: pipelineKey });
        setSelectedStepId(newStep.id);
      } catch {
        if (snapshot) queryClient.setQueryData(pipelineKey, snapshot);
      }
    },
    [selectedCompanyId, pipelineId, pipeline?.steps.length, queryClient, pipelineKey],
  );

  const handleUnlinkSteps = useCallback(
    (sourceId: string, targetId: string) => {
      const targetStep = pipeline?.steps.find(s => s.id === targetId);
      if (targetStep) {
        const newDeps = targetStep.dependsOn.filter(d => d !== sourceId);
        updateStepDepsMutation.mutate({ stepId: targetId, dependsOn: newDeps });
      }
    },
    [pipeline?.steps, updateStepDepsMutation],
  );

  // --- Render ---

  if (!selectedCompanyId) return null;
  if (isLoading) {
    return <div className="px-6 py-8 text-sm text-muted-foreground">Loading...</div>;
  }
  if (!pipeline) {
    return <div className="px-6 py-8 text-sm text-destructive">Pipeline not found.</div>;
  }

  const completedCount = runDetail?.steps.filter((s) => s.status === "completed").length ?? 0;
  const totalCount = runDetail?.steps.length ?? pipeline.steps.length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate("/pipelines")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <GitBranch className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-base font-semibold flex-1 truncate">{pipeline.name}</h1>

        <Badge variant={STATUS_VARIANT[pipelineStatus] ?? "secondary"} className="capitalize text-[11px]">
          {pipelineStatus}
        </Badge>

        {isRunning && (
          <span className="text-xs text-muted-foreground">
            {completedCount}/{totalCount} completed
          </span>
        )}

        {isDraft && (
          <Button
            size="sm"
            disabled={runMutation.isPending || pipeline.steps.length === 0}
            onClick={() => {
              const steps = pipeline.steps;
              if (steps.length === 0) {
                alert("Add at least one step before running.");
                return;
              }
              const unassigned = steps.filter(s => !s.assigneeType);
              if (unassigned.length > 0) {
                alert(`All steps must have an assignee. Unassigned: ${unassigned.map(s => s.name).join(", ")}`);
                return;
              }
              if (steps.length > 1) {
                const disconnected = steps.filter((s, i) => i > 0 && s.dependsOn.length === 0);
                if (disconnected.length > 0) {
                  alert(`All steps must be connected. Disconnected: ${disconnected.map(s => s.name).join(", ")}`);
                  return;
                }
              }
              runMutation.mutate();
            }}
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            Run
          </Button>
        )}
      </div>

      {/* Content: 3 views based on status */}
      {isCompleted && runDetail ? (
        <CompletedMetrics runDetail={runDetail} memberNames={memberNames} agentNames={agentNames} />
      ) : (
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
            onUnlinkSteps={handleUnlinkSteps}
            onAutoLayout={(positions) => batchPositionsMutation.mutate(positions)}
            runMode={isRunning}
            runSteps={runDetail?.steps}
            currentUserId={currentUserId}
            onCompleteStep={(runStepId) => completeStepMutation.mutate(runStepId)}
            shakingNodeIds={shakingNodeIds}
          />
          {isDraft && selectedStepId && pipeline.steps.find((s) => s.id === selectedStepId) && (
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
      )}
    </div>
  );
}

// --- Metrics panel for completed pipelines ---

function CompletedMetrics({
  runDetail,
  memberNames,
  agentNames,
}: {
  runDetail: { status: string; startedAt: string | null; completedAt: string | null; steps: PipelineRunStep[] };
  memberNames: Record<string, string>;
  agentNames: Record<string, string>;
}) {
  const steps = runDetail.steps;
  const completedSteps = steps.filter(s => s.status === "completed");
  const totalDurationMs = runDetail.startedAt && runDetail.completedAt
    ? new Date(runDetail.completedAt).getTime() - new Date(runDetail.startedAt).getTime()
    : 0;
  const avgStepMs = completedSteps.length > 0 ? totalDurationMs / completedSteps.length : 0;

  function formatDuration(ms: number) {
    if (ms < 1000) return `${ms}ms`;
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remainSecs = secs % 60;
    if (mins < 60) return `${mins}m ${remainSecs}s`;
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hours}h ${remainMins}m`;
  }

  function stepDuration(step: PipelineRunStep) {
    if (!step.startedAt || !step.completedAt) return "—";
    return formatDuration(new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime());
  }

  function assigneeName(step: PipelineRunStep) {
    if (step.assigneeType === "agent" && step.agentId) return agentNames[step.agentId] ?? step.agentId.slice(0, 8);
    if (step.assigneeType === "user" && step.assigneeUserId) return memberNames[step.assigneeUserId] ?? step.assigneeUserId.slice(0, 8);
    return "—";
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 max-w-3xl mx-auto w-full">
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <BarChart3 className="h-4 w-4" />
            <span className="text-xs">Total Steps</span>
          </div>
          <span className="text-2xl font-semibold">{steps.length}</span>
        </div>
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-xs">Completed</span>
          </div>
          <span className="text-2xl font-semibold">{completedSteps.length}</span>
        </div>
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Clock className="h-4 w-4" />
            <span className="text-xs">Total Time</span>
          </div>
          <span className="text-2xl font-semibold">{formatDuration(totalDurationMs)}</span>
        </div>
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Users className="h-4 w-4" />
            <span className="text-xs">Avg per Step</span>
          </div>
          <span className="text-2xl font-semibold">{formatDuration(avgStepMs)}</span>
        </div>
      </div>

      <div className="border border-border rounded-lg bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Step</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Assignee</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
              <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Duration</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step) => (
              <tr key={step.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 font-medium">{step.stepName}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{assigneeName(step)}</td>
                <td className="px-4 py-2.5">
                  <Badge
                    variant={step.status === "completed" ? "outline" : step.status === "failed" ? "destructive" : "secondary"}
                    className="capitalize text-[10px]"
                  >
                    {step.status}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-right text-muted-foreground font-mono text-xs">{stepDuration(step)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
