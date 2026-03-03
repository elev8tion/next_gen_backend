import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser } from "@/lib/ncb-utils";
import { getNextRunAt } from "@/lib/workers/cron-parser";

interface Schedule {
  id: string;
  name: string;
  schedule_type: "cron" | "interval";
  expression: string;
  event_name: string;
  is_enabled: boolean;
  next_run_at: string;
  payload_json?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") || "";
  const user = await getSessionUser(cookieHeader);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const batchSize = (body as { batch_size?: number }).batch_size || 20;

  const authCookies = extractAuthCookies(cookieHeader);
  const origin = req.headers.get("origin") || req.nextUrl.origin;
  const now = new Date().toISOString();

  try {
    // Read due schedules
    const url = `${CONFIG.dataApiUrl}/read/automation_schedules?Instance=${CONFIG.instance}&is_enabled=eq.true&next_run_at=lte.${now}&limit=${batchSize}&order=next_run_at.asc`;
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies },
    });
    const schedules: Schedule[] = await res.json();

    if (!Array.isArray(schedules) || schedules.length === 0) {
      return NextResponse.json({ processed: 0 });
    }

    let processed = 0;

    for (const schedule of schedules) {
      // Create schedule run
      await fetch(`${CONFIG.dataApiUrl}/create/automation_schedule_runs?Instance=${CONFIG.instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies, Origin: origin },
        body: JSON.stringify({
          schedule_id: schedule.id,
          triggered_at: now,
          status: "completed",
          user_id: user.id,
        }),
      });

      // Emit event
      await fetch(`${CONFIG.dataApiUrl}/create/events?Instance=${CONFIG.instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies, Origin: origin },
        body: JSON.stringify({
          event_name: schedule.event_name,
          entity_type: "schedule",
          entity_id: schedule.id,
          payload: schedule.payload_json || { schedule_id: schedule.id, schedule_name: schedule.name },
          user_id: user.id,
        }),
      });

      // Compute next run
      try {
        const nextRun = getNextRunAt(schedule.schedule_type, schedule.expression);
        await fetch(`${CONFIG.dataApiUrl}/update/automation_schedules?Instance=${CONFIG.instance}&id=eq.${schedule.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies, Origin: origin },
          body: JSON.stringify({ next_run_at: nextRun.toISOString() }),
        });
      } catch {
        // Disable schedule on parse error
        await fetch(`${CONFIG.dataApiUrl}/update/automation_schedules?Instance=${CONFIG.instance}&id=eq.${schedule.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies, Origin: origin },
          body: JSON.stringify({ is_enabled: false }),
        });
      }

      processed++;
    }

    return NextResponse.json({ processed });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scheduler tick failed" },
      { status: 500 }
    );
  }
}
