import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser, unwrapNCBArray } from "@/lib/ncb-utils";
import { DependencyResolver } from "@/lib/generator/resolver";
import { ConfigEvaluator } from "@/lib/generator/config-evaluator";
import { ManifestValidator } from "@/lib/generator/validator";
import { SQLGenerator } from "@/lib/generator/sql-generator";
import type { BlueprintModule, BlueprintVersionRecord } from "@/lib/generator/types";

export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") || "";
  const user = await getSessionUser(cookieHeader);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as {
    module_keys?: string[];
    config?: Record<string, unknown>;
  };

  const moduleKeys = body.module_keys;
  if (!moduleKeys || !Array.isArray(moduleKeys) || moduleKeys.length === 0) {
    return NextResponse.json(
      { error: "module_keys is required and must be a non-empty array" },
      { status: 400 }
    );
  }

  const authCookies = extractAuthCookies(cookieHeader);

  try {
    // Fetch latest blueprint_versions for each module_key
    const url = `${CONFIG.dataApiUrl}/read/blueprint_versions?Instance=${CONFIG.instance}&module_key=in.(${moduleKeys.join(",")})&order=created_at.desc`;
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        "X-Database-Instance": CONFIG.instance,
        Cookie: authCookies,
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch blueprint versions" },
        { status: 502 }
      );
    }

    const allVersions = unwrapNCBArray(await res.json()) as BlueprintVersionRecord[];
    if (allVersions.length === 0) {
      return NextResponse.json(
        { sql: "-- No blueprint versions found for the given module keys", validation: { ok: false, errors: ["No blueprint versions found"], warnings: [] } }
      );
    }

    // Deduplicate: keep latest per module_key
    const latestByKey = new Map<string, BlueprintVersionRecord>();
    for (const v of allVersions) {
      if (!latestByKey.has(v.module_key)) {
        latestByKey.set(v.module_key, v);
      }
    }

    // Parse blueprints
    const modules: BlueprintModule[] = [];
    for (const [, ver] of latestByKey) {
      const blueprint =
        typeof ver.blueprint_json === "string"
          ? JSON.parse(ver.blueprint_json as unknown as string)
          : ver.blueprint_json;

      if (!blueprint.module || !blueprint.entities) {
        continue;
      }

      modules.push(blueprint);
    }

    if (modules.length === 0) {
      return NextResponse.json(
        { sql: "-- No valid blueprints found", validation: { ok: false, errors: ["No valid blueprints found"], warnings: [] } }
      );
    }

    // Run pipeline
    const resolver = new DependencyResolver();
    const sorted = resolver.resolve(modules);

    const evaluator = new ConfigEvaluator();
    const config = (body.config || {}) as Record<string, boolean | string | number>;
    const manifest = evaluator.evaluate(sorted, config);

    const validator = new ManifestValidator();
    const validation = validator.validate(manifest);

    const generator = new SQLGenerator();
    const sql = generator.generate(manifest);

    return NextResponse.json({ sql, validation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pipeline failed";
    return NextResponse.json(
      { sql: `-- Error: ${message}`, validation: { ok: false, errors: [message], warnings: [] } }
    );
  }
}
