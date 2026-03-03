"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

interface FieldDef {
  name: string;
  type: string;
  pk?: boolean;
  nullable?: boolean;
  unique?: boolean;
  default?: string;
  when?: string;
}

interface IndexDef {
  name?: string;
  columns: string[];
  unique?: boolean;
  when?: string;
}

interface EventDef {
  name: string;
  trigger: string;
  payload?: string[];
  when?: string;
}

interface AttachPointDef {
  name: string;
  type: string;
  description?: string;
  when?: string;
}

interface AICapabilityDef {
  name: string;
  type: string;
  model?: string;
  requires?: string[];
  description?: string;
  when?: string;
}

interface EntityDef {
  name: string;
  table: string;
  fields: FieldDef[];
  indexes?: IndexDef[];
  events?: EventDef[];
  attach_points?: AttachPointDef[];
  ai_capabilities?: AICapabilityDef[];
  when?: string;
}

interface RelationshipEndpoint {
  entity: string;
  field: string;
  module_key?: string;
}

interface RelationshipDef {
  name: string;
  from: RelationshipEndpoint;
  to: RelationshipEndpoint;
  cardinality: string;
  on_delete: string;
  when?: string;
}

interface ConfigOption {
  type: string;
  label: string;
  default: boolean | string | number;
  description?: string;
}

interface ModuleDependency {
  module_key: string;
  version: string;
  optional?: boolean;
}

interface Blueprint {
  module: {
    key: string;
    name: string;
    version: string;
    layer: string;
    description?: string;
  };
  dependencies: ModuleDependency[];
  config: { options: Record<string, ConfigOption> };
  entities: EntityDef[];
  relationships?: RelationshipDef[];
  events?: EventDef[];
}

interface VersionRecord {
  id: string;
  version: string;
  blueprint_json: Blueprint;
  created_at: string;
}

const FIELD_TYPES = [
  "uuid", "text", "varchar(100)", "varchar(200)", "varchar(255)", "varchar(320)",
  "int", "bigint", "smallint", "boolean", "jsonb", "timestamptz", "date",
  "numeric(12,6)", "bytea", "float", "serial",
];

const CARDINALITIES = ["many_to_one", "one_to_many", "many_to_many", "one_to_one"];
const ON_DELETE_OPTIONS = ["restrict", "cascade", "set null", "no action"];

