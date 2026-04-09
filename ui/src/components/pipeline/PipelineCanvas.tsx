import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type OnNodeDrag,
  type OnConnect,
  type OnNodesDelete,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { PipelineStep } from "../../api/pipelines";
import type { CompanyMember } from "../../api/access";
import { stepsToNodes, stepsToEdges } from "./utils";
import { useAutoLayout, computeFullLayout } from "./useAutoLayout";
import { StepNode } from "./StepNode";
import { IfElseNode } from "./IfElseNode";
import { AddStepEdge } from "./AddStepEdge";
import { Button } from "@/components/ui/button";
import { LayoutGrid, Plus, GitFork } from "lucide-react";

const nodeTypes = { stepNode: StepNode, ifElse: IfElseNode };
const edgeTypes = { addStep: AddStepEdge };

interface PipelineCanvasProps {
  steps: PipelineStep[];
  agents: Array<{ id: string; name: string }>;
  members: CompanyMember[];
  agentNames: Record<string, string>;
  memberNames: Record<string, string>;
  onUpdateStepPosition: (stepId: string, positionX: number, positionY: number) => void;
  onUpdateStepDeps: (stepId: string, dependsOn: string[]) => void;
  onDeleteStep: (stepId: string) => void;
  onSelectStep: (stepId: string | null) => void;
  onAddStep: (type: "action" | "if_else") => void;
  onAutoLayout: (positions: Array<{ stepId: string; positionX: number; positionY: number }>) => void;
}

export function PipelineCanvas({
  steps, agentNames, memberNames,
  onUpdateStepPosition, onUpdateStepDeps, onDeleteStep, onSelectStep, onAddStep, onAutoLayout,
}: PipelineCanvasProps) {
  const rawNodes = useMemo(
    () => stepsToNodes(steps, agentNames, memberNames, (id) => onSelectStep(id), onDeleteStep),
    [steps, agentNames, memberNames, onSelectStep, onDeleteStep],
  );
  const rawEdges = useMemo(() => stepsToEdges(steps), [steps]);
  const layoutNodes = useAutoLayout(rawNodes, rawEdges);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rawEdges);

  // Sync when steps change
  useMemo(() => { setNodes(layoutNodes); setEdges(rawEdges); }, [layoutNodes, rawEdges, setNodes, setEdges]);

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, node) => { onUpdateStepPosition(node.id, node.position.x, node.position.y); },
    [onUpdateStepPosition],
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.target) return;
      const targetStep = steps.find((s) => s.id === connection.target);
      if (targetStep) {
        const newDeps = [...new Set([...targetStep.dependsOn, connection.source])];
        onUpdateStepDeps(connection.target, newDeps);
      }
      setEdges((eds) => addEdge({ ...connection, type: "addStep" }, eds));
    },
    [steps, onUpdateStepDeps, setEdges],
  );

  const onNodesDelete: OnNodesDelete = useCallback(
    (deleted) => { for (const node of deleted) onDeleteStep(node.id); },
    [onDeleteStep],
  );

  const handleAutoLayout = useCallback(() => {
    const reLayout = computeFullLayout(nodes, edges);
    setNodes(reLayout);
    onAutoLayout(reLayout.map((n) => ({ stepId: n.id, positionX: n.position.x, positionY: n.position.y })));
  }, [nodes, edges, setNodes, onAutoLayout]);

  return (
    <div className="flex-1 h-full relative">
      <div className="absolute top-3 left-3 z-10 flex gap-1.5">
        <Button size="sm" variant="outline" onClick={() => onAddStep("action")}>
          <Plus className="h-3.5 w-3.5 mr-1" />Action
        </Button>
        <Button size="sm" variant="outline" onClick={() => onAddStep("if_else")}>
          <GitFork className="h-3.5 w-3.5 mr-1" />If/Else
        </Button>
        <Button size="sm" variant="ghost" onClick={handleAutoLayout}>
          <LayoutGrid className="h-3.5 w-3.5 mr-1" />Auto-layout
        </Button>
      </div>
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop} onConnect={onConnect} onNodesDelete={onNodesDelete}
        onNodeClick={(_e, node) => onSelectStep(node.id)}
        onPaneClick={() => onSelectStep(null)}
        nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        fitView fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode="Delete" className="bg-background"
      >
        <Background gap={20} size={1} className="!bg-muted/30" />
        <Controls className="!bg-card !border-border !shadow-sm" />
        <MiniMap className="!bg-card !border-border" />
      </ReactFlow>
    </div>
  );
}
