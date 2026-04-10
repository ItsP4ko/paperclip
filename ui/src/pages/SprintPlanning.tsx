import { useEffect, useState } from "react";
import { useParams, useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Zap, CheckCircle2, AlertTriangle } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { sprintsApi } from "../api/sprints";
import { issuesApi } from "../api/issues";
import type { Issue, Sprint } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "../components/StatusBadge";
import { PriorityIcon } from "../components/PriorityIcon";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

function IssueCard({
  issue,
  action,
  onAction,
  loading,
}: {
  issue: Issue;
  action: "add" | "remove";
  onAction: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex items-start gap-2 p-3 border border-border rounded-md bg-card hover:bg-accent/30 transition-colors">
      <div className="flex items-center gap-1 mt-0.5 shrink-0">
        <PriorityIcon priority={issue.priority} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug line-clamp-2">{issue.title}</p>
        <div className="flex items-center gap-1.5 mt-1">
          {issue.identifier && (
            <span className="text-xs font-mono text-muted-foreground">{issue.identifier}</span>
          )}
          <StatusBadge status={issue.status} />
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn("shrink-0 mt-0.5", action === "add" ? "text-blue-400 hover:text-blue-300" : "text-muted-foreground hover:text-destructive")}
        onClick={onAction}
        disabled={loading}
      >
        {action === "add" ? <Plus className="h-4 w-4" /> : <X className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export function SprintPlanning() {
  const { sprintId } = useParams<{ sprintId: string }>();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loadingIssueId, setLoadingIssueId] = useState<string | null>(null);
  const [showComplete, setShowComplete] = useState(false);
  const [spillStrategy, setSpillStrategy] = useState<"backlog" | "next_sprint">("backlog");
  const [nextSprintId, setNextSprintId] = useState<string>("");

  const { data: sprint } = useQuery({
    queryKey: queryKeys.sprints.detail(sprintId!),
    queryFn: () => sprintsApi.get(sprintId!),
    enabled: !!sprintId,
  });

  const { data: sprintIssues = [] } = useQuery({
    queryKey: queryKeys.sprints.issues(sprintId!, selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!, { sprintId: sprintId! }),
    enabled: !!sprintId && !!selectedCompanyId,
  });

  const { data: backlogIssues = [] } = useQuery({
    queryKey: queryKeys.sprints.backlog(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!, { noSprint: true }),
    enabled: !!selectedCompanyId,
  });

  const { data: allSprints = [] } = useQuery({
    queryKey: queryKeys.sprints.list(selectedCompanyId!),
    queryFn: () => sprintsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: "Sprints", href: "/sprints" },
      { label: sprint?.name ?? "Planning" },
    ]);
  }, [setBreadcrumbs, sprint]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: queryKeys.sprints.issues(sprintId!, selectedCompanyId!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.sprints.backlog(selectedCompanyId!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.sprints.list(selectedCompanyId!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.sprints.active(selectedCompanyId!) });
  }

  async function handleAdd(issueId: string) {
    const backlogKey = queryKeys.sprints.backlog(selectedCompanyId!);
    const sprintKey = queryKeys.sprints.issues(sprintId!, selectedCompanyId!);
    await queryClient.cancelQueries({ queryKey: backlogKey });
    await queryClient.cancelQueries({ queryKey: sprintKey });
    const prevBacklog = queryClient.getQueryData<Issue[]>(backlogKey);
    const prevSprint = queryClient.getQueryData<Issue[]>(sprintKey);
    const issue = prevBacklog?.find((i) => i.id === issueId);
    if (issue) {
      queryClient.setQueryData<Issue[]>(backlogKey, (old) => old?.filter((i) => i.id !== issueId) ?? []);
      queryClient.setQueryData<Issue[]>(sprintKey, (old) => [...(old ?? []), issue]);
    }
    setLoadingIssueId(issueId);
    try {
      await sprintsApi.addIssue(sprintId!, issueId);
      invalidate();
    } catch {
      if (prevBacklog) queryClient.setQueryData(backlogKey, prevBacklog);
      if (prevSprint) queryClient.setQueryData(sprintKey, prevSprint);
    } finally {
      setLoadingIssueId(null);
    }
  }

  async function handleRemove(issueId: string) {
    const backlogKey = queryKeys.sprints.backlog(selectedCompanyId!);
    const sprintKey = queryKeys.sprints.issues(sprintId!, selectedCompanyId!);
    await queryClient.cancelQueries({ queryKey: backlogKey });
    await queryClient.cancelQueries({ queryKey: sprintKey });
    const prevBacklog = queryClient.getQueryData<Issue[]>(backlogKey);
    const prevSprint = queryClient.getQueryData<Issue[]>(sprintKey);
    const issue = prevSprint?.find((i) => i.id === issueId);
    if (issue) {
      queryClient.setQueryData<Issue[]>(sprintKey, (old) => old?.filter((i) => i.id !== issueId) ?? []);
      queryClient.setQueryData<Issue[]>(backlogKey, (old) => [...(old ?? []), issue]);
    }
    setLoadingIssueId(issueId);
    try {
      await sprintsApi.removeIssue(sprintId!, issueId);
      invalidate();
    } catch {
      if (prevBacklog) queryClient.setQueryData(backlogKey, prevBacklog);
      if (prevSprint) queryClient.setQueryData(sprintKey, prevSprint);
    } finally {
      setLoadingIssueId(null);
    }
  }

  const activateMutation = useMutation({
    mutationFn: () => sprintsApi.activate(sprintId!),
    onSuccess: () => {
      invalidate();
      navigate("/issues");
    },
  });

  const completeMutation = useMutation({
    mutationFn: () =>
      sprintsApi.complete(sprintId!, {
        spillStrategy,
        nextSprintId: spillStrategy === "next_sprint" && nextSprintId ? nextSprintId : undefined,
      }),
    onSuccess: () => {
      setShowComplete(false);
      invalidate();
      navigate(`/sprints/${sprintId!}/metrics`);
    },
  });

  const planningOptions = allSprints.filter((s) => s.status === "planning" && s.id !== sprintId);
  const isActive = sprint?.status === "active";
  const isPlanning = sprint?.status === "planning";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-xl font-bold">{sprint?.name ?? "Sprint"}</h1>
          {sprint?.startDate && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {sprint.startDate} → {sprint.endDate ?? "?"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isPlanning && (
            <Button
              size="sm"
              onClick={() => activateMutation.mutate()}
              disabled={activateMutation.isPending || sprintIssues.length === 0}
              className="bg-green-600 hover:bg-green-500 text-white"
            >
              <Zap className="h-4 w-4 mr-1" />
              Inicializar Sprint
            </Button>
          )}
          {isActive && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowComplete(true)}
              className="border-orange-500/40 text-orange-400 hover:bg-orange-500/10"
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Finalizar Sprint
            </Button>
          )}
          {!isPlanning && !isActive && (
            <Button size="sm" variant="outline" onClick={() => navigate(`/sprints/${sprintId!}/metrics`)}>
              Ver Métricas
            </Button>
          )}
        </div>
      </div>

      {/* Two-column planning board */}
      <div className="flex flex-1 min-h-0 divide-x divide-border">
        {/* Backlog */}
        <div className="flex flex-col w-1/2 min-h-0">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30 shrink-0">
            <span className="text-sm font-semibold">Backlog</span>
            <Badge variant="secondary" className="text-xs">{backlogIssues.length}</Badge>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {backlogIssues.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Sin issues en backlog</p>
            )}
            {backlogIssues.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                action="add"
                onAction={() => handleAdd(issue.id)}
                loading={loadingIssueId === issue.id}
              />
            ))}
          </div>
        </div>

        {/* Sprint */}
        <div className="flex flex-col w-1/2 min-h-0">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30 shrink-0">
            <span className="text-sm font-semibold">{sprint?.name ?? "Sprint"}</span>
            <Badge variant="secondary" className="text-xs">{sprintIssues.length}</Badge>
            {isActive && (
              <Badge className="text-xs bg-green-500/15 text-green-400 border border-green-500/20">Activo</Badge>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {sprintIssues.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                {isPlanning ? "Arrastrá issues del backlog →" : "No hay issues en este sprint"}
              </p>
            )}
            {sprintIssues.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                action="remove"
                onAction={() => handleRemove(issue.id)}
                loading={loadingIssueId === issue.id}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Complete Sprint Dialog */}
      <Dialog open={showComplete} onOpenChange={setShowComplete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-400" />
              Finalizar Sprint
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {(() => {
              const incomplete = sprintIssues.filter((i) => i.status !== "done" && i.status !== "cancelled");
              return incomplete.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Hay <span className="text-foreground font-medium">{incomplete.length} issues incompletas</span>.
                  ¿Qué hacemos con ellas?
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Todas las issues están completadas. </p>
              );
            })()}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Issues incompletas</label>
              <Select value={spillStrategy} onValueChange={(v) => setSpillStrategy(v as "backlog" | "next_sprint")}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="backlog">Mover al backlog</SelectItem>
                  <SelectItem value="next_sprint">Mover al próximo sprint</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {spillStrategy === "next_sprint" && (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Próximo sprint</label>
                <Select value={nextSprintId} onValueChange={setNextSprintId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Seleccionar sprint..." />
                  </SelectTrigger>
                  <SelectContent>
                    {planningOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowComplete(false)}>Cancelar</Button>
            <Button
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending || (spillStrategy === "next_sprint" && !nextSprintId)}
              className="bg-orange-600 hover:bg-orange-500 text-white"
            >
              Finalizar Sprint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
