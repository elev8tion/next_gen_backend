import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser } from "@/lib/ncb-utils";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ packKey: string }> }
) {
  const cookieHeader = req.headers.get("cookie") || "";
  const user = await getSessionUser(cookieHeader);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { packKey } = await params;
  const body = await req.json();

  if (!body.confirm) {
    return NextResponse.json(
      { error: "Must pass confirm: true to execute SQL" },
      { status: 400 }
    );
  }

  const authCookies = extractAuthCookies(cookieHeader);
  let sql = body.sql;

  // If build_number provided, load SQL from stored build
  if (!sql && body.build_number) {
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

    const buildUrl = `${CONFIG.dataApiUrl}/read/pack_builds?Instance=${CONFIG.instance}&pack_id=eq.${packs[0].id}&build_number=eq.${body.build_number}`;
    const buildRes = await fetch(buildUrl, {
      headers: {
        "Content-Type": "application/json",
        "X-Database-Instance": CONFIG.instance,
        Cookie: authCookies,
      },
    });
    const builds = await buildRes.json();
    if (!Array.isArray(builds) || !builds.length) {
      return NextResponse.json({ error: "Build not found" }, { status: 404 });
    }
    sql = builds[0].sql_migration;
  }

  if (!sql) {
    return NextResponse.json(
      { error: "No SQL provided. Pass sql or build_number." },
      { status: 400 }
    );
  }

  try {
    // Execute via NCB SQL execution
    const execUrl = `${CONFIG.dataApiUrl}/execute-sql?Instance=${CONFIG.instance}`;
    const execRes = await fetch(execUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Database-Instance": CONFIG.instance,
        Cookie: authCookies,
      },
      body: JSON.stringify({ sql }),
    });

    if (!execRes.ok) {
      const errText = await execRes.text();
      return NextResponse.json(
        { success: false, error: errText },
        { status: execRes.status }
      );
    }

    const result = await execRes.json();

    // Count CREATE TABLE statements for summary
    const tableMatches = sql.match(/CREATE TABLE\s+(\w+)/g) || [];
    const tablesCreated = tableMatches.map((m: string) =>
      m.replace("CREATE TABLE ", "")
    );

    return NextResponse.json({
      success: true,
      tables_created: tablesCreated,
      result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "SQL execution failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
