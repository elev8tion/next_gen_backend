import type {
  AICapabilityDef,
  AttachPointDef,
  BlueprintModule,
  EventDef,
  PackConfig,
  ResolvedEntity,
  ResolvedField,
  ResolvedIndex,
  ResolvedManifest,
  ResolvedRelationship,
} from "./types";

export class ConfigEvaluator {
  evaluate(
    modules: BlueprintModule[],
    packConfig: PackConfig
  ): ResolvedManifest {
    const entities: ResolvedEntity[] = [];
    const relationships: ResolvedRelationship[] = [];
    const events: EventDef[] = [];
    const attachPoints: AttachPointDef[] = [];
    const aiCapabilities: AICapabilityDef[] = [];
    const moduleVersions: Record<string, string> = {};

    // Build full config with defaults from all modules
    const fullConfig = this.buildFullConfig(modules, packConfig);

    // Entity table map: (module_key, entity_name) -> table_name
    const entityTableMap = new Map<string, string>();

    // First pass: collect all entity table mappings (before filtering)
    for (const mod of modules) {
      for (const entity of mod.entities) {
        entityTableMap.set(
          `${mod.module.key}:${entity.name}`,
          entity.table
        );
      }
    }

    // Second pass: resolve each module
    for (const mod of modules) {
      moduleVersions[mod.module.key] = mod.module.version;

      for (const entity of mod.entities) {
        // Check entity-level when
        if (!this.evaluateCondition(entity.when, fullConfig)) continue;

        // Filter fields by when
        const resolvedFields: ResolvedField[] = [];
        for (const field of entity.fields) {
          if (!this.evaluateCondition(field.when, fullConfig)) continue;
          resolvedFields.push({
            name: field.name,
            type: field.type,
            pk: field.pk,
            nullable: field.nullable,
            unique: field.unique,
            default: this.resolveDefault(field.default, fullConfig),
          });
        }

        // Filter indexes by when
        const resolvedIndexes: ResolvedIndex[] = [];
        for (const idx of entity.indexes || []) {
          if (!this.evaluateCondition(idx.when, fullConfig)) continue;
          resolvedIndexes.push({
            name: idx.name,
            columns: idx.columns,
            unique: idx.unique,
          });
        }

        entities.push({
          module_key: mod.module.key,
          name: entity.name,
          table: entity.table,
          fields: resolvedFields,
          indexes: resolvedIndexes,
        });

        // Filter events by when
        for (const evt of entity.events || []) {
          if (!this.evaluateCondition(evt.when, fullConfig)) continue;
          events.push(evt);
        }

        // Filter attach_points by when
        for (const ap of entity.attach_points || []) {
          if (!this.evaluateCondition(ap.when, fullConfig)) continue;
          attachPoints.push(ap);
        }

        // Filter ai_capabilities by when
        for (const ai of entity.ai_capabilities || []) {
          if (!this.evaluateCondition(ai.when, fullConfig)) continue;
          aiCapabilities.push(ai);
        }
      }

      // Also collect top-level module events
      for (const evt of mod.events || []) {
        if (!this.evaluateCondition(evt.when, fullConfig)) continue;
        events.push(evt);
      }

      // Resolve relationships
      for (const rel of mod.relationships || []) {
        if (!this.evaluateCondition(rel.when, fullConfig)) continue;

        const fromKey = rel.from.module_key || mod.module.key;
        const toKey = rel.to.module_key || mod.module.key;

        const fromTable = entityTableMap.get(`${fromKey}:${rel.from.entity}`);
        const toTable = entityTableMap.get(`${toKey}:${rel.to.entity}`);

        if (!fromTable || !toTable) continue; // Entity was filtered out by config

        relationships.push({
          name: rel.name,
          from_table: fromTable,
          from_field: rel.from.field,
          to_table: toTable,
          to_field: rel.to.field,
          cardinality: rel.cardinality,
          on_delete: rel.on_delete,
        });
      }
    }

    return {
      entities,
      relationships,
      events,
      attach_points: attachPoints,
      ai_capabilities: aiCapabilities,
      config_applied: fullConfig,
      module_versions: moduleVersions,
    };
  }

  evaluateCondition(
    when: string | undefined,
    config: PackConfig
  ): boolean {
    if (!when) return true;

    // Parse "config.KEY == VALUE" or "config.KEY != VALUE"
    const match = when.match(
      /^config\.(\w+)\s*(==|!=)\s*(.+)$/
    );
    if (!match) return true; // Unparseable → include by default

    const [, key, op, rawValue] = match;
    const configValue = config[key];

    // Parse the expected value
    let expected: boolean | string | number;
    const trimmed = rawValue.trim();
    if (trimmed === "true") expected = true;
    else if (trimmed === "false") expected = false;
    else if (trimmed.startsWith("'") || trimmed.startsWith('"'))
      expected = trimmed.slice(1, -1);
    else if (!isNaN(Number(trimmed))) expected = Number(trimmed);
    else expected = trimmed;

    if (op === "==") return configValue === expected;
    if (op === "!=") return configValue !== expected;
    return true;
  }

  private buildFullConfig(
    modules: BlueprintModule[],
    packConfig: PackConfig
  ): PackConfig {
    const full: PackConfig = {};

    // Collect defaults from all modules
    for (const mod of modules) {
      if (mod.config?.options) {
        for (const [key, opt] of Object.entries(mod.config.options)) {
          if (opt.default !== undefined) {
            full[key] = opt.default;
          }
        }
      }
    }

    // Override with pack config
    Object.assign(full, packConfig);
    return full;
  }

  private resolveDefault(
    defaultVal: string | undefined,
    config: PackConfig
  ): string | undefined {
    if (!defaultVal) return undefined;

    // Resolve config.KEY references
    const match = defaultVal.match(/^config\.(\w+)$/);
    if (match) {
      const val = config[match[1]];
      return val !== undefined ? String(val) : undefined;
    }

    // SQL literals pass through
    return defaultVal;
  }
}
