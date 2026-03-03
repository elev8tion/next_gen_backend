"use client";

import { Handle, Position } from "@xyflow/react";

const LAYER_COLORS: Record<string, { bg: string; border: string; badge: string }> = {
  core: { bg: "bg-blue-500/5", border: "border-blue-500/30", badge: "bg-blue-500/20 text-blue-400" },
  ai: { bg: "bg-purple-500/5", border: "border-purple-500/30", badge: "bg-purple-500/20 text-purple-400" },
  automation: { bg: "bg-amber-500/5", border: "border-amber-500/30", badge: "bg-amber-500/20 text-amber-400" },
  domain: { bg: "bg-emerald-500/5", border: "border-emerald-500/30", badge: "bg-emerald-500/20 text-emerald-400" },
};

interface ModuleNodeData {
  label: string;
  module_key: string;
  layer: string;
  entities: string[];
  [key: string]: unknown;
}

export default function ModuleNode({ data }: { data: ModuleNodeData }) {
  const colors = LAYER_COLORS[data.layer] || LAYER_COLORS.domain;

  return (
    <div className={`rounded-lg border-2 ${colors.border} ${colors.bg} min-w-[200px] shadow-sm`}>
      <Handle type="target" position={Position.Left} className="!bg-accent !w-2 !h-2" />

      <div className="px-3 py-2 border-b border-card-border/30">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">{data.label}</span>
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${colors.badge}`}>
            {data.layer}
          </span>
        </div>
        <div className="text-[10px] font-mono text-muted">{data.module_key}</div>
      </div>

      {data.entities && data.entities.length > 0 && (
        <div className="px-3 py-2 space-y-1">
          {data.entities.map((entity: string) => (
            <div key={entity} className="flex items-center text-[10px] text-muted">
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-accent/50" />
              {entity}
            </div>
          ))}
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!bg-accent !w-2 !h-2" />
    </div>
  );
}
