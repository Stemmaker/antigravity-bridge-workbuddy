import path from "node:path";

export interface Config {
  agyPath: string;
  timeoutSec: number;
  timeoutExplicit: boolean;
  perToolTimeouts: Record<string, number>;
  maxOutputChars: number;
  defaultModel?: string;
  skipPermissions: boolean;
  sandbox: boolean;
  onFailure: "strict" | "fallback";
  allowedRoots: string[];
  quotaFailover: boolean;
  effort?: string;
  modelListTimeoutMs?: number;
  taskTtlMs?: number;
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function loadPerToolTimeouts(env: Record<string, string | undefined>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(env)) {
    if (!key.startsWith("AGY_TIMEOUT_")) continue;
    const name = key.slice("AGY_TIMEOUT_".length).toLowerCase();
    const value = Number(raw);
    if (name && Number.isInteger(value) && value > 0) result[name] = value;
  }
  return result;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const roots = (env.AGY_ALLOWED_ROOTS || process.cwd())
    .split(path.delimiter)
    .map((root) => root.trim())
    .filter(Boolean)
    .map((root) => path.resolve(root));

  return {
    agyPath: env.AGY_PATH || "agy",
    timeoutSec: positiveInt(env.AGY_TIMEOUT, 1200),
    timeoutExplicit: positiveInt(env.AGY_TIMEOUT, 0) > 0,
    perToolTimeouts: loadPerToolTimeouts(env),
    maxOutputChars: positiveInt(env.AGY_MAX_OUTPUT_CHARS, 50_000),
    defaultModel: env.AGY_DEFAULT_MODEL || undefined,
    skipPermissions: env.AGY_SKIP_PERMISSIONS === "true",
    sandbox: env.AGY_SANDBOX === "true",
    onFailure: env.AGY_ON_FAILURE === "strict" ? "strict" : "fallback",
    allowedRoots: roots,
    quotaFailover: env.AGY_QUOTA_FAILOVER === "true",
    effort: env.AGY_EFFORT || undefined,
    modelListTimeoutMs: positiveInt(env.AGY_MODEL_LIST_TIMEOUT_MS, 120_000),
    taskTtlMs: positiveInt(env.AGY_TASK_TTL_MS, 60 * 60_000),
  };
}
