"use client";

interface PropertiesPanelProps {
  selectedNode: {
    id: string;
    data: {
      label: string;
      module_key: string;
      layer: string;
      entities: string[];
      [key: string]: unknown;
    };
  } | null;
}

export default function PropertiesPanel({ selectedNode }: PropertiesPanelProps) {
  if (!selectedNode) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <p className="text-xs text-muted text-center">Select a node to view properties</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Properties</h3>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-muted mb-1">Name</label>
          <div className="text-sm font-medium">{selectedNode.data.label}</div>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Module Key</label>
          <div className="text-xs font-mono">{selectedNode.data.module_key}</div>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Layer</label>
          <div className="text-xs">{selectedNode.data.layer}</div>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Entities ({selectedNode.data.entities?.length || 0})</label>
          <div className="space-y-1">
            {(selectedNode.data.entities || []).map((e: string) => (
              <div key={e} className="rounded border border-card-border bg-card px-2 py-1 text-xs font-mono">
                {e}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-card-border">
        <a
          href={`/modules/${selectedNode.data.module_key}`}
          className="text-xs text-accent hover:underline"
        >
          Open in Module Editor →
        </a>
      </div>
    </div>
  );
}
