import { CONFIG, extractAuthCookies, unwrapNCBArray } from "@/lib/ncb-utils";
import { evaluateCondition } from "./json-logic";

// ── Types ──

type RuleActionType =
  | "event.emit" | "webhook.call" | "db.insert" | "db.update"
  | "workflow.start" | "workflow.transition" | "ai.run" | "notification.send";

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
  action_type: RuleActionType;
  action_config: Record<string, unknown>;
  max_attempts: number;
}

interface ExecutionResult {
  rule_id: string;
  event_id: string;
  success: boolean;
  error?: string;
}

// ── NCB Fetch ──

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

// ── Telemetry ──

async function logActionExecution(
  authCookies: string,
  origin: string,
  userId: string,
  params: {
    action_type: RuleActionType;
    rule_id: string;
    event_id: string;
    status: "success" | "failure";
    duration_ms: number;
    ref_type?: string;
    ref_id?: string;
    error_message?: string;
  }
) {
  try {
    await ncbFetch("create/automation_action_logs", authCookies, origin, "POST", {
      action_type: params.action_type,
      rule_id: params.rule_id,
      event_id: params.event_id,
      status: params.status,
      duration_ms: params.duration_ms,
      ref_type: params.ref_type || null,
      ref_id: params.ref_id || null,
      error_message: params.error_message || null,
      user_id: userId,
    });
  } catch {
    // Telemetry logging is best-effort
  }
}

// ── Pre-Execution Validation ──

function validateAction(actionType: RuleActionType, config: Record<string, unknown>): void {
  switch (actionType) {
    case "event.emit":
      if (!config.event_name) throw new Error("event.emit: event_name is required");
      break;
    case "webhook.call":
      if (!config.url) throw new Error("webhook.call: url is required");
      break;
    case "db.insert":
      if (!config.table) throw new Error("db.insert: table is required");
      break;
    case "db.update":
      if (!config.table) throw new Error("db.update: table is required");
      break;
    case "workflow.start":
      if (!config.workflow_id) throw new Error("workflow.start: workflow_id is required");
      break;
    case "workflow.transition":
      if (!config.instance_id && !(config.workflow_id && config.entity_type && config.entity_id)) {
        throw new Error("workflow.transition: instance_id or (workflow_id + entity_type + entity_id) required");
      }
      if (!config.target_state) throw new Error("workflow.transition: target_state is required");
      break;
    case "ai.run":
      if (!config.agent_id) throw new Error("ai.run: agent_id is required");
      break;
    case "notification.send":
      if (!config.title) throw new Error("notification.send: title is required");
      if (!config.body) throw new Error("notification.send: body is required");
      break;
    default:
      throw new Error(`Unknown action type: ${actionType}`);
  }
}

// ── Main Executor ──

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

      const startTime = Date.now();

      try {
        // Validate before executing
        validateAction(rule.action_type, rule.action_config);

        // Execute action
        const actionRef = await executeAction(rule.action_type, rule.action_config, event, authCookies, origin, userId);

        const durationMs = Date.now() - startTime;

        // Mark success
        if (execution.id) {
          await ncbFetch(`update/rule_executions?id=eq.${execution.id}`, authCookies, origin, "PUT", {
            status: "completed",
          });
        }

        // Telemetry
        await logActionExecution(authCookies, origin, userId, {
          action_type: rule.action_type,
          rule_id: rule.id,
          event_id: event.id,
          status: "success",
          duration_ms: durationMs,
          ref_type: actionRef?.ref_type,
          ref_id: actionRef?.ref_id,
        });

        results.push({ rule_id: rule.id, event_id: event.id, success: true });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        const durationMs = Date.now() - startTime;

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

        // Telemetry
        await logActionExecution(authCookies, origin, userId, {
          action_type: rule.action_type,
          rule_id: rule.id,
          event_id: event.id,
          status: "failure",
          duration_ms: durationMs,
          error_message: errorMsg,
        });

        results.push({ rule_id: rule.id, event_id: event.id, success: false, error: errorMsg });
      }
    }
  }

  return { processed: events.length, results };
}

// ── Action Executors ──

interface ActionRef {
  ref_type?: string;
  ref_id?: string;
}

