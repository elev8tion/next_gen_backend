import type {
  AICapabilityDef,
  AttachPointDef,
  EventDef,
  ResolvedManifest,
  RuntimeManifest,
} from "./types";

const ACTION_TYPES_SUPPORTED = [
  "event.emit", "webhook.call", "db.insert", "db.update",
  "workflow.start", "workflow.transition", "ai.run", "notification.send",
];

export class RuntimeManifestGenerator {
  generate(manifest: ResolvedManifest): RuntimeManifest {
    // Event catalog: all events from resolved manifest
    const eventCatalog: EventDef[] = [...manifest.events];

    // AI capability registry: group by entity
    const aiRegistry: Record<string, AICapabilityDef[]> = {};
    for (const cap of manifest.ai_capabilities) {
      for (const req of cap.requires || ["_global"]) {
        if (!aiRegistry[req]) aiRegistry[req] = [];
        aiRegistry[req].push(cap);
      }
    }
    // Also index by name if no requires
    if (manifest.ai_capabilities.length > 0) {
      for (const cap of manifest.ai_capabilities) {
        if (!cap.requires?.length) {
          if (!aiRegistry["_global"]) aiRegistry["_global"] = [];
          if (!aiRegistry["_global"].some((c) => c.name === cap.name)) {
            aiRegistry["_global"].push(cap);
          }
        }
      }
    }

    // Attach points map: attach points currently do not carry entity scope in
    // resolved manifests, so publish as global until scoped metadata is added.
    const attachPointsMap: Record<string, AttachPointDef[]> = {};
    if (manifest.attach_points.length > 0) {
      attachPointsMap["_global"] = manifest.attach_points;
    }

    // Workflow subscriptions: check for automation.workflow module
    const workflowSubscriptions: string[] = [];
    const hasWorkflow = manifest.module_versions["automation.workflow"];
    if (hasWorkflow) {
      const workflowEntities = manifest.entities.filter(
        (e) => e.module_key === "automation.workflow"
      );
      for (const entity of workflowEntities) {
        if (
          entity.table.includes("trigger") ||
          entity.table.includes("subscription")
        ) {
          workflowSubscriptions.push(entity.table);
        }
      }
      // Also include workflow trigger event names from entity events
      for (const evt of manifest.events) {
        if (evt.name.startsWith("workflow.") || evt.trigger === "workflow") {
          workflowSubscriptions.push(evt.name);
        }
      }
    }

    // Rule triggers: check for automation.rules module
    const ruleTriggers: string[] = [];
    const hasRules = manifest.module_versions["automation.rules"];
    if (hasRules) {
      for (const evt of manifest.events) {
        if (evt.trigger === "rule" || evt.name.includes("rule")) {
          ruleTriggers.push(evt.name);
        }
      }
      // Also include any event pattern tables
      const ruleEntities = manifest.entities.filter(
        (e) => e.module_key === "automation.rules"
      );
      for (const entity of ruleEntities) {
        if (entity.table.includes("rule")) {
          ruleTriggers.push(entity.table);
        }
      }
    }

    return {
      event_catalog: eventCatalog,
      ai_capability_registry: aiRegistry,
      attach_points_map: attachPointsMap,
      workflow_subscriptions: [...new Set(workflowSubscriptions)],
      rule_triggers: [...new Set(ruleTriggers)],
      action_types_supported: ACTION_TYPES_SUPPORTED,
    };
  }
}
