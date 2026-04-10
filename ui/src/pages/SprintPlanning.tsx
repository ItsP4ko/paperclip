import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Play } from "lucide-react";
import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
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

const PRIORITY_COLOR: Record<string, string> = {
  critical: "text-destructive",
  high: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-muted-foreground",
};

function IssueCardContent({ issue }: { issue: Issue }) {
  return (
    <>
      <p className="text-sm text-foreground line-clamp-2" title={issue.title}>{issue.title}</p>
      <div className="flex items-center gap-2 mt-0.5">
        {issue.priority && (
          <span className={cn("text-xs font-medium capitalize", PRIORITY_COLOR[issue.priority] ?? "text-muted-foreground")}>
            {issue.priority}
          </span>
        )}
        {issue.identifier && <span className="text-xs text-muted-foreground font-mono">{issue.identifier}</span>}
      </div>
    </>
  );
}

function DraggableIssueCard({ issue, isDragging }: { issue: Issue; isDragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: issue.id });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "flex-1 min-w-0 px-3 py-2 rounded-md border border-border bg-card transition-colors cursor-grab select-none",
        isDragging ? "opacity-40" : "hover:bg-muted/40 hover:border-primary/30",
      )}
    >
      <IssueCardContent issue={issue} />
    </div>
  );
}

function DroppableZone({ id, children, isOver }: { id: string; children: React.ReactNode; isOver: boolean }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-1 min-h-0 overflow-hidden transition-colors",
        isOver && "bg-primary/5 ring-1 ring-primary/20 ring-inset",
      )}
    >
      {children}
    </div>
  );
}

export function SprintPlanning({ sprint, projectId, onActivated, onCreateNew }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const { selectedCompanyId: companyId } = useCompany();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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
    onMutate: async (issueId) => {
      const backlogKey = queryKeys.sprints.backlog(projectId);
      const sprintKey = queryKeys.sprints.issues(sprint!.id);
      await queryClient.cancelQueries({ queryKey: backlogKey });
      await queryClient.cancelQueries({ queryKey: sprintKey });
      const prevBacklog = queryClient.getQueryData<Issue[]>(backlogKey);
      const prevSprint = queryClient.getQueryData<Issue[]>(sprintKey);
      const issue = prevBacklog?.find((i) => i.id === issueId);
      if (issue) {
        queryClient.setQueryData<Issue[]>(backlogKey, (old) => old?.filter((i) => i.id !== issueId) ?? []);
        queryClient.setQueryData<Issue[]>(sprintKey, (old) => [...(old ?? []), issue]);
      }
      return { prevBacklog, prevSprint };
    },
    onError: (_err, _issueId, ctx) => {
      if (ctx?.prevBacklog) queryClient.setQueryData(queryKeys.sprints.backlog(projectId), ctx.prevBacklog);
      if (ctx?.prevSprint) queryClient.setQueryData(queryKeys.sprints.issues(sprint!.id), ctx.prevSprint);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sprints.backlog(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sprints.issues(sprint!.id) });
    },
  });

  const removeIssue = useMutation({
    mutationFn: (issueId: string) => sprintsApi.removeIssue(sprint!.id, issueId),
    onMutate: async (issueId) => {
      const backlogKey = queryKeys.sprints.backlog(projectId);
      const sprintKey = queryKeys.sprints.issues(sprint!.id);
      await queryClient.cancelQueries({ queryKey: backlogKey });
      await queryClient.cancelQueries({ queryKey: sprintKey });
      const prevBacklog = queryClient.getQueryData<Issue[]>(backlogKey);
      const prevSprint = queryClient.getQueryData<Issue[]>(sprintKey);
      const issue = prevSprint?.find((i) => i.id === issueId);
      if (issue) {
        queryClient.setQueryData<Issue[]>(sprintKey, (old) => old?.filter((i) => i.id !== issueId) ?? []);
        queryClient.setQueryData<Issue[]>(backlogKey, (old) => [...(old ?? []), issue]);
      }
      return { prevBacklog, prevSprint };
    },
    onError: (_err, _issueId, ctx) => {
      if (ctx?.prevBacklog) queryClient.setQueryData(queryKeys.sprints.backlog(projectId), ctx.prevBacklog);
      if (ctx?.prevSprint) queryClient.setQueryData(queryKeys.sprints.issues(sprint!.id), ctx.prevSprint);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sprints.backlog(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sprints.issues(sprint!.id) });
    },
  });

  const activate = useMutation({
    mutationFn: () => sprintsApi.activate(sprint!.id),
    onSuccess: () => onActivated(),
  });

  const allIssues = [...backlog, ...sprintIssues];
  const isInBacklog = (id: string) => backlog.some((i) => i.id === id);
  const isInSprint = (id: string) => sprintIssues.some((i) => i.id === id);

  function handleDragStart({ active }: DragStartEvent) {
    setActiveIssue(allIssues.find((i) => i.id === active.id) ?? null);
  }

  function resolvePanel(id: string): "sprint" | "backlog" | null {
    if (id === "sprint" || isInSprint(id)) return "sprint";
    if (id === "backlog" || isInBacklog(id)) return "backlog";
    return null;
  }

  function handleDragOver({ over }: { over: { id: string | number } | null }) {
    if (!over) { setOverId(null); return; }
    setOverId(resolvePanel(String(over.id)));
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveIssue(null);
    setOverId(null);
    if (!over || !sprint) return;

    const issueId = String(active.id);
    const panel = resolvePanel(String(over.id));

    if (panel === "sprint" && isInBacklog(issueId)) {
      addIssue.mutate(issueId);
    } else if (panel === "backlog" && isInSprint(issueId)) {
      removeIssue.mutate(issueId);
    }
  }

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
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
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
        <div className="flex-1 min-h-0 grid grid-cols-2 divide-x divide-border overflow-hidden">
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
            <DroppableZone id="backlog" isOver={overId === "backlog"}>
              <ScrollArea className="h-full">
                <div className="p-2 space-y-1">
                  {backlogLoading
                    ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)
                    : filteredBacklog.map((issue) => (
                        <DraggableIssueCard key={issue.id} issue={issue} isDragging={activeIssue?.id === issue.id} />
                      ))}
                  {!backlogLoading && filteredBacklog.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-6">Sin tareas en el backlog</p>
                  )}
                </div>
              </ScrollArea>
            </DroppableZone>
          </div>

          {/* Sprint tasks */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{sprint.name}</span>
              <Badge variant="secondary" className="text-xs">{sprintIssues.length}</Badge>
            </div>
            <DroppableZone id="sprint" isOver={overId === "sprint"}>
              <ScrollArea className="h-full">
                <div className="p-2 space-y-1">
                  {sprintLoading
                    ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)
                    : sprintIssues.map((issue) => (
                        <DraggableIssueCard key={issue.id} issue={issue} isDragging={activeIssue?.id === issue.id} />
                      ))}
                  {!sprintLoading && sprintIssues.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-6">Arrastrá tareas del backlog</p>
                  )}
                </div>
              </ScrollArea>
            </DroppableZone>
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeIssue && (
          <div className="px-3 py-2 rounded-md border border-primary/40 bg-card shadow-lg shadow-black/20 cursor-grabbing min-w-[200px]">
            <IssueCardContent issue={activeIssue} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
