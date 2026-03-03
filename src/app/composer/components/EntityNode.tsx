"use client";

import { Handle, Position } from "@xyflow/react";

interface EntityNodeData {
  label: string;
  table: string;
  fields: { name: string; type: string; pk?: boolean }[];
  [key: string]: unknown;
}

export default function EntityNode({ data }: { data: EntityNodeData }) {
  return (
    <div className="rounded-lg border border-card-border bg-card min-w-[180px] shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-accent !w-2 !h-2" />

      <div className="px-3 py-2 border-b border-card-border bg-accent/5">
        <div className="text-xs font-semibold">{data.label}</div>
        <div className="text-[10px] font-mono text-muted">{data.table}</div>
      </div>

      <div className="px-3 py-1.5 space-y-0.5">
        {(data.fields || []).slice(0, 8).map((f) => (
          <div key={f.name} className="flex items-center justify-between text-[10px]">
            <span className={f.pk ? "font-bold" : "text-muted"}>
              {f.pk ? "🔑 " : ""}{f.name}
            </span>
            <span className="font-mono text-muted/60">{f.type}</span>
          </div>
        ))}
        {(data.fields || []).length > 8 && (
          <div className="text-[10px] text-muted">+{data.fields.length - 8} more</div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!bg-accent !w-2 !h-2" />
    </div>
  );
}
