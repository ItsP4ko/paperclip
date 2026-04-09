import { useMemo } from "react";
import dagre from "dagre";
import type { Node, Edge } from "@xyflow/react";

const NODE_WIDTH = 280;
const NODE_HEIGHT = 80;
const IF_ELSE_HEIGHT = 60;

export function useAutoLayout(nodes: Node[], edges: Edge[]): Node[] {
  return useMemo(() => {
    const needsLayout = nodes.some((n) => n.position.x === 0 && n.position.y === 0);
    if (!needsLayout) return nodes;

    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 100 });
    g.setDefaultEdgeLabel(() => ({}));

    for (const node of nodes) {
      const height = node.type === "ifElse" ? IF_ELSE_HEIGHT : NODE_HEIGHT;
      g.setNode(node.id, { width: NODE_WIDTH, height });
    }
    for (const edge of edges) {
      g.setEdge(edge.source, edge.target);
    }
    dagre.layout(g);

    return nodes.map((node) => {
      if (node.position.x !== 0 || node.position.y !== 0) return node;
      const np = g.node(node.id);
      if (!np) return node;
      const height = node.type === "ifElse" ? IF_ELSE_HEIGHT : NODE_HEIGHT;
      return { ...node, position: { x: np.x - NODE_WIDTH / 2, y: np.y - height / 2 } };
    });
  }, [nodes, edges]);
}

export function computeFullLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 100 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    const height = node.type === "ifElse" ? IF_ELSE_HEIGHT : NODE_HEIGHT;
    g.setNode(node.id, { width: NODE_WIDTH, height });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }
  dagre.layout(g);

  return nodes.map((node) => {
    const np = g.node(node.id);
    if (!np) return node;
    const height = node.type === "ifElse" ? IF_ELSE_HEIGHT : NODE_HEIGHT;
    return { ...node, position: { x: np.x - NODE_WIDTH / 2, y: np.y - height / 2 } };
  });
}
