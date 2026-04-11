import { useEffect, useState } from "react";
import { useAnimateIn } from "@/hooks/useAnimateIn";
import { useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { pipelinesApi, type Pipeline } from "../api/pipelines";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GitBranch, Play, Plus, Trash2 } from "lucide-react";

const STATUS_VARIANT: Record<Pipeline["status"], "default" | "secondary" | "outline"> = {
  active: "default",
  draft: "secondary",
  running: "default",
  completed: "outline",
  archived: "outline",
};

export function Pipelines() {
  const { scope: animateRef } = useAnimateIn({ preset: "fadeUp" });
  const { selectedCompanyId } = useCompany();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [deletingPipelineId, setDeletingPipelineId] = useState<string | null>(null);

  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => { setBreadcrumbs([{ label: "Pipelines" }]); }, [setBreadcrumbs]);

  const { data: pipelines = [], isLoading } = useQuery({
    queryKey: queryKeys.pipelines.list(selectedCompanyId!),
    queryFn: () => pipelinesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const deletingPipeline = pipelines?.find(p => p.id === deletingPipelineId);

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      pipelinesApi.create(selectedCompanyId!, { name, status: "draft" }),
    onSuccess: (pipeline) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.list(selectedCompanyId!) });
      setCreating(false);
      setNewName("");
      navigate(`/pipelines/${pipeline.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (pipelineId: string) =>
      pipelinesApi.delete(selectedCompanyId!, pipelineId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.list(selectedCompanyId!) });
    },
  });

  const runMutation = useMutation({
    mutationFn: (pipelineId: string) =>
      pipelinesApi.triggerRun(selectedCompanyId!, pipelineId),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.runs(selectedCompanyId!) });
      navigate(`/pipelines/${run.pipelineId}`);
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (newName.trim()) createMutation.mutate(newName.trim());
  }

  if (!selectedCompanyId) return null;

  return (
    <div ref={animateRef} className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-base font-semibold">Pipelines</h1>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          New Pipeline
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {creating && (
          <form
            onSubmit={handleCreate}
            className="flex items-center gap-2 px-6 py-3 border-b border-border bg-accent/30"
          >
            <input
              autoFocus
              type="text"
              placeholder="Pipeline name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 text-sm bg-background border border-border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-ring"
            />
            <Button type="submit" size="sm" disabled={!newName.trim() || createMutation.isPending}>
              Create
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { setCreating(false); setNewName(""); }}
            >
              Cancel
            </Button>
          </form>
        )}

        {isLoading ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">Loading...</div>
        ) : pipelines.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <GitBranch className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No pipelines yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Create a pipeline to orchestrate multi-step agent workflows.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {pipelines.map((pipeline) => (
              <div
                key={pipeline.id}
                className="flex items-center gap-3 px-6 py-3 hover:bg-accent/30 transition-colors group"
              >
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => navigate(`/pipelines/${pipeline.id}`)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{pipeline.name}</span>
                    <Badge variant={STATUS_VARIANT[pipeline.status]} className="text-[10px] px-1.5 py-0 capitalize">
                      {pipeline.status}
                    </Badge>
                  </div>
                  {pipeline.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {pipeline.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {pipeline.status === "draft" && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Run pipeline"
                      disabled={runMutation.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        runMutation.mutate(pipeline.id);
                      }}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Delete pipeline"
                    disabled={deleteMutation.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingPipelineId(pipeline.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!deletingPipelineId} onOpenChange={(open) => !open && setDeletingPipelineId(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete Pipeline</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deletingPipeline?.name}&rdquo;? This action cannot be undone. All steps and run history will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingPipelineId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deletingPipelineId) {
                  deleteMutation.mutate(deletingPipelineId);
                  setDeletingPipelineId(null);
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
