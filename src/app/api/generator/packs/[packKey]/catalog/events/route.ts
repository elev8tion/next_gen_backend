import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/ncb-utils";
import { buildResolvedManifest } from "@/lib/generator/pipeline";

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

  try {
    const { manifest } = await buildResolvedManifest(packKey, cookieHeader);
    return NextResponse.json(manifest.events);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to build manifest";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
