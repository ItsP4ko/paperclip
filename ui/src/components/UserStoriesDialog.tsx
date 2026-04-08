import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Sparkles, RefreshCw } from "lucide-react";
import type { Issue } from "@paperclipai/shared";

interface GeneratedStory {
  title: string;
  description: string;
  selected: boolean;
}

export function UserStoriesDialog({
  open,
  onOpenChange,
  issue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issue: Issue;
}) {
  const queryClient = useQueryClient();
  const [stories, setStories] = useState<GeneratedStory[]>([]);
  const [error, setError] = useState<string | null>(null);

  const storiesQuery = useQuery({
    queryKey: queryKeys.issues.userStories(issue.id),
    queryFn: () => issuesApi.generateUserStories(issue.id),
    enabled: open,
    staleTime: 5 * 60_000, // 5 min — no regenera si se reabre pronto
    retry: 1,
  });

  useEffect(() => {
    if (storiesQuery.data) {
      setStories(storiesQuery.data.userStories.map((s) => ({ ...s, selected: true })));
      setError(null);
    }
    if (storiesQuery.isError) {
      setError((storiesQuery.error as Error).message);
    }
  }, [storiesQuery.data, storiesQuery.isError, storiesQuery.error]);

  const createSubtasks = useMutation({
    mutationFn: async () => {
      const selected = stories.filter((s) => s.selected);
      const createdIds: string[] = [];

      try {
        for (const story of selected) {
          const created = await issuesApi.create(issue.companyId, {
            title: story.title,
            description: story.description,
            parentId: issue.id,
            status: "backlog",
            priority: issue.priority,
            projectId: issue.projectId,
            ...(issue.assigneeAgentId ? { assigneeAgentId: issue.assigneeAgentId } : {}),
            ...(issue.executionWorkspaceId ? { executionWorkspaceId: issue.executionWorkspaceId } : {}),
            ...(issue.executionWorkspacePreference ? { executionWorkspacePreference: issue.executionWorkspacePreference } : {}),
            ...(issue.assigneeAdapterOverrides ? { assigneeAdapterOverrides: issue.assigneeAdapterOverrides } : {}),
          });
          createdIds.push(created.id);
        }
      } catch (e) {
        // Rollback: eliminar subtasks ya creados antes del fallo
        await Promise.allSettled(createdIds.map((id) => issuesApi.remove(id)));
        throw e;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issue.id) });
      if (issue.projectId && issue.companyId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.issues.listByProject(issue.companyId, issue.projectId),
        });
      }
      onOpenChange(false);
      reset();
    },
    onError: (e) => setError((e as Error).message),
  });

  function reset() {
    setStories([]);
    setError(null);
  }

  function handleOpen(o: boolean) {
    if (!o) reset();
    onOpenChange(o);
  }

  function handleRegenerate() {
    reset();
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.userStories(issue.id) });
  }

  const allSelected = stories.length > 0 && stories.every((s) => s.selected);
  const isLoading = storiesQuery.isFetching && stories.length === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Generar historias de usuario
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Generando historias de usuario…</p>
          </div>
        )}

        {!isLoading && error && (
          <div className="py-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {!isLoading && !error && stories.length > 0 && (
          <>
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">{stories.length} historias generadas</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRegenerate}
                  disabled={storiesQuery.isFetching}
                  className="h-6 px-2 text-xs"
                >
                  {storiesQuery.isFetching
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <RefreshCw className="h-3 w-3 mr-1" />
                  }
                  {!storiesQuery.isFetching && "Regenerar"}
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStories((prev) => prev.map((s) => ({ ...s, selected: !allSelected })))}
              >
                {allSelected ? "Deseleccionar todo" : "Seleccionar todo"}
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 min-h-0 pr-1">
              {stories.map((story, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 space-y-1.5 transition-colors ${
                    story.selected ? "border-border bg-card" : "border-border/40 bg-muted/20 opacity-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={story.selected}
                      onCheckedChange={(checked) =>
                        setStories((prev) => prev.map((s, idx) => idx === i ? { ...s, selected: !!checked } : s))
                      }
                      className="mt-0.5 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug">{story.title}</p>
                      <div className="mt-1 text-xs text-muted-foreground whitespace-pre-line">
                        {story.description}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button
                disabled={!stories.some((s) => s.selected) || createSubtasks.isPending}
                onClick={() => createSubtasks.mutate()}
              >
                {createSubtasks.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Crear {stories.filter((s) => s.selected).length} subtarea{stories.filter((s) => s.selected).length !== 1 ? "s" : ""}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
