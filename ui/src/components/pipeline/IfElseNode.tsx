import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Trash2, Pencil, GitFork } from "lucide-react";
import type { IfElseNodeData } from "./utils";

type Branch = { id: string; label: string; condition: { field: string; operator: string; value: unknown } | null };

export const IfElseNode = memo(function IfElseNode({ data }: NodeProps) {
  const { step, onEdit, onDelete } = data as IfElseNodeData;
  const config = step.config as { branches?: Branch[] };
  const branches = config.branches ?? [];

  return (
    <div className="group w-[280px] border-2 border-amber-500/50 rounded-lg bg-card shadow-[2px_2px_0px_0px_rgba(0,0,0,0.05)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.03)] px-4 py-3">
      <Handle type="target" position={Position.Top} className="!bg-amber-500 !w-2 !h-2" />
      <div className="flex items-start gap-2">
        <GitFork className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium block truncate">{step.name}</span>
          <span className="text-xs text-muted-foreground block mt-0.5">
            {branches.length} branches
          </span>
        </div>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={(e) => { e.stopPropagation(); onEdit(step.id); }} className="p-1 rounded hover:bg-accent">
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(step.id); }} className="p-1 rounded hover:bg-accent">
            <Trash2 className="h-3 w-3 text-destructive" />
          </button>
        </div>
      </div>
      {branches.map((branch, idx) => (
        <Handle
          key={branch.id}
          type="source"
          position={Position.Bottom}
          id={branch.id}
          className="!bg-amber-500 !w-2 !h-2"
          style={{ left: `${((idx + 1) / (branches.length + 1)) * 100}%` }}
        />
      ))}
    </div>
  );
});
