import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Square } from "lucide-react";
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
import { sprintsApi, type BoardGroupSprint } from "../api/sprints";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { useCompany } from "../context/CompanyContext";
import { useMemberRole } from "../hooks/useMemberRole";
import type { Issue } from "@paperclipai/shared";
import { Button } from "@/ui/components/ui/button";
import { Badge } from "@/ui/components/ui/badge";
import { ScrollArea } from "@/ui/components/ui/scroll-area";
import { Skeleton } from "@/ui/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/components/ui/select";
import { cn } from "@/ui/lib/utils";
import { CloseSprintModal } from "../components/CloseSprintModal";

const BOARD_COLUMNS = [
  { id: "todo",        label: "Todo",        color: "text-muted-foreground" },
  { id: "in_progress", label: "In Progress", color: "text-accent" },
  { id: "in_review",   label: "In Review",   color: "text-yellow-500" },
  { id: "done",        label: "Done",        color: "text-primary" },
] as const;

type ColId = typeof BOARD_COLUMNS[number]["id"];

const PRIORITY_COLOR: Record<string, string> = {
  critical: "text-destructive",
  high: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-muted-foreground",
};

function IssueCardContent({ issue }: { issue: Issue }) {
  return (
    <>
      <p className="text-foreground text-sm leading-snug">{issue.title}</p>
      <div className="flex items-center gap-2 mt-1">
        {issue.priority && (
          <span className={cn("text-xs capitalize font-medium", PRIORITY_COLOR[issue.priority] ?? "text-muted-foreground")}>
            {issue.priority}
          </span>
        )}
        {issue.identifier && <span className="text-xs text-muted-foreground font-mono">{issue.identifier}</span>}
      </div>
    </>
  );
}

function DraggableCard({ issue, isDragging }: { issue: Issue; isDragging: boolean }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: issue.id });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "bg-card border border-border rounded-md p-2.5 cursor-grab select-none transition-colors",
        isDragging ? "opacity-40" : "hover:border-primary/40",
      )}
    >
      <IssueCardContent issue={issue} />
    </div>
  );
}

function DroppableColumn({ colId, isOver, children }: { colId: string; isOver: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: colId });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-1 p-2 space-y-1.5 transition-colors rounded-sm min-h-[80px]",
        isOver && "bg-primary/5 ring-1 ring-primary/20 ring-inset",
      )}
    >
      {children}
    </div>
  );
}

