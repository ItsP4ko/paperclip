import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Milestone, Plus, CalendarDays, ChevronRight } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useNavigate } from "@/lib/router";
import { queryKeys } from "../lib/queryKeys";
import { sprintsApi } from "../api/sprints";
import type { Sprint } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function sprintStatusColor(status: string) {
  if (status === "active") return "bg-green-500/15 text-green-400 border-green-500/20";
  if (status === "planning") return "bg-blue-500/15 text-blue-400 border-blue-500/20";
  if (status === "completed") return "bg-muted text-muted-foreground";
  return "bg-muted text-muted-foreground";
}

function SprintRow({ sprint, onClick }: { sprint: Sprint; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left border-b border-border last:border-0"
    >
      <Milestone className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{sprint.name}</span>
          <Badge variant="outline" className={cn("text-xs border", sprintStatusColor(sprint.status))}>
            {sprint.status}
          </Badge>
        </div>
        {(sprint.startDate || sprint.endDate) && (
          <div className="flex items-center gap-1 mt-0.5">
            <CalendarDays className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {sprint.startDate ?? "?"} → {sprint.endDate ?? "?"}
            </span>
          </div>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}

export function Sprints() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => { setBreadcrumbs([{ label: "Sprints" }]); }, [setBreadcrumbs]);

  const { data: sprints = [], isLoading } = useQuery({
    queryKey: queryKeys.sprints.list(selectedCompanyId!),
    queryFn: () => sprintsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => sprintsApi.create(selectedCompanyId!, { name }),
    onSuccess: (sprint) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sprints.list(selectedCompanyId!) });
      setShowNew(false);
      setNewName("");
      navigate(`/sprints/${sprint.id}/plan`);
    },
  });

  const active = sprints.find((s) => s.status === "active");
  const planning = sprints.filter((s) => s.status === "planning");
  const completed = sprints.filter((s) => s.status === "completed");

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (newName.trim()) createMutation.mutate(newName.trim());
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <h1 className="text-xl font-bold">Sprints</h1>
        <Button size="sm" onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Sprint
        </Button>
      </div>

      {showNew && (
        <form onSubmit={handleCreate} className="flex items-center gap-2 px-6 py-3 border-b border-border bg-accent/30">
          <Input
            autoFocus
            placeholder="Sprint name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-8 text-sm"
          />
          <Button size="sm" type="submit" disabled={!newName.trim() || createMutation.isPending}>
            Create
          </Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => { setShowNew(false); setNewName(""); }}>
            Cancel
          </Button>
        </form>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Loading...</div>
        )}

        {!isLoading && sprints.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <Milestone className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No sprints yet. Create one to start planning.</p>
          </div>
        )}

        {active && (
          <div className="px-6 pt-4 pb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Active</p>
            <div className="border border-green-500/30 rounded-lg overflow-hidden bg-green-500/5">
              <SprintRow sprint={active} onClick={() => navigate(`/sprints/${active.id}/plan`)} />
            </div>
          </div>
        )}

        {planning.length > 0 && (
          <div className="px-6 pt-4 pb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Planning</p>
            <div className="border border-border rounded-lg overflow-hidden">
              {planning.map((s) => (
                <SprintRow key={s.id} sprint={s} onClick={() => navigate(`/sprints/${s.id}/plan`)} />
              ))}
            </div>
          </div>
        )}

        {completed.length > 0 && (
          <div className="px-6 pt-4 pb-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Completed</p>
            <div className="border border-border rounded-lg overflow-hidden">
              {completed.map((s) => (
                <SprintRow key={s.id} sprint={s} onClick={() => navigate(`/sprints/${s.id}/metrics`)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
