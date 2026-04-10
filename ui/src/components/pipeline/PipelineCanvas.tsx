import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Edge,
  type Connection,
  type OnNodeDrag,
  type OnConnect,
  type OnNodesDelete,
  type OnConnectEnd,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { PipelineStep, PipelineRunStep } from "../../api/pipelines";
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
  onAddStepBetween: (sourceId: string, targetId: string) => void;
  onAddStepFromNode: (sourceNodeId: string) => void;
  onUnlinkSteps: (sourceId: string, targetId: string) => void;
  onAutoLayout: (positions: Array<{ stepId: string; positionX: number; positionY: number }>) => void;
  runMode?: boolean;
  runSteps?: PipelineRunStep[];
  currentUserId?: string | null;
  onCompleteStep?: (runStepId: string) => void;
  shakingNodeIds?: Set<string>;
}

const noop = () => {};

export function PipelineCanvas({
  steps, agentNames, memberNames,
  onUpdateStepPosition, onUpdateStepDeps, onDeleteStep, onSelectStep, onAddStep, onAddStepBetween, onAddStepFromNode, onUnlinkSteps, onAutoLayout,
  runMode, runSteps, currentUserId, onCompleteStep, shakingNodeIds,
}: PipelineCanvasProps) {
  const connectingNodeId = useRef<string | null>(null);

  const runStepMap = useMemo(() => {
    if (!runSteps) return new Map<string, PipelineRunStep>();
    return new Map(runSteps.map(rs => [rs.pipelineStepId, rs]));
  }, [runSteps]);

  const rawNodes = useMemo(() => {
    const base = stepsToNodes(
      steps, agentNames, memberNames,
      runMode ? noop : (id) => onSelectStep(id),
      runMode ? noop : onDeleteStep,
    ).map(node => ({
      ...node,
      data: { ...node.data, shake: shakingNodeIds?.has(node.id) },
    }));
    if (!runMode) return base;
    return base.map(node => {
      const rs = runStepMap.get(node.id);
      if (!rs) return node;
      return {
        ...node,
        data: {
          ...node.data,
          runStatus: rs.status,
          canComplete: rs.status === "running" && rs.assigneeType === "user" && rs.assigneeUserId === currentUserId,
          onComplete: onCompleteStep ? () => onCompleteStep(rs.id) : undefined,
        },
        className:
          rs.status === "running"
            ? "ring-2 ring-blue-500 rounded-lg animate-pulse"
            : rs.status === "completed"
              ? "ring-2 ring-green-500 rounded-lg"
              : rs.status === "failed"
                ? "ring-2 ring-destructive rounded-lg"
                : rs.status === "skipped"
                  ? "opacity-40"
                  : "",
      };
    });
  }, [steps, agentNames, memberNames, onSelectStep, onDeleteStep, runMode, runStepMap, currentUserId, onCompleteStep, shakingNodeIds]);

  const rawEdges: Edge[] = useMemo(() => {
    const edges = stepsToEdges(steps);
    if (runMode) {
      return edges.map(e => ({ ...e, type: "smoothstep", style: { stroke: '#6b7280', strokeWidth: 1.5 }, animated: true }));
    }
    return edges.map(e => ({
      ...e,
      data: {
        onAddStep: (sourceId: string, targetId: string) => onAddStepBetween(sourceId, targetId),
        onUnlink: (sourceId: string, targetId: string) => onUnlinkSteps(sourceId, targetId),
      },
    }));
  }, [steps, runMode, onAddStepBetween, onUnlinkSteps]);

  const layoutNodes = useAutoLayout(rawNodes, rawEdges);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rawEdges);

  const handleEdgesChange: typeof onEdgesChange = useCallback((changes) => {
    onEdgesChange(changes.filter(c => c.type !== 'remove'));
  }, [onEdgesChange]);

  const prevStepIdsRef = useRef<string>("");
  useEffect(() => {
    const stepKey = steps.map(s => `${s.id}:${s.name}:${s.stepType}:${s.assigneeType}:${s.dependsOn.join(",")}`).join("|");
    const runKey = runSteps?.map(rs => `${rs.pipelineStepId}:${rs.status}`).join("|") ?? "";
    const fullKey = `${stepKey}||${runKey}||${runMode ? "run" : "edit"}`;
    if (fullKey !== prevStepIdsRef.current) {
      prevStepIdsRef.current = fullKey;
      setNodes(layoutNodes);
      setEdges(rawEdges);
    }
  }, [layoutNodes, rawEdges, setNodes, setEdges, steps, runSteps]);

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, node) => { onUpdateStepPosition(node.id, node.position.x, node.position.y); },
    [onUpdateStepPosition],
  );

  const onConnectStart = useCallback(
    (_event: MouseEvent | TouchEvent, params: { nodeId: string | null }) => {
      connectingNodeId.current = params.nodeId;
    },
    [],
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      connectingNodeId.current = null;
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

  const onConnectEnd: OnConnectEnd = useCallback(
    (event) => {
      if (!connectingNodeId.current) return;
      const targetIsPane = (event.target as HTMLElement)?.classList?.contains("react-flow__pane");
      if (targetIsPane) {
        onAddStepFromNode(connectingNodeId.current);
      }
      connectingNodeId.current = null;
    },
    [onAddStepFromNode],
  );

  const onNodesDelete: OnNodesDelete = useCallback(
    (deleted) => { for (const node of deleted) onDeleteStep(node.id); },
    [onDeleteStep],
  );

  const handleAutoLayout = useCallback(() => {
    const reLayout = computeFullLayout(nodes, edges);
    setNodes(reLayout.map(n => ({
      ...n,
      style: { ...n.style, transition: "all 0.5s ease" },
    })));
    setTimeout(() => {
      setNodes(prev => prev.map(n => ({
        ...n,
        style: { ...n.style, transition: undefined },
      })));
    }, 600);
    onAutoLayout(reLayout.map(n => ({ stepId: n.id, positionX: n.position.x, positionY: n.position.y })));
  }, [nodes, edges, setNodes, onAutoLayout]);

  return (
    <div className="flex-1 h-full relative">
      {!runMode && (
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
      )}
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={runMode ? onEdgesChange : handleEdgesChange}
        onNodeDragStop={runMode ? undefined : onNodeDragStop}
        onConnectStart={runMode ? undefined : onConnectStart}
        onConnect={runMode ? undefined : onConnect}
        onConnectEnd={runMode ? undefined : onConnectEnd}
        onNodesDelete={runMode ? undefined : onNodesDelete}
        onNodeClick={runMode ? undefined : (_e, node) => onSelectStep(node.id)}
        onPaneClick={runMode ? undefined : () => onSelectStep(null)}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={!runMode}
        nodesConnectable={!runMode}
        fitView fitViewOptions={{ padding: 0.2 }}
        snapToGrid={!runMode} snapGrid={[20, 20]}
        deleteKeyCode={runMode ? null : "Delete"}
        className="bg-background"
      >
        <Background gap={20} size={1} className="!bg-muted/30" />
        <Controls className="!bg-card !border-border !shadow-sm" />
        {!runMode && <MiniMap className="!bg-card !border-border" />}
      </ReactFlow>
    </div>
  );
}
