import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { sprintsApi } from "../api/sprints";
import { queryKeys } from "../lib/queryKeys";
import type { Sprint } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Props {
  sprint: Sprint;
  projectId: string;
  totalIssues: number;
  doneIssues: number;
  onClose: () => void;
  onClosed: () => void;
}

export function CloseSprintModal({ sprint, projectId, totalIssues, doneIssues, onClose, onClosed }: Props) {
  const pendingIssues = totalIssues - doneIssues;
  const [strategy, setStrategy] = useState<"backlog" | "next_sprint">("backlog");
  const [nextSprintId, setNextSprintId] = useState<string>("");

  const { data: sprints = [] } = useQuery({
    queryKey: queryKeys.sprints.list(projectId),
    queryFn: () => sprintsApi.listByProject(projectId),
  });

  const planningSprintsForNext = sprints.filter((s) => s.status === "planning" && s.id !== sprint.id);

  const complete = useMutation({
    mutationFn: () =>
      sprintsApi.complete(sprint.id, {
        spillStrategy: strategy,
        nextSprintId: strategy === "next_sprint" && nextSprintId ? nextSprintId : undefined,
      }),
    onSuccess: () => onClosed(),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">Cerrar {sprint.name}</DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-primary/10 border border-primary/20 rounded-md p-2">
              <div className="text-lg font-bold text-primary">{doneIssues}</div>
              <div className="text-xs text-muted-foreground">Completadas</div>
            </div>
            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-2">
              <div className="text-lg font-bold text-destructive">{pendingIssues}</div>
              <div className="text-xs text-muted-foreground">Pendientes</div>
            </div>
            <div className="bg-muted border border-border rounded-md p-2">
              <div className="text-lg font-bold text-foreground">{totalIssues}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
          </div>

          {pendingIssues > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                ¿Qué hacemos con las <span className="text-destructive font-medium">{pendingIssues} tareas pendientes</span>?
              </p>

              <button
                onClick={() => setStrategy("backlog")}
                className={cn(
                  "w-full text-left p-3 rounded-md border text-sm transition-colors",
                  strategy === "backlog" ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:border-border/80",
                )}
              >
                <div className="font-medium">Volver al backlog</div>
                <div className="text-xs mt-0.5 opacity-70">Quedan sin sprint asignado</div>
              </button>

              <button
                onClick={() => setStrategy("next_sprint")}
                className={cn(
                  "w-full text-left p-3 rounded-md border text-sm transition-colors",
                  strategy === "next_sprint" ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:border-border/80",
                )}
              >
                <div className="font-medium">Mover al siguiente sprint</div>
                <div className="text-xs mt-0.5 opacity-70">Se asignan al sprint seleccionado</div>
              </button>

              {strategy === "next_sprint" && (
                <Select value={nextSprintId} onValueChange={setNextSprintId}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Seleccioná el sprint destino..." />
                  </SelectTrigger>
                  <SelectContent>
                    {planningSprintsForNext.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground border-t border-border pt-3">
            Todo queda registrado en métricas: tareas completadas, pendientes y a dónde fueron.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            variant="destructive"
            onClick={() => complete.mutate()}
            disabled={complete.isPending || (strategy === "next_sprint" && !nextSprintId && planningSprintsForNext.length > 0)}
          >
            {complete.isPending ? "Cerrando..." : "Cerrar Sprint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
