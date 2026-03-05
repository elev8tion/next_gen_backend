#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const seedPath = path.join(root, "src", "lib", "generator", "seed-data.json");
const outDir = path.join(root, "artifacts");
const outPath = path.join(outDir, "runtime-manifest.json");

const seedRaw = fs.readFileSync(seedPath, "utf8");
const seed = JSON.parse(seedRaw);

const modules = Array.isArray(seed.modules)
  ? seed.modules.map((m) => ({
      module_key: m.module_key,
      version: m.blueprint_json?.module?.version || null,
      dependency_keys: Array.isArray(m.blueprint_json?.dependencies)
        ? m.blueprint_json.dependencies.map((d) => d.module_key).filter(Boolean).sort()
        : [],
      entity_tables: Array.isArray(m.blueprint_json?.entities)
        ? m.blueprint_json.entities.map((e) => e.table).filter(Boolean).sort()
        : [],
    }))
  : [];

const packs = Array.isArray(seed.packs)
  ? seed.packs.map((p) => ({
      pack_key: p.pack_key,
      module_keys: Array.isArray(p.modules)
        ? p.modules.map((pm) => pm.module_key).filter(Boolean).sort()
        : [],
      config_keys: p.config ? Object.keys(p.config).sort() : [],
    }))
  : [];

modules.sort((a, b) => String(a.module_key).localeCompare(String(b.module_key)));
packs.sort((a, b) => String(a.pack_key).localeCompare(String(b.pack_key)));

const snapshot = {
  generated_by: "emit-determinism-snapshot",
  source: "src/lib/generator/seed-data.json",
  module_count: modules.length,
  pack_count: packs.length,
  modules,
  packs,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`Wrote ${path.relative(root, outPath)}`);
