import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser, unwrapNCBArray } from "@/lib/ncb-utils";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ canvasId: string }> }
) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { canvasId } = await params;
  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");

  const res = await fetch(`${CONFIG.dataApiUrl}/read/ui_canvas_nodes?Instance=${CONFIG.instance}&canvas_id=eq.${canvasId}&order=created_at.asc`, {
    headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies },
  });
  return NextResponse.json(unwrapNCBArray(await res.json()));
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

  const res = await fetch(`${CONFIG.dataApiUrl}/create/ui_canvas_nodes?Instance=${CONFIG.instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies, Origin: origin },
    body: JSON.stringify({
      canvas_id: canvasId,
      node_type: body.node_type,
      module_key: body.module_key || null,
      entity_name: body.entity_name || null,
      position_x: body.position_x || 0,
      position_y: body.position_y || 0,
      data_json: body.data_json || {},
      user_id: user.id,
    }),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.ok ? 201 : res.status });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ canvasId: string }> }
) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");
  const origin = req.headers.get("origin") || req.nextUrl.origin;

  // Batch update positions
  if (Array.isArray(body.updates)) {
    for (const update of body.updates) {
      await fetch(`${CONFIG.dataApiUrl}/update/ui_canvas_nodes?Instance=${CONFIG.instance}&id=eq.${update.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies, Origin: origin },
        body: JSON.stringify({ position_x: update.position_x, position_y: update.position_y }),
      });
    }
  }

  return NextResponse.json({ updated: true });
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

  if (body.node_id) {
    await fetch(`${CONFIG.dataApiUrl}/delete/ui_canvas_nodes?Instance=${CONFIG.instance}&id=eq.${body.node_id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies, Origin: origin },
    });
  }
  return NextResponse.json({ deleted: true });
}
