/**
 * Simple JSON-logic condition evaluator for automation rules.
 * Supports basic operators: ==, !=, >, <, >=, <=, in, and, or, not, var
 */

type JsonLogicOp = Record<string, unknown>;

export function evaluateCondition(
  logic: JsonLogicOp | boolean,
  data: Record<string, unknown>
): boolean {
  if (typeof logic === "boolean") return logic;
  if (!logic || typeof logic !== "object") return true;

  const [op] = Object.keys(logic);
  const args = logic[op];

  switch (op) {
    case "==":
      return resolve(args, data, 0) == resolve(args, data, 1);
    case "===":
      return resolve(args, data, 0) === resolve(args, data, 1);
    case "!=":
      return resolve(args, data, 0) != resolve(args, data, 1);
    case "!==":
      return resolve(args, data, 0) !== resolve(args, data, 1);
    case ">":
      return Number(resolve(args, data, 0)) > Number(resolve(args, data, 1));
    case "<":
      return Number(resolve(args, data, 0)) < Number(resolve(args, data, 1));
    case ">=":
      return Number(resolve(args, data, 0)) >= Number(resolve(args, data, 1));
    case "<=":
      return Number(resolve(args, data, 0)) <= Number(resolve(args, data, 1));
    case "in": {
      const val = resolve(args, data, 0);
      const arr = resolve(args, data, 1);
      return Array.isArray(arr) ? arr.includes(val) : false;
    }
    case "and": {
      if (!Array.isArray(args)) return Boolean(args);
      return args.every((a: JsonLogicOp | boolean) => evaluateCondition(a, data));
    }
    case "or": {
      if (!Array.isArray(args)) return Boolean(args);
      return args.some((a: JsonLogicOp | boolean) => evaluateCondition(a, data));
    }
    case "not":
    case "!":
      return !evaluateCondition(Array.isArray(args) ? args[0] : args, data);
    case "var": {
      const path = typeof args === "string" ? args : Array.isArray(args) ? args[0] : String(args);
      return resolveVar(path, data) as boolean;
    }
    default:
      return true;
  }
}

function resolve(
  args: unknown,
  data: Record<string, unknown>,
  index: number
): unknown {
  if (!Array.isArray(args)) return args;
  const val = args[index];
  if (val && typeof val === "object" && "var" in (val as Record<string, unknown>)) {
    return resolveVar(String((val as Record<string, unknown>).var), data);
  }
  if (val && typeof val === "object") {
    return evaluateCondition(val as JsonLogicOp, data);
  }
  return val;
}

function resolveVar(path: string, data: Record<string, unknown>): unknown {
  const parts = path.split(".");
  let current: unknown = data;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
