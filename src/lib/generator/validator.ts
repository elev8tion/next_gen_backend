import type { ResolvedManifest, ValidationResult } from "./types";

export class ManifestValidator {
  validate(manifest: ResolvedManifest): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Unique table names
    const tableNames = new Set<string>();
    for (const entity of manifest.entities) {
      if (tableNames.has(entity.table)) {
        errors.push(`Duplicate table name: "${entity.table}"`);
      }
      tableNames.add(entity.table);
    }

    // Build field lookup: table -> field names
    const tableFields = new Map<string, Set<string>>();
    for (const entity of manifest.entities) {
      const fieldNames = new Set<string>();
      let pkCount = 0;

      for (const field of entity.fields) {
        // 2. Unique field names per entity
        if (fieldNames.has(field.name)) {
          errors.push(
            `Duplicate field "${field.name}" in table "${entity.table}"`
          );
        }
        fieldNames.add(field.name);

        if (field.pk) pkCount++;
      }

      // 3. Exactly one PK per entity
      if (pkCount === 0) {
        errors.push(`Table "${entity.table}" has no primary key field`);
      } else if (pkCount > 1) {
        warnings.push(
          `Table "${entity.table}" has ${pkCount} primary key fields`
        );
      }

      tableFields.set(entity.table, fieldNames);
    }

    // 4. Relationship targets exist
    for (const rel of manifest.relationships) {
      const toFields = tableFields.get(rel.to_table);
      if (!toFields) {
        errors.push(
          `Relationship "${rel.name}": target table "${rel.to_table}" does not exist`
        );
      } else if (!toFields.has(rel.to_field)) {
        errors.push(
          `Relationship "${rel.name}": target field "${rel.to_table}.${rel.to_field}" does not exist`
        );
      }

      const fromFields = tableFields.get(rel.from_table);
      if (!fromFields) {
        errors.push(
          `Relationship "${rel.name}": source table "${rel.from_table}" does not exist`
        );
      } else if (!fromFields.has(rel.from_field)) {
        errors.push(
          `Relationship "${rel.name}": source field "${rel.from_table}.${rel.from_field}" does not exist`
        );
      }
    }

    // 5. No circular FK chains (DFS on table graph)
    const fkGraph = new Map<string, string[]>();
    for (const rel of manifest.relationships) {
      if (!fkGraph.has(rel.from_table)) fkGraph.set(rel.from_table, []);
      fkGraph.get(rel.from_table)!.push(rel.to_table);
    }

    const visited = new Set<string>();
    const inStack = new Set<string>();

    const hasCycle = (node: string): boolean => {
      if (inStack.has(node)) return true;
      if (visited.has(node)) return false;
      visited.add(node);
      inStack.add(node);
      for (const neighbor of fkGraph.get(node) || []) {
        if (hasCycle(neighbor)) {
          warnings.push(`Circular FK chain detected involving "${node}"`);
          return true;
        }
      }
      inStack.delete(node);
      return false;
    };

    for (const table of tableNames) {
      hasCycle(table);
    }

    // 6. AI capability requires targets exist
    for (const cap of manifest.ai_capabilities) {
      for (const req of cap.requires || []) {
        if (!tableNames.has(req)) {
          const entityMatch = manifest.entities.find((e) => e.name === req);
          if (!entityMatch) {
            warnings.push(
              `AI capability "${cap.name}" requires "${req}" which is not a resolved entity or table`
            );
          }
        }
      }
    }

    return { ok: errors.length === 0, errors, warnings };
  }
}
