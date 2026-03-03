import { CONFIG, extractAuthCookies, unwrapNCBArray } from "@/lib/ncb-utils";
import { evaluateCondition } from "./json-logic";

interface Event {
  id: string;
  event_name: string;
  entity_type?: string;
  entity_id?: string;
  payload: Record<string, unknown>;
  occurred_at: string;
}

interface Rule {
  id: string;
  event_name: string;
  condition_json: Record<string, unknown> | null;
  action_type: string;
  action_config: Record<string, unknown>;
  max_attempts: number;
}

interface ExecutionResult {
  rule_id: string;
  event_id: string;
  success: boolean;
  error?: string;
}

async function ncbFetch(path: string, authCookies: string, origin: string, method = "GET", body?: unknown) {
  const url = `${CONFIG.dataApiUrl}/${path}?Instance=${CONFIG.instance}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
      Origin: origin,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export async function executeRules(
  authCookies: string,
  origin: string,
  userId: string,
  batchSize = 50
): Promise<{ processed: number; results: ExecutionResult[] }> {
  // 1. Read recent unprocessed events (events not yet in rule_executions)
  let events: Event[];
  try {
    events = unwrapNCBArray<Event>(await ncbFetch(
      `read/events?order=occurred_at.desc&limit=${batchSize}`,
      authCookies,
      origin
    ));
  } catch {
    return { processed: 0, results: [] };
  }

  if (events.length === 0) {
    return { processed: 0, results: [] };
  }

  // 2. Read enabled rules
  let rules: Rule[];
  try {
    rules = unwrapNCBArray<Rule>(await ncbFetch(
      "read/automation_rules?is_enabled=eq.true",
      authCookies,
      origin
    ));
  } catch {
    return { processed: 0, results: [] };
  }

  if (rules.length === 0) {
    return { processed: 0, results: [] };
  }

  const results: ExecutionResult[] = [];

  for (const event of events) {
    // Match rules by event_name
    const matchingRules = rules.filter((r) => r.event_name === event.event_name);

    for (const rule of matchingRules) {
      // Check condition
      if (rule.condition_json) {
        const passes = evaluateCondition(rule.condition_json, event.payload);
        if (!passes) continue;
      }

      // Create execution record
      const execution = await ncbFetch("create/rule_executions", authCookies, origin, "POST", {
        rule_id: rule.id,
        event_id: event.id,
        status: "running",
        user_id: userId,
      });

      try {
        // Execute action
        await executeAction(rule.action_type, rule.action_config, event, authCookies, origin, userId);

        // Mark success
        if (execution.id) {
          await ncbFetch(`update/rule_executions?id=eq.${execution.id}`, authCookies, origin, "PUT", {
            status: "completed",
          });
        }

        results.push({ rule_id: rule.id, event_id: event.id, success: true });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";

        if (execution.id) {
          await ncbFetch(`update/rule_executions?id=eq.${execution.id}`, authCookies, origin, "PUT", {
            status: "failed",
            error_message: errorMsg,
          });
        }

        // Dead letter if max attempts exceeded
        await ncbFetch("create/dead_letters", authCookies, origin, "POST", {
          rule_id: rule.id,
          event_id: event.id,
          error_message: errorMsg,
          payload: event.payload,
          user_id: userId,
        });

        results.push({ rule_id: rule.id, event_id: event.id, success: false, error: errorMsg });
      }
    }
  }

  return { processed: events.length, results };
}

async function executeAction(
  actionType: string,
  config: Record<string, unknown>,
  event: Event,
  authCookies: string,
  origin: string,
  userId: string
): Promise<void> {
  switch (actionType) {
    case "event.emit":
      await ncbFetch("create/events", authCookies, origin, "POST", {
        event_name: config.event_name || "action.triggered",
        entity_type: event.entity_type,
        entity_id: event.entity_id,
        payload: { ...event.payload, source_event_id: event.id, ...(config.payload as Record<string, unknown> || {}) },
        user_id: userId,
      });
      break;

    case "webhook.call":
      if (config.url) {
        await fetch(String(config.url), {
          method: String(config.method || "POST"),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event, config }),
        });
      }
      break;

    case "db.insert":
      if (config.table) {
        await ncbFetch(`create/${config.table}`, authCookies, origin, "POST", {
          ...(config.data as Record<string, unknown> || {}),
          user_id: userId,
        });
      }
      break;

    case "db.update":
      if (config.table && config.filter) {
        await ncbFetch(`update/${config.table}?${config.filter}`, authCookies, origin, "PUT", config.data);
      }
      break;

    default:
      throw new Error(`Unknown action type: ${actionType}`);
  }
}
