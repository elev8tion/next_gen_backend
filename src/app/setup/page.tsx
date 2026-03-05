"use client";

import { useState } from "react";
import Link from "next/link";

interface ProvisionResult {
  provisioned: string[];
  already_existed: string[];
  failed: { table: string; error: string }[];
  processed_count?: number;
  total_tables?: number;
  next_offset?: number | null;
  done?: boolean;
}

export default function SetupPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressText, setProgressText] = useState<string | null>(null);

  async function handleProvision() {
    setLoading(true);
    setError(null);
    setResult(null);
    setProgressText("Starting provisioning...");
    try {
      let offset = 0;
      let iterations = 0;
      const merged: ProvisionResult = { provisioned: [], already_existed: [], failed: [] };

      while (iterations < 20) {
        const res = await fetch("/api/setup/provision", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset, max_tables: 10 }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Provision failed");
        }

        const data: ProvisionResult = await res.json();
        merged.provisioned.push(...(data.provisioned || []));
        merged.already_existed.push(...(data.already_existed || []));
        merged.failed.push(...(data.failed || []));

        if (data.total_tables) {
          const doneCount = merged.provisioned.length + merged.already_existed.length + merged.failed.length;
          setProgressText(`Provisioning... ${doneCount}/${data.total_tables}`);
        }

        if (data.done || data.next_offset == null) {
          break;
        }
        offset = data.next_offset;
        iterations += 1;
      }

      setResult(merged);
      setProgressText(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Provision failed");
      setProgressText(null);
    } finally {
      setLoading(false);
    }
  }

  const total = result
    ? result.provisioned.length + result.already_existed.length + result.failed.length
    : 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Setup</h1>
        <p className="mt-1 text-sm text-muted">
          Provision all required NCB tables for the backend engine.
        </p>
      </div>

      <div className="rounded-lg border border-card-border bg-card p-6">
        <h2 className="font-semibold">Table Provisioning</h2>
        <p className="mt-1 text-sm text-muted">
          Creates all 19 required tables in your NCB instance. Safe to run multiple times
          &mdash; existing tables are skipped.
        </p>

        <button
          onClick={handleProvision}
          disabled={loading}
          className="mt-4 rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? "Provisioning…" : "Provision All Tables"}
        </button>

        {loading && progressText && (
          <p className="mt-3 text-xs text-muted">{progressText}</p>
        )}

        {error && (
          <div className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-6 space-y-4">
            <p className="text-sm font-medium">
              {total} tables processed &mdash;{" "}
              <span className="text-success">{result.provisioned.length} provisioned</span>,{" "}
              <span className="text-muted">{result.already_existed.length} already existed</span>
              {result.failed.length > 0 && (
                <>, <span className="text-danger">{result.failed.length} failed</span></>
              )}
            </p>

            {result.provisioned.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-muted uppercase tracking-wide mb-2">
                  Provisioned
                </h3>
                <div className="flex flex-wrap gap-2">
                  {result.provisioned.map((t) => (
                    <span
                      key={t}
                      className="rounded-md border border-success/30 bg-success/10 px-2 py-1 text-xs font-mono text-success"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.already_existed.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-muted uppercase tracking-wide mb-2">
                  Already Existed
                </h3>
                <div className="flex flex-wrap gap-2">
                  {result.already_existed.map((t) => (
                    <span
                      key={t}
                      className="rounded-md border border-card-border bg-card px-2 py-1 text-xs font-mono text-muted"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.failed.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-muted uppercase tracking-wide mb-2">
                  Failed
                </h3>
                <div className="space-y-1">
                  {result.failed.map((f) => (
                    <div
                      key={f.table}
                      className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs"
                    >
                      <span className="font-mono font-medium text-danger">{f.table}</span>
                      <span className="text-muted ml-2">{f.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6">
        <Link href="/" className="text-sm text-accent hover:underline">
          &larr; Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
