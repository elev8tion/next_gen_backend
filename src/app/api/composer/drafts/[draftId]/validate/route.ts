import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser, unwrapNCBArray } from "@/lib/ncb-utils";
import { validateBlueprint } from "@/lib/generator/blueprint-validator";
import type { BlueprintModule } from "@/lib/generator/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ draftId: string }> }
) {
  const user = await getSessionUser(req.headers.get("cookie") || "");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { draftId } = await params;
  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");
  const origin = req.headers.get("origin") || req.nextUrl.origin;

  // Get draft
  const draftRes = await fetch(`${CONFIG.dataApiUrl}/read/ui_blueprint_drafts?Instance=${CONFIG.instance}&id=eq.${draftId}`, {
    headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies },
  });
  const drafts = unwrapNCBArray(await draftRes.json());
  if (!drafts.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const blueprint = drafts[0].blueprint_json as BlueprintModule;
  const result = validateBlueprint(blueprint);

  // Store validation results
  await fetch(`${CONFIG.dataApiUrl}/create/ui_validation_results?Instance=${CONFIG.instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies, Origin: origin },
    body: JSON.stringify({
      draft_id: draftId,
      is_valid: result.ok,
      errors_json: result.errors,
      warnings_json: result.warnings,
      user_id: user.id,
    }),
  });

  return NextResponse.json(result);
}
