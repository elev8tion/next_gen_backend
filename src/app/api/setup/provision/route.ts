import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser, unwrapNCBArray } from "@/lib/ncb-utils";

const TABLES = [
  // Blueprint / Generator
  "blueprint_modules",
  "blueprint_versions",
  "blueprint_packs",
  "pack_modules",
  "pack_config",
  // Composer
  "ui_projects",
  "ui_canvases",
  "ui_canvas_nodes",
  "ui_canvas_edges",
  "ui_blueprint_drafts",
  "ui_validation_results",
  // Events
  "events",
  // Rules
  "automation_rules",
  "rule_executions",
  "dead_letters",
  // Scheduler
  "automation_schedules",
  "automation_schedule_runs",
  // AI/Agents
  "ai_agents",
  "ai_tools",
  "ai_agent_tools",
  "ai_agent_tasks",
  "ai_agent_task_steps",
  "ai_runs",
  // Webhooks
  "inbound_webhooks",
];

async function ncbFetch(
  path: string,
  authCookies: string,
  origin: string,
  method = "GET",
  body?: unknown
) {
  const url = `${CONFIG.dataApiUrl}/${path}?Instance=${CONFIG.instance}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
      Origin: origin,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function provisionTable(
  table: string,
  authCookies: string,
  origin: string,
  userId: string
): Promise<{ table: string; status: "provisioned" | "already_existed" | "failed"; error?: string }> {
  // Check if table already exists
  try {
    const existing = await ncbFetch(`read/${table}?limit=1`, authCookies, origin);
    // If NCB returns an array (or wrapped array), the table exists.
    // If it returns an error object like { error: "..." }, it doesn't.
    const asObj = existing as Record<string, unknown> | null;
    const isError = asObj && typeof asObj === "object" && "error" in asObj && !Array.isArray(asObj);
    if (!isError) {
      return { table, status: "already_existed" };
    }
  } catch {
    // Table likely doesn't exist, proceed to create
  }

  // Create sentinel row to force table creation
  try {
    const created = await ncbFetch(`create/${table}`, authCookies, origin, "POST", {
      _provision: true,
      user_id: userId,
    });

    // Delete the sentinel row
    if (created && created.id) {
      await ncbFetch(`delete/${table}?id=eq.${created.id}`, authCookies, origin, "DELETE").catch(() => {});
    }

    return { table, status: "provisioned" };
  } catch (err) {
    return {
      table,
      status: "failed",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") || "";
  const user = await getSessionUser(cookieHeader);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authCookies = extractAuthCookies(cookieHeader);
  const origin = req.headers.get("origin") || req.nextUrl.origin;

  const provisioned: string[] = [];
  const already_existed: string[] = [];
  const failed: { table: string; error: string }[] = [];

  for (const table of TABLES) {
    const result = await provisionTable(table, authCookies, origin, user.id);
    if (result.status === "provisioned") {
      provisioned.push(table);
    } else if (result.status === "already_existed") {
      already_existed.push(table);
    } else {
      failed.push({ table, error: result.error || "Unknown" });
    }
  }

  return NextResponse.json({ provisioned, already_existed, failed });
}
