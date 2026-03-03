import { NextRequest, NextResponse } from "next/server";
import { extractAuthCookies, getSessionUser } from "@/lib/ncb-utils";
import { executeRules } from "@/lib/workers/rules-executor";

export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") || "";
  const user = await getSessionUser(cookieHeader);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const batchSize = (body as { batch_size?: number }).batch_size || 50;

  const authCookies = extractAuthCookies(cookieHeader);
  const origin = req.headers.get("origin") || req.nextUrl.origin;

  try {
    const result = await executeRules(authCookies, origin, user.id, batchSize);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Rules execution failed" },
      { status: 500 }
    );
  }
}
