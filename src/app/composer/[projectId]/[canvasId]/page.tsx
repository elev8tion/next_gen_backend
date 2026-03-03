"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import ModulePalette from "../../components/ModulePalette";
import CanvasView from "../../components/CanvasView";
import PropertiesPanel from "../../components/PropertiesPanel";
import ValidationPanel from "../../components/ValidationPanel";
import SQLPreview from "../../components/SQLPreview";

interface VersionData {
  id: string;
  module_key: string;
  blueprint_json: {
    module: { key: string; name: string; layer: string };
    entities?: { name: string; table: string; fields: { name: string; type: string; pk?: boolean }[] }[];
    dependencies?: { module_key: string }[];
  };
}

export default function CanvasEditor() {
  const { projectId, canvasId } = useParams<{ projectId: string; canvasId: string }>();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [validating, setValidating] = useState(false);
  const [sql, setSql] = useState("");
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load existing canvas data
  useEffect(() => {
    fetch(`/api/composer/canvases/${canvasId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.nodes && Array.isArray(data.nodes)) {
          const restored: Node[] = data.nodes.map((n: { id: string; node_type: string; module_key: string; position_x: number; position_y: number; data_json: Record<string, unknown> }) => ({
            id: n.id,
            type: n.node_type || "module",
            position: { x: n.position_x || 0, y: n.position_y || 0 },
            data: n.data_json || { label: n.module_key, module_key: n.module_key, layer: "domain", entities: [] },
          }));
          setNodes(restored);
        }
        if (data.edges && Array.isArray(data.edges)) {
          const restored: Edge[] = data.edges.map((e: { id: string; source_node_id: string; target_node_id: string; edge_type: string }) => ({
            id: e.id,
            source: e.source_node_id,
            target: e.target_node_id,
            type: e.edge_type || "default",
          }));
          setEdges(restored);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [canvasId, setNodes, setEdges]);

  // Auto-save debounced
  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => {
      const updates = nodes.map((n) => ({
        id: n.id,
        position_x: Math.round(n.position.x),
        position_y: Math.round(n.position.y),
      }));
      fetch(`/api/composer/canvases/${canvasId}/nodes`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      }).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, [nodes, canvasId, loading]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds));
      // Persist edge
      fetch(`/api/composer/canvases/${canvasId}/edges`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_node_id: connection.source,
          target_node_id: connection.target,
          edge_type: "relationship",
        }),
      }).catch(() => {});
    },
    [canvasId, setEdges]
  );

  const handleNodeClick = useCallback((node: Node) => {
    setSelectedNode(node);
  }, []);

  async function addModuleToCanvas(moduleKey: string, name: string, layer: string, x?: number, y?: number) {
    // Fetch module blueprint for entity list
    let entities: string[] = [];
    try {
      const res = await fetch(`/api/generator/modules/${moduleKey}/versions`, { credentials: "include" });
      if (res.ok) {
        const versions: VersionData[] = await res.json();
        if (versions.length > 0) {
          const bp = typeof versions[0].blueprint_json === "string"
            ? JSON.parse(versions[0].blueprint_json as unknown as string)
            : versions[0].blueprint_json;
          entities = (bp.entities || []).map((e: { name: string }) => e.name);
        }
      }
    } catch { /* ignore */ }

    const posX = x ?? 100 + nodes.length * 250;
    const posY = y ?? 100;

    const nodeData = {
      label: name,
      module_key: moduleKey,
      layer,
      entities,
    };

    // Create in DB
    const createRes = await fetch(`/api/composer/canvases/${canvasId}/nodes`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        node_type: "module",
        module_key: moduleKey,
        position_x: posX,
        position_y: posY,
        data_json: nodeData,
      }),
    });
    const created = await createRes.json();

    const newNode: Node = {
      id: created.id || `temp-${Date.now()}`,
      type: "module",
      position: { x: posX, y: posY },
      data: nodeData,
    };

    setNodes((prev) => [...prev, newNode]);
  }

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const data = event.dataTransfer.getData("application/json");
      if (!data) return;
      try {
        const mod = JSON.parse(data);
        const bounds = (event.target as HTMLElement).closest(".react-flow")?.getBoundingClientRect();
        const x = bounds ? event.clientX - bounds.left : event.clientX;
        const y = bounds ? event.clientY - bounds.top : event.clientY;
        addModuleToCanvas(mod.module_key, mod.name, mod.layer, x, y);
      } catch { /* ignore */ }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canvasId, nodes]
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  async function handleValidate() {
    setValidating(true);
    // Client-side validation of all module nodes
    const errs: string[] = [];
    const warns: string[] = [];
    const moduleNodes = nodes.filter((n) => n.type === "module");
    if (moduleNodes.length === 0) errs.push("No modules on canvas");
    // Check for dependency edges
    for (const node of moduleNodes) {
      const hasIncoming = edges.some((e) => e.target === node.id);
      const hasOutgoing = edges.some((e) => e.source === node.id);
      if (!hasIncoming && !hasOutgoing && moduleNodes.length > 1) {
        warns.push(`Module "${(node.data as { label?: string }).label}" has no connections`);
      }
    }
    setErrors(errs);
    setWarnings(warns);
    setValidating(false);
  }

  async function handleGenerateSQL() {
    setGenerating(true);
    setSql("// SQL generation requires a pack with these modules.\n// Use the Pack Builder to create a pack from these modules, then build.");
    setGenerating(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] -mx-6 -my-8">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-card-border bg-card">
        <div className="flex items-center gap-3">
          <a href="/composer" className="text-xs text-muted hover:text-foreground">&larr; Projects</a>
          <span className="text-xs text-muted">Canvas</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>{nodes.length} nodes</span>
          <span>{edges.length} edges</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - Module Palette */}
        <div className="w-[250px] border-r border-card-border bg-card overflow-hidden">
          <ModulePalette onDragModule={addModuleToCanvas} />
        </div>

        {/* Center - Canvas */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1">
            <CanvasView
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={handleNodeClick}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            />
          </div>
          <SQLPreview sql={sql} onGenerate={handleGenerateSQL} generating={generating} />
        </div>

        {/* Right sidebar - Properties + Validation */}
        <div className="w-[300px] border-l border-card-border bg-card flex flex-col">
          <div className="flex-1 overflow-hidden">
            <PropertiesPanel selectedNode={selectedNode as { id: string; data: { label: string; module_key: string; layer: string; entities: string[] } } | null} />
          </div>
          <ValidationPanel
            errors={errors}
            warnings={warnings}
            onValidate={handleValidate}
            validating={validating}
          />
        </div>
      </div>
    </div>
  );
}
