// ── Blueprint Module (matches blueprint_versions.blueprint_json) ──

export interface FieldDef {
  name: string;
  type: string;
  pk?: boolean;
  nullable?: boolean;
  unique?: boolean;
  default?: string;
  when?: string;
}

export interface IndexDef {
  name: string;
  columns: string[];
  unique?: boolean;
  when?: string;
}

export interface EventDef {
  name: string;
  trigger: string;
  payload?: string[];
  when?: string;
}

export interface AttachPointDef {
  name: string;
  type: string;
  description?: string;
  when?: string;
}

export interface AICapabilityDef {
  name: string;
  type: string;
  model?: string;
  requires?: string[];
  description?: string;
  when?: string;
}

export interface EntityDef {
  name: string;
  table: string;
  fields: FieldDef[];
  indexes?: IndexDef[];
  events?: EventDef[];
  attach_points?: AttachPointDef[];
  ai_capabilities?: AICapabilityDef[];
  when?: string;
}

export interface RelationshipEndpoint {
  entity: string;
  field: string;
  module_key?: string;
}

export interface RelationshipDef {
  name: string;
  from: RelationshipEndpoint;
  to: RelationshipEndpoint;
  cardinality: string;
  on_delete: string;
  when?: string;
}

export interface ConfigOption {
  type: string;
  label: string;
  default: boolean | string | number;
  description?: string;
}

export interface ModuleConfig {
  options: Record<string, ConfigOption>;
}

export interface ModuleDependency {
  module_key: string;
  version: string;
  optional?: boolean;
}

export interface BlueprintModule {
  module: {
    key: string;
    name: string;
    version: string;
    layer: string;
    description?: string;
  };
  dependencies: ModuleDependency[];
  config: ModuleConfig;
  entities: EntityDef[];
  relationships?: RelationshipDef[];
  events?: EventDef[];
}

// ── Pack & Config ──

export type PackConfig = Record<string, boolean | string | number>;

export interface PackRecord {
  id: string;
  pack_key: string;
  name: string;
  description?: string;
  version?: string;
}

export interface PackModuleRecord {
  id: string;
  pack_id: string;
  module_key: string;
  version_id: string;
  load_order: number;
}

export interface BlueprintVersionRecord {
  id: string;
  module_key: string;
  version: string;
  blueprint_json: BlueprintModule;
  created_at?: string;
}

// ── Loader Output ──

export interface LoaderResult {
  pack: PackRecord;
  modules: BlueprintModule[];
  packConfig: PackConfig;
  moduleOrder: string[];
}

// ── Resolved Manifest ──

export interface ResolvedField {
  name: string;
  type: string;
  pk?: boolean;
  nullable?: boolean;
  unique?: boolean;
  default?: string;
}

export interface ResolvedIndex {
  name: string;
  columns: string[];
  unique?: boolean;
}

export interface ResolvedEntity {
  module_key: string;
  name: string;
  table: string;
  fields: ResolvedField[];
  indexes: ResolvedIndex[];
}

export interface ResolvedRelationship {
  name: string;
  from_table: string;
  from_field: string;
  to_table: string;
  to_field: string;
  cardinality: string;
  on_delete: string;
}

export interface ResolvedManifest {
  entities: ResolvedEntity[];
  relationships: ResolvedRelationship[];
  events: EventDef[];
  attach_points: AttachPointDef[];
  ai_capabilities: AICapabilityDef[];
  config_applied: PackConfig;
  module_versions: Record<string, string>;
}

// ── Validation ──

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

// ── Runtime Manifest ──

export interface RuntimeManifest {
  event_catalog: EventDef[];
  ai_capability_registry: Record<string, AICapabilityDef[]>;
  attach_points_map: Record<string, AttachPointDef[]>;
  workflow_subscriptions: string[];
  rule_triggers: string[];
}

// ── Build Artifact ──

export interface BuildArtifact {
  pack_key: string;
  build_number: number;
  resolved_manifest: ResolvedManifest;
  sql_migration: string;
  runtime_manifest: RuntimeManifest;
  generated_at: string;
}
