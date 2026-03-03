import type { BlueprintModule, EntityDef, FieldDef } from "./types";

export interface BlueprintValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const VALID_FIELD_TYPES = new Set([
  "uuid", "text", "varchar", "int", "integer", "bigint", "smallint",
  "boolean", "jsonb", "json", "timestamptz", "timestamp", "date",
  "numeric", "decimal", "float", "double precision", "real",
  "bytea", "serial", "bigserial", "varchar(3)", "varchar(10)",
  "varchar(20)", "varchar(30)", "varchar(50)", "varchar(60)",
  "varchar(100)", "varchar(120)", "varchar(200)", "varchar(255)",
  "varchar(300)", "varchar(320)", "varchar(500)", "varchar(1000)",
]);

function isValidFieldType(type: string): boolean {
  if (VALID_FIELD_TYPES.has(type)) return true;
  if (/^varchar\(\d+\)$/.test(type)) return true;
  if (/^numeric\(\d+,\d+\)$/.test(type)) return true;
  if (/^char\(\d+\)$/.test(type)) return true;
  return false;
}

function isValidWhen(when: string): boolean {
  if (!when) return true;
  return /^config\.\w+\s*==\s*.+$/.test(when);
}

export function validateBlueprint(bp: BlueprintModule): BlueprintValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Module metadata
  if (!bp.module) {
    errors.push("Missing module metadata");
    return { ok: false, errors, warnings };
  }
  if (!bp.module.key) errors.push("Module key is required");
  if (!bp.module.name) errors.push("Module name is required");
  if (!bp.module.version) errors.push("Module version is required");
  if (!bp.module.layer) errors.push("Module layer is required");

  // Entities
  if (!bp.entities || bp.entities.length === 0) {
    errors.push("At least one entity is required");
    return { ok: false, errors, warnings };
  }

  const entityNames = new Set<string>();
  const tableNames = new Set<string>();

  for (const entity of bp.entities) {
    if (!entity.name) {
      errors.push("Entity missing name");
      continue;
    }
    if (!entity.table) {
      errors.push(`Entity "${entity.name}" missing table name`);
    }

    if (entityNames.has(entity.name)) {
      errors.push(`Duplicate entity name: ${entity.name}`);
    }
    entityNames.add(entity.name);

    if (entity.table && tableNames.has(entity.table)) {
      errors.push(`Duplicate table name: ${entity.table}`);
    }
    if (entity.table) tableNames.add(entity.table);

    // Fields
    if (!entity.fields || entity.fields.length === 0) {
      errors.push(`Entity "${entity.name}" has no fields`);
      continue;
    }

    const hasPk = entity.fields.some((f: FieldDef) => f.pk);
    if (!hasPk) {
      errors.push(`Entity "${entity.name}" has no primary key field`);
    }

    const fieldNames = new Set<string>();
    for (const field of entity.fields) {
      if (!field.name) {
        errors.push(`Entity "${entity.name}" has field with no name`);
        continue;
      }
      if (fieldNames.has(field.name)) {
        errors.push(`Entity "${entity.name}": duplicate field "${field.name}"`);
      }
      fieldNames.add(field.name);

      if (!field.type) {
        errors.push(`Entity "${entity.name}": field "${field.name}" has no type`);
      } else if (!isValidFieldType(field.type)) {
        warnings.push(`Entity "${entity.name}": field "${field.name}" has uncommon type "${field.type}"`);
      }

      if (field.when && !isValidWhen(field.when)) {
        warnings.push(`Entity "${entity.name}": field "${field.name}" has complex when condition`);
      }
    }

    // Entity when condition
    if (entity.when && !isValidWhen(entity.when)) {
      warnings.push(`Entity "${entity.name}" has complex when condition`);
    }
  }

  // Relationships
  if (bp.relationships) {
    for (const rel of bp.relationships) {
      if (!rel.name) errors.push("Relationship missing name");
      if (!rel.from?.entity || !rel.from?.field) {
        errors.push(`Relationship "${rel.name}": missing from entity/field`);
      }
      if (!rel.to?.entity || !rel.to?.field) {
        errors.push(`Relationship "${rel.name}": missing to entity/field`);
      }
      // Check from entity exists (if same module)
      if (rel.from?.entity && !rel.from?.module_key && !entityNames.has(rel.from.entity)) {
        errors.push(`Relationship "${rel.name}": from entity "${rel.from.entity}" not found in this module`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
