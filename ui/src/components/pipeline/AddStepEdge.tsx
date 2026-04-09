import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import { Plus, Trash2 } from "lucide-react";

export const AddStepEdge = memo(function AddStepEdge(props: EdgeProps) {
  const { id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  });

  const edgeData = data as { onAddStep?: (sourceId: string, targetId: string) => void; onUnlink?: (sourceId: string, targetId: string) => void } | undefined;

  return (
    <>
      <BaseEdge id={id} path={edgePath} className="!stroke-border" />
      <EdgeLabelRenderer>
        <div
          className="flex items-center gap-1"
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
        >
          <div
            className="flex items-center justify-center w-5 h-5 rounded-full bg-background border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            onClick={() => edgeData?.onAddStep?.(source, target)}
          >
            <Plus className="h-3 w-3" />
          </div>
          <div
            className="flex items-center justify-center w-5 h-5 rounded-full bg-background border border-border text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors cursor-pointer"
            onClick={() => edgeData?.onUnlink?.(source, target)}
          >
            <Trash2 className="h-2.5 w-2.5" />
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