export default function ModuleAuthoringPage() {
  const { moduleKey } = useParams<{ moduleKey: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [blueprint, setBlueprint] = useState<Blueprint>({
    module: { key: moduleKey, name: "", version: "1.0.0", layer: "domain" },
    dependencies: [],
    config: { options: {} },
    entities: [],
    relationships: [],
    events: [],
  });
  const [selectedEntity, setSelectedEntity] = useState<number>(-1);
  const [publishing, setPublishing] = useState(false);
  const [versionInput, setVersionInput] = useState("");
  const [activeTab, setActiveTab] = useState<"entities" | "relationships" | "config" | "dependencies" | "events" | "versions">("entities");

  const loadData = useCallback(async () => {
    try {
      const versionsRes = await fetch(`/api/generator/modules/${moduleKey}/versions`, { credentials: "include" });
      if (versionsRes.ok) {
        const vData = await versionsRes.json();
        setVersions(vData);
        if (vData.length > 0) {
          const latest = vData[0];
          const bp = typeof latest.blueprint_json === "string" ? JSON.parse(latest.blueprint_json) : latest.blueprint_json;
          setBlueprint(bp);
          setVersionInput(incrementVersion(latest.version));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [moduleKey]);

  useEffect(() => { loadData(); }, [loadData]);

  function incrementVersion(v: string): string {
    const parts = v.split(".").map(Number);
    parts[2] = (parts[2] || 0) + 1;
    return parts.join(".");
  }

  function updateBlueprint(updater: (bp: Blueprint) => Blueprint) {
    setBlueprint((prev) => updater({ ...prev }));
  }

  function addEntity() {
    updateBlueprint((bp) => {
      const name = `entity_${bp.entities.length + 1}`;
      bp.entities = [...bp.entities, {
        name,
        table: `${name}s`,
        fields: [
          { name: "id", type: "uuid", pk: true },
          { name: "created_at", type: "timestamptz", nullable: false, default: "now()" },
          { name: "updated_at", type: "timestamptz", nullable: false, default: "now()" },
        ],
        indexes: [],
        events: [],
      }];
      setSelectedEntity(bp.entities.length - 1);
      return bp;
    });
  }

  function removeEntity(idx: number) {
    updateBlueprint((bp) => {
      bp.entities = bp.entities.filter((_, i) => i !== idx);
      if (selectedEntity >= bp.entities.length) setSelectedEntity(bp.entities.length - 1);
      return bp;
    });
  }

  function updateEntity(idx: number, updater: (e: EntityDef) => EntityDef) {
    updateBlueprint((bp) => {
      bp.entities = bp.entities.map((e, i) => i === idx ? updater({ ...e }) : e);
      return bp;
    });
  }

  function addField(entityIdx: number) {
    updateEntity(entityIdx, (e) => {
      e.fields = [...e.fields, { name: "new_field", type: "text" }];
      return e;
    });
  }

  function updateField(entityIdx: number, fieldIdx: number, updates: Partial<FieldDef>) {
    updateEntity(entityIdx, (e) => {
      e.fields = e.fields.map((f, i) => i === fieldIdx ? { ...f, ...updates } : f);
      return e;
    });
  }

  function removeField(entityIdx: number, fieldIdx: number) {
    updateEntity(entityIdx, (e) => {
      e.fields = e.fields.filter((_, i) => i !== fieldIdx);
      return e;
    });
  }

  async function handlePublish() {
    if (!versionInput) return;
    setPublishing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/generator/modules/${moduleKey}/versions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: versionInput,
          blueprint_json: blueprint,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Publish failed");
      }
      setSuccess(`Published v${versionInput}`);
      loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const entity = selectedEntity >= 0 && selectedEntity < blueprint.entities.length
    ? blueprint.entities[selectedEntity]
    : null;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <a href="/modules" className="text-sm text-muted hover:text-foreground">&larr; Modules</a>
          <h1 className="mt-2 text-2xl font-semibold">{blueprint.module.name || moduleKey}</h1>
          <div className="mt-1 flex items-center gap-3">
            <span className="text-xs font-mono text-muted">{moduleKey}</span>
            <span className="text-xs text-muted">Layer: {blueprint.module.layer}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={versionInput}
            onChange={(e) => setVersionInput(e.target.value)}
            placeholder="1.0.1"
            className="w-24 rounded-md border border-card-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
          <button
            onClick={handlePublish}
            disabled={publishing || !versionInput}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {publishing ? "Publishing..." : "Publish Version"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg border border-success/30 bg-success/10 p-3">
          <p className="text-sm text-success">{success}</p>
        </div>
      )}

      {/* Module metadata */}
      <div className="mb-6 rounded-lg border border-card-border bg-card p-4">
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Name</label>
            <input
              type="text"
              value={blueprint.module.name}
              onChange={(e) => updateBlueprint((bp) => { bp.module = { ...bp.module, name: e.target.value }; return bp; })}
              className="w-full rounded-md border border-card-border bg-background px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Layer</label>
            <select
              value={blueprint.module.layer}
              onChange={(e) => updateBlueprint((bp) => { bp.module = { ...bp.module, layer: e.target.value }; return bp; })}
              className="w-full rounded-md border border-card-border bg-background px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
            >
              <option value="core">Core</option>
              <option value="ai">AI</option>
              <option value="automation">Automation</option>
              <option value="domain">Domain</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-muted mb-1">Description</label>
            <input
              type="text"
              value={blueprint.module.description || ""}
              onChange={(e) => updateBlueprint((bp) => { bp.module = { ...bp.module, description: e.target.value }; return bp; })}
              className="w-full rounded-md border border-card-border bg-background px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-card-border">
        {(["entities", "relationships", "config", "dependencies", "events", "versions"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === "entities" && ` (${blueprint.entities.length})`}
            {tab === "relationships" && ` (${blueprint.relationships?.length || 0})`}
            {tab === "versions" && ` (${versions.length})`}
          </button>
        ))}
      </div>

      {/* Entities Tab */}
      {activeTab === "entities" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Entity List */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Entities</h3>
              <button onClick={addEntity} className="text-xs text-accent hover:underline">+ Add</button>
            </div>
            <div className="space-y-1">
              {blueprint.entities.map((e, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors ${selectedEntity === i ? "border-accent bg-accent/10" : "border-card-border bg-card hover:border-accent/30"}`}
                >
                  <button onClick={() => setSelectedEntity(i)} className="flex-1 text-left">
                    <span className="font-medium">{e.name}</span>
                    <span className="ml-2 text-xs text-muted">{e.fields.length} fields</span>
                  </button>
                  <button
                    onClick={() => removeEntity(i)}
                    className="text-xs text-danger/50 hover:text-danger ml-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Entity Detail */}
          <div className="lg:col-span-2">
            {entity ? (
              <div className="rounded-lg border border-card-border bg-card p-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">Entity Name</label>
                    <input
                      type="text"
                      value={entity.name}
                      onChange={(e) => updateEntity(selectedEntity, (ent) => ({ ...ent, name: e.target.value }))}
                      className="w-full rounded-md border border-card-border bg-background px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">Table Name</label>
                    <input
                      type="text"
                      value={entity.table}
                      onChange={(e) => updateEntity(selectedEntity, (ent) => ({ ...ent, table: e.target.value }))}
                      className="w-full rounded-md border border-card-border bg-background px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">When Condition</label>
                    <input
                      type="text"
                      value={entity.when || ""}
                      onChange={(e) => updateEntity(selectedEntity, (ent) => ({ ...ent, when: e.target.value || undefined }))}
                      placeholder="config.x == true"
                      className="w-full rounded-md border border-card-border bg-background px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>

                {/* Fields Table */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-muted uppercase">Fields</h4>
                    <button onClick={() => addField(selectedEntity)} className="text-xs text-accent hover:underline">+ Add Field</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-card-border text-left text-muted">
                          <th className="pb-2 pr-2">Name</th>
                          <th className="pb-2 pr-2">Type</th>
                          <th className="pb-2 pr-2 text-center">PK</th>
                          <th className="pb-2 pr-2 text-center">Null</th>
                          <th className="pb-2 pr-2 text-center">Unique</th>
                          <th className="pb-2 pr-2">Default</th>
                          <th className="pb-2 pr-2">When</th>
                          <th className="pb-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {entity.fields.map((f, fi) => (
                          <tr key={fi} className="border-b border-card-border/50">
                            <td className="py-1 pr-2">
                              <input
                                type="text"
                                value={f.name}
                                onChange={(e) => updateField(selectedEntity, fi, { name: e.target.value })}
                                className="w-full rounded border border-card-border bg-background px-2 py-0.5 focus:border-accent focus:outline-none"
                              />
                            </td>
                            <td className="py-1 pr-2">
                              <select
                                value={FIELD_TYPES.includes(f.type) ? f.type : ""}
                                onChange={(e) => updateField(selectedEntity, fi, { type: e.target.value })}
                                className="w-full rounded border border-card-border bg-background px-1 py-0.5 focus:border-accent focus:outline-none"
                              >
                                {!FIELD_TYPES.includes(f.type) && <option value="">{f.type}</option>}
                                {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </td>
                            <td className="py-1 pr-2 text-center">
                              <input type="checkbox" checked={!!f.pk} onChange={(e) => updateField(selectedEntity, fi, { pk: e.target.checked || undefined })} />
                            </td>
                            <td className="py-1 pr-2 text-center">
                              <input type="checkbox" checked={!!f.nullable} onChange={(e) => updateField(selectedEntity, fi, { nullable: e.target.checked || undefined })} />
                            </td>
                            <td className="py-1 pr-2 text-center">
                              <input type="checkbox" checked={!!f.unique} onChange={(e) => updateField(selectedEntity, fi, { unique: e.target.checked || undefined })} />
                            </td>
                            <td className="py-1 pr-2">
                              <input
                                type="text"
                                value={f.default || ""}
                                onChange={(e) => updateField(selectedEntity, fi, { default: e.target.value || undefined })}
                                className="w-full rounded border border-card-border bg-background px-2 py-0.5 focus:border-accent focus:outline-none"
                                placeholder="—"
                              />
                            </td>
                            <td className="py-1 pr-2">
                              <input
                                type="text"
                                value={f.when || ""}
                                onChange={(e) => updateField(selectedEntity, fi, { when: e.target.value || undefined })}
                                className="w-full rounded border border-card-border bg-background px-2 py-0.5 focus:border-accent focus:outline-none"
                                placeholder="—"
                              />
                            </td>
                            <td className="py-1">
                              <button
                                onClick={() => removeField(selectedEntity, fi)}
                                className="text-danger/50 hover:text-danger"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Indexes */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-muted uppercase">Indexes</h4>
                    <button
                      onClick={() => updateEntity(selectedEntity, (ent) => ({
                        ...ent,
                        indexes: [...(ent.indexes || []), { columns: [""], unique: false }],
                      }))}
                      className="text-xs text-accent hover:underline"
                    >
                      + Add Index
                    </button>
                  </div>
                  {(entity.indexes || []).map((idx, ii) => (
                    <div key={ii} className="flex items-center gap-2 mb-2">
                      <input
                        type="text"
                        value={idx.columns.join(", ")}
                        onChange={(e) => updateEntity(selectedEntity, (ent) => {
                          const idxs = [...(ent.indexes || [])];
                          idxs[ii] = { ...idxs[ii], columns: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) };
                          return { ...ent, indexes: idxs };
                        })}
                        placeholder="col1, col2"
                        className="flex-1 rounded border border-card-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
                      />
                      <label className="flex items-center gap-1 text-xs text-muted">
                        <input
                          type="checkbox"
                          checked={!!idx.unique}
                          onChange={(e) => updateEntity(selectedEntity, (ent) => {
                            const idxs = [...(ent.indexes || [])];
                            idxs[ii] = { ...idxs[ii], unique: e.target.checked };
                            return { ...ent, indexes: idxs };
                          })}
                        />
                        Unique
                      </label>
                      <button
                        onClick={() => updateEntity(selectedEntity, (ent) => ({
                          ...ent,
                          indexes: (ent.indexes || []).filter((_, i) => i !== ii),
                        }))}
                        className="text-xs text-danger/50 hover:text-danger"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-card-border bg-card p-12 text-center text-sm text-muted">
                Select an entity or add a new one.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Relationships Tab */}
      {activeTab === "relationships" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => updateBlueprint((bp) => ({
                ...bp,
                relationships: [...(bp.relationships || []), {
                  name: "new_relationship",
                  from: { entity: "", field: "" },
                  to: { entity: "", field: "id" },
                  cardinality: "many_to_one",
                  on_delete: "restrict",
                }],
              }))}
              className="text-xs text-accent hover:underline"
            >
              + Add Relationship
            </button>
          </div>
          {(blueprint.relationships || []).map((rel, ri) => (
            <div key={ri} className="rounded-lg border border-card-border bg-card p-4">
              <div className="grid gap-3 sm:grid-cols-6">
                <div>
                  <label className="block text-xs text-muted mb-1">Name</label>
                  <input
                    type="text"
                    value={rel.name}
                    onChange={(e) => updateBlueprint((bp) => {
                      const rels = [...(bp.relationships || [])];
                      rels[ri] = { ...rels[ri], name: e.target.value };
                      return { ...bp, relationships: rels };
                    })}
                    className="w-full rounded border border-card-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">From Entity</label>
                  <input
                    type="text"
                    value={rel.from.entity}
                    onChange={(e) => updateBlueprint((bp) => {
                      const rels = [...(bp.relationships || [])];
                      rels[ri] = { ...rels[ri], from: { ...rels[ri].from, entity: e.target.value } };
                      return { ...bp, relationships: rels };
                    })}
                    className="w-full rounded border border-card-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">From Field</label>
                  <input
                    type="text"
                    value={rel.from.field}
                    onChange={(e) => updateBlueprint((bp) => {
                      const rels = [...(bp.relationships || [])];
                      rels[ri] = { ...rels[ri], from: { ...rels[ri].from, field: e.target.value } };
                      return { ...bp, relationships: rels };
                    })}
                    className="w-full rounded border border-card-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">To Entity</label>
                  <input
                    type="text"
                    value={rel.to.entity}
                    onChange={(e) => updateBlueprint((bp) => {
                      const rels = [...(bp.relationships || [])];
                      rels[ri] = { ...rels[ri], to: { ...rels[ri].to, entity: e.target.value } };
                      return { ...bp, relationships: rels };
                    })}
                    className="w-full rounded border border-card-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Cardinality</label>
                  <select
                    value={rel.cardinality}
                    onChange={(e) => updateBlueprint((bp) => {
                      const rels = [...(bp.relationships || [])];
                      rels[ri] = { ...rels[ri], cardinality: e.target.value };
                      return { ...bp, relationships: rels };
                    })}
                    className="w-full rounded border border-card-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
                  >
                    {CARDINALITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-xs text-muted mb-1">On Delete</label>
                    <select
                      value={rel.on_delete}
                      onChange={(e) => updateBlueprint((bp) => {
                        const rels = [...(bp.relationships || [])];
                        rels[ri] = { ...rels[ri], on_delete: e.target.value };
                        return { ...bp, relationships: rels };
                      })}
                      className="w-full rounded border border-card-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
                    >
                      {ON_DELETE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <button
                    onClick={() => updateBlueprint((bp) => ({
                      ...bp,
                      relationships: (bp.relationships || []).filter((_, i) => i !== ri),
                    }))}
                    className="text-xs text-danger/50 hover:text-danger pb-1"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Config Tab */}
      {activeTab === "config" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => updateBlueprint((bp) => {
                const opts = { ...bp.config.options };
                opts[`option_${Object.keys(opts).length + 1}`] = { type: "boolean", label: "New Option", default: true };
                return { ...bp, config: { options: opts } };
              })}
              className="text-xs text-accent hover:underline"
            >
              + Add Option
            </button>
          </div>
          {Object.entries(blueprint.config.options).map(([key, opt]) => (
            <div key={key} className="rounded-lg border border-card-border bg-card p-4">
              <div className="grid gap-3 sm:grid-cols-5">
                <div>
                  <label className="block text-xs text-muted mb-1">Key</label>
                  <input
                    type="text"
                    value={key}
                    onChange={(e) => updateBlueprint((bp) => {
                      const opts = { ...bp.config.options };
                      const val = opts[key];
                      delete opts[key];
                      opts[e.target.value] = val;
                      return { ...bp, config: { options: opts } };
                    })}
                    className="w-full rounded border border-card-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Type</label>
                  <select
                    value={opt.type}
                    onChange={(e) => updateBlueprint((bp) => {
                      const opts = { ...bp.config.options };
                      opts[key] = { ...opts[key], type: e.target.value };
                      return { ...bp, config: { options: opts } };
                    })}
                    className="w-full rounded border border-card-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
                  >
                    <option value="boolean">boolean</option>
                    <option value="string">string</option>
                    <option value="number">number</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Label</label>
                  <input
                    type="text"
                    value={opt.label}
                    onChange={(e) => updateBlueprint((bp) => {
                      const opts = { ...bp.config.options };
                      opts[key] = { ...opts[key], label: e.target.value };
                      return { ...bp, config: { options: opts } };
                    })}
                    className="w-full rounded border border-card-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Default</label>
                  <input
                    type="text"
                    value={String(opt.default)}
                    onChange={(e) => updateBlueprint((bp) => {
                      const opts = { ...bp.config.options };
                      let val: boolean | string | number = e.target.value;
                      if (opt.type === "boolean") val = e.target.value === "true";
                      else if (opt.type === "number") val = Number(e.target.value) || 0;
                      opts[key] = { ...opts[key], default: val };
                      return { ...bp, config: { options: opts } };
                    })}
                    className="w-full rounded border border-card-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => updateBlueprint((bp) => {
                      const opts = { ...bp.config.options };
                      delete opts[key];
                      return { ...bp, config: { options: opts } };
                    })}
                    className="text-xs text-danger/50 hover:text-danger pb-1"
                  >
                    ✕ Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dependencies Tab */}
      {activeTab === "dependencies" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => updateBlueprint((bp) => ({
                ...bp,
                dependencies: [...bp.dependencies, { module_key: "", version: "^1.0.0" }],
              }))}
              className="text-xs text-accent hover:underline"
            >
              + Add Dependency
            </button>
          </div>
          {blueprint.dependencies.map((dep, di) => (
            <div key={di} className="flex items-center gap-3 rounded-lg border border-card-border bg-card p-3">
              <input
                type="text"
                value={dep.module_key}
                onChange={(e) => updateBlueprint((bp) => {
                  const deps = [...bp.dependencies];
                  deps[di] = { ...deps[di], module_key: e.target.value };
                  return { ...bp, dependencies: deps };
                })}
                placeholder="core.identity"
                className="flex-1 rounded border border-card-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
              />
              <input
                type="text"
                value={dep.version}
                onChange={(e) => updateBlueprint((bp) => {
                  const deps = [...bp.dependencies];
                  deps[di] = { ...deps[di], version: e.target.value };
                  return { ...bp, dependencies: deps };
                })}
                placeholder="^1.0.0"
                className="w-24 rounded border border-card-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
              />
              <label className="flex items-center gap-1 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={!!dep.optional}
                  onChange={(e) => updateBlueprint((bp) => {
                    const deps = [...bp.dependencies];
                    deps[di] = { ...deps[di], optional: e.target.checked };
                    return { ...bp, dependencies: deps };
                  })}
                />
                Optional
              </label>
              <button
                onClick={() => updateBlueprint((bp) => ({
                  ...bp,
                  dependencies: bp.dependencies.filter((_, i) => i !== di),
                }))}
                className="text-xs text-danger/50 hover:text-danger"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Events Tab */}
      {activeTab === "events" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => updateBlueprint((bp) => ({
                ...bp,
                events: [...(bp.events || []), { name: "new.event", trigger: "insert" }],
              }))}
              className="text-xs text-accent hover:underline"
            >
              + Add Event
            </button>
          </div>
          {(blueprint.events || []).map((evt, ei) => (
            <div key={ei} className="flex items-center gap-3 rounded-lg border border-card-border bg-card p-3">
              <input
                type="text"
                value={evt.name}
                onChange={(e) => updateBlueprint((bp) => {
                  const evts = [...(bp.events || [])];
                  evts[ei] = { ...evts[ei], name: e.target.value };
                  return { ...bp, events: evts };
                })}
                placeholder="entity.action"
                className="flex-1 rounded border border-card-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
              />
              <input
                type="text"
                value={evt.trigger}
                onChange={(e) => updateBlueprint((bp) => {
                  const evts = [...(bp.events || [])];
                  evts[ei] = { ...evts[ei], trigger: e.target.value };
                  return { ...bp, events: evts };
                })}
                placeholder="insert/update/delete"
                className="w-28 rounded border border-card-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
              />
              <button
                onClick={() => updateBlueprint((bp) => ({
                  ...bp,
                  events: (bp.events || []).filter((_, i) => i !== ei),
                }))}
                className="text-xs text-danger/50 hover:text-danger"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Versions Tab */}
      {activeTab === "versions" && (
        <div className="space-y-3">
          {versions.length === 0 ? (
            <p className="text-sm text-muted">No versions published yet.</p>
          ) : (
            versions.map((v) => (
              <div key={v.id} className="rounded-lg border border-card-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">v{v.version}</span>
                  <span className="text-xs text-muted">{new Date(v.created_at).toLocaleDateString()}</span>
                </div>
                <pre className="text-xs overflow-x-auto bg-background rounded p-3 border border-card-border max-h-64 overflow-y-auto">
                  {JSON.stringify(
                    typeof v.blueprint_json === "string" ? JSON.parse(v.blueprint_json as unknown as string) : v.blueprint_json,
                    null,
                    2
                  )}
                </pre>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
