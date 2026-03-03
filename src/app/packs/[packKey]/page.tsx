"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";

interface ModuleInfo {
  module_key: string;
  name: string;
  layer: string;
  version?: string;
  load_order: number;
}

interface PackDetail {
  id: string;
  pack_key: string;
  name: string;
  description?: string;
  modules: ModuleInfo[];
  config: Record<string, boolean | string | number>;
}

interface BuildSummary {
  id: string;
  build_number: number;
  generated_at: string;
}

interface BuildResult {
  pack_key: string;
  build_number: number;
  sql_migration: string;
  resolved_manifest: { entities: { table: string }[] };
  runtime_manifest: Record<string, unknown>;
  validation: { ok: boolean; warnings: string[] };
}

interface AvailableModule {
  id: string;
  module_key: string;
  name: string;
  layer: string;
}

interface ExecResult {
  success: boolean;
  tables_created?: string[];
  error?: string;
}

const LAYER_COLORS: Record<string, string> = {
  core: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  ai: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  automation: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  domain: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

export default function PackDetail() {
  const { packKey } = useParams<{ packKey: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const autoBuild = searchParams.get("build") === "true";

  const [pack, setPack] = useState<PackDetail | null>(null);
  const [builds, setBuilds] = useState<BuildSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [buildPhase, setBuildPhase] = useState<string | null>(null);
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availableModules, setAvailableModules] = useState<AvailableModule[]>([]);
  const [showAddModule, setShowAddModule] = useState(false);
  const [configEditing, setConfigEditing] = useState(false);
  const [configDraft, setConfigDraft] = useState<Record<string, boolean | string | number>>({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [activeTab, setActiveTab] = useState<"sql" | "tables">("sql");
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<ExecResult | null>(null);

  const loadPack = useCallback(() => {
    Promise.all([
      fetch(`/api/generator/packs/${packKey}`, { credentials: "include" }).then((r) => r.json()),
      fetch(`/api/generator/packs/${packKey}/builds`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ])
      .then(([packData, buildsData]) => {
        setPack(packData);
        setBuilds(Array.isArray(buildsData) ? buildsData : []);
        setConfigDraft(packData.config || {});
        if (autoBuild && !packData.error) {
          runBuild();
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [packKey, autoBuild]);

  useEffect(() => { loadPack(); }, [loadPack]);

  async function runBuild() {
    setBuilding(true);
    setBuildPhase("Resolving modules...");
    setBuildResult(null);
    setExecResult(null);
    setError(null);
    try {
      setBuildPhase("Generating SQL...");
      const res = await fetch(`/api/generator/packs/${packKey}/build`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Build failed");
        if (data.errors) setError(data.errors.join("; "));
      } else {
        setBuildResult(data);
        setActiveTab("sql");
        const buildsRes = await fetch(`/api/generator/packs/${packKey}/builds`, { credentials: "include" });
        if (buildsRes.ok) setBuilds(await buildsRes.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Build failed");
    } finally {
      setBuilding(false);
      setBuildPhase(null);
    }
  }

  async function executeSql() {
    if (!buildResult) return;
    setExecuting(true);
    setExecResult(null);
    try {
      const res = await fetch(`/api/generator/packs/${packKey}/execute/sql`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, build_number: buildResult.build_number }),
      });
      const data = await res.json();
      setExecResult(data);
    } catch (e) {
      setExecResult({ success: false, error: e instanceof Error ? e.message : "Failed" });
    } finally {
      setExecuting(false);
    }
  }

  async function handleDeletePack() {
    if (!confirm(`Delete pack "${pack?.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/generator/packs/${packKey}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        router.push("/");
      } else {
        const data = await res.json();
        setError(data.error || "Delete failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function loadAvailableModules() {
    try {
      const res = await fetch("/api/generator/modules", { credentials: "include" });
      if (res.ok) {
        const mods = await res.json();
        setAvailableModules(mods);
      }
    } catch { /* ignore */ }
  }

  async function handleAddModule(moduleKey: string) {
    setError(null);
    try {
      const res = await fetch(`/api/generator/packs/${packKey}/modules`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module_key: moduleKey }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to add module");
      } else {
        setShowAddModule(false);
        loadPack();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add module");
    }
  }

  async function handleRemoveModule(moduleKey: string) {
    if (!confirm(`Remove ${moduleKey} from this pack?`)) return;
    try {
      const res = await fetch(`/api/generator/packs/${packKey}/modules/${moduleKey}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) loadPack();
      else {
        const data = await res.json();
        setError(data.error || "Failed to remove module");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove module");
    }
  }

  async function handleMoveModule(moduleKey: string, direction: "up" | "down") {
    if (!pack) return;
    const idx = pack.modules.findIndex((m) => m.module_key === moduleKey);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= pack.modules.length) return;

    const current = pack.modules[idx];
    const swap = pack.modules[swapIdx];

    await Promise.all([
      fetch(`/api/generator/packs/${packKey}/modules/${current.module_key}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ load_order: swap.load_order }),
      }),
      fetch(`/api/generator/packs/${packKey}/modules/${swap.module_key}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ load_order: current.load_order }),
      }),
    ]);
    loadPack();
  }

  async function handleSaveConfig() {
    setSavingConfig(true);
    setError(null);
    try {
      const res = await fetch(`/api/generator/packs/${packKey}/config`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config_json: configDraft }),
      });
      if (res.ok) {
        setConfigEditing(false);
        loadPack();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to save config");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save config");
    } finally {
      setSavingConfig(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!pack || pack.name === undefined) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/10 p-6 text-center">
        <p className="text-danger">Pack not found: {packKey}</p>
      </div>
    );
  }

  const byLayer = pack.modules.reduce<Record<string, ModuleInfo[]>>((acc, m) => {
    const layer = m.layer || "unknown";
    if (!acc[layer]) acc[layer] = [];
    acc[layer].push(m);
    return acc;
  }, {});

  const includedKeys = new Set(pack.modules.map((m) => m.module_key));
  const filteredAvailable = availableModules.filter((m) => !includedKeys.has(m.module_key));

  const hasPriorBuilds = builds.length > 0;
  const buildButtonLabel = building
    ? (buildPhase || "Building...")
    : hasPriorBuilds && !buildResult
      ? "Rebuild"
      : "Build";

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <a href="/" className="text-muted hover:text-foreground text-sm">&larr; Packs</a>
          </div>
          <h1 className="mt-2 text-2xl font-semibold">{pack.name}</h1>
          <p className="text-xs font-mono text-muted">{pack.pack_key}</p>
          {pack.description && <p className="mt-1 text-sm text-muted">{pack.description}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowAddModule(!showAddModule); if (!showAddModule) loadAvailableModules(); }}
            className="rounded-md border border-card-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/10"
          >
            Add Module
          </button>
          <a
            href={`/packs/${packKey}/schema`}
            className="rounded-md border border-card-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/10"
          >
            Schema
          </a>
          <button
            onClick={runBuild}
            disabled={building}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {buildButtonLabel}
          </button>
          <button
            onClick={handleDeletePack}
            className="rounded-md border border-danger/30 px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
          >
            Delete
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-danger/30 bg-danger/10 p-4">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {/* Add Module Dropdown */}
      {showAddModule && (
        <div className="mb-6 rounded-lg border border-card-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Add Module to Pack</h3>
          {filteredAvailable.length === 0 ? (
            <p className="text-xs text-muted">All modules are already included.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filteredAvailable.map((mod) => (
                <button
                  key={mod.module_key}
                  onClick={() => handleAddModule(mod.module_key)}
                  className={`rounded-md border p-3 text-left text-sm transition-colors hover:border-accent/40 ${LAYER_COLORS[mod.layer] || "border-card-border"}`}
                >
                  <span className="font-medium">{mod.name}</span>
                  <span className="ml-2 text-xs font-mono text-muted">{mod.module_key}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Inline Build Output */}
      {buildResult && (
        <div className="mb-8 rounded-lg border border-success/30 bg-success/10 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-success">Build #{buildResult.build_number} Complete</h3>
              <p className="text-sm text-muted mt-1">
                {buildResult.resolved_manifest.entities.length} tables generated
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={executeSql}
                disabled={executing || execResult?.success === true}
                className="rounded-md bg-accent px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {executing ? "Executing..." : execResult?.success ? "SQL Executed" : "Execute SQL"}
              </button>
              <a
                href={`/packs/${packKey}/builds/${buildResult.build_number}`}
                className="rounded-md border border-card-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-card"
              >
                Full Output
              </a>
            </div>
          </div>

          {/* Exec result */}
          {execResult && (
            <div className={`mt-3 rounded-md border p-3 text-xs ${execResult.success ? "border-success/30 bg-success/5 text-success" : "border-danger/30 bg-danger/5 text-danger"}`}>
              {execResult.success
                ? `SQL executed successfully. ${execResult.tables_created?.length || 0} tables created.`
                : `Error: ${execResult.error}`}
            </div>
          )}

          {/* Validation warnings */}
          {buildResult.validation.warnings.length > 0 && (
            <div className="mt-3 text-xs text-warning">
              {buildResult.validation.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          )}

          {/* Mini tabs: SQL Preview / Tables */}
          <div className="mt-4">
            <div className="flex gap-4 border-b border-card-border">
              <button
                onClick={() => setActiveTab("sql")}
                className={`pb-2 text-xs font-medium transition-colors ${activeTab === "sql" ? "border-b-2 border-accent text-accent" : "text-muted hover:text-foreground"}`}
              >
                SQL Preview
              </button>
              <button
                onClick={() => setActiveTab("tables")}
                className={`pb-2 text-xs font-medium transition-colors ${activeTab === "tables" ? "border-b-2 border-accent text-accent" : "text-muted hover:text-foreground"}`}
              >
                Tables ({buildResult.resolved_manifest.entities.length})
              </button>
            </div>
            <div className="mt-3">
              {activeTab === "sql" ? (
                <pre className="max-h-64 overflow-auto rounded-md border border-card-border bg-background p-3 text-xs font-mono text-muted">
                  {buildResult.sql_migration}
                </pre>
              ) : (
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {buildResult.resolved_manifest.entities.map((e) => (
                    <div key={e.table} className="rounded-md border border-card-border bg-background px-3 py-2 text-xs font-mono text-muted">
                      {e.table}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Modules */}
        <div className="lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold">Modules ({pack.modules.length})</h2>
          <div className="space-y-4">
            {Object.entries(byLayer).map(([layer, mods]) => (
              <div key={layer}>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">{layer}</h3>
                <div className="space-y-2">
                  {mods.map((m, idx) => (
                    <div
                      key={m.module_key}
                      className={`rounded-md border px-4 py-3 ${LAYER_COLORS[layer] || "border-card-border bg-card"}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <a
                            href={`/modules/${m.module_key}`}
                            className="text-sm font-medium hover:underline"
                          >
                            {m.name}
                          </a>
                          <span className="ml-2 text-xs font-mono text-muted/70">{m.module_key}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-mono text-muted mr-2">{m.version || "1.0.0"}</span>
                          <button
                            onClick={() => handleMoveModule(m.module_key, "up")}
                            className="rounded p-1 text-xs text-muted hover:text-foreground hover:bg-card"
                            title="Move up"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => handleMoveModule(m.module_key, "down")}
                            className="rounded p-1 text-xs text-muted hover:text-foreground hover:bg-card"
                            title="Move down"
                          >
                            ▼
                          </button>
                          <button
                            onClick={() => handleRemoveModule(m.module_key)}
                            className="rounded p-1 text-xs text-danger/60 hover:text-danger hover:bg-danger/10 ml-1"
                            title="Remove"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar: Config + Build History */}
        <div className="space-y-6">
          {/* Config */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Configuration</h2>
              <button
                onClick={() => {
                  if (configEditing) {
                    setConfigDraft(pack.config || {});
                  }
                  setConfigEditing(!configEditing);
                }}
                className="text-xs text-accent hover:underline"
              >
                {configEditing ? "Cancel" : "Edit"}
              </button>
            </div>
            <div className="rounded-lg border border-card-border bg-card p-4 space-y-3">
              {Object.keys(configDraft).length === 0 && !configEditing ? (
                <p className="text-xs text-muted">No configuration set.</p>
              ) : (
                Object.entries(configDraft).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs text-muted">{key}</span>
                    {configEditing ? (
                      typeof value === "boolean" ? (
                        <button
                          onClick={() => setConfigDraft({ ...configDraft, [key]: !value })}
                          className={`rounded-full px-3 py-0.5 text-xs font-medium ${value ? "bg-success/20 text-success" : "bg-card-border text-muted"}`}
                        >
                          {String(value)}
                        </button>
                      ) : typeof value === "number" ? (
                        <input
                          type="number"
                          value={value}
                          onChange={(e) => setConfigDraft({ ...configDraft, [key]: Number(e.target.value) })}
                          className="w-24 rounded border border-card-border bg-background px-2 py-0.5 text-xs text-right focus:border-accent focus:outline-none"
                        />
                      ) : (
                        <input
                          type="text"
                          value={String(value)}
                          onChange={(e) => setConfigDraft({ ...configDraft, [key]: e.target.value })}
                          className="w-40 rounded border border-card-border bg-background px-2 py-0.5 text-xs text-right focus:border-accent focus:outline-none"
                        />
                      )
                    ) : (
                      <span className={`text-xs font-medium ${value === true ? "text-success" : value === false ? "text-muted" : ""}`}>
                        {String(value)}
                      </span>
                    )}
                  </div>
                ))
              )}
              {configEditing && (
                <button
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                  className="mt-2 w-full rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                >
                  {savingConfig ? "Saving..." : "Save Config"}
                </button>
              )}
            </div>
          </div>

          {/* Build History */}
          <div>
            <h2 className="mb-3 text-lg font-semibold">Build History</h2>
            {builds.length === 0 ? (
              <p className="text-sm text-muted">No builds yet.</p>
            ) : (
              <div className="space-y-2">
                {builds.map((b) => (
                  <a
                    key={b.id}
                    href={`/packs/${packKey}/builds/${b.build_number}`}
                    className="block rounded-md border border-card-border bg-card p-3 transition-colors hover:border-accent/30"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Build #{b.build_number}</span>
                      <span className="text-xs text-muted">
                        {new Date(b.generated_at).toLocaleDateString()}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
