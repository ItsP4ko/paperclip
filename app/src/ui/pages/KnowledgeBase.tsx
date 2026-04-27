import { useState, useEffect, useCallback } from "react";
import { useAnimateIn } from "@/ui/hooks/useAnimateIn";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { knowledgeApi, type KnowledgeEntry, type KnowledgeEntryInput } from "../api/knowledge";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import { Textarea } from "@/ui/components/ui/textarea";
import { Label } from "@/ui/components/ui/label";
import { Badge } from "@/ui/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/ui/components/ui/dialog";
import {
  BookOpen,
  Plus,
  Search,
  Pin,
  Pencil,
  Trash2,
  X,
} from "lucide-react";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function EntryEditor({
  entry,
  onSave,
  onClose,
  saving,
}: {
  entry: KnowledgeEntry | null;
  onSave: (input: KnowledgeEntryInput) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(entry?.title ?? "");
  const [content, setContent] = useState(entry?.content ?? "");
  const [category, setCategory] = useState(entry?.category ?? "");
  const [tagsInput, setTagsInput] = useState(entry?.tags?.join(", ") ?? "");
  const [pinned, setPinned] = useState(entry?.pinned ?? false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    onSave({
      title,
      content,
      category: category || null,
      tags,
      pinned,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="kb-title">Title</Label>
        <Input
          id="kb-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Deployment checklist"
          required
          autoFocus
        />
      </div>
      <div>
        <Label htmlFor="kb-content">Content</Label>
        <Textarea
          id="kb-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Knowledge entry content (markdown supported)"
          rows={8}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="kb-category">Category</Label>
          <Input
            id="kb-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. processes, architecture"
          />
        </div>
        <div>
          <Label htmlFor="kb-tags">Tags (comma-separated)</Label>
          <Input
            id="kb-tags"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="e.g. deploy, ci, prod"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={pinned}
          onChange={(e) => setPinned(e.target.checked)}
          className="rounded border-border"
        />
        <Pin className="h-3.5 w-3.5" />
        Pin this entry (always inject into agent runs)
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving || !title || !content}>
          {saving ? "Saving..." : entry ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
}

export function KnowledgeBase() {
  const { scope: animateRef } = useAnimateIn({ preset: "fadeUp" });
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([{ label: "Knowledge Base" }]);
  }, [setBreadcrumbs]);

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [pinnedFilter, setPinnedFilter] = useState<string>("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const filterParams = {
    category: categoryFilter || undefined,
    pinned: pinnedFilter || undefined,
  };

  const listQuery = useQuery({
    queryKey: queryKeys.knowledge.list(selectedCompanyId!, filterParams),
    queryFn: () =>
      knowledgeApi.list(selectedCompanyId!, {
        category: filterParams.category,
        pinned: filterParams.pinned,
      }),
    enabled: !!selectedCompanyId && !searchQuery,
  });

  const searchQueryResult = useQuery({
    queryKey: queryKeys.knowledge.search(selectedCompanyId!, searchQuery),
    queryFn: () => knowledgeApi.search(selectedCompanyId!, searchQuery),
    enabled: !!selectedCompanyId && searchQuery.length >= 2,
  });

  const categoriesQuery = useQuery({
    queryKey: queryKeys.knowledge.categories(selectedCompanyId!),
    queryFn: () => knowledgeApi.categories(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const entries = searchQuery.length >= 2 ? searchQueryResult.data : listQuery.data;
  const isLoading = searchQuery.length >= 2 ? searchQueryResult.isLoading : listQuery.isLoading;

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["knowledge", selectedCompanyId!] });
  }

  const createMutation = useMutation({
    mutationFn: (input: KnowledgeEntryInput) => knowledgeApi.create(selectedCompanyId!, input),
    onSuccess: () => {
      invalidateAll();
      setEditorOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<KnowledgeEntryInput> }) =>
      knowledgeApi.update(selectedCompanyId!, id, input),
    onSuccess: () => {
      invalidateAll();
      setEditorOpen(false);
      setEditingEntry(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => knowledgeApi.delete(selectedCompanyId!, id),
    onSuccess: () => {
      invalidateAll();
      setDeleteConfirm(null);
    },
  });

  const togglePinMutation = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      knowledgeApi.update(selectedCompanyId!, id, { pinned }),
    onSuccess: () => invalidateAll(),
  });

  function openCreate() {
    setEditingEntry(null);
    setEditorOpen(true);
  }

  function openEdit(entry: KnowledgeEntry) {
    setEditingEntry(entry);
    setEditorOpen(true);
  }

  function handleSave(input: KnowledgeEntryInput) {
    if (editingEntry) {
      updateMutation.mutate({ id: editingEntry.id, input });
    } else {
      createMutation.mutate(input);
    }
  }

  return (
    <div ref={animateRef} className="p-6 max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Shared knowledge that agents can reference during runs
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New Entry
        </Button>
      </div>

      {/* Search + Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search knowledge entries..."
            className="pl-8 h-8 text-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="text-xs border border-border rounded px-2 py-1.5 bg-background min-w-[120px]"
        >
          <option value="">All categories</option>
          {categoriesQuery.data?.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={pinnedFilter}
          onChange={(e) => setPinnedFilter(e.target.value)}
          className="text-xs border border-border rounded px-2 py-1.5 bg-background min-w-[100px]"
        >
          <option value="">All</option>
          <option value="true">Pinned</option>
          <option value="false">Unpinned</option>
        </select>
      </div>

      {/* Entry count */}
      {entries && (
        <p className="text-xs text-muted-foreground">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
          {searchQuery.length >= 2 ? ` matching "${searchQuery}"` : ""}
        </p>
      )}

      {/* Entries list */}
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {(!entries || entries.length === 0) && !isLoading && (
          <div className="py-12 text-center">
            <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              {searchQuery ? "No matching entries" : "No knowledge entries yet"}
            </p>
            {!searchQuery && (
              <Button variant="outline" size="sm" className="mt-3" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Create first entry
              </Button>
            )}
          </div>
        )}

        {entries?.map((entry) => (
          <div key={entry.id} className="px-4 py-3 group">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{entry.title}</span>
                  {entry.pinned && (
                    <Pin className="h-3 w-3 text-amber-500 shrink-0" />
                  )}
                  {entry.category && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {entry.category}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {entry.content.slice(0, 200)}
                </p>
                {entry.tags.length > 0 && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {entry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    togglePinMutation.mutate({ id: entry.id, pinned: !entry.pinned })
                  }
                  title={entry.pinned ? "Unpin" : "Pin"}
                >
                  <Pin className={`h-3.5 w-3.5 ${entry.pinned ? "text-amber-500" : ""}`} />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(entry)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setDeleteConfirm(entry.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                {timeAgo(entry.updatedAt)}
              </span>
            </div>
          </div>
        ))}

        {isLoading && (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditorOpen(false);
            setEditingEntry(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEntry ? "Edit Entry" : "New Knowledge Entry"}</DialogTitle>
          </DialogHeader>
          <EntryEditor
            entry={editingEntry}
            onSave={handleSave}
            onClose={() => {
              setEditorOpen(false);
              setEditingEntry(null);
            }}
            saving={createMutation.isPending || updateMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete entry?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently remove this knowledge entry. Existing injection records will be preserved.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
