import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Play, Square, ArrowRight, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useToast } from "../context/ToastContext";
import { CloseSprintModal } from "../components/CloseSprintModal";
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
import { useSidebar } from "../context/SidebarContext";
import type { Sprint, Issue } from "@paperclipai/shared";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import { ScrollArea } from "@/ui/components/ui/scroll-area";
import { Skeleton } from "@/ui/components/ui/skeleton";
import { Badge } from "@/ui/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/ui/components/ui/tabs";
import { cn } from "@/ui/lib/utils";

interface Props {
  sprint: Sprint | null;
  projectId: string;
  onActivated: () => void;
  onClosed?: () => void;
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

function MobileIssueCard({
  issue,
  direction,
  onMove,
}: {
  issue: Issue;
  direction: "to-sprint" | "to-backlog";
  onMove: (issueId: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-md border border-border bg-card">
      <div className="flex-1 min-w-0">
        <IssueCardContent issue={issue} />
      </div>
      <button
        onClick={() => onMove(issue.id)}
        className={cn(
          "shrink-0 flex items-center justify-center h-9 w-9 rounded-md border transition-colors",
          direction === "to-sprint"
            ? "border-primary/30 text-primary hover:bg-primary/10"
            : "border-border text-muted-foreground hover:bg-muted/50",
        )}
        aria-label={direction === "to-sprint" ? "Agregar al sprint" : "Devolver al backlog"}
      >
        {direction === "to-sprint" ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function SprintPlanning({ sprint, projectId, onActivated, onClosed, onCreateNew }: Props) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { isMobile } = useSidebar();
  const [search, setSearch] = useState("");
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"backlog" | "sprint">("backlog");
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
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "No se pudo activar el sprint";
      pushToast({ title: msg, tone: "error" });
    },
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

  const sprintHeader = (
    <div className={cn(
      "px-4 py-3 border-b border-border",
      isMobile ? "space-y-2" : "flex items-center justify-between",
    )}>
      <div>
        <h2 className="font-display font-semibold text-foreground">{sprint.name}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {sprint.startDate && sprint.endDate ? `${sprint.startDate} → ${sprint.endDate} · ` : ""}
          {sprintIssues.length} tareas asignadas
        </p>
      </div>
      {sprint.status === "active" ? (
        <Button size="sm" variant="outline" onClick={() => setShowCloseModal(true)} className={cn(isMobile && "w-full justify-center")}>
          <Square className="h-3.5 w-3.5 mr-1.5" />
          Cerrar Sprint
        </Button>
      ) : (
        <Button
          size="sm"
          onClick={() => activate.mutate()}
          disabled={sprintIssues.length === 0 || activate.isPending}
          className={cn(isMobile && "w-full justify-center")}
        >
          <Play className="h-3.5 w-3.5 mr-1.5" />
          {activate.isPending ? "Activando..." : "Activar Sprint"}
        </Button>
      )}
    </div>
  );

  const closeModal = showCloseModal && sprint && (
    <CloseSprintModal
      sprint={sprint}
      projectId={projectId}
      totalIssues={sprintIssues.length}
      doneIssues={sprintIssues.filter((i) => i.status === "done").length}
      onClose={() => setShowCloseModal(false)}
      onClosed={() => {
        setShowCloseModal(false);
        onClosed?.();
      }}
    />
  );

  /* ── Mobile: tabbed view with tap-to-move ──────────────── */
  if (isMobile) {
    return (
      <div className="flex flex-col h-full min-h-0">
        {sprintHeader}

        <Tabs
          value={mobilePanel}
          onValueChange={(v) => setMobilePanel(v as "backlog" | "sprint")}
          className="flex-1 min-h-0 flex flex-col"
        >
          <TabsList className="mx-3 mt-2 w-auto shrink-0">
            <TabsTrigger value="backlog" className="flex-1 gap-1.5">
              Backlog
              <Badge variant="secondary" className="text-xs">{backlog.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="sprint" className="flex-1 gap-1.5">
              Sprint
              <Badge variant="secondary" className="text-xs">{sprintIssues.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="backlog" className="flex-1 min-h-0 flex flex-col mt-0 data-[state=inactive]:hidden">
            <div className="px-3 py-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar en backlog..."
                  className="pl-9 h-10 text-sm"
                />
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="px-3 pb-3 space-y-1.5">
                {backlogLoading
                  ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)
                  : filteredBacklog.map((issue) => (
                      <MobileIssueCard
                        key={issue.id}
                        issue={issue}
                        direction="to-sprint"
                        onMove={(id) => addIssue.mutate(id)}
                      />
                    ))}
                {!backlogLoading && filteredBacklog.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin tareas en el backlog</p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="sprint" className="flex-1 min-h-0 flex flex-col mt-0 data-[state=inactive]:hidden">
            <ScrollArea className="flex-1">
              <div className="px-3 py-2 space-y-1.5">
                {sprintLoading
                  ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)
                  : sprintIssues.map((issue) => (
                      <MobileIssueCard
                        key={issue.id}
                        issue={issue}
                        direction="to-backlog"
                        onMove={(id) => removeIssue.mutate(id)}
                      />
                    ))}
                {!sprintLoading && sprintIssues.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Agregá tareas desde el backlog
                  </p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {closeModal}
      </div>
    );
  }

  /* ── Desktop: two-panel DnD (unchanged) ────────────────── */
  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-full min-h-0">
        {sprintHeader}

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

      {closeModal}
    </DndContext>
  );
}
