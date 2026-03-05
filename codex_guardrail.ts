#!/usr/bin/env node
/**
 * Codex Guardrail — Architecture Validator
 * ----------------------------------------
 * Goal: fail fast if changes violate core architecture constraints.
 *
 * Usage (recommended):
 *   npx tsx codex_guardrail.ts --config codex_guardrail.config.json
 *
 * Alternative:
 *   npx ts-node codex_guardrail.ts --config codex_guardrail.config.json
 *
 * This tool is intentionally conservative: it flags likely violations
 * instead of trying to perfectly prove correctness.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { execSync } from "child_process";

type Severity = "error" | "warning";

type Finding = {
  severity: Severity;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

type Config = {
  // Files that must exist (relative to repo root)
  required_files: string[];

  // Directories to search for blueprint modules (relative to repo root).
  // The tool will also auto-discover JSON blueprints if this is empty.
  blueprint_dirs: string[];

  // Keys that define layers (used for dependency checks)
  layers: {
    core: string[];
    domain: string[];
    automation: string[];
    ai: string[];
    system?: string[];
  };

  // Forbidden dependencies / frameworks / patterns
  forbidden_import_substrings: string[];

  // File globs-ish: directories to scan for code checks
  code_dirs: string[];

  // Optional: run a deterministic build command twice and compare outputs
  determinism_test?: {
    enabled: boolean;
    command: string;     // e.g. "npm run build:manifest -- --pack crm.ai_first.v1"
    output_paths: string[]; // paths to compare after each run (relative to repo root)
  };
};

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

function exists(p: string): boolean {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function sha256File(p: string): string {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(p));
  return h.digest("hex");
}

function walkFiles(root: string, filter: (p: string) => boolean): string[] {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length) {
    const cur = stack.pop()!;
    let st: fs.Stats;
    try { st = fs.statSync(cur); } catch { continue; }
    if (st.isDirectory()) {
      const entries = fs.readdirSync(cur).map(e => path.join(cur, e));
      for (const e of entries) stack.push(e);
    } else if (st.isFile()) {
      if (filter(cur)) out.push(cur);
    }
  }
  return out;
}

function repoRoot(): string {
  // heuristic: current working directory when running hook
  return process.cwd();
}

function parseArgs(): { configPath: string } {
  const idx = process.argv.indexOf("--config");
  if (idx !== -1 && process.argv[idx + 1]) {
    return { configPath: process.argv[idx + 1] };
  }
  return { configPath: "codex_guardrail.config.json" };
}

function addFinding(findings: Finding[], severity: Severity, code: string, message: string, details?: Record<string, unknown>) {
  findings.push({ severity, code, message, details });
}

function loadConfig(root: string, configPath: string): Config {
  const absolute = path.isAbsolute(configPath) ? configPath : path.join(root, configPath);
  if (!exists(absolute)) {
    throw new Error(`Config not found: ${absolute}`);
  }
  return readJson<Config>(absolute);
}

// Very lightweight blueprint extractor: look for JSON files containing module.key and dependencies.
type BlueprintSummary = {
  file: string;
  module_key: string;
  dependencies: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractDependencyKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const deps: string[] = [];
  for (const dep of value) {
    if (isRecord(dep) && typeof dep.module_key === "string") {
      deps.push(dep.module_key);
    }
  }
  return deps;
}

function tryParseBlueprints(filePath: string): BlueprintSummary[] {
  const raw = fs.readFileSync(filePath, "utf8");
  // Quick reject for large non-JSON files
  if (!raw.includes('"module"') && !raw.includes('"module_key"')) return [];
  let obj: unknown;
  try { obj = JSON.parse(raw); } catch { return []; }
  if (!isRecord(obj)) return [];

  const results: BlueprintSummary[] = [];

  // Format A: standalone blueprint module JSON
  if (isRecord(obj.module) && typeof obj.module.key === "string") {
    results.push({
      file: filePath,
      module_key: obj.module.key,
      dependencies: extractDependencyKeys(obj.dependencies),
    });
  }

  // Format B: seed-data.json with modules[]
  if (Array.isArray(obj.modules)) {
    for (const entry of obj.modules) {
      if (!isRecord(entry) || typeof entry.module_key !== "string") continue;
      const blueprintJson = isRecord(entry.blueprint_json) ? entry.blueprint_json : null;
      const deps = blueprintJson ? extractDependencyKeys(blueprintJson.dependencies) : [];
      results.push({
        file: filePath,
        module_key: entry.module_key,
        dependencies: deps,
      });
    }
  }

  return results;
}

function discoverBlueprints(root: string, cfg: Config): BlueprintSummary[] {
  const candidates: string[] = [];

  const dirs = (cfg.blueprint_dirs && cfg.blueprint_dirs.length) ? cfg.blueprint_dirs : [];
  if (dirs.length) {
    for (const d of dirs) {
      const abs = path.join(root, d);
      if (exists(abs)) {
        candidates.push(...walkFiles(abs, p => p.endsWith(".json")));
      }
    }
  } else {
    // auto-discover: look for JSON files likely to be modules
    candidates.push(...walkFiles(root, p =>
      p.endsWith(".json") &&
      !p.includes(`${path.sep}node_modules${path.sep}`) &&
      !p.includes(`${path.sep}.git${path.sep}`) &&
      !p.includes(`${path.sep}dist${path.sep}`) &&
      !p.includes(`${path.sep}build${path.sep}`) &&
      !p.includes(`${path.sep}.next${path.sep}`) &&
      !p.includes(`${path.sep}coverage${path.sep}`)
    ));
  }

  const out: BlueprintSummary[] = [];
  for (const f of candidates) {
    const summaries = tryParseBlueprints(f);
    if (summaries.length) out.push(...summaries);
  }
  const deduped = new Map<string, BlueprintSummary>();
  for (const bp of out) {
    deduped.set(`${bp.file}:${bp.module_key}`, bp);
  }
  return Array.from(deduped.values());
}

function classifyLayer(cfg: Config, moduleKey: string): string | null {
  for (const [layer, keys] of Object.entries(cfg.layers)) {
    if (keys.includes(moduleKey)) return layer;
  }
  // heuristic: prefix-based
  if (moduleKey.startsWith("core.")) return "core";
  if (moduleKey.startsWith("automation.")) return "automation";
  if (moduleKey.startsWith("ai.")) return "ai";
  if (moduleKey.startsWith("system.")) return "system";
  // known domain keys list
  const domainSet = new Set(cfg.layers.domain);
  if (domainSet.has(moduleKey)) return "domain";
  return null;
}

function checkRequiredFiles(root: string, cfg: Config, findings: Finding[]) {
  for (const rel of cfg.required_files) {
    const abs = path.join(root, rel);
    if (!exists(abs)) {
      addFinding(findings, "error", "REQ_FILE_MISSING", `Required file missing: ${rel}`);
    }
  }
}

function checkForbiddenImports(root: string, cfg: Config, findings: Finding[]) {
  const scanDirs = cfg.code_dirs?.length ? cfg.code_dirs : ["src"];
  const files: string[] = [];
  for (const d of scanDirs) {
    const abs = path.join(root, d);
    if (!exists(abs)) continue;
    files.push(...walkFiles(abs, p =>
      (p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".js") || p.endsWith(".jsx")) &&
      !p.includes(`${path.sep}node_modules${path.sep}`) &&
      !p.includes(`${path.sep}.next${path.sep}`) &&
      !p.includes(`${path.sep}dist${path.sep}`)
    ));
  }

  const forbidden = cfg.forbidden_import_substrings || [];
  const hits: Array<{ file: string; token: string }> = [];
  for (const f of files) {
    const txt = fs.readFileSync(f, "utf8");
    for (const token of forbidden) {
      if (txt.includes(token)) {
        hits.push({ file: path.relative(root, f), token });
      }
    }
  }

  if (hits.length) {
    addFinding(findings, "error", "FORBIDDEN_IMPORT", "Forbidden framework/pattern detected in code.", { hits });
  }
}

function checkLayerDependencies(cfg: Config, blueprints: BlueprintSummary[], findings: Finding[]) {
  // Build map
  const byKey = new Map<string, BlueprintSummary>();
  for (const b of blueprints) byKey.set(b.module_key, b);

  // Enforce: domain modules must not depend on other domain modules (unless explicitly allowed).
  const domainSet = new Set(cfg.layers.domain);

  for (const b of blueprints) {
    const layer = classifyLayer(cfg, b.module_key);
    if (layer === "domain") {
      const domainDeps = b.dependencies.filter(d => domainSet.has(d));
      if (domainDeps.length) {
        addFinding(
          findings,
          "error",
          "DOMAIN_DEPENDS_ON_DOMAIN",
          `Domain module "${b.module_key}" depends on domain module(s): ${domainDeps.join(", ")}`,
          { module: b.module_key, deps: domainDeps, file: b.file }
        );
      }
    }
  }
}

function checkVectorExtensionHint(root: string, findings: Finding[]) {
  // This is a heuristic check to nudge pgvector extension handling.
  const candidates = [
    path.join(root, "src", "lib", "generator", "sql-generator.ts"),
    path.join(root, "src", "lib", "generator", "sql_generator.ts"),
  ];
  for (const c of candidates) {
    if (exists(c)) {
      const txt = fs.readFileSync(c, "utf8");
      if (!txt.includes("CREATE EXTENSION") || !txt.toLowerCase().includes("vector")) {
        addFinding(findings, "warning", "VECTOR_EXTENSION_NOT_FOUND", "SQL generator may be missing pgvector extension creation.");
      }
      return;
    }
  }
  addFinding(findings, "warning", "SQL_GENERATOR_NOT_FOUND", "Could not find sql-generator.ts to check pgvector extension handling.");
}

function runDeterminismTest(root: string, cfg: Config, findings: Finding[]) {
  const det = cfg.determinism_test;
  if (!det?.enabled) return;

  const cmd = det.command?.trim();
  if (!cmd) {
    addFinding(findings, "warning", "DETERMINISM_NO_CMD", "Determinism test enabled but no command provided.");
    return;
  }
  const outputs = det.output_paths || [];
  if (!outputs.length) {
    addFinding(findings, "warning", "DETERMINISM_NO_OUTPUTS", "Determinism test enabled but no output_paths provided.");
    return;
  }

  // Run command twice and hash outputs
  const runOnce = (label: string): Record<string, string> => {
    execSync(cmd, { cwd: root, stdio: "inherit", shell: "/bin/sh" });
    const hashes: Record<string, string> = {};
    for (const rel of outputs) {
      const abs = path.join(root, rel);
      if (!exists(abs)) {
        addFinding(findings, "error", "DETERMINISM_OUTPUT_MISSING", `Determinism output missing after ${label}: ${rel}`);
      } else {
        hashes[rel] = sha256File(abs);
      }
    }
    return hashes;
  };

  let h1: Record<string, string> = {};
  let h2: Record<string, string> = {};
  try {
    h1 = runOnce("run1");
    h2 = runOnce("run2");
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    addFinding(findings, "error", "DETERMINISM_CMD_FAILED", "Determinism command failed to run.", { error: message });
    return;
  }

  const diffs: Array<{ path: string; run1: string; run2: string }> = [];
  for (const rel of outputs) {
    if (h1[rel] && h2[rel] && h1[rel] !== h2[rel]) diffs.push({ path: rel, run1: h1[rel], run2: h2[rel] });
  }
  if (diffs.length) {
    addFinding(findings, "error", "NON_DETERMINISTIC_OUTPUT", "Generator output differs across identical runs.", { diffs });
  }
}

function printFindings(findings: Finding[]) {
  const errors = findings.filter(f => f.severity === "error");
  const warnings = findings.filter(f => f.severity === "warning");

  const fmt = (f: Finding) => {
    const head = f.severity.toUpperCase();
    const details = f.details ? `\n    details: ${JSON.stringify(f.details, null, 2).split("\n").join("\n    ")}` : "";
    return `- [${head}] ${f.code}: ${f.message}${details}`;
  };

  console.log("\nCodex Guardrail Report");
  console.log("======================");
  if (!findings.length) {
    console.log("✅ No issues found.");
    return;
  }
  if (errors.length) {
    console.log("\nErrors:");
    for (const e of errors) console.log(fmt(e));
  }
  if (warnings.length) {
    console.log("\nWarnings:");
    for (const w of warnings) console.log(fmt(w));
  }
}

async function main() {
  const root = repoRoot();
  const { configPath } = parseArgs();
  const findings: Finding[] = [];

  let cfg: Config;
  try {
    cfg = loadConfig(root, configPath);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(message);
    process.exit(2);
    return;
  }

  checkRequiredFiles(root, cfg, findings);
  checkForbiddenImports(root, cfg, findings);

  const blueprints = discoverBlueprints(root, cfg);
  if (blueprints.length === 0) {
    addFinding(findings, "warning", "NO_BLUEPRINTS_FOUND", "No blueprint JSON modules discovered. Configure blueprint_dirs in codex_guardrail.config.json.");
  } else {
    checkLayerDependencies(cfg, blueprints, findings);
  }

  checkVectorExtensionHint(root, findings);
  runDeterminismTest(root, cfg, findings);

  printFindings(findings);

  const hasErrors = findings.some(f => f.severity === "error");
  process.exit(hasErrors ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
