import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import { Plus } from "lucide-react";

export const AddStepEdge = memo(function AddStepEdge(props: EdgeProps) {
  const { id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} className="!stroke-border" />
      <EdgeLabelRenderer>
        <div
          className="flex items-center justify-center w-5 h-5 rounded-full bg-background border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          onClick={() => {
            const edgeData = data as { onAddStep?: (sourceId: string, targetId: string) => void } | undefined;
            edgeData?.onAddStep?.(source, target);
          }}
        >
          <Plus className="h-3 w-3" />
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
