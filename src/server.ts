import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { loadConfig, type Config } from "./config.js";
import { ModelRegistry } from "./models.js";
import {
  runAgy,
  defaultDeps,
  execWithClosedStdin,
  type RunnerDeps,
  type RunResult,
} from "./runner.js";
import { CooldownRegistry, QuotaError } from "./quota.js";
import { TOOLS, assertAllowedCwd, type ToolDef } from "./tools.js";

interface ToolResponse {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}
interface HandlerExtra {
  signal?: AbortSignal;
}

type TaskRecord = {
  status: "running" | "completed" | "failed" | "cancelled";
  output?: string;
  error?: string;
  model: string;
  sessionId?: string;
  createdAt: number;
  updatedAt: number;
  controller: AbortController;
};

function resultText(value: string, isError = false): ToolResponse {
  return { content: [{ type: "text", text: value }], ...(isError ? { isError: true } : {}) };
}
function pruneTasks(tasks: Map<string, TaskRecord>, ttlMs: number): void {
  const now = Date.now();
  for (const [id, task] of tasks)
    if (task.status !== "running" && now - task.updatedAt > ttlMs) tasks.delete(id);
}

export function createToolHandler(
  tool: ToolDef,
  cfg: Config,
  registry: ModelRegistry,
  deps: RunnerDeps = defaultDeps,
  cooldowns: CooldownRegistry = new CooldownRegistry(),
): (args: Record<string, unknown>, extra?: HandlerExtra) => Promise<ToolResponse> {
  return async (args, extra) => {
    try {
      const cwd = assertAllowedCwd(
        (args.cwd as string | undefined) ?? process.cwd(),
        cfg.allowedRoots,
      );
      const conversationId = args.session_id as string | undefined;
      const prompt = tool.buildPrompt(args, cwd);
      const timeoutSec =
        cfg.perToolTimeouts[tool.name] ?? (cfg.timeoutExplicit ? cfg.timeoutSec : tool.timeoutSec);
      const resolution = conversationId
        ? { models: [undefined], note: undefined }
        : await registry.resolveChain({
            explicit: args.model as string | undefined,
            chain: tool.chain,
            defaultModel: cfg.defaultModel,
          });
      const attempts: string[] = [];
      let result: RunResult | undefined;
      let used: string | undefined;
      for (const model of resolution.models) {
        if (model && cooldowns.cooling(model)) {
          attempts.push(`${model}: quota cooldown, ${cooldowns.describe(model)} left`);
          continue;
        }
        try {
          result = await runAgy(
            {
              prompt,
              cwd,
              model,
              effort: args.effort as string | undefined,
              conversationId,
              timeoutSec,
              signal: extra?.signal,
            },
            cfg,
            deps,
          );
          used = model;
          break;
        } catch (err) {
          if (cfg.quotaFailover && err instanceof QuotaError && model) {
            cooldowns.set(model, err.resetSeconds);
            attempts.push(
              `${model}: quota exhausted${err.resetText ? ` (resets in ${err.resetText})` : ""}`,
            );
            continue;
          }
          throw err;
        }
      }
      if (!result) throw new Error(`No available model executed. ${attempts.join("; ")}`);
      const meta = [
        `model: ${used ?? (conversationId ? "same as resumed session" : "agy default")}`,
      ];
      if (resolution.note) meta.push(`note: ${resolution.note}`);
      if (attempts.length) meta.push(`failover: ${attempts.join("; ")}`);
      if (result.sessionId) meta.push(`session: ${result.sessionId} (use follow_up to continue)`);
      if (result.usage) meta.push(`usage: ${JSON.stringify(result.usage)}`);
      return resultText(`${result.output}\n\n---\n[antigravity-bridge] ${meta.join(" | ")}`);
    } catch (err) {
      let message = (err as Error).message;
      if (cfg.onFailure === "strict")
        message +=
          "\n\nDelegation failed. Do NOT perform this work yourself in the main context; report the failure and ask before performing the delegated task here.";
      return resultText(message, true);
    }
  };
}