async function executeAction(
  actionType: RuleActionType,
  config: Record<string, unknown>,
  event: Event,
  authCookies: string,
  origin: string,
  userId: string
): Promise<ActionRef | undefined> {
  switch (actionType) {
    case "event.emit":
      await ncbFetch("create/events", authCookies, origin, "POST", {
        event_name: config.event_name || "action.triggered",
        entity_type: event.entity_type,
        entity_id: event.entity_id,
        payload: { ...event.payload, source_event_id: event.id, ...(config.payload as Record<string, unknown> || {}) },
        user_id: userId,
      });
      return;

    case "webhook.call":
      if (config.url) {
        await fetch(String(config.url), {
          method: String(config.method || "POST"),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event, config }),
        });
      }
      return;

    case "db.insert": {
      const result = await ncbFetch(`create/${config.table}`, authCookies, origin, "POST", {
        ...(config.data as Record<string, unknown> || {}),
        user_id: userId,
      });
      return { ref_type: String(config.table), ref_id: result?.id };
    }

    case "db.update":
      if (config.table && config.filter) {
        await ncbFetch(`update/${config.table}?${config.filter}`, authCookies, origin, "PUT", config.data);
      }
      return { ref_type: String(config.table) };

    case "workflow.start":
      return await executeWorkflowStart(config, event, authCookies, origin, userId);

    case "workflow.transition":
      return await executeWorkflowTransition(config, event, authCookies, origin, userId);

    case "ai.run":
      return await executeAiRun(config, event, authCookies, origin, userId);

    case "notification.send":
      return await executeNotificationSend(config, event, authCookies, origin, userId);

    default:
      throw new Error(`Unknown action type: ${actionType}`);
  }
}

// ── workflow.start ──

async function executeWorkflowStart(
  config: Record<string, unknown>,
  event: Event,
  authCookies: string,
  origin: string,
  userId: string
): Promise<ActionRef> {
  const workflowId = String(config.workflow_id);

  // Validate workflow exists
  const workflows = unwrapNCBArray<{ id: string }>(
    await ncbFetch(`read/workflows?id=eq.${workflowId}`, authCookies, origin)
  );
  if (workflows.length === 0) {
    throw new Error(`workflow.start: workflow not found: ${workflowId}`);
  }

  // Get initial state (first by sort_order)
  const states = unwrapNCBArray<{ id: string; name: string }>(
    await ncbFetch(`read/workflow_states?workflow_id=eq.${workflowId}&order=sort_order.asc&limit=1`, authCookies, origin)
  );
  if (states.length === 0) {
    throw new Error(`workflow.start: workflow ${workflowId} has no states defined`);
  }

  const initialState = states[0];
  const entityType = String(config.entity_type || event.entity_type || "");
  const entityId = String(config.entity_id || event.entity_id || "");

  // Create workflow instance
  const instance = await ncbFetch("create/workflow_instances", authCookies, origin, "POST", {
    workflow_id: workflowId,
    entity_type: entityType || null,
    entity_id: entityId || null,
    current_state_id: initialState.id,
    status: "active",
    data_json: config.initial_data || event.payload || {},
    user_id: userId,
  });

  // Emit workflow.instance.created event
  await ncbFetch("create/events", authCookies, origin, "POST", {
    event_name: "workflow.instance.created",
    entity_type: "workflow_instance",
    entity_id: instance.id,
    payload: {
      workflow_id: workflowId,
      instance_id: instance.id,
      initial_state: initialState.name,
      source_event_id: event.id,
    },
    user_id: userId,
  });

  return { ref_type: "workflow_instance", ref_id: instance.id };
}

// ── workflow.transition ──

