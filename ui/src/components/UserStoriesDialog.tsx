import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Sparkles } from "lucide-react";
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
  const [step, setStep] = useState<"loading" | "preview">("loading");
  const [error, setError] = useState<string | null>(null);

  const generate = useMutation({
    mutationFn: () => issuesApi.generateUserStories(issue.id),
    onSuccess: (data) => {
      setStories(data.userStories.map((s) => ({ ...s, selected: true })));
      setStep("preview");
    },
    onError: (e) => {
      setError((e as Error).message);
      setStep("preview");
    },
  });

  const createSubtasks = useMutation({
    mutationFn: async () => {
      const selected = stories.filter((s) => s.selected);
      for (const story of selected) {
        await issuesApi.create(issue.companyId, {
          title: story.title,
          description: story.description,
          parentId: issue.id,
          status: "backlog",
          priority: issue.priority,
          projectId: issue.projectId,
        });
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
    setStep("loading");
    setStories([]);
    setError(null);
  }

  function handleOpen(o: boolean) {
    if (o) {
      reset();
      generate.mutate();
    }
    onOpenChange(o);
  }

  const allSelected = stories.length > 0 && stories.every((s) => s.selected);

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Generar historias de usuario
          </DialogTitle>
        </DialogHeader>

        {step === "loading" && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Generando historias de usuario…</p>
          </div>
        )}

        {step === "preview" && error && (
          <div className="py-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {step === "preview" && !error && stories.length > 0 && (
          <>
            <div className="flex items-center justify-between px-1">
              <p className="text-sm text-muted-foreground">{stories.length} historias generadas</p>
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
