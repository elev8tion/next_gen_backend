import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser } from "@/lib/ncb-utils";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ draftId: string }> }
) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { draftId } = await params;
  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");

  const res = await fetch(`${CONFIG.dataApiUrl}/read/ui_blueprint_drafts?Instance=${CONFIG.instance}&id=eq.${draftId}`, {
    headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies },
  });
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data[0]);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ draftId: string }> }
) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { draftId } = await params;
  const body = await req.json();
  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");
  const origin = req.headers.get("origin") || req.nextUrl.origin;

  const res = await fetch(`${CONFIG.dataApiUrl}/update/ui_blueprint_drafts?Instance=${CONFIG.instance}&id=eq.${draftId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies, Origin: origin },
    body: JSON.stringify({ blueprint_json: body.blueprint_json, status: body.status }),
  });
  return NextResponse.json(await res.json());
}
