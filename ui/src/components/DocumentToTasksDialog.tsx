import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, FileText, Mic, Download } from "lucide-react";

type Priority = "low" | "medium" | "high" | "critical";

interface GeneratedTask {
  title: string;
  description: string;
  priority: Priority;
  selected: boolean;
}

const ACCEPTED_TYPES = ".pdf,.docx,.txt,.md,.mp3,.wav,.m4a,.ogg,.webm";
const MAX_SIZE_BYTES = 20 * 1024 * 1024;

export function DocumentToTasksDialog({
  open,
  onOpenChange,
  companyId,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isAudioFile, setIsAudioFile] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [tasks, setTasks] = useState<GeneratedTask[]>([]);
  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [error, setError] = useState<string | null>(null);

  const analyze = useMutation({
    mutationFn: (file: File) => issuesApi.analyzeDocument(companyId, file),
    onSuccess: (data) => {
      setTasks(data.tasks.map((t) => ({ ...t, selected: true })));
      setTranscription(data.transcription ?? null);
      setStep("preview");
    },
    onError: (e) => setError((e as Error).message),
  });

  const createIssues = useMutation({
    mutationFn: async () => {
      const selected = tasks.filter((t) => t.selected);
      for (const task of selected) {
        await issuesApi.create(companyId, {
          title: task.title,
          description: task.description,
          priority: task.priority,
          projectId,
          status: "backlog",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByProject(companyId, projectId) });
      onOpenChange(false);
      reset();
    },
    onError: (e) => setError((e as Error).message),
  });

  function reset() {
    setStep("upload");
    setTasks([]);
    setFileName(null);
    setError(null);
    setTranscription(null);
    setIsAudioFile(false);
  }

  function downloadTranscription() {
    if (!transcription) return;
    const blob = new Blob([transcription], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcripcion-${fileName?.replace(/\.[^.]+$/, "") ?? "audio"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const handleFile = useCallback((file: File) => {
    setError(null);
    if (file.size > MAX_SIZE_BYTES) {
      setError("El archivo no puede superar 20 MB");
      return;
    }
    setFileName(file.name);
    setIsAudioFile(file.type.startsWith("audio/"));
    analyze.mutate(file);
  }, [analyze]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const toggleAll = (selected: boolean) =>
    setTasks((prev) => prev.map((t) => ({ ...t, selected })));

  const allSelected = tasks.length > 0 && tasks.every((t) => t.selected);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Generar tareas desde documento</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex-1 flex flex-col gap-4">
            <div
              className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
                dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              {analyze.isPending ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Analizando {fileName}…</p>
                </>
              ) : (
                <>
                  {isAudioFile
                    ? <Mic className="h-8 w-8 text-muted-foreground" />
                    : <Upload className="h-8 w-8 text-muted-foreground" />
                  }
                  <div className="text-center">
                    <p className="text-sm font-medium">Arrastrá un archivo o hacé click para seleccionar</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, TXT, MD, MP3, WAV, M4A — máximo 20 MB</p>
                  </div>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {step === "preview" && (
          <>
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">
                  <FileText className="inline h-3.5 w-3.5 mr-1" />
                  {fileName} — {tasks.length} tareas generadas
                </p>
                {transcription && (
                  <Button variant="ghost" size="sm" onClick={downloadTranscription} className="h-6 px-2 text-xs">
                    <Download className="h-3 w-3 mr-1" />
                    Descargar transcripción
                  </Button>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => toggleAll(!allSelected)}>
                {allSelected ? "Deseleccionar todo" : "Seleccionar todo"}
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-1">
              {tasks.map((task, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 transition-colors ${
                    task.selected ? "border-border bg-card" : "border-border/40 bg-muted/20 opacity-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={task.selected}
                      onCheckedChange={(checked) =>
                        setTasks((prev) => prev.map((t, idx) => idx === i ? { ...t, selected: !!checked } : t))
                      }
                      className="mt-0.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0 space-y-2">
                      <Input
                        value={task.title}
                        onChange={(e) =>
                          setTasks((prev) => prev.map((t, idx) => idx === i ? { ...t, title: e.target.value } : t))
                        }
                        className="h-7 text-sm font-medium"
                      />
                      <Select
                        value={task.priority}
                        onValueChange={(v) =>
                          setTasks((prev) => prev.map((t, idx) => idx === i ? { ...t, priority: v as Priority } : t))
                        }
                      >
                        <SelectTrigger className="h-6 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="critical">Critical</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => { reset(); }}>Volver</Button>
              <Button
                disabled={!tasks.some((t) => t.selected) || createIssues.isPending}
                onClick={() => createIssues.mutate()}
              >
                {createIssues.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Crear {tasks.filter((t) => t.selected).length} tarea{tasks.filter((t) => t.selected).length !== 1 ? "s" : ""}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
