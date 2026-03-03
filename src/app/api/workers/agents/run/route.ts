import { NextRequest, NextResponse } from "next/server";
import { extractAuthCookies, getSessionUser } from "@/lib/ncb-utils";
import { executeAgentTasks } from "@/lib/workers/agent-executor";

export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") || "";
  const user = await getSessionUser(cookieHeader);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const batchSize = (body as { batch_size?: number }).batch_size || 10;

  const authCookies = extractAuthCookies(cookieHeader);
  const origin = req.headers.get("origin") || req.nextUrl.origin;

  try {
    const result = await executeAgentTasks(authCookies, origin, user.id, batchSize);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Agent execution failed" },
      { status: 500 }
    );
  }
}
