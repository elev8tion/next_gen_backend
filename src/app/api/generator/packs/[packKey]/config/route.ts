import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser } from "@/lib/ncb-utils";

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
  const { config_json } = body;

  if (!config_json || typeof config_json !== "object") {
    return NextResponse.json({ error: "config_json object is required" }, { status: 400 });
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
  const packs = await packRes.json();
  if (!Array.isArray(packs) || !packs.length) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }
  const packId = packs[0].id;

  // Check if config already exists
  const cfgUrl = `${CONFIG.dataApiUrl}/read/pack_config?Instance=${CONFIG.instance}&pack_id=eq.${packId}`;
  const cfgRes = await fetch(cfgUrl, {
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
    },
  });
  const configs = await cfgRes.json();

  let res: Response;
  if (Array.isArray(configs) && configs.length) {
    // Update existing
    const updateUrl = `${CONFIG.dataApiUrl}/update/pack_config?Instance=${CONFIG.instance}&id=eq.${configs[0].id}`;
    res = await fetch(updateUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Database-Instance": CONFIG.instance,
        Cookie: authCookies,
        Origin: origin,
      },
      body: JSON.stringify({ config_json }),
    });
  } else {
    // Create new
    const createUrl = `${CONFIG.dataApiUrl}/create/pack_config?Instance=${CONFIG.instance}`;
    res = await fetch(createUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Database-Instance": CONFIG.instance,
        Cookie: authCookies,
        Origin: origin,
      },
      body: JSON.stringify({
        pack_id: packId,
        config_json,
        user_id: user.id,
      }),
    });
  }

  const data = await res.json();
  return NextResponse.json(data, { status: res.ok ? 200 : res.status });
}
