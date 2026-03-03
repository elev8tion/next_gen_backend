"use client";

import { useCallback } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ModuleNode from "./ModuleNode";
import EntityNode from "./EntityNode";

const nodeTypes = {
  module: ModuleNode,
  entity: EntityNode,
};

interface CanvasViewProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  onNodeClick: (node: Node) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
}

export default function CanvasView({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onDrop,
  onDragOver,
}: CanvasViewProps) {
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => onNodeClick(node),
    [onNodeClick]
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        className="bg-background"
      >
        <Controls className="!bg-card !border-card-border !shadow-none [&>button]:!bg-card [&>button]:!border-card-border [&>button]:!text-muted" />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--color-card-border)" />
      </ReactFlow>
    </div>
  );
}