export function createServer(): McpServer {
  const cfg = loadConfig();
  const registry = new ModelRegistry(async () => {
    const { stdout, stderr } = await execWithClosedStdin(cfg.agyPath, ["models"], {
      cwd: process.cwd(),
      timeout: cfg.modelListTimeoutMs ?? 120_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    if (!stdout.trim()) throw new Error(stderr || "agy models returned no output");
    return stdout;
  });
  const cooldowns = new CooldownRegistry();
  const server = new McpServer({ name: "antigravity-bridge", version: "1.0.0" });
  for (const tool of TOOLS)
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.schema },
      createToolHandler(tool, cfg, registry, defaultDeps, cooldowns),
    );

  const tasks = new Map<string, TaskRecord>();
  server.registerTool(
    "list_models",
    {
      description: "List the live model directory returned by the authenticated Antigravity CLI.",
      inputSchema: { refresh: z.boolean().optional() },
    },
    async ({ refresh }) => {
      try {
        const entries = await registry.entriesList(Boolean(refresh));
        if (!entries?.length)
          return resultText("agy returned no models. Verify the CLI login and retry.", true);
        return resultText(
          entries.map((item) => `${item.id ? `${item.id}\t` : ""}${item.name}`).join("\n"),
        );
      } catch (err) {
        return resultText(`Could not list Antigravity models: ${(err as Error).message}`, true);
      }
    },
  );

  server.registerTool(
    "start_task",
    {
      description: "Start a long-running task. Use task_status to poll and cancel_task to stop it.",
      inputSchema: {
        prompt: z.string().min(1),
        cwd: z.string().optional(),
        model: z.string().optional(),
        effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
      },
    },
    async ({ prompt, cwd, model, effort }) => {
      try {
        pruneTasks(tasks, cfg.taskTtlMs ?? 3_600_000);
        const root = assertAllowedCwd(
          (cwd as string | undefined) ?? process.cwd(),
          cfg.allowedRoots,
        );
        const resolution = await registry.resolveChain({
          explicit: model as string | undefined,
          chain: [],
          defaultModel: cfg.defaultModel,
        });
        const selected = resolution.models[0];
        if (!selected)
          return resultText(
            "No authenticated model was selected. Call list_models, then pass a model ID or display name.",
            true,
          );
        const id = randomUUID();
        const controller = new AbortController();
        const now = Date.now();
        const task: TaskRecord = {
          status: "running",
          model: selected,
          createdAt: now,
          updatedAt: now,
          controller,
        };
        tasks.set(id, task);
        void runAgy(
          {
            prompt: prompt as string,
            cwd: root,
            model: selected,
            effort: effort as string | undefined,
            timeoutSec: cfg.timeoutSec,
            signal: controller.signal,
          },
          cfg,
        )
          .then((result) => {
            task.status = "completed";
            task.output = result.output;
            task.sessionId = result.sessionId;
            task.updatedAt = Date.now();
          })
          .catch((err) => {
            task.status = controller.signal.aborted ? "cancelled" : "failed";
            task.error = (err as Error).message;
            task.updatedAt = Date.now();
          });
        return resultText(JSON.stringify({ task_id: id, status: task.status, model: task.model }));
      } catch (err) {
        return resultText((err as Error).message, true);
      }
    },
  );
  server.registerTool(
    "task_status",
    { description: "Read task state and final result.", inputSchema: { task_id: z.string() } },
    async ({ task_id }) => {
      pruneTasks(tasks, cfg.taskTtlMs ?? 3_600_000);
      const task = tasks.get(task_id as string);
      if (!task) return resultText("Task not found or expired.", true);
      return resultText(
        JSON.stringify({
          task_id,
          status: task.status,
          model: task.model,
          created_at: new Date(task.createdAt).toISOString(),
          updated_at: new Date(task.updatedAt).toISOString(),
          session_id: task.sessionId,
          output: task.output,
          error: task.error,
        }),
      );
    },
  );
  server.registerTool(
    "cancel_task",
    { description: "Cancel a running Antigravity task.", inputSchema: { task_id: z.string() } },
    async ({ task_id }) => {
      const task = tasks.get(task_id as string);
      if (!task) return resultText("Task not found or expired.", true);
      if (task.status !== "running") return resultText(`Task is already ${task.status}.`);
      task.controller.abort();
      return resultText(`Cancellation requested for ${task_id}.`);
    },
  );
  return server;
}
