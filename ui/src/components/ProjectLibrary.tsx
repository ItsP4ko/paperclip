import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { File, FileText, Image, Trash2, Upload } from "lucide-react";

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(contentType: string | null | undefined) {
  if (!contentType) return <File className="h-4 w-4 shrink-0 text-muted-foreground" />;
  if (contentType.startsWith("image/")) return <Image className="h-4 w-4 shrink-0 text-muted-foreground" />;
  if (contentType === "application/pdf") return <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />;
  return <File className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

const ACCEPTED = ".pdf,.doc,.docx,.txt,.md";

export function ProjectLibrary({ companyId, projectId }: { companyId: string; projectId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const queryClient = useQueryClient();

  const { data: docs = [], isLoading } = useQuery({
    queryKey: queryKeys.projects.documents(companyId, projectId),
    queryFn: () => projectsApi.listDocuments(companyId, projectId),
    enabled: !!companyId && !!projectId,
  });

  const upload = useMutation({
    mutationFn: (file: File) => projectsApi.uploadDocument(companyId, projectId, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects.documents(companyId, projectId) }),
  });

  const remove = useMutation({
    mutationFn: (documentId: string) => projectsApi.deleteDocument(companyId, projectId, documentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects.documents(companyId, projectId) }),
  });

  function handleFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((f) => upload.mutate(f));
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        className={`relative rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-border/80 hover:bg-accent/20"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Upload className="h-7 w-7 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium">
          {upload.isPending ? "Subiendo…" : "Arrastrá o hacé click para subir documentos"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">PDF, Word, TXT, Markdown — hasta 20 MB</p>
        <p className="text-xs text-muted-foreground mt-1">
          Estos documentos serán usados como contexto al generar historias de usuario
        </p>
      </div>

      {/* Document list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando documentos…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No hay documentos subidos todavía.</p>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 px-4 py-2.5">
              {fileIcon(doc.contentType)}
              <span className="text-sm truncate min-w-0 flex-1">
                {doc.originalFilename ?? doc.id.slice(0, 12)}
              </span>
              {doc.byteSize != null && (
                <span className="text-xs text-muted-foreground shrink-0">{formatBytes(doc.byteSize)}</span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate(doc.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
