import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser, unwrapNCBArray } from "@/lib/ncb-utils";
import seedData from "@/lib/generator/seed-data.json";

interface SeedModule {
  module_key: string;
  name: string;
  layer: string;
  description: string;
  blueprint_json: Record<string, unknown>;
}

interface SeedPack {
  pack_key: string;
  name: string;
  description: string;
  modules: { module_key: string; load_order: number }[];
  config: Record<string, boolean | string | number>;
}

async function ncbCreate(
  table: string,
  body: Record<string, unknown>,
  authCookies: string,
  origin: string
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const url = `${CONFIG.dataApiUrl}/create/${table}?Instance=${CONFIG.instance}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
      Origin: origin,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

async function ncbRead(
  table: string,
  query: string,
  authCookies: string
): Promise<Record<string, unknown>[]> {
  const url = `${CONFIG.dataApiUrl}/read/${table}?Instance=${CONFIG.instance}&${query}`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return unwrapNCBArray(data);
}

export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") || "";
  const user = await getSessionUser(cookieHeader);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authCookies = extractAuthCookies(cookieHeader);
  const origin = req.headers.get("origin") || req.nextUrl.origin;

  // Check if already seeded
  const existing = await ncbRead("blueprint_modules", "limit=1", authCookies);
  if (existing.length > 0) {
    return NextResponse.json({ already_seeded: true, message: "Database already has modules." });
  }

  const modules = seedData.modules as unknown as SeedModule[];
  const packs = seedData.packs as unknown as SeedPack[];

  const results = {
    modules_created: 0,
    versions_created: 0,
    packs_created: 0,
    pack_modules_linked: 0,
    pack_configs_created: 0,
    errors: [] as string[],
  };

  // Step 1: Create all modules + versions
  const versionIdMap: Record<string, string> = {};

  for (const mod of modules) {
    // Create module record
    const modResult = await ncbCreate(
      "blueprint_modules",
      {
        module_key: mod.module_key,
        name: mod.name,
        layer: mod.layer,
        description: mod.description,
        user_id: user.id,
      },
      authCookies,
      origin
    );

    if (!modResult.ok) {
      results.errors.push(`Module ${mod.module_key}: ${JSON.stringify(modResult.data)}`);
      continue;
    }
    results.modules_created++;

    // Create version record
    const verResult = await ncbCreate(
      "blueprint_versions",
      {
        module_key: mod.module_key,
        version: "1.0.0",
        blueprint_json: mod.blueprint_json,
        user_id: user.id,
      },
      authCookies,
      origin
    );

    if (!verResult.ok) {
      results.errors.push(`Version ${mod.module_key}: ${JSON.stringify(verResult.data)}`);
      continue;
    }
    results.versions_created++;

    const verId = (verResult.data as { id?: string }).id;
    if (verId) {
      versionIdMap[mod.module_key] = verId;
    }
  }

  // Step 2: Create packs with modules and configs
  for (const pack of packs) {
    // Create pack record
    const packResult = await ncbCreate(
      "blueprint_packs",
      {
        pack_key: pack.pack_key,
        name: pack.name,
        description: pack.description,
        user_id: user.id,
      },
      authCookies,
      origin
    );

    if (!packResult.ok) {
      results.errors.push(`Pack ${pack.pack_key}: ${JSON.stringify(packResult.data)}`);
      continue;
    }
    results.packs_created++;

    const packId = (packResult.data as { id?: string }).id;
    if (!packId) {
      results.errors.push(`Pack ${pack.pack_key}: no id returned`);
      continue;
    }

    // Link modules to pack
    for (const pm of pack.modules) {
      const versionId = versionIdMap[pm.module_key];
      if (!versionId) {
        results.errors.push(`Pack ${pack.pack_key}: no version for ${pm.module_key}`);
        continue;
      }

      const linkResult = await ncbCreate(
        "pack_modules",
        {
          pack_id: packId,
          module_key: pm.module_key,
          version_id: versionId,
          load_order: pm.load_order,
          user_id: user.id,
        },
        authCookies,
        origin
      );

      if (linkResult.ok) {
        results.pack_modules_linked++;
      } else {
        results.errors.push(`pack_modules ${pack.pack_key}/${pm.module_key}: ${JSON.stringify(linkResult.data)}`);
      }
    }

    // Create pack config
    if (Object.keys(pack.config).length > 0) {
      const cfgResult = await ncbCreate(
        "pack_config",
        {
          pack_id: packId,
          config_json: pack.config,
          user_id: user.id,
        },
        authCookies,
        origin
      );

      if (cfgResult.ok) {
        results.pack_configs_created++;
      } else {
        results.errors.push(`pack_config ${pack.pack_key}: ${JSON.stringify(cfgResult.data)}`);
      }
    }
  }

  return NextResponse.json({
    success: results.errors.length === 0,
    ...results,
  });
}
