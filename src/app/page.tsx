"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Pack {
  id: string;
  pack_key: string;
  name: string;
  description?: string;
  module_count: number;
}

export default function Dashboard() {
  const router = useRouter();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ pack_key: "", name: "", description: "" });
  const [creating, setCreating] = useState(false);

  function loadPacks() {
    setLoading(true);
    fetch("/api/generator/packs", { credentials: "include" })
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/sign-in");
          return null;
        }
        if (!res.ok) throw new Error("Failed to load packs");
        return res.json();
      })
      .then((data) => { if (data) setPacks(data); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadPacks(); }, [router]);

  async function handleSeed() {
    setSeeding(true);
    setSeedResult(null);
    setError(null);
    try {
      const res = await fetch("/api/generator/seed", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.already_seeded) {
        setSeedResult("Database already seeded.");
      } else if (data.success) {
        setSeedResult(
          `Seeded ${data.modules_created} modules, ${data.packs_created} packs, ${data.pack_modules_linked} links.`
        );
        loadPacks();
      } else {
        setSeedResult(`Seed completed with errors: ${data.errors?.join("; ")}`);
        loadPacks();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seed failed");
    } finally {
      setSeeding(false);
    }
  }

  async function handleCreatePack(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.pack_key || !createForm.name) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/generator/packs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create pack");
      }
      setShowCreateForm(false);
      setCreateForm({ pack_key: "", name: "", description: "" });
      loadPacks();
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

  return (
    <div>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Blueprint Packs</h1>
          <p className="mt-1 text-sm text-muted">
            Select a pack to view modules, configure, and generate your backend schema.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="rounded-md border border-card-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/10 hover:border-accent/30"
          >
            Create Pack
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-danger/30 bg-danger/10 p-4">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {seedResult && (
        <div className="mb-6 rounded-lg border border-success/30 bg-success/10 p-4">
          <p className="text-sm text-success">{seedResult}</p>
        </div>
      )}

      {showCreateForm && (
        <form onSubmit={handleCreatePack} className="mb-6 rounded-lg border border-card-border bg-card p-5 space-y-4">
          <h3 className="font-semibold">New Pack</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Pack Key</label>
              <input
                type="text"
                value={createForm.pack_key}
                onChange={(e) => setCreateForm({ ...createForm, pack_key: e.target.value })}
                placeholder="my-pack.v1"
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
                placeholder="My Pack"
                className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                required
              />
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

      {packs.length === 0 ? (
        <div className="rounded-lg border border-card-border bg-card p-12 text-center">
          <p className="text-muted mb-4">No packs found. Seed your NCB database with blueprint data.</p>
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="rounded-md bg-accent px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {seeding ? "Seeding..." : "Seed Database"}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {packs.map((pack) => (
            <div
              key={pack.id}
              className="group rounded-lg border border-card-border bg-card p-5 transition-colors hover:border-accent/40"
            >
              <h2 className="font-semibold">{pack.name}</h2>
              <p className="mt-1 text-xs font-mono text-muted">{pack.pack_key}</p>
              {pack.description && (
                <p className="mt-2 text-sm text-muted line-clamp-2">{pack.description}</p>
              )}
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-muted">
                  {pack.module_count} module{pack.module_count !== 1 ? "s" : ""}
                </span>
                <div className="flex gap-2">
                  <a
                    href={`/packs/${pack.pack_key}`}
                    className="rounded-md bg-card border border-card-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent/10 hover:border-accent/30"
                  >
                    View
                  </a>
                  <a
                    href={`/packs/${pack.pack_key}?build=true`}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
                  >
                    Build
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
