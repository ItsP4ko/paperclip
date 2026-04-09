import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Trash2, Pencil } from "lucide-react";
import type { StepNodeData } from "./utils";

export const StepNode = memo(function StepNode({ data }: NodeProps) {
  const { step, agentNames, memberNames, onEdit, onDelete } = data as StepNodeData;

  let assigneeLabel: string | null = null;
  if (step.assigneeType === "agent" && step.agentId) {
    assigneeLabel = `Agent: ${agentNames[step.agentId] ?? step.agentId.slice(0, 8)}`;
  } else if (step.assigneeType === "user" && step.assigneeUserId) {
    assigneeLabel = `User: ${memberNames[step.assigneeUserId] ?? step.assigneeUserId.slice(0, 8)}`;
  }

  return (
    <div className="group w-[280px] border border-border rounded-lg bg-card shadow-[2px_2px_0px_0px_rgba(0,0,0,0.05)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.03)] px-4 py-3 transition-all duration-200">
      <Handle type="target" position={Position.Top} className="!bg-border !w-2 !h-2" />
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium block truncate">{step.name}</span>
          {assigneeLabel && (
            <span className="text-xs text-muted-foreground block mt-0.5">{assigneeLabel}</span>
          )}
          {step.issueId && (
            <span className="text-xs text-muted-foreground block mt-0.5">
              Issue: {step.issueId.slice(0, 8)}...
            </span>
          )}
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
      <Handle type="source" position={Position.Bottom} className="!bg-border !w-2 !h-2" />
    </div>
  );
});
