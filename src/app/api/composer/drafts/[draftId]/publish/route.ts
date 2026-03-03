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
  const body = await req.json();
  const authCookies = extractAuthCookies(req.headers.get("cookie") || "");
  const origin = req.headers.get("origin") || req.nextUrl.origin;

  // Get draft
  const draftRes = await fetch(`${CONFIG.dataApiUrl}/read/ui_blueprint_drafts?Instance=${CONFIG.instance}&id=eq.${draftId}`, {
    headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies },
  });
  const drafts = unwrapNCBArray(await draftRes.json());
  if (!drafts.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const blueprint = drafts[0].blueprint_json as BlueprintModule;

  // Validate first
  const validation = validateBlueprint(blueprint);
  if (!validation.ok) {
    return NextResponse.json({ error: "Validation failed", ...validation }, { status: 422 });
  }

  const moduleKey = blueprint.module.key;
  const version = body.version || blueprint.module.version;

  // Create blueprint version
  const verRes = await fetch(`${CONFIG.dataApiUrl}/create/blueprint_versions?Instance=${CONFIG.instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies, Origin: origin },
    body: JSON.stringify({
      module_key: moduleKey,
      version,
      blueprint_json: blueprint,
      user_id: user.id,
    }),
  });

  if (!verRes.ok) {
    const err = await verRes.json();
    return NextResponse.json({ error: "Failed to publish", details: err }, { status: 500 });
  }

  // Update draft status
  await fetch(`${CONFIG.dataApiUrl}/update/ui_blueprint_drafts?Instance=${CONFIG.instance}&id=eq.${draftId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Database-Instance": CONFIG.instance, Cookie: authCookies, Origin: origin },
    body: JSON.stringify({ status: "published" }),
  });

  const versionData = await verRes.json();
  return NextResponse.json({ published: true, version: versionData });
}
