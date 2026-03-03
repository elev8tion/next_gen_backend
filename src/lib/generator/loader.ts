import { CONFIG, extractAuthCookies, unwrapNCBArray } from "@/lib/ncb-utils";
import type {
  BlueprintModule,
  BlueprintVersionRecord,
  LoaderResult,
  PackConfig,
  PackModuleRecord,
  PackRecord,
} from "./types";

async function fetchNCB(path: string, cookieHeader: string): Promise<unknown> {
  const authCookies = extractAuthCookies(cookieHeader);
  const url = `${CONFIG.dataApiUrl}/${path}?Instance=${CONFIG.instance}`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NCB fetch failed (${res.status}): ${text}`);
  }
  return res.json();
}

export class BlueprintLoader {
  async load(packKey: string, cookieHeader: string): Promise<LoaderResult> {
    // 1. Fetch the pack
    const packs = unwrapNCBArray<PackRecord>(await fetchNCB(
      `read/blueprint_packs?pack_key=eq.${packKey}`,
      cookieHeader
    ));
    if (!packs.length) {
      throw new Error(`Pack not found: ${packKey}`);
    }
    const pack = packs[0];

    // 2. Fetch pack_modules for this pack
    const packModules = unwrapNCBArray<PackModuleRecord>(await fetchNCB(
      `read/pack_modules?pack_id=eq.${pack.id}&order=load_order.asc`,
      cookieHeader
    ));
    if (!packModules.length) {
      throw new Error(`No modules found for pack: ${packKey}`);
    }

    // 3. Fetch all blueprint versions for these modules
    const moduleKeys = packModules.map((pm) => pm.module_key);
    const versionIds = packModules.map((pm) => pm.version_id);

    const versions = unwrapNCBArray<BlueprintVersionRecord>(await fetchNCB(
      `read/blueprint_versions?id=in.(${versionIds.join(",")})`,
      cookieHeader
    ));

    // Build a map of version_id -> blueprint
    const versionMap = new Map<string, BlueprintVersionRecord>();
    for (const v of versions) {
      versionMap.set(v.id, v);
    }

    // 4. Assemble modules in load_order
    const modules: BlueprintModule[] = [];
    for (const pm of packModules) {
      const ver = versionMap.get(pm.version_id);
      if (!ver) {
        throw new Error(
          `Blueprint version ${pm.version_id} not found for module ${pm.module_key}`
        );
      }

      const blueprint =
        typeof ver.blueprint_json === "string"
          ? JSON.parse(ver.blueprint_json)
          : ver.blueprint_json;

      // Validate required top-level keys
      if (!blueprint.module || !blueprint.entities) {
        throw new Error(
          `Blueprint for ${pm.module_key} missing required keys (module, entities)`
        );
      }

      modules.push(blueprint);
    }

    // 5. Fetch pack_config
    const configs = unwrapNCBArray<{ id: string; config_json: PackConfig }>(await fetchNCB(
      `read/pack_config?pack_id=eq.${pack.id}`,
      cookieHeader
    ));
    const packConfig: PackConfig = configs.length ? configs[0].config_json : {};

    return {
      pack,
      modules,
      packConfig:
        typeof packConfig === "string" ? JSON.parse(packConfig) : packConfig,
      moduleOrder: moduleKeys,
    };
  }
}
