"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Module {
  id: string;
  module_key: string;
  name: string;
  layer: string;
  description?: string;
  version?: string;
}

interface VersionDetail {
  id: string;
  version: string;
  blueprint_json: Record<string, unknown>;
  created_at: string;
}

const LAYER_ORDER = ["core", "ai", "automation", "domain"];
const LAYER_STYLES: Record<string, string> = {
  core: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  ai: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  automation: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  domain: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
};

export default function ModuleBrowser() {
  const router = useRouter();
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [versionDetail, setVersionDetail] = useState<VersionDetail[] | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ module_key: "", name: "", layer: "domain", description: "" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/generator/modules", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 401 ? "Please sign in" : "Failed to load modules");
        return res.json();
      })
      .then((data) => setModules(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function toggleExpand(moduleKey: string) {
    if (expanded === moduleKey) {
      setExpanded(null);
      setVersionDetail(null);
      return;
    }
    setExpanded(moduleKey);
    setVersionDetail(null);
    try {
      const res = await fetch(`/api/generator/modules/${moduleKey}/versions`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setVersionDetail(Array.isArray(data) ? data : []);
      }
    } catch {
      // Silently fail
    }
  }

  async function handleCreateModule(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.module_key || !createForm.name) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/generator/modules", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create module");
      }
      setShowCreateForm(false);
      setCreateForm({ module_key: "", name: "", layer: "domain", description: "" });
      // Refresh
      const modsRes = await fetch("/api/generator/modules", { credentials: "include" });
      if (modsRes.ok) {
        const refreshed = await modsRes.json();
        setModules(Array.isArray(refreshed) ? refreshed : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/10 p-6 text-center">
        <p className="text-danger">{error}</p>
      </div>
    );
  }

  const byLayer = modules.reduce<Record<string, Module[]>>((acc, m) => {
    const layer = m.layer || "unknown";
    if (!acc[layer]) acc[layer] = [];
    acc[layer].push(m);
    return acc;
  }, {});

  const sortedLayers = Object.keys(byLayer).sort(
    (a, b) => (LAYER_ORDER.indexOf(a) ?? 99) - (LAYER_ORDER.indexOf(b) ?? 99)
  );

  return (
    <div>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Blueprint Modules</h1>
          <p className="mt-1 text-sm text-muted">
            {modules.length} modules across {sortedLayers.length} layers. Use <strong>Open Editor</strong> to author blueprint JSON, or ▸ to preview.
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="rounded-md border border-card-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/10 hover:border-accent/30"
        >
          Create Module
        </button>
      </div>

      {showCreateForm && (
        <form onSubmit={handleCreateModule} className="mb-6 rounded-lg border border-card-border bg-card p-5 space-y-4">
          <h3 className="font-semibold">New Module</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Module Key</label>
              <input
                type="text"
                value={createForm.module_key}
                onChange={(e) => setCreateForm({ ...createForm, module_key: e.target.value })}
                placeholder="domain.my_module"
                className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Name</label>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="My Module"
                className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Layer</label>
              <select
                value={createForm.layer}
                onChange={(e) => setCreateForm({ ...createForm, layer: e.target.value })}
                className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
              >
                <option value="core">Core</option>
                <option value="ai">AI</option>
                <option value="automation">Automation</option>
                <option value="domain">Domain</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Description</label>
            <input
              type="text"
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              placeholder="Optional description"
              className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="rounded-md border border-card-border px-4 py-2 text-sm font-medium transition-colors hover:bg-card"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-8">
        {sortedLayers.map((layer) => (
          <div key={layer}>
            <div className="mb-3 flex items-center gap-2">
              <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wider border ${LAYER_STYLES[layer] || "border-card-border"}`}>
                {layer}
              </span>
              <span className="text-xs text-muted">{byLayer[layer].length} modules</span>
            </div>
            <div className="space-y-2">
              {byLayer[layer].map((mod) => (
                <div key={mod.module_key}>
                  <div className="w-full rounded-lg border border-card-border bg-card p-4 transition-colors hover:border-accent/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium">{mod.name}</span>
                        <span className="ml-2 text-xs font-mono text-muted">{mod.module_key}</span>
                        <a
                          href={`/modules/${mod.module_key}`}
                          className="ml-2 rounded border border-accent/20 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent hover:bg-accent/20"
                        >
                          Open Editor
                        </a>
                      </div>
                      <div className="flex items-center gap-2">
                        {mod.version && <span className="text-xs font-mono text-muted">{mod.version}</span>}
                        <button
                          onClick={() => toggleExpand(mod.module_key)}
                          className="text-muted text-xs hover:text-foreground"
                          title="Preview blueprint JSON"
                        >
                          {expanded === mod.module_key ? "▾" : "▸"}
                        </button>
                      </div>
                    </div>
                    {mod.description && (
                      <p className="mt-1 text-xs text-muted">{mod.description}</p>
                    )}
                  </div>

                  {expanded === mod.module_key && (
                    <div className="ml-4 mt-2 rounded-lg border border-card-border bg-card p-4">
                      {versionDetail === null ? (
                        <p className="text-xs text-muted">Loading...</p>
                      ) : versionDetail.length === 0 ? (
                        <p className="text-xs text-muted">No versions found.</p>
                      ) : (
                        <div className="space-y-3">
                          {versionDetail.map((v) => (
                            <div key={v.id}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium">v{v.version}</span>
                                <span className="text-xs text-muted">{new Date(v.created_at).toLocaleDateString()}</span>
                              </div>
                              <pre className="text-xs overflow-x-auto bg-background rounded p-3 border border-card-border max-h-96 overflow-y-auto">
                                {JSON.stringify(
                                  typeof v.blueprint_json === "string" ? JSON.parse(v.blueprint_json) : v.blueprint_json,
                                  null,
                                  2
                                )}
                              </pre>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