function GroupSprintSection({
  groupSprint,
  projectId,
  onClosed,
}: {
  groupSprint: BoardGroupSprint;
  projectId: string;
  onClosed: () => void;
}) {
  const queryClient = useQueryClient();
  const { selectedCompanyId: companyId } = useCompany();
  const [showClose, setShowClose] = useState(false);
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const { sprint, group, issues: initialIssues } = groupSprint;

  const { data: issues = initialIssues } = useQuery({
    queryKey: queryKeys.sprints.issues(sprint.id),
    queryFn: () => issuesApi.list(companyId!, { projectId, sprintId: sprint.id }),
    enabled: !!companyId,
    initialData: initialIssues,
  });

  const updateStatus = useMutation({
    mutationFn: ({ issueId, status }: { issueId: string; status: string }) =>
      issuesApi.update(issueId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sprints.issues(sprint.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sprints.board(projectId) });
    },
  });

  const byStatus: Record<ColId, Issue[]> = { todo: [], in_progress: [], in_review: [], done: [] };
  for (const issue of issues) {
    const col = BOARD_COLUMNS.find((c) => c.id === issue.status);
    if (col) byStatus[col.id].push(issue);
    else byStatus.todo.push(issue);
  }

  const done = byStatus.done.length;
  const total = issues.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  function handleDragStart({ active }: DragStartEvent) {
    setActiveIssue(issues.find((i) => i.id === active.id) ?? null);
  }

  function handleDragOver({ over }: { over: { id: string | number } | null }) {
    setOverId(over ? String(over.id) : null);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveIssue(null);
    setOverId(null);
    if (!over) return;

    const issueId = String(active.id);
    const toStatus = String(over.id);
    const issue = issues.find((i) => i.id === issueId);
    if (!issue || issue.status === toStatus) return;

    updateStatus.mutate({ issueId, status: toStatus });
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="border-b border-border">
        {/* Group header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                {group && (
                  <span className="text-xs font-semibold text-muted-foreground uppercase">{group.name}</span>
                )}
                <span className="text-sm font-medium text-foreground">{sprint.name}</span>
                <Badge variant="outline" className="text-xs border-primary/40 text-primary bg-primary/10">Activo</Badge>
              </div>
              {sprint.startDate && sprint.endDate && (
                <p className="text-xs text-muted-foreground mt-0.5">{sprint.startDate} → {sprint.endDate}</p>
              )}
            </div>
            {total > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground">{done}/{total}</span>
              </div>
            )}
          </div>
          <Button size="sm" variant="destructive" onClick={() => setShowClose(true)}>
            <Square className="h-3.5 w-3.5 mr-1.5" /> Cerrar Sprint
          </Button>
        </div>

        {/* 4-column kanban */}
        <div className="grid grid-cols-4 divide-x divide-border" style={{ minHeight: "200px" }}>
          {BOARD_COLUMNS.map((col) => (
            <div key={col.id} className="flex flex-col">
              <div className="px-3 py-1.5 border-b border-border flex items-center gap-1.5">
                <span className={cn("text-xs font-semibold uppercase tracking-wide", col.color)}>{col.label}</span>
                <span className="text-xs text-muted-foreground">{byStatus[col.id].length}</span>
              </div>
              <ScrollArea className="flex-1">
                <DroppableColumn colId={col.id} isOver={overId === col.id}>
                  {byStatus[col.id].map((issue) => (
                    <DraggableCard key={issue.id} issue={issue} isDragging={activeIssue?.id === issue.id} />
                  ))}
                  {byStatus[col.id].length === 0 && (
                    <div className="border border-dashed border-border rounded-md p-4 text-center text-xs text-muted-foreground/50 mt-1">
                      vacío
                    </div>
                  )}
                </DroppableColumn>
              </ScrollArea>
            </div>
          ))}
        </div>

        {showClose && (
          <CloseSprintModal
            sprint={sprint}
            projectId={projectId}
            totalIssues={total}
            doneIssues={done}
            onClose={() => setShowClose(false)}
            onClosed={() => {
              setShowClose(false);
              queryClient.invalidateQueries({ queryKey: queryKeys.sprints.board(projectId) });
              onClosed();
            }}
          />
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeIssue && (
          <div className="bg-card border border-primary/40 rounded-md p-2.5 shadow-lg shadow-black/20 cursor-grabbing min-w-[160px]">
            <IssueCardContent issue={activeIssue} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

interface Props {
  projectId: string;
  onClosed: () => void;
}

export function SprintBoard({ projectId, onClosed }: Props) {
  const { selectedCompanyId: companyId } = useCompany();
  const { isOwner } = useMemberRole(companyId);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);

  const { data: board, isLoading } = useQuery({
    queryKey: queryKeys.sprints.board(projectId),
    queryFn: () => sprintsApi.getBoard(projectId),
    enabled: !!companyId,
  });

  if (isLoading || !board) {
    return (
      <div className="p-4 space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  const filtered = groupFilter
    ? board.groupSprints.filter((gs) => gs.group?.id === groupFilter)
    : board.groupSprints;

  return (
    <div className="flex flex-col">
      {/* Owner filter dropdown */}
      {isOwner && board.groupSprints.length > 1 && (
        <div className="px-4 py-2 border-b border-border bg-muted/20">
          <Select value={groupFilter ?? "all"} onValueChange={(v) => setGroupFilter(v === "all" ? null : v)}>
            <SelectTrigger className="w-48 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los grupos</SelectItem>
              {board.groupSprints.map((gs) => (
                <SelectItem key={gs.group?.id ?? "none"} value={gs.group?.id ?? "none"}>
                  {gs.group?.name ?? "Sin grupo"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Group sprint sections */}
      {filtered.map((gs) => (
        <GroupSprintSection key={gs.sprint.id} groupSprint={gs} projectId={projectId} onClosed={onClosed} />
      ))}

      {/* No groups banner */}
      {filtered.length === 0 && (
        <div className="px-4 py-12 text-center text-sm text-muted-foreground">
          No perteneces a ningún grupo en este proyecto. Pide acceso a un administrador.
        </div>
      )}

      {/* Backlog / unassigned issues */}
      {board.unassignedIssues.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Issues sin sprint ({board.unassignedIssues.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {board.unassignedIssues.map((issue) => (
              <div key={issue.id} className="bg-card border border-border rounded-md p-2.5">
                <IssueCardContent issue={issue} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
