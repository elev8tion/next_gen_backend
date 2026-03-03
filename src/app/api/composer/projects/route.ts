import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser } from "@/lib/ncb-utils";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");
  const url = `${CONFIG.dataApiUrl}/read/ui_projects?Instance=${CONFIG.instance}&order=created_at.desc`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies },
  });
  const data = await res.json();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");
  const origin = req.headers.get("origin") || req.nextUrl.origin;

  // Create project
  const projRes = await fetch(`${CONFIG.dataApiUrl}/create/ui_projects?Instance=${CONFIG.instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies, Origin: origin },
    body: JSON.stringify({ name: body.name, description: body.description || null, user_id: user.id }),
  });
  const project = await projRes.json();
  if (!projRes.ok) return NextResponse.json(project, { status: projRes.status });

  // Auto-create a default canvas
  const canvasRes = await fetch(`${CONFIG.dataApiUrl}/create/ui_canvases?Instance=${CONFIG.instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies, Origin: origin },
    body: JSON.stringify({ project_id: project.id, name: "Main Canvas", user_id: user.id }),
  });
  const canvas = await canvasRes.json();

  return NextResponse.json({ ...project, canvas_id: canvas.id }, { status: 201 });
}