async function executeWorkflowTransition(
  config: Record<string, unknown>,
  event: Event,
  authCookies: string,
  origin: string,
  userId: string
): Promise<ActionRef> {
  // Load instance by ID or by workflow + entity
  let instances: { id: string; workflow_id: string; current_state_id: string; status: string }[];

  if (config.instance_id) {
    instances = unwrapNCBArray(
      await ncbFetch(`read/workflow_instances?id=eq.${config.instance_id}`, authCookies, origin)
    );
  } else {
    const wfId = String(config.workflow_id);
    const entType = String(config.entity_type || event.entity_type || "");
    const entId = String(config.entity_id || event.entity_id || "");
    instances = unwrapNCBArray(
      await ncbFetch(
        `read/workflow_instances?workflow_id=eq.${wfId}&entity_type=eq.${entType}&entity_id=eq.${entId}&status=eq.active&limit=1`,
        authCookies,
        origin
      )
    );
  }

  if (instances.length === 0) {
    throw new Error("workflow.transition: instance not found");
  }

  const instance = instances[0];

  if (instance.status !== "active") {
    throw new Error(`workflow.transition: instance ${instance.id} is ${instance.status}, not active`);
  }

  // Resolve target state ID
  const targetStateName = String(config.target_state);
  const targetStates = unwrapNCBArray<{ id: string; name: string }>(
    await ncbFetch(
      `read/workflow_states?workflow_id=eq.${instance.workflow_id}&name=eq.${targetStateName}`,
      authCookies,
      origin
    )
  );
  if (targetStates.length === 0) {
    throw new Error(`workflow.transition: target state "${targetStateName}" not found`);
  }
  const targetStateId = targetStates[0].id;

  // Validate transition exists
  const transitions = unwrapNCBArray<{ id: string }>(
    await ncbFetch(
      `read/workflow_transitions?workflow_id=eq.${instance.workflow_id}&from_state_id=eq.${instance.current_state_id}&to_state_id=eq.${targetStateId}`,
      authCookies,
      origin
    )
  );
  if (transitions.length === 0) {
    throw new Error(
      `workflow.transition: no valid transition from current state to "${targetStateName}"`
    );
  }

  // Update instance
  await ncbFetch(`update/workflow_instances?id=eq.${instance.id}`, authCookies, origin, "PUT", {
    current_state_id: targetStateId,
  });

  // Emit state changed event
  await ncbFetch("create/events", authCookies, origin, "POST", {
    event_name: "workflow.instance.state_changed",
    entity_type: "workflow_instance",
    entity_id: instance.id,
    payload: {
      workflow_id: instance.workflow_id,
      instance_id: instance.id,
      from_state_id: instance.current_state_id,
      to_state_id: targetStateId,
      target_state: targetStateName,
      source_event_id: event.id,
    },
    user_id: userId,
  });

  return { ref_type: "workflow_instance", ref_id: instance.id };
}

// ── ai.run ──

async function executeAiRun(
  config: Record<string, unknown>,
  event: Event,
  authCookies: string,
  origin: string,
  userId: string
): Promise<ActionRef> {
  const agentId = String(config.agent_id);

  // Validate agent exists
  const agents = unwrapNCBArray<{ id: string }>(
    await ncbFetch(`read/ai_agents?id=eq.${agentId}`, authCookies, origin)
  );
  if (agents.length === 0) {
    throw new Error(`ai.run: agent not found: ${agentId}`);
  }

  const entityRef = config.entity_ref as { entity_type?: string; entity_id?: string } | undefined;
  const entityType = entityRef?.entity_type || event.entity_type || "rule_triggered";
  const entityId = entityRef?.entity_id || event.entity_id || "";

  // Create ai_runs record
  const aiRun = await ncbFetch("create/ai_runs", authCookies, origin, "POST", {
    entity_type: entityType,
    entity_id: entityId || null,
    capability_key: "rule_triggered",
    status: "queued",
    user_id: userId,
  });

  // Create ai_agent_tasks record (agent-executor picks this up)
  const agentTask = await ncbFetch("create/ai_agent_tasks", authCookies, origin, "POST", {
    agent_id: agentId,
    input_payload: {
      ...(config.input as Record<string, unknown> || {}),
      source_event_id: event.id,
      ai_run_id: aiRun.id,
    },
    status: "queued",
    user_id: userId,
  });

  return { ref_type: "ai_agent_task", ref_id: agentTask.id };
}

// ── notification.send ──

async function executeNotificationSend(
  config: Record<string, unknown>,
  event: Event,
  authCookies: string,
  origin: string,
  userId: string
): Promise<ActionRef> {
  const channel = String(config.channel || "system");
  const title = String(config.title);
  const body = String(config.body);
  const recipientId = config.recipient_id ? String(config.recipient_id) : userId;

  // Insert notification record
  const notification = await ncbFetch("create/notifications", authCookies, origin, "POST", {
    channel,
    title,
    body,
    recipient_id: recipientId,
    status: "sent",
    metadata: config.metadata || null,
    user_id: userId,
  });

  // If webhook channel, fire HTTP POST (best-effort)
  if (channel === "webhook" && config.webhook_url) {
    try {
      await fetch(String(config.webhook_url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          event_id: event.id,
          metadata: config.metadata,
        }),
      });
    } catch {
      // Best-effort — don't fail the action on webhook error
    }
  }

  // Emit notification.sent event
  await ncbFetch("create/events", authCookies, origin, "POST", {
    event_name: "notification.sent",
    entity_type: "notification",
    entity_id: notification.id,
    payload: {
      channel,
      title,
      recipient_id: recipientId,
      source_event_id: event.id,
    },
    user_id: userId,
  });

  return { ref_type: "notification", ref_id: notification.id };
}
