import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { groupsApi } from "../api/groups";
import { queryKeys } from "../lib/queryKeys";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays } from "lucide-react";
import { sprintsApi } from "../api/sprints";
import type { Sprint } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useSidebar } from "../context/SidebarContext";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
  onClose: () => void;
  onCreated: (sprint: Sprint) => void;
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

const DURATION_PRESETS = [
  { label: "1 sem", days: 7 },
  { label: "2 sem", days: 14 },
  { label: "3 sem", days: 21 },
  { label: "4 sem", days: 28 },
] as const;

function SprintForm({
  name, setName, description, setDescription,
  startDate, setStartDate, endDate, setEndDate,
  duration, isMobile, isPending, onSubmit, onClose,
  groupId, setGroupId, projectGroups,
}: {
  name: string; setName: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  startDate: string; setStartDate: (v: string) => void;
  endDate: string; setEndDate: (v: string) => void;
  duration: number | null;
  isMobile: boolean;
  isPending: boolean;
  onSubmit: () => void;
  onClose: () => void;
  groupId: string; setGroupId: (v: string) => void;
  projectGroups: Array<{ id: string; name: string; description: string | null }>;
}) {
  const applyPreset = (days: number) => {
    const start = startDate ? new Date(startDate) : new Date();
    if (!startDate) setStartDate(toISODate(start));
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    setEndDate(toISODate(end));
  };

  if (!isMobile) {
    // Desktop: original layout, untouched
    return (
      <>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="sprint-group">Grupo</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger id="sprint-group" className="h-9 text-sm">
                <SelectValue placeholder="Seleccionar grupo..." />
              </SelectTrigger>
              <SelectContent>
                {projectGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
          <Button onClick={onSubmit} disabled={!name.trim() || !groupId || isPending}>
            {isPending ? "Creando..." : "Crear Sprint"}
          </Button>
        </DialogFooter>
      </>
    );
  }

  // Mobile: stacked layout with duration presets
  return (
    <div className="flex flex-col gap-5 px-4 pb-4">
      {/* Group selector */}
      <div className="space-y-2">
        <Label htmlFor="sprint-group-m" className="text-sm font-medium">Grupo</Label>
        <Select value={groupId} onValueChange={setGroupId}>
          <SelectTrigger id="sprint-group-m" className="h-12 text-base">
            <SelectValue placeholder="Seleccionar grupo..." />
          </SelectTrigger>
          <SelectContent>
            {projectGroups.map((g) => (
              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Name — large input for easy tapping */}
      <div className="space-y-2">
        <Label htmlFor="sprint-name-m" className="text-sm font-medium">Nombre</Label>
        <Input
          id="sprint-name-m"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Sprint #1"
          autoFocus
          className="h-12 text-base"
        />
      </div>

      {/* Description — slightly taller on mobile */}
      <div className="space-y-2">
        <Label htmlFor="sprint-desc-m" className="text-sm font-medium text-muted-foreground">
          Descripción <span className="text-xs">(opcional)</span>
        </Label>
        <Textarea
          id="sprint-desc-m"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Objetivos del sprint..."
          rows={3}
          className="text-base resize-none"
        />
      </div>

      {/* Duration presets — quick tap */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Duración rápida</span>
        <div className="grid grid-cols-4 gap-2">
          {DURATION_PRESETS.map((p) => {
            const isActive = duration === p.days;
            return (
              <button
                key={p.days}
                type="button"
                onClick={() => applyPreset(p.days)}
                className={cn(
                  "rounded-md border py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary/50 text-muted-foreground hover:bg-secondary",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dates — stacked vertically for mobile */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fechas</span>
        </div>
        <div className="space-y-2.5">
          <div className="space-y-1.5">
            <Label htmlFor="sprint-start-m" className="text-xs text-muted-foreground">Inicio</Label>
            <Input id="sprint-start-m" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-12 text-base" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sprint-end-m" className="text-xs text-muted-foreground">Fin</Label>
            <Input id="sprint-end-m" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="h-12 text-base" />
          </div>
        </div>
        {duration !== null && (
          <p className="text-xs text-muted-foreground">
            Duración: <span className="text-foreground font-medium">{duration} días</span>
          </p>
        )}
      </div>

      {/* Submit — full-width sticky button */}
      <Button
        onClick={onSubmit}
        disabled={!name.trim() || !groupId || isPending}
        className="w-full h-12 text-base font-semibold"
      >
        {isPending ? "Creando..." : "Crear Sprint"}
      </Button>
    </div>
  );
}

export function CreateSprintModal({ projectId, onClose, onCreated }: Props) {
  const { isMobile } = useSidebar();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [groupId, setGroupId] = useState("");

  const { data: projectGroups = [] } = useQuery({
    queryKey: queryKeys.groups.forProject(projectId),
    queryFn: () => groupsApi.listForProject(projectId),
  });

  const duration = startDate && endDate && endDate > startDate ? daysBetween(startDate, endDate) : null;

  const create = useMutation({
    mutationFn: () =>
      sprintsApi.create(projectId, {
        name: name.trim(),
        description: description.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        groupId,
      }),
    onSuccess: (sprint) => onCreated(sprint),
  });

  const formProps = {
    name, setName, description, setDescription,
    startDate, setStartDate, endDate, setEndDate,
    duration, isMobile, isPending: create.isPending,
    onSubmit: () => create.mutate(), onClose,
    groupId, setGroupId, projectGroups,
  };

  if (isMobile) {
    return (
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" className="max-h-[90dvh] rounded-t-xl pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="px-4 pt-2 pb-0">
            {/* Drag handle */}
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />
            <SheetTitle className="font-display text-lg">Nuevo Sprint</SheetTitle>
          </SheetHeader>
          <SprintForm {...formProps} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Nuevo Sprint</DialogTitle>
        </DialogHeader>
        <SprintForm {...formProps} />
      </DialogContent>
    </Dialog>
  );
}
