"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Entity {
  module_key: string;
  name: string;
  table: string;
  fields: { name: string; type: string; pk?: boolean }[];
  indexes: { name: string; columns: string[]; unique?: boolean }[];
}

interface BuildData {
  id: string;
  build_number: number;
  resolved_manifest: {
    entities: Entity[];
    relationships: { name: string; from_table: string; to_table: string }[];
    events: { name: string; trigger: string }[];
    ai_capabilities: { name: string; type: string }[];
    module_versions: Record<string, string>;
  };
  sql_migration: string;
  runtime_manifest: {
    event_catalog: { name: string }[];
    ai_capability_registry: Record<string, { name: string }[]>;
    workflow_subscriptions: string[];
    rule_triggers: string[];
  };
  generated_at: string;
}

type Tab = "sql" | "manifest" | "runtime";

export default function BuildOutput() {
  const { packKey, buildId } = useParams<{ packKey: string; buildId: string }>();
  const [build, setBuild] = useState<BuildData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("sql");
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<{ success: boolean; tables_created?: string[]; error?: string } | null>(null);

  useEffect(() => {
    fetch(`/api/generator/packs/${packKey}/builds`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load builds");
        const buildsRaw = await res.json();
        const builds = Array.isArray(buildsRaw) ? buildsRaw : [];
        // Find the specific build - buildId is the build_number
        const match = builds.find((b: { build_number: number; id: string }) =>
          String(b.build_number) === buildId || b.id === buildId
        );
        if (!match) throw new Error(`Build #${buildId} not found`);
        // Fetch full build data
        const fullRes = await fetch(`/api/data/read/pack_builds?id=eq.${match.id}`, { credentials: "include" });
        if (!fullRes.ok) throw new Error("Failed to load build details");
        const fullRaw = await fullRes.json();
        const full = Array.isArray(fullRaw) ? fullRaw : Array.isArray(fullRaw?.data) ? fullRaw.data : Array.isArray(fullRaw?.rows) ? fullRaw.rows : [];
        if (full.length) {
          const b = full[0];
          b.resolved_manifest = typeof b.resolved_manifest === "string" ? JSON.parse(b.resolved_manifest) : b.resolved_manifest;
          b.runtime_manifest = typeof b.runtime_manifest === "string" ? JSON.parse(b.runtime_manifest) : b.runtime_manifest;
          setBuild(b);
        } else {
          throw new Error("Build data not found");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [packKey, buildId]);

  async function executeSql() {
    if (!build) return;
    setExecuting(true);
    setExecResult(null);
    try {
      const res = await fetch(`/api/generator/packs/${packKey}/execute/sql`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, build_number: build.build_number }),
      });
      const data = await res.json();
      setExecResult(data);
    } catch (e) {
      setExecResult({ success: false, error: e instanceof Error ? e.message : "Failed" });
    } finally {
      setExecuting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error || !build) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/10 p-6 text-center">
        <p className="text-danger">{error || "Build not found"}</p>
      </div>
    );
  }

  const manifest = build.resolved_manifest;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <a href={`/packs/${packKey}`} className="text-sm text-muted hover:text-foreground">&larr; Back to pack</a>
          <h1 className="mt-2 text-2xl font-semibold">Build #{build.build_number}</h1>
          <p className="text-xs text-muted">
            Generated {new Date(build.generated_at).toLocaleString()} &middot;{" "}
            {manifest.entities.length} tables &middot;{" "}
            {Object.keys(manifest.module_versions).length} modules
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const blob = new Blob([build.sql_migration], { type: "text/sql" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${packKey}_build_${build.build_number}.sql`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="rounded-md border border-card-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/10"
          >
            Download SQL
          </button>
          <button
            onClick={executeSql}
            disabled={executing}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {executing ? "Executing..." : "Execute SQL"}
          </button>
        </div>
      </div>

      {execResult && (
        <div className={`mb-6 rounded-lg border p-4 ${execResult.success ? "border-success/30 bg-success/10" : "border-danger/30 bg-danger/10"}`}>
          {execResult.success ? (
            <div>
              <p className="font-medium text-success">SQL executed successfully</p>
              {execResult.tables_created && (
                <p className="mt-1 text-xs text-muted">{execResult.tables_created.length} tables created</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-danger">{execResult.error}</p>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-card-border">
        {(["sql", "manifest", "runtime"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t === "sql" ? "SQL Migration" : t === "manifest" ? "Resolved Manifest" : "Runtime Manifest"}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "sql" && (
        <div className="rounded-lg border border-card-border bg-card p-4 overflow-x-auto">
          <pre className="sql-preview whitespace-pre text-foreground/90">{build.sql_migration}</pre>
        </div>
      )}

      {tab === "manifest" && (
        <div className="space-y-6">
          {/* Entity summary */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">Entities ({manifest.entities.length})</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {manifest.entities.map((e) => (
                <div key={e.table} className="rounded-md border border-card-border bg-card p-3">
                  <p className="text-sm font-medium">{e.name}</p>
                  <p className="text-xs font-mono text-muted">{e.table}</p>
                  <p className="mt-1 text-xs text-muted">{e.fields.length} fields, {e.indexes.length} indexes</p>
                </div>
              ))}
            </div>
          </div>

          {/* Relationships */}
          {manifest.relationships.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold">Relationships ({manifest.relationships.length})</h3>
              <div className="rounded-lg border border-card-border bg-card p-4 space-y-2">
                {manifest.relationships.map((r, i) => (
                  <div key={i} className="text-xs font-mono">
                    <span className="text-accent">{r.from_table}</span>
                    <span className="text-muted"> &rarr; </span>
                    <span className="text-accent">{r.to_table}</span>
                    <span className="text-muted ml-2">({r.name})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full JSON */}
          <details>
            <summary className="cursor-pointer text-sm text-muted hover:text-foreground">Full Manifest JSON</summary>
            <pre className="mt-2 rounded-lg border border-card-border bg-card p-4 text-xs overflow-x-auto">
              {JSON.stringify(manifest, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {tab === "runtime" && (
        <div className="space-y-6">
          <div>
            <h3 className="mb-3 text-sm font-semibold">Event Catalog ({build.runtime_manifest.event_catalog?.length || 0})</h3>
            {(build.runtime_manifest.event_catalog || []).length > 0 ? (
              <div className="rounded-lg border border-card-border bg-card p-4 space-y-1">
                {build.runtime_manifest.event_catalog.map((e, i) => (
                  <p key={i} className="text-xs font-mono">{e.name}</p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No events in this build.</p>
            )}
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">AI Capabilities</h3>
            {Object.keys(build.runtime_manifest.ai_capability_registry || {}).length > 0 ? (
              <div className="rounded-lg border border-card-border bg-card p-4 space-y-2">
                {Object.entries(build.runtime_manifest.ai_capability_registry).map(([entity, caps]) => (
                  <div key={entity}>
                    <p className="text-xs font-medium text-accent">{entity}</p>
                    {caps.map((c, i) => (
                      <p key={i} className="ml-4 text-xs font-mono text-muted">{c.name}</p>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No AI capabilities in this build.</p>
            )}
          </div>

          <details>
            <summary className="cursor-pointer text-sm text-muted hover:text-foreground">Full Runtime JSON</summary>
            <pre className="mt-2 rounded-lg border border-card-border bg-card p-4 text-xs overflow-x-auto">
              {JSON.stringify(build.runtime_manifest, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
