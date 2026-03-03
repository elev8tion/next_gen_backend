import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser, unwrapNCBArray } from "@/lib/ncb-utils";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ packKey: string }> }
) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { packKey } = await params;
  const body = await req.json();
  const { module_key, sort_order } = body;

  if (!module_key) {
    return NextResponse.json({ error: "module_key is required" }, { status: 400 });
  }

  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");
  const origin = req.headers.get("origin") || req.nextUrl.origin;

  // Get pack
  const packUrl = `${CONFIG.dataApiUrl}/read/blueprint_packs?Instance=${CONFIG.instance}&pack_key=eq.${packKey}`;
  const packRes = await fetch(packUrl, {
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
    },
  });
  const packs = unwrapNCBArray(await packRes.json());
  if (!packs.length) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }
  const packId = packs[0].id;

  // Get latest version for module
  const verUrl = `${CONFIG.dataApiUrl}/read/blueprint_versions?Instance=${CONFIG.instance}&module_key=eq.${module_key}&order=created_at.desc&limit=1`;
  const verRes = await fetch(verUrl, {
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
    },
  });
  const versions = unwrapNCBArray(await verRes.json());
  if (!versions.length) {
    return NextResponse.json({ error: `No version found for module: ${module_key}` }, { status: 404 });
  }
  const versionId = versions[0].id;

  // Get current max load_order
  const modsUrl = `${CONFIG.dataApiUrl}/read/pack_modules?Instance=${CONFIG.instance}&pack_id=eq.${packId}&order=load_order.desc&limit=1`;
  const modsRes = await fetch(modsUrl, {
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
    },
  });
  const existingMods = unwrapNCBArray(await modsRes.json());
  const maxOrder = existingMods.length ? (existingMods[0] as { load_order: number }).load_order : 0;

  const createUrl = `${CONFIG.dataApiUrl}/create/pack_modules?Instance=${CONFIG.instance}`;
  const res = await fetch(createUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
      Origin: origin,
    },
    body: JSON.stringify({
      pack_id: packId,
      module_key,
      version_id: versionId,
      load_order: sort_order ?? maxOrder + 1,
      user_id: user.id,
    }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.ok ? 201 : res.status });
}
