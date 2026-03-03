import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser } from "@/lib/ncb-utils";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key } = await params;
  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");
  const url = `${CONFIG.dataApiUrl}/read/blueprint_versions?Instance=${CONFIG.instance}&module_key=eq.${key}&order=created_at.desc`;

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
    },
  });

  const data = await res.json();
  const versions = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.rows) ? data.rows : [];
  return NextResponse.json(versions);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key } = await params;
  const body = await req.json();
  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");
  const url = `${CONFIG.dataApiUrl}/create/blueprint_versions?Instance=${CONFIG.instance}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
    },
    body: JSON.stringify({
      module_key: key,
      version: body.version,
      blueprint_json: body.blueprint_json,
      user_id: user.id,
    }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.ok ? 201 : res.status });
}
