import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser } from "@/lib/ncb-utils";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");
  const projectId = req.nextUrl.searchParams.get("project_id");
  const filter = projectId ? `&project_id=eq.${projectId}` : "";

  const res = await fetch(`${CONFIG.dataApiUrl}/read/ui_blueprint_drafts?Instance=${CONFIG.instance}&order=created_at.desc${filter}`, {
    headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies },
  });
  return NextResponse.json(await res.json());
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");
  const origin = req.headers.get("origin") || req.nextUrl.origin;

  const res = await fetch(`${CONFIG.dataApiUrl}/create/ui_blueprint_drafts?Instance=${CONFIG.instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies, Origin: origin },
    body: JSON.stringify({
      project_id: body.project_id,
      canvas_id: body.canvas_id,
      module_key: body.module_key,
      blueprint_json: body.blueprint_json || {},
      status: "draft",
      user_id: user.id,
    }),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.ok ? 201 : res.status });
}
