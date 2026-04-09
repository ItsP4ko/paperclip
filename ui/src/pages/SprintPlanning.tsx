import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, X, Play } from "lucide-react";
import { useState } from "react";
import { sprintsApi } from "../api/sprints";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { useCompany } from "../context/CompanyContext";
import type { Sprint, Issue } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  sprint: Sprint | null;
  projectId: string;
  onActivated: () => void;
  onCreateNew: () => void;
}

function priorityBadge(priority: string | null) {
  if (!priority) return null;
  const map: Record<string, string> = { critical: "text-destructive", high: "text-orange-500", medium: "text-yellow-500", low: "text-muted-foreground" };
  return <span className={cn("text-xs font-medium capitalize", map[priority] ?? "text-muted-foreground")}>{priority}</span>;
}

function IssueCard({ issue, action, onAction }: { issue: Issue; action: "add" | "remove"; onAction: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card hover:bg-muted/40 transition-colors group">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{issue.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {priorityBadge(issue.priority)}
          {issue.identifier && <span className="text-xs text-muted-foreground font-mono">{issue.identifier}</span>}
        </div>
      </div>
      <Button
        size="icon"
        variant={action === "add" ? "outline" : "ghost"}
        className={cn("h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity", action === "remove" && "text-muted-foreground hover:text-destructive")}
        onClick={onAction}
      >
        {action === "add" ? <Plus className="h-3 w-3" /> : <X className="h-3 w-3" />}
      </Button>
    </div>
  );
}

export function SprintPlanning({ sprint, projectId, onActivated, onCreateNew }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const { selectedCompanyId: companyId } = useCompany();

  const { data: backlog = [], isLoading: backlogLoading } = useQuery({
    queryKey: queryKeys.sprints.backlog(projectId),
    queryFn: () => issuesApi.list(companyId!, { projectId, noSprint: true }),
    enabled: !!projectId && !!companyId,
  });

  const { data: sprintIssues = [], isLoading: sprintLoading } = useQuery({
    queryKey: queryKeys.sprints.issues(sprint?.id ?? ""),
    queryFn: () => issuesApi.list(companyId!, { projectId, sprintId: sprint?.id }),
    enabled: !!sprint?.id && !!companyId,
  });

  const addIssue = useMutation({
    mutationFn: (issueId: string) => sprintsApi.addIssue(sprint!.id, issueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sprints.backlog(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sprints.issues(sprint!.id) });
    },
  });

  const removeIssue = useMutation({
    mutationFn: (issueId: string) => sprintsApi.removeIssue(sprint!.id, issueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sprints.backlog(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sprints.issues(sprint!.id) });
    },
  });

  const activate = useMutation({
    mutationFn: () => sprintsApi.activate(sprint!.id),
    onSuccess: () => onActivated(),
  });

  const filteredBacklog = backlog.filter((i) =>
    !search || i.title.toLowerCase().includes(search.toLowerCase()) || (i.identifier ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  if (!sprint) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        <Button variant="outline" onClick={onCreateNew}>Crear sprint</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sprint header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h2 className="font-display font-semibold text-foreground">{sprint.name}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {sprint.startDate && sprint.endDate ? `${sprint.startDate} → ${sprint.endDate} · ` : ""}
            {sprintIssues.length} tareas asignadas
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => activate.mutate()}
          disabled={sprintIssues.length === 0 || activate.isPending}
        >
          <Play className="h-3.5 w-3.5 mr-1.5" />
          {activate.isPending ? "Activando..." : "Activar Sprint"}
        </Button>
      </div>

      {/* Two panels */}
      <div className="flex-1 min-h-0 grid grid-cols-2 divide-x divide-border">
        {/* Backlog */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Backlog</span>
            <Badge variant="secondary" className="text-xs">{backlog.length}</Badge>
            <div className="flex-1" />
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="h-6 pl-6 text-xs w-28"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {backlogLoading
                ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)
                : filteredBacklog.map((issue) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      action="add"
                      onAction={() => addIssue.mutate(issue.id)}
                    />
                  ))}
              {!backlogLoading && filteredBacklog.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Sin tareas en el backlog</p>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Sprint tasks */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{sprint.name}</span>
            <Badge variant="secondary" className="text-xs">{sprintIssues.length}</Badge>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {sprintLoading
                ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)
                : sprintIssues.map((issue) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      action="remove"
                      onAction={() => removeIssue.mutate(issue.id)}
                    />
                  ))}
              {!sprintLoading && sprintIssues.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Agregá tareas del backlog</p>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
