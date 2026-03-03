import { BlueprintLoader } from "./loader";
import { DependencyResolver } from "./resolver";
import { ConfigEvaluator } from "./config-evaluator";
import { ManifestValidator } from "./validator";
import { SQLGenerator } from "./sql-generator";
import { RuntimeManifestGenerator } from "./runtime-manifest";
import type {
  BuildArtifact,
  LoaderResult,
  ResolvedManifest,
  ValidationResult,
} from "./types";

const loader = new BlueprintLoader();
const resolver = new DependencyResolver();
const evaluator = new ConfigEvaluator();
const validator = new ManifestValidator();
const sqlGen = new SQLGenerator();
const runtimeGen = new RuntimeManifestGenerator();

export async function buildResolvedManifest(
  packKey: string,
  cookieHeader: string
): Promise<{ loaderResult: LoaderResult; manifest: ResolvedManifest }> {
  const loaderResult = await loader.load(packKey, cookieHeader);
  const sorted = resolver.resolve(loaderResult.modules);
  const manifest = evaluator.evaluate(sorted, loaderResult.packConfig);
  return { loaderResult, manifest };
}

export async function runFullPipeline(
  packKey: string,
  cookieHeader: string
): Promise<{
  artifact: BuildArtifact;
  validation: ValidationResult;
}> {
  const { manifest } = await buildResolvedManifest(packKey, cookieHeader);

  const validation = validator.validate(manifest);
  if (!validation.ok) {
    return { artifact: null as unknown as BuildArtifact, validation };
  }

  const sql = sqlGen.generate(manifest);
  const runtime = runtimeGen.generate(manifest);

  const artifact: BuildArtifact = {
    pack_key: packKey,
    build_number: 0, // set by caller
    resolved_manifest: manifest,
    sql_migration: sql,
    runtime_manifest: runtime,
    generated_at: new Date().toISOString(),
  };

  return { artifact, validation };
}
