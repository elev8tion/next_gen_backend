import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser } from "@/lib/ncb-utils";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");

  // Fetch packs
  const packsUrl = `${CONFIG.dataApiUrl}/read/blueprint_packs?Instance=${CONFIG.instance}&order=name.asc`;
  const packsRes = await fetch(packsUrl, {
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
    },
  });

  if (!packsRes.ok) {
    return NextResponse.json(
      { error: "Failed to fetch packs from NCB", status: packsRes.status },
      { status: packsRes.status === 401 || packsRes.status === 403 ? 401 : 502 }
    );
  }

  const packs = await packsRes.json();
  if (!Array.isArray(packs)) {
    return NextResponse.json([], { status: 200 });
  }

  // Fetch module counts per pack
  const modulesUrl = `${CONFIG.dataApiUrl}/read/pack_modules?Instance=${CONFIG.instance}`;
  const modulesRes = await fetch(modulesUrl, {
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
    },
  });

  const allModules = modulesRes.ok ? await modulesRes.json() : [];

  // Attach module count to each pack
  const result = packs.map((pack: { id: string; pack_key: string; name: string; description?: string }) => {
    const moduleCount = Array.isArray(allModules)
      ? (allModules as { pack_id: string }[]).filter((m) => m.pack_id === pack.id).length
      : 0;
    return { ...pack, module_count: moduleCount };
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { pack_key, name, description } = body;
  if (!pack_key || !name) {
    return NextResponse.json({ error: "pack_key and name are required" }, { status: 400 });
  }

  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");
  const origin = req.headers.get("origin") || req.nextUrl.origin;
  const url = `${CONFIG.dataApiUrl}/create/blueprint_packs?Instance=${CONFIG.instance}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
      Origin: origin,
    },
    body: JSON.stringify({
      pack_key,
      name,
      description: description || null,
      user_id: user.id,
    }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.ok ? 201 : res.status });
}
