import type { Node, Edge } from "@xyflow/react";
import type { PipelineStep } from "../../api/pipelines";

export type StepNodeData = {
  step: PipelineStep;
  agentNames: Record<string, string>;
  memberNames: Record<string, string>;
  onEdit: (stepId: string) => void;
  onDelete: (stepId: string) => void;
};

export type IfElseNodeData = {
  step: PipelineStep;
  onEdit: (stepId: string) => void;
  onDelete: (stepId: string) => void;
};

export function stepsToNodes(
  steps: PipelineStep[],
  agentNames: Record<string, string>,
  memberNames: Record<string, string>,
  onEdit: (stepId: string) => void,
  onDelete: (stepId: string) => void,
): Node[] {
  return steps.map((step) => ({
    id: step.id,
    type: step.stepType === "if_else" ? "ifElse" : "stepNode",
    position: { x: step.positionX ?? 0, y: step.positionY ?? 0 },
    data: step.stepType === "if_else"
      ? { step, onEdit, onDelete }
      : { step, agentNames, memberNames, onEdit, onDelete },
  }));
}

export function stepsToEdges(steps: PipelineStep[]): Edge[] {
  const edges: Edge[] = [];
  for (const step of steps) {
    for (const depId of step.dependsOn) {
      const sourceStep = steps.find((s) => s.id === depId);
      let sourceHandle: string | undefined;
      if (sourceStep?.stepType === "if_else") {
        const config = sourceStep.config as { branches?: Array<{ id: string; nextStepIds: string[] }> };
        const branch = config.branches?.find((b) => b.nextStepIds.includes(step.id));
        if (branch) sourceHandle = branch.id;
      }
      edges.push({
        id: `${depId}-${step.id}`,
        source: depId,
        target: step.id,
        sourceHandle,
        type: "addStep",
      });
    }
  }
  return edges;
}
