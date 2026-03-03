"use client";

import { useState } from "react";

interface SQLPreviewProps {
  sql: string;
  onGenerate: () => void;
  generating: boolean;
}

export default function SQLPreview({ sql, onGenerate, generating }: SQLPreviewProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`border-t border-card-border bg-card transition-all ${expanded ? "h-80" : "h-10"}`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-card-border/50">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-semibold uppercase tracking-wider text-muted hover:text-foreground"
        >
          SQL Preview {expanded ? "▾" : "▴"}
        </button>
        <button
          onClick={onGenerate}
          disabled={generating}
          className="rounded bg-accent/80 px-3 py-0.5 text-[10px] font-medium text-white hover:bg-accent disabled:opacity-50"
        >
          {generating ? "..." : "Generate SQL"}
        </button>
      </div>
      {expanded && (
        <pre className="h-full overflow-auto p-3 text-xs font-mono text-muted sql-preview">
          {sql || "Click 'Generate SQL' to preview the migration output."}
        </pre>
      )}
    </div>
  );
}
