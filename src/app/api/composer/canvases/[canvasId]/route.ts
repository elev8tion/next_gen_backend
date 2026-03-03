import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser } from "@/lib/ncb-utils";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ canvasId: string }> }
) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { canvasId } = await params;
  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");

  const [nodesRes, edgesRes] = await Promise.all([
    fetch(`${CONFIG.dataApiUrl}/read/ui_canvas_nodes?Instance=${CONFIG.instance}&canvas_id=eq.${canvasId}&order=created_at.asc`, {
      headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies },
    }),
    fetch(`${CONFIG.dataApiUrl}/read/ui_canvas_edges?Instance=${CONFIG.instance}&canvas_id=eq.${canvasId}`, {
      headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies },
    }),
  ]);

  const nodes = await nodesRes.json();
  const edges = await edgesRes.json();

  return NextResponse.json({ canvas_id: canvasId, nodes, edges });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ canvasId: string }> }
) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { canvasId } = await params;
  const body = await req.json();
  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");
  const origin = req.headers.get("origin") || req.nextUrl.origin;

  const res = await fetch(`${CONFIG.dataApiUrl}/update/ui_canvases?Instance=${CONFIG.instance}&id=eq.${canvasId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies, Origin: origin },
    body: JSON.stringify({ name: body.name }),
  });
  const data = await res.json();
  return NextResponse.json(data);
}
