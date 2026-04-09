import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { sprintsApi } from "../api/sprints";
import type { Sprint } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface Props {
  projectId: string;
  onClose: () => void;
  onCreated: (sprint: Sprint) => void;
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

export function CreateSprintModal({ projectId, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const duration = startDate && endDate && endDate > startDate ? daysBetween(startDate, endDate) : null;

  const create = useMutation({
    mutationFn: () =>
      sprintsApi.create(projectId, {
        name: name.trim(),
        description: description.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    onSuccess: (sprint) => onCreated(sprint),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Nuevo Sprint</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="sprint-name">Nombre</Label>
            <Input id="sprint-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sprint #1" autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sprint-desc">Descripción (opcional)</Label>
            <Textarea id="sprint-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Objetivos del sprint..." rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sprint-start">Fecha de inicio</Label>
              <Input id="sprint-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sprint-end">Fecha de fin</Label>
              <Input id="sprint-end" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          {duration !== null && (
            <p className="text-xs text-muted-foreground">
              Duración: <span className="text-foreground font-medium">{duration} días</span>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Creando..." : "Crear Sprint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
