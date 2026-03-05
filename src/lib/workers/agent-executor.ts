import { CONFIG, unwrapNCBArray } from "@/lib/ncb-utils";

interface AgentTask {
  id: string;
  agent_id: string;
  input_payload: Record<string, unknown>;
  status: string;
}

interface AgentConfig {
  id: string;
  name: string;
  model?: string;
  system_prompt?: string;
}

interface AgentTool {
  id: string;
  name: string;
  executor_type: string;
  config_json: Record<string, unknown>;
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

export async function executeAgentTasks(
  authCookies: string,
  origin: string,
  userId: string,
  batchSize = 10
): Promise<{ processed: number; results: { task_id: string; success: boolean; error?: string }[] }> {
  // 1. Poll queued tasks
  let tasks: AgentTask[];
  try {
    tasks = unwrapNCBArray<AgentTask>(await ncbFetch(
      `read/ai_agent_tasks?status=eq.queued&limit=${batchSize}&order=created_at.asc`,
      authCookies,
      origin
    ));
  } catch {
    return { processed: 0, results: [] };
  }

  if (tasks.length === 0) {
    return { processed: 0, results: [] };
  }

  const results: { task_id: string; success: boolean; error?: string }[] = [];

  for (const task of tasks) {
    // Mark as running
    await ncbFetch(`update/ai_agent_tasks?id=eq.${task.id}`, authCookies, origin, "PUT", {
      status: "running",
    });

    try {
      // Get agent config
      const agents = unwrapNCBArray<AgentConfig>(await ncbFetch(
        `read/ai_agents?id=eq.${task.agent_id}`,
        authCookies,
        origin
      ));
      if (!agents.length) {
        throw new Error(`Agent not found: ${task.agent_id}`);
      }

      // Get agent tools
      const agentTools = unwrapNCBArray<{ tool_id: string }>(await ncbFetch(
        `read/ai_agent_tools?agent_id=eq.${task.agent_id}`,
        authCookies,
        origin
      ));

      if (agentTools.length > 0) {
        const toolIds = agentTools.map((at) => at.tool_id);
        const tools = unwrapNCBArray<AgentTool>(await ncbFetch(
          `read/ai_tools?id=in.(${toolIds.join(",")})`,
          authCookies,
          origin
        ));

        // Execute each tool call (simplified)
        for (const tool of tools) {
          const stepResult = await executeTool(tool, task.input_payload, authCookies, origin, userId);

          // Log step
          await ncbFetch("create/ai_agent_task_steps", authCookies, origin, "POST", {
            task_id: task.id,
            tool_name: tool.name,
            input_json: task.input_payload,
            output_json: stepResult,
            status: "completed",
            user_id: userId,
          });
        }
      }

      // Create ai_run record
      await ncbFetch("create/ai_runs", authCookies, origin, "POST", {
        entity_type: "ai_agent_task",
        entity_id: task.id,
        capability_key: "agent_execution",
        model: agents[0].model || "system",
        input_payload: task.input_payload,
        output_payload: { status: "completed" },
        status: "success",
        user_id: userId,
      });

      // Mark completed
      await ncbFetch(`update/ai_agent_tasks?id=eq.${task.id}`, authCookies, origin, "PUT", {
        status: "completed",
      });

      results.push({ task_id: task.id, success: true });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";

      await ncbFetch(`update/ai_agent_tasks?id=eq.${task.id}`, authCookies, origin, "PUT", {
        status: "failed",
        error_message: errorMsg,
      });

      results.push({ task_id: task.id, success: false, error: errorMsg });
    }
  }

  return { processed: tasks.length, results };
}

async function executeTool(
  tool: AgentTool,
  input: Record<string, unknown>,
  authCookies: string,
  origin: string,
  userId: string
): Promise<Record<string, unknown>> {
  switch (tool.executor_type) {
    case "http": {
      const url = String(tool.config_json.url || "");
      if (!url) return { error: "No URL configured" };
      const res = await fetch(url, {
        method: String(tool.config_json.method || "POST"),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return { status: res.status, body: await res.text() };
    }

    case "db_query": {
      const table = String(tool.config_json.table || "");
      if (!table) return { error: "No table configured" };
      const data = await ncbFetch(`read/${table}?limit=10`, authCookies, origin);
      return { rows: data };
    }

    case "event_emit": {
      await ncbFetch("create/events", authCookies, origin, "POST", {
        event_name: String(tool.config_json.event_name || "tool.executed"),
        payload: input,
        user_id: userId,
      });
      return { emitted: true };
    }

    default:
      return { error: `Unknown executor type: ${tool.executor_type}` };
  }
}
