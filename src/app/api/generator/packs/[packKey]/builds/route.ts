import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser } from "@/lib/ncb-utils";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ packKey: string }> }
) {
  const cookieHeader = req.headers.get("cookie") || "";
  const user = await getSessionUser(cookieHeader);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { packKey } = await params;
  const authCookies = extractAuthCookies(cookieHeader);

  // Get pack ID
  const packUrl = `${CONFIG.dataApiUrl}/read/blueprint_packs?Instance=${CONFIG.instance}&pack_key=eq.${packKey}`;
  const packRes = await fetch(packUrl, {
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
    },
  });
  const packs = await packRes.json();
  if (!Array.isArray(packs) || !packs.length) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }

  const buildsUrl = `${CONFIG.dataApiUrl}/read/pack_builds?Instance=${CONFIG.instance}&pack_id=eq.${packs[0].id}&order=build_number.desc`;
  const buildsRes = await fetch(buildsUrl, {
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
    },
  });

  const builds = await buildsRes.json();
  // Return summary (not full SQL/manifest)
  const summary = (builds as { id: string; build_number: number; generated_at: string; user_id?: string }[]).map((b) => ({
    id: b.id,
    build_number: b.build_number,
    generated_at: b.generated_at,
    user_id: b.user_id,
  }));

  return NextResponse.json(summary);
}
