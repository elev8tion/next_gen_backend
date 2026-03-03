import { NextRequest, NextResponse } from "next/server";
import { extractAuthCookies, getSessionUser } from "@/lib/ncb-utils";
import { executeRules } from "@/lib/workers/rules-executor";
import { executeAgentTasks } from "@/lib/workers/agent-executor";

export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") || "";
  const user = await getSessionUser(cookieHeader);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const authCookies = extractAuthCookies(cookieHeader);
  const origin = req.headers.get("origin") || req.nextUrl.origin;

  const results: Record<string, unknown> = {};

  // 1. Scheduler tick
  try {
    const schedRes = await fetch(`${req.nextUrl.origin}/api/workers/scheduler/tick`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader },
      body: "{}",
    });
    results.scheduler = await schedRes.json();
  } catch (err) {
    results.scheduler = { error: err instanceof Error ? err.message : "Failed" };
  }

  // 2. Rules
  try {
    results.rules = await executeRules(authCookies, origin, user.id);
  } catch (err) {
    results.rules = { error: err instanceof Error ? err.message : "Failed" };
  }

  // 3. Agents
  try {
    results.agents = await executeAgentTasks(authCookies, origin, user.id);
  } catch (err) {
    results.agents = { error: err instanceof Error ? err.message : "Failed" };
  }

  return NextResponse.json(results);
}
