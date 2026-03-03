"use client";

import { useState, useEffect } from "react";

interface PaletteModule {
  module_key: string;
  name: string;
  layer: string;
}

const LAYER_STYLES: Record<string, string> = {
  core: "border-blue-500/30 text-blue-400",
  ai: "border-purple-500/30 text-purple-400",
  automation: "border-amber-500/30 text-amber-400",
  domain: "border-emerald-500/30 text-emerald-400",
};

const LAYER_ORDER = ["core", "ai", "automation", "domain"];

export default function ModulePalette({
  onDragModule,
}: {
  onDragModule: (moduleKey: string, name: string, layer: string) => void;
}) {
  const [modules, setModules] = useState<PaletteModule[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/generator/modules", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setModules(data); })
      .catch(() => {});
  }, []);

  const byLayer = modules.reduce<Record<string, PaletteModule[]>>((acc, m) => {
    const layer = m.layer || "unknown";
    if (!acc[layer]) acc[layer] = [];
    acc[layer].push(m);
    return acc;
  }, {});

  const sortedLayers = Object.keys(byLayer).sort(
    (a, b) => (LAYER_ORDER.indexOf(a) ?? 99) - (LAYER_ORDER.indexOf(b) ?? 99)
  );

  return (
    <div className="h-full overflow-y-auto p-3 space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Module Palette</h3>
      {sortedLayers.map((layer) => (
        <div key={layer}>
          <button
            onClick={() => setCollapsed({ ...collapsed, [layer]: !collapsed[layer] })}
            className="flex w-full items-center justify-between text-xs font-medium uppercase tracking-wider text-muted mb-2"
          >
            <span>{layer} ({byLayer[layer].length})</span>
            <span>{collapsed[layer] ? "+" : "-"}</span>
          </button>
          {!collapsed[layer] && (
            <div className="space-y-1">
              {byLayer[layer].map((mod) => (
                <div
                  key={mod.module_key}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/json", JSON.stringify(mod));
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => onDragModule(mod.module_key, mod.name, mod.layer)}
                  className={`cursor-grab rounded border px-3 py-2 text-xs transition-colors hover:bg-accent/5 ${LAYER_STYLES[layer] || "border-card-border"}`}
                >
                  <div className="font-medium">{mod.name}</div>
                  <div className="text-muted/70 font-mono text-[10px]">{mod.module_key}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
