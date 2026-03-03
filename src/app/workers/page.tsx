"use client";

import { useState } from "react";

interface WorkerResult {
  processed?: number;
  results?: { success: boolean; error?: string }[];
  error?: string;
}

interface RunAllResult {
  scheduler?: WorkerResult;
  rules?: WorkerResult;
  agents?: WorkerResult;
}

function formatResult(r: WorkerResult) {
  if (r.error) return { processed: 0, success: 0, failed: 0, error: r.error };
  const processed = r.processed ?? 0;
  const success = r.results?.filter((x) => x.success).length ?? 0;
  const failed = r.results?.filter((x) => !x.success).length ?? 0;
  return { processed, success, failed, error: null };
}

export default function WorkersDashboard() {
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, WorkerResult>>({});
  const [runAllResult, setRunAllResult] = useState<RunAllResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runWorker(name: string, url: string) {
    setRunning((prev) => ({ ...prev, [name]: true }));
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json();
      setResults((prev) => ({ ...prev, [name]: data }));
    } catch (e) {
      setError(e instanceof Error ? e.message : `${name} failed`);
    } finally {
      setRunning((prev) => ({ ...prev, [name]: false }));
    }
  }

  async function handleRunAll() {
    setRunning((prev) => ({ ...prev, all: true }));
    setError(null);
    setRunAllResult(null);
    try {
      const res = await fetch("/api/workers/run-all", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json();
      setRunAllResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run all failed");
    } finally {
      setRunning((prev) => ({ ...prev, all: false }));
    }
  }

  const workers = [
    { name: "Scheduler", key: "scheduler", url: "/api/workers/scheduler/tick", desc: "Process due schedules and emit events" },
    { name: "Rules Engine", key: "rules", url: "/api/workers/rules/run", desc: "Match events to rules and execute actions" },
    { name: "Agent Runner", key: "agents", url: "/api/workers/agents/run", desc: "Execute queued AI agent tasks" },
  ];

  return (
    <div>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Runtime Workers</h1>
          <p className="mt-1 text-sm text-muted">
            Manually trigger worker loops or set up external cron to call these endpoints.
          </p>
        </div>
        <button
          onClick={handleRunAll}
          disabled={running.all}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {running.all ? "Running All..." : "Run All Workers"}
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-danger/30 bg-danger/10 p-4">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {runAllResult && (
        <div className="mb-6 rounded-lg border border-success/30 bg-success/10 p-4">
          <h3 className="text-sm font-semibold text-success mb-3">Run All Complete</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["scheduler", "rules", "agents"] as const).map((key) => {
              const r = runAllResult[key];
              if (!r) return null;
              const f = formatResult(r);
              const label = key === "scheduler" ? "Scheduler" : key === "rules" ? "Rules Engine" : "Agent Runner";
              return (
                <div key={key} className="rounded-md border border-success/20 bg-success/5 p-3">
                  <p className="text-xs font-medium text-success">{label}</p>
                  <p className="mt-1 text-xs text-muted">Processed: {f.processed}</p>
                  <p className="text-xs text-muted">Success: {f.success} / Failed: {f.failed}</p>
                  {f.error && <p className="mt-1 text-xs text-danger">{f.error}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {workers.map((w) => {
          const r = results[w.key];
          const f = r ? formatResult(r) : null;
          return (
            <div key={w.key} className="rounded-lg border border-card-border bg-card p-5">
              <h2 className="font-semibold">{w.name}</h2>
              <p className="mt-1 text-xs text-muted">{w.desc}</p>

              <button
                onClick={() => runWorker(w.key, w.url)}
                disabled={running[w.key]}
                className="mt-4 w-full rounded-md bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {running[w.key] ? "Running..." : `Run ${w.name}`}
              </button>

              {f && (
                <div className="mt-3 rounded border border-card-border bg-background p-3 space-y-1">
                  <p className="text-xs text-muted">Processed: {f.processed}</p>
                  <p className="text-xs text-muted">Success: {f.success} / Failed: {f.failed}</p>
                  {f.error && <p className="text-xs text-danger">{f.error}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Trigger Event Section */}
      <div className="mt-8">
        <h2 className="mb-2 text-lg font-semibold">Trigger Event</h2>
        <p className="mb-4 text-xs text-muted">Emit a named event to the rules engine. Matching automation rules will fire immediately.</p>
        <EventEmitter />
      </div>
    </div>
  );
}

function EventEmitter() {
  const [eventName, setEventName] = useState("test.event");
  const [payload, setPayload] = useState('{"key": "value"}');
  const [emitting, setEmitting] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  async function handleEmit() {
    setEmitting(true);
    setResult(null);
    try {
      let parsedPayload: Record<string, unknown> = {};
      try {
        parsedPayload = JSON.parse(payload);
      } catch {
        parsedPayload = { raw: payload };
      }

      const res = await fetch("/api/events", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_name: eventName,
          payload: parsedPayload,
        }),
      });
      setResult(await res.json());
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "Failed" });
    } finally {
      setEmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-card-border bg-card p-5 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Event Name</label>
          <input
            type="text"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Payload (JSON)</label>
          <input
            type="text"
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            className="w-full rounded-md border border-card-border bg-background px-3 py-2 text-sm font-mono focus:border-accent focus:outline-none"
          />
        </div>
      </div>
      <button
        onClick={handleEmit}
        disabled={emitting}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {emitting ? "Emitting..." : "Trigger Event"}
      </button>
      {result && (
        <pre className="text-xs text-muted bg-background rounded p-3 border border-card-border">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
