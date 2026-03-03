import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser, unwrapNCBArray } from "@/lib/ncb-utils";
import { runFullPipeline } from "@/lib/generator/pipeline";

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

  try {
    const { artifact, validation } = await runFullPipeline(packKey, cookieHeader);

    if (!validation.ok) {
      return NextResponse.json(
        { error: "Validation failed", errors: validation.errors, warnings: validation.warnings },
        { status: 422 }
      );
    }

    // Get next build number
    const authCookies = extractAuthCookies(cookieHeader);
    const buildsUrl = `${CONFIG.dataApiUrl}/read/pack_builds?Instance=${CONFIG.instance}&pack_id=eq.${artifact.pack_key}&order=build_number.desc&limit=1`;

    let nextBuildNumber = 1;
    try {
      const buildsRes = await fetch(buildsUrl.replace(`pack_id=eq.${artifact.pack_key}`, `sql_migration=neq.''`), {
        headers: {
          "Content-Type": "application/json",
          "X-Database-Instance": CONFIG.instance,
          Cookie: authCookies,
        },
      });
      // Try to get pack_id from loader - we need the actual pack record
      const packUrl = `${CONFIG.dataApiUrl}/read/blueprint_packs?Instance=${CONFIG.instance}&pack_key=eq.${packKey}`;
      const packRes = await fetch(packUrl, {
        headers: {
          "Content-Type": "application/json",
          "X-Database-Instance": CONFIG.instance,
          Cookie: authCookies,
        },
      });
      const packs = unwrapNCBArray(await packRes.json());
      const packId = packs.length ? (packs[0] as { id: string }).id : null;

      if (packId) {
        const historyUrl = `${CONFIG.dataApiUrl}/read/pack_builds?Instance=${CONFIG.instance}&pack_id=eq.${packId}&order=build_number.desc&limit=1`;
        const historyRes = await fetch(historyUrl, {
          headers: {
            "Content-Type": "application/json",
            "X-Database-Instance": CONFIG.instance,
            Cookie: authCookies,
          },
        });
        if (historyRes.ok) {
          const history = unwrapNCBArray(await historyRes.json());
          if (history.length) {
            nextBuildNumber = (history[0] as { build_number: number }).build_number + 1;
          }
        }

        // Persist the build
        artifact.build_number = nextBuildNumber;
        const createUrl = `${CONFIG.dataApiUrl}/create/pack_builds?Instance=${CONFIG.instance}`;
        await fetch(createUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Database-Instance": CONFIG.instance,
            Cookie: authCookies,
          },
          body: JSON.stringify({
            pack_id: packId,
            build_number: nextBuildNumber,
            resolved_manifest: artifact.resolved_manifest,
            sql_migration: artifact.sql_migration,
            runtime_manifest: artifact.runtime_manifest,
            generated_at: artifact.generated_at,
            user_id: user.id,
          }),
        });
      }
    } catch {
      // Build persistence failed — still return the artifact
      artifact.build_number = nextBuildNumber;
    }

    return NextResponse.json({
      ...artifact,
      validation: { ok: true, warnings: validation.warnings },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pipeline failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
