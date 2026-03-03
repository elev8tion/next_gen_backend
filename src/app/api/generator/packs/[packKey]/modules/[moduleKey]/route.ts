import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser } from "@/lib/ncb-utils";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ packKey: string; moduleKey: string }> }
) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { packKey, moduleKey } = await params;
  const body = await req.json();
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

  const updateUrl = `${CONFIG.dataApiUrl}/update/pack_modules?Instance=${CONFIG.instance}&pack_id=eq.${packs[0].id}&module_key=eq.${moduleKey}`;
  const res = await fetch(updateUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
      Origin: origin,
    },
    body: JSON.stringify({ load_order: body.load_order }),
  });

  const data = await res.json();
  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ packKey: string; moduleKey: string }> }
) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { packKey, moduleKey } = await params;
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

  const deleteUrl = `${CONFIG.dataApiUrl}/delete/pack_modules?Instance=${CONFIG.instance}&pack_id=eq.${packs[0].id}&module_key=eq.${moduleKey}`;
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
