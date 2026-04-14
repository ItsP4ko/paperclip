import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { groupsApi } from "../api/groups";
import { queryKeys } from "../lib/queryKeys";

export function NewGroupDialog() {
  const { newGroupOpen, closeNewGroup } = useDialog();
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const createGroup = useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      groupsApi.create(selectedCompanyId!, data),
  });

  function reset() {
    setName("");
    setDescription("");
  }

  async function handleSubmit() {
    if (!selectedCompanyId || !name.trim()) return;
    await createGroup.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
    });
    reset();
    closeNewGroup();
    queryClient.invalidateQueries({ queryKey: queryKeys.groups.list(selectedCompanyId) });
  }

  return (
    <Dialog
      open={newGroupOpen}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          closeNewGroup();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Group</DialogTitle>
          <DialogDescription>Create a new group to organize members and projects.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label htmlFor="group-name" className="text-sm font-medium text-foreground">
              Name
            </label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Marketing, Engineering"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="group-desc" className="text-sm font-medium text-foreground">
              Description
            </label>
            <Textarea
              id="group-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this group for?"
              rows={3}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                reset();
                closeNewGroup();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!name.trim() || createGroup.isPending}>
              {createGroup.isPending ? "Creating..." : "Create Group"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
