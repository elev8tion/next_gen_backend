"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Field {
  name: string;
  type: string;
  pk?: boolean;
  nullable?: boolean;
  unique?: boolean;
}

interface Entity {
  module_key: string;
  name: string;
  table: string;
  fields: Field[];
  indexes: { name: string; columns: string[] }[];
}

interface Relationship {
  name: string;
  from_table: string;
  from_field: string;
  to_table: string;
  to_field: string;
  cardinality: string;
}

const LAYER_DOT: Record<string, string> = {
  core: "bg-blue-400",
  ai: "bg-purple-400",
  automation: "bg-amber-400",
  domain: "bg-emerald-400",
};

export default function SchemaVisualizer() {
  const { packKey } = useParams<{ packKey: string }>();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/generator/packs/${packKey}/catalog/entities`, { credentials: "include" }),
      fetch(`/api/generator/packs/${packKey}/build`, { method: "POST", credentials: "include" })
        .then((r) => r.json())
        .catch(() => ({ resolved_manifest: { relationships: [] } })),
    ])
      .then(async ([entRes, buildData]) => {
        if (!entRes.ok) throw new Error("Failed to load entities");
        const ents = await entRes.json();
        setEntities(ents);
        setRelationships(buildData.resolved_manifest?.relationships || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [packKey]);

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

  const filtered = filter
    ? entities.filter(
        (e) =>
          e.name.toLowerCase().includes(filter.toLowerCase()) ||
          e.table.toLowerCase().includes(filter.toLowerCase()) ||
          e.module_key.toLowerCase().includes(filter.toLowerCase())
      )
    : entities;

  // Get unique module keys for the legend
  const moduleKeys = [...new Set(entities.map((e) => e.module_key))];

  // Build relationship map for an entity
  const getRelationships = (table: string) =>
    relationships.filter((r) => r.from_table === table || r.to_table === table);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <a href={`/packs/${packKey}`} className="text-sm text-muted hover:text-foreground">&larr; Back to pack</a>
          <h1 className="mt-2 text-2xl font-semibold">Schema Visualizer</h1>
          <p className="text-xs text-muted">{entities.length} entities, {relationships.length} relationships</p>
        </div>
      </div>

      {/* Filter + Legend */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <input
          type="text"
          placeholder="Filter entities..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-md border border-card-border bg-card px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          {moduleKeys.map((key) => {
            const layer = key.split(".")[0];
            return (
              <span key={key} className="flex items-center gap-1.5 text-xs text-muted">
                <span className={`h-2 w-2 rounded-full ${LAYER_DOT[layer] || "bg-zinc-400"}`} />
                {key}
              </span>
            );
          })}
        </div>
      </div>

      {/* Entity Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((entity) => {
          const rels = getRelationships(entity.table);
          const layer = entity.module_key.split(".")[0];

          return (
            <div
              key={entity.table}
              className="rounded-lg border border-card-border bg-card overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center gap-2 border-b border-card-border bg-card px-4 py-2.5">
                <span className={`h-2 w-2 rounded-full ${LAYER_DOT[layer] || "bg-zinc-400"}`} />
                <div>
                  <p className="text-sm font-semibold">{entity.name}</p>
                  <p className="text-xs font-mono text-muted">{entity.table}</p>
                </div>
              </div>

              {/* Fields */}
              <div className="px-4 py-2 space-y-0.5">
                {entity.fields.map((f) => (
                  <div key={f.name} className="flex items-center justify-between py-0.5">
                    <span className="text-xs font-mono">
                      {f.pk && <span className="text-warning mr-1">PK</span>}
                      {f.name}
                    </span>
                    <span className="text-xs text-muted">{f.type}</span>
                  </div>
                ))}
              </div>

              {/* Relationships */}
              {rels.length > 0 && (
                <div className="border-t border-card-border px-4 py-2">
                  {rels.map((r, i) => (
                    <p key={i} className="text-xs text-muted">
                      {r.from_table === entity.table ? (
                        <>
                          <span className="text-accent">{r.from_field}</span> &rarr; {r.to_table}.{r.to_field}
                        </>
                      ) : (
                        <>
                          {r.from_table}.{r.from_field} &rarr; <span className="text-accent">{r.to_field}</span>
                        </>
                      )}
                      <span className="ml-1">({r.cardinality})</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
