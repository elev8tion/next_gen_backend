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

  const res = await fetch(`${CONFIG.dataApiUrl}/read/ui_canvas_edges?Instance=${CONFIG.instance}&canvas_id=eq.${canvasId}`, {
    headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies },
  });
  return NextResponse.json(await res.json());
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ canvasId: string }> }
) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { canvasId } = await params;
  const body = await req.json();
  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");
  const origin = req.headers.get("origin") || req.nextUrl.origin;

  const res = await fetch(`${CONFIG.dataApiUrl}/create/ui_canvas_edges?Instance=${CONFIG.instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies, Origin: origin },
    body: JSON.stringify({
      canvas_id: canvasId,
      source_node_id: body.source_node_id,
      target_node_id: body.target_node_id,
      edge_type: body.edge_type || "relationship",
      data_json: body.data_json || {},
      user_id: user.id,
    }),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.ok ? 201 : res.status });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ canvasId: string }> }
) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");
  const origin = req.headers.get("origin") || req.nextUrl.origin;

  if (body.edge_id) {
    await fetch(`${CONFIG.dataApiUrl}/delete/ui_canvas_edges?Instance=${CONFIG.instance}&id=eq.${body.edge_id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies, Origin: origin },
    });
  }
  return NextResponse.json({ deleted: true });
}
