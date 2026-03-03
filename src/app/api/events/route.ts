import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser } from "@/lib/ncb-utils";

export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") || "";
  const user = await getSessionUser(cookieHeader);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { event_name, entity_type, entity_id, payload } = body;

  if (!event_name) {
    return NextResponse.json({ error: "event_name is required" }, { status: 400 });
  }

  const authCookies = extractAuthCookies(cookieHeader);
  const origin = req.headers.get("origin") || req.nextUrl.origin;

  const res = await fetch(`${CONFIG.dataApiUrl}/create/events?Instance=${CONFIG.instance}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
      Origin: origin,
    },
    body: JSON.stringify({
      event_name,
      entity_type: entity_type || null,
      entity_id: entity_id || null,
      payload: payload || {},
      user_id: user.id,
    }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.ok ? 201 : res.status });
}
