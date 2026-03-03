"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Project {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

export default function ComposerDashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/composer/projects", { credentials: "include" })
      .then(async (res) => {
        if (res.status === 401) { router.push("/sign-in"); return null; }
        if (!res.ok) throw new Error("Failed to load projects");
        return res.json();
      })
      .then((data) => { if (data) setProjects(Array.isArray(data) ? data : []); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/composer/projects", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to create project");
      const data = await res.json();
      router.push(`/composer/${data.id}/${data.canvas_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(projectId: string) {
    if (!confirm("Delete this project?")) return;
    await fetch(`/api/composer/projects/${projectId}`, { method: "DELETE", credentials: "include" });
    setProjects(projects.filter((p) => p.id !== projectId));
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
          <h1 className="text-2xl font-semibold tracking-tight">Visual Composer</h1>
          <p className="mt-1 text-sm text-muted">Drag-and-drop blueprint composition with live validation.</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          New Project
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-danger/30 bg-danger/10 p-4">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="mb-6 rounded-lg border border-card-border bg-card p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Project Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={creating} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {creating ? "Creating..." : "Create & Open"}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="rounded-md border border-card-border px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {projects.length === 0 ? (
        <div className="rounded-lg border border-card-border bg-card p-12 text-center">
          <p className="text-muted">No projects yet. Create one to start composing blueprints visually.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <div key={p.id} className="rounded-lg border border-card-border bg-card p-5 hover:border-accent/40 transition-colors">
              <h2 className="font-semibold">{p.name}</h2>
              {p.description && <p className="mt-1 text-sm text-muted">{p.description}</p>}
              <p className="mt-2 text-xs text-muted">{new Date(p.created_at).toLocaleDateString()}</p>
              <div className="mt-4 flex gap-2">
                <a
                  href={`/composer/${p.id}`}
                  className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
                >
                  Open
                </a>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="rounded-md border border-danger/30 px-3 py-1.5 text-xs text-danger hover:bg-danger/10"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
