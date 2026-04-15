import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Milestone, Plus, BarChart2, ChevronDown } from "lucide-react";
import { sprintsApi } from "../api/sprints";
import { queryKeys } from "../lib/queryKeys";
import type { Sprint } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useSidebar } from "../context/SidebarContext";
import { CreateSprintModal } from "../components/CreateSprintModal";
import { SprintPlanning } from "./SprintPlanning";
import { SprintMetricsPanel } from "./SprintMetricsPanel";

type SprintView = "planning" | "metrics";

function SprintStatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge variant="outline" className="text-xs border-primary/40 text-primary bg-primary/10">Activo</Badge>;
  if (status === "planning") return <Badge variant="outline" className="text-xs border-border text-muted-foreground">Planificando</Badge>;
  return <Badge variant="outline" className="text-xs border-border text-muted-foreground">Completado</Badge>;
}

export function SprintTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { isMobile } = useSidebar();
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [view, setView] = useState<SprintView>("planning");
  const [sprintPickerOpen, setSprintPickerOpen] = useState(false);

  const { data: sprints = [], isLoading } = useQuery({
    queryKey: queryKeys.sprints.list(projectId),
    queryFn: () => sprintsApi.listByProject(projectId),
  });

  const effectiveSprintId = selectedSprintId ?? sprints.find((s) => s.status === "active")?.id ?? sprints[0]?.id ?? null;
  const selectedSprint = sprints.find((s) => s.id === effectiveSprintId) ?? null;

  const handleSelectSprint = (sprint: Sprint) => {
    setSelectedSprintId(sprint.id);
    setView("planning");
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.sprints.list(projectId) });
  };

  const contentArea = (
    <>
      {view === "metrics" ? (
        <SprintMetricsPanel projectId={projectId} />
      ) : !effectiveSprintId ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          <div className="text-center">
            <Milestone className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>No hay sprints aún.</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowCreate(true)}>
              Crear primer sprint
            </Button>
          </div>
        </div>
      ) : (
        <SprintPlanning
          sprint={selectedSprint}
          projectId={projectId}
          onActivated={handleRefresh}
          onClosed={handleRefresh}
          onCreateNew={() => setShowCreate(true)}
        />
      )}
    </>
  );

  const createModal = showCreate && (
    <CreateSprintModal
      projectId={projectId}
      onClose={() => setShowCreate(false)}
      onCreated={(sprint) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.sprints.list(projectId) });
        setSelectedSprintId(sprint.id);
        setShowCreate(false);
        setView("planning");
      }}
    />
  );

  /* ── Mobile layout ────────────────────────────────────── */
  if (isMobile) {
    return (
      <div className="flex flex-col h-full min-h-0 border border-border rounded-lg overflow-hidden">
        {/* Sprint selector header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-sidebar shrink-0">
          <button
            onClick={() => setSprintPickerOpen(true)}
            className="flex items-center gap-2 flex-1 min-w-0 text-left"
          >
            <Milestone className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="font-display font-semibold text-sm truncate">
              {selectedSprint?.name ?? "Sprints"}
            </span>
            {selectedSprint && <SprintStatusBadge status={selectedSprint.status} />}
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground ml-auto" />
          </button>

          <Button size="icon-sm" variant="outline" onClick={() => setShowCreate(true)} aria-label="Nuevo sprint">
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant={view === "metrics" ? "secondary" : "ghost"}
            onClick={() => setView(view === "metrics" ? "planning" : "metrics")}
            aria-label="Métricas"
          >
            <BarChart2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {contentArea}
        </div>

        {/* Sprint picker bottom sheet */}
        <Sheet open={sprintPickerOpen} onOpenChange={setSprintPickerOpen}>
          <SheetContent side="bottom" className="max-h-[85dvh] pb-[env(safe-area-inset-bottom)]">
            <SheetHeader className="px-4 pt-2 pb-0">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />
              <SheetTitle className="font-display text-base">Sprints</SheetTitle>
            </SheetHeader>
            <ScrollArea className="flex-1 px-2">
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="px-3 py-3"><Skeleton className="h-10 w-full" /></div>
                  ))
                : sprints.map((sprint) => (
                    <button
                      key={sprint.id}
                      onClick={() => { handleSelectSprint(sprint); setSprintPickerOpen(false); }}
                      className={cn(
                        "w-full text-left px-4 py-3 text-sm transition-colors rounded-lg mb-1",
                        effectiveSprintId === sprint.id
                          ? "bg-accent/10 text-foreground"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                      )}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <Milestone className="h-4 w-4 shrink-0" />
                        <span className="font-medium truncate">{sprint.name}</span>
                      </div>
                      <SprintStatusBadge status={sprint.status} />
                    </button>
                  ))}
            </ScrollArea>
          </SheetContent>
        </Sheet>

        {createModal}
      </div>
    );
  }

  /* ── Desktop layout (unchanged) ───────────────────────── */
  return (
    <div className="flex h-full min-h-0 border border-border rounded-lg overflow-hidden" style={{ minHeight: "600px" }}>
      <div className="w-48 shrink-0 border-r border-border bg-sidebar flex flex-col">
        <div className="p-3 border-b border-border">
          <Button size="sm" variant="outline" className="w-full justify-start text-xs" onClick={() => setShowCreate(true)}>
            <Plus className="h-3 w-3 mr-1.5" />
            Nuevo Sprint
          </Button>
        </div>

        <ScrollArea className="flex-1">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-3 py-2"><Skeleton className="h-8 w-full" /></div>
              ))
            : sprints.map((sprint) => (
                <button
                  key={sprint.id}
                  onClick={() => handleSelectSprint(sprint)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-xs transition-colors border-l-2",
                    effectiveSprintId === sprint.id
                      ? "bg-accent/10 border-l-primary text-foreground"
                      : "border-l-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Milestone className="h-3 w-3 shrink-0" />
                    <span className="font-medium truncate">{sprint.name}</span>
                  </div>
                  <SprintStatusBadge status={sprint.status} />
                </button>
              ))}
        </ScrollArea>

        <div className="border-t border-border p-2">
          <button
            onClick={() => setView("metrics")}
            className={cn(
              "w-full text-left px-2 py-1.5 text-xs rounded-md flex items-center gap-1.5 transition-colors",
              view === "metrics" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            <BarChart2 className="h-3 w-3" />
            Métricas del proyecto
          </button>
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        {contentArea}
      </div>

      {createModal}
    </div>
  );
}
