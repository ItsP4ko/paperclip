import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Square } from "lucide-react";
import { sprintsApi } from "../api/sprints";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { useCompany } from "../context/CompanyContext";
import type { Sprint, Issue } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CloseSprintModal } from "../components/CloseSprintModal";

const BOARD_COLUMNS = [
  { id: "todo",        label: "Todo",        color: "text-muted-foreground" },
  { id: "in_progress", label: "In Progress", color: "text-accent" },
  { id: "in_review",   label: "In Review",   color: "text-yellow-500" },
  { id: "done",        label: "Done",        color: "text-primary" },
] as const;

type ColId = typeof BOARD_COLUMNS[number]["id"];

interface Props {
  sprint: Sprint;
  projectId: string;
  onClosed: () => void;
}

function IssueCard({ issue }: { issue: Issue; onStatusChange: (status: string) => void }) {
  return (
    <div className="bg-card border border-border rounded-md p-2.5 text-xs space-y-1.5 cursor-pointer hover:border-primary/40 transition-colors">
      <p className="text-foreground text-sm leading-snug">{issue.title}</p>
      <div className="flex items-center gap-2">
        {issue.priority && (
          <span className={cn("capitalize font-medium", {
            "text-destructive": issue.priority === "critical",
            "text-orange-500": issue.priority === "high",
            "text-yellow-500": issue.priority === "medium",
            "text-muted-foreground": issue.priority === "low",
          })}>{issue.priority}</span>
        )}
        {issue.identifier && <span className="text-muted-foreground font-mono">{issue.identifier}</span>}
      </div>
    </div>
  );
}

export function SprintBoard({ sprint, projectId, onClosed }: Props) {
  const queryClient = useQueryClient();
  const [showClose, setShowClose] = useState(false);
  const { selectedCompanyId: companyId } = useCompany();

  const { data: issues = [], isLoading } = useQuery({
    queryKey: queryKeys.sprints.issues(sprint.id),
    queryFn: () => issuesApi.list(companyId!, { projectId, sprintId: sprint.id }),
    enabled: !!companyId,
  });

  const updateStatus = useMutation({
    mutationFn: ({ issueId, status }: { issueId: string; status: string }) =>
      issuesApi.update(issueId, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sprints.issues(sprint.id) }),
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

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sprint header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-semibold text-foreground">{sprint.name}</h2>
              <Badge variant="outline" className="text-xs border-primary/40 text-primary bg-primary/10">Activo</Badge>
            </div>
            {sprint.startDate && sprint.endDate && (
              <p className="text-xs text-muted-foreground mt-0.5">{sprint.startDate} → {sprint.endDate}</p>
            )}
          </div>
          {total > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs text-muted-foreground">{done}/{total}</span>
            </div>
          )}
        </div>
        <Button size="sm" variant="destructive" onClick={() => setShowClose(true)}>
          <Square className="h-3.5 w-3.5 mr-1.5" />
          Cerrar Sprint
        </Button>
      </div>

      {/* Board */}
      <div className="flex-1 min-h-0 grid grid-cols-4 divide-x divide-border overflow-hidden">
        {BOARD_COLUMNS.map((col) => (
          <div key={col.id} className="flex flex-col min-h-0">
            <div className="px-3 py-2 border-b border-border flex items-center gap-1.5">
              <span className={cn("text-xs font-semibold uppercase tracking-wide", col.color)}>{col.label}</span>
              <span className="text-xs text-muted-foreground">{byStatus[col.id].length}</span>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1.5">
                {isLoading
                  ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-md" />)
                  : byStatus[col.id].map((issue) => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        onStatusChange={(status) => updateStatus.mutate({ issueId: issue.id, status })}
                      />
                    ))}
                {!isLoading && byStatus[col.id].length === 0 && (
                  <div className="border border-dashed border-border rounded-md p-4 text-center text-xs text-muted-foreground/50">
                    vacío
                  </div>
                )}
              </div>
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
            queryClient.invalidateQueries({ queryKey: queryKeys.sprints.list(projectId) });
            onClosed();
          }}
        />
      )}
    </div>
  );
}
