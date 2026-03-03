import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser } from "@/lib/ncb-utils";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ packKey: string }> }
) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { packKey } = await params;
  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");

  // Fetch pack
  const packUrl = `${CONFIG.dataApiUrl}/read/blueprint_packs?Instance=${CONFIG.instance}&pack_key=eq.${packKey}`;
  const packRes = await fetch(packUrl, {
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
    },
  });
  const packs = await packRes.json();
  if (!Array.isArray(packs) || !packs.length) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }
  const pack = packs[0];

  // Fetch pack modules with version details
  const modulesUrl = `${CONFIG.dataApiUrl}/read/pack_modules?Instance=${CONFIG.instance}&pack_id=eq.${pack.id}&order=load_order.asc`;
  const modulesRes = await fetch(modulesUrl, {
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
    },
  });
  const modules = await modulesRes.json();

  // Fetch blueprint versions for these modules
  const versionIds = (modules as { version_id: string }[]).map((m) => m.version_id);
  let versions: { id: string; module_key: string; version: string; blueprint_json: Record<string, unknown> }[] = [];
  if (versionIds.length) {
    const versionsUrl = `${CONFIG.dataApiUrl}/read/blueprint_versions?Instance=${CONFIG.instance}&id=in.(${versionIds.join(",")})`;
    const versionsRes = await fetch(versionsUrl, {
      headers: {
        "Content-Type": "application/json",
        "X-Database-Instance": CONFIG.instance,
        Cookie: authCookies,
      },
    });
    versions = await versionsRes.json();
  }

  // Fetch pack config
  const configUrl = `${CONFIG.dataApiUrl}/read/pack_config?Instance=${CONFIG.instance}&pack_id=eq.${pack.id}`;
  const configRes = await fetch(configUrl, {
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
    },
  });
  const configs = await configRes.json();

  const versionMap = new Map(versions.map((v) => [v.id, v]));
  const enrichedModules = (modules as { module_key: string; version_id: string; load_order: number }[]).map((m) => {
    const ver = versionMap.get(m.version_id);
    const blueprint = ver?.blueprint_json as { module?: { name?: string; layer?: string } } | undefined;
    return {
      module_key: m.module_key,
      load_order: m.load_order,
      version: ver?.version,
      name: blueprint?.module?.name || m.module_key,
      layer: blueprint?.module?.layer || "unknown",
    };
  });

  return NextResponse.json({
    ...pack,
    modules: enrichedModules,
    config: Array.isArray(configs) && configs.length ? configs[0].config_json : {},
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ packKey: string }> }
) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { packKey } = await params;
  const body = await req.json();
  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");
  const origin = req.headers.get("origin") || req.nextUrl.origin;

  // Get pack ID
  const packUrl = `${CONFIG.dataApiUrl}/read/blueprint_packs?Instance=${CONFIG.instance}&pack_key=eq.${packKey}`;
  const packRes = await fetch(packUrl, {
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
    },
  });
  const packs = await packRes.json();
  if (!Array.isArray(packs) || !packs.length) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }

  const updateUrl = `${CONFIG.dataApiUrl}/update/blueprint_packs?Instance=${CONFIG.instance}&id=eq.${packs[0].id}`;
  const res = await fetch(updateUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
      Origin: origin,
    },
    body: JSON.stringify({
      name: body.name,
      description: body.description,
    }),
  });

  const data = await res.json();
  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ packKey: string }> }
) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { packKey } = await params;
  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");
  const origin = req.headers.get("origin") || req.nextUrl.origin;

  // Get pack ID
  const packUrl = `${CONFIG.dataApiUrl}/read/blueprint_packs?Instance=${CONFIG.instance}&pack_key=eq.${packKey}`;
  const packRes = await fetch(packUrl, {
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
    },
  });
  const packs = await packRes.json();
  if (!Array.isArray(packs) || !packs.length) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }

  const packId = packs[0].id;

  // Delete pack_config, pack_modules, then the pack itself
  for (const table of ["pack_config", "pack_modules"]) {
    await fetch(`${CONFIG.dataApiUrl}/delete/${table}?Instance=${CONFIG.instance}&pack_id=eq.${packId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "X-Database-Instance": CONFIG.instance,
        Cookie: authCookies,
        Origin: origin,
      },
    });
  }

  const deleteUrl = `${CONFIG.dataApiUrl}/delete/blueprint_packs?Instance=${CONFIG.instance}&id=eq.${packId}`;
  const res = await fetch(deleteUrl, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
      Origin: origin,
    },
  });

  return NextResponse.json({ deleted: true }, { status: res.ok ? 200 : res.status });
}
