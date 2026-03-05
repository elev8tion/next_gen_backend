import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser } from "@/lib/ncb-utils";

async function ncbFetch(
  path: string,
  authCookies: string,
  origin: string,
  method = "GET",
  body?: unknown
) {
  const url = `${CONFIG.dataApiUrl}/${path}?Instance=${CONFIG.instance}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
      Origin: origin,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") || "";
  const user = await getSessionUser(cookieHeader);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authCookies = extractAuthCookies(cookieHeader);
  const origin = req.headers.get("origin") || req.nextUrl.origin;

  const body = await req.json();
  const { name, description = null, config_json = null, organization_id = null } = body || {};

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const created = await ncbFetch("create/knowledge_collections", authCookies, origin, "POST", {
    name,
    description,
    config_json,
    organization_id,
    is_active: true,
  });

  if ((created as { error?: string })?.error) {
    return NextResponse.json(created, { status: 400 });
  }

  return NextResponse.json({ collection: created });
}
