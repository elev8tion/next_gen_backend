import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser } from "@/lib/ncb-utils";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");

  const [projRes, canvasesRes] = await Promise.all([
    fetch(`${CONFIG.dataApiUrl}/read/ui_projects?Instance=${CONFIG.instance}&id=eq.${projectId}`, {
      headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies },
    }),
    fetch(`${CONFIG.dataApiUrl}/read/ui_canvases?Instance=${CONFIG.instance}&project_id=eq.${projectId}`, {
      headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies },
    }),
  ]);

  const projects = await projRes.json();
  const canvases = await canvasesRes.json();

  if (!Array.isArray(projects) || !projects.length) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ ...projects[0], canvases });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const body = await req.json();
  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");
  const origin = req.headers.get("origin") || req.nextUrl.origin;

  const res = await fetch(`${CONFIG.dataApiUrl}/update/ui_projects?Instance=${CONFIG.instance}&id=eq.${projectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies, Origin: origin },
    body: JSON.stringify({ name: body.name, description: body.description }),
  });
  const data = await res.json();
  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");
  const origin = req.headers.get("origin") || req.nextUrl.origin;

  // Cascade delete canvases (nodes/edges), then project
  const canvasesRes = await fetch(`${CONFIG.dataApiUrl}/read/ui_canvases?Instance=${CONFIG.instance}&project_id=eq.${projectId}`, {
    headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies },
  });
  const canvases = await canvasesRes.json();

  if (Array.isArray(canvases)) {
    for (const canvas of canvases) {
      for (const table of ["ui_canvas_edges", "ui_canvas_nodes"]) {
        await fetch(`${CONFIG.dataApiUrl}/delete/${table}?Instance=${CONFIG.instance}&canvas_id=eq.${canvas.id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies, Origin: origin },
        });
      }
    }
    await fetch(`${CONFIG.dataApiUrl}/delete/ui_canvases?Instance=${CONFIG.instance}&project_id=eq.${projectId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies, Origin: origin },
    });
  }

  await fetch(`${CONFIG.dataApiUrl}/delete/ui_projects?Instance=${CONFIG.instance}&id=eq.${projectId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies, Origin: origin },
  });

  return NextResponse.json({ deleted: true });
}
