import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser } from "@/lib/ncb-utils";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");
  const url = `${CONFIG.dataApiUrl}/read/blueprint_modules?Instance=${CONFIG.instance}&order=layer.asc,name.asc`;

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
    },
  });

  const data = await res.json();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { module_key, name, layer, description } = body;
  if (!module_key || !name || !layer) {
    return NextResponse.json({ error: "module_key, name, and layer are required" }, { status: 400 });
  }

  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");
  const origin = req.headers.get("origin") || req.nextUrl.origin;
  const url = `${CONFIG.dataApiUrl}/create/blueprint_modules?Instance=${CONFIG.instance}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
      Origin: origin,
    },
    body: JSON.stringify({
      module_key,
      name,
      layer,
      description: description || null,
      user_id: user.id,
    }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.ok ? 201 : res.status });
}
