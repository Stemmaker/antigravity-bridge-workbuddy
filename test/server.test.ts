import { describe, it, expect } from "vitest";
import { createToolHandler } from "../src/server.js";
import { ModelRegistry } from "../src/models.js";
import { TOOLS } from "../src/tools.js";
import type { Config } from "../src/config.js";
import type { ChildHandle, RunnerDeps } from "../src/runner.js";

const cfg: Config = {
  agyPath: "agy",
  timeoutSec: 600,
  timeoutExplicit: false,
  perToolTimeouts: {},
  maxOutputChars: 50_000,
  defaultModel: undefined,
  skipPermissions: false,
  sandbox: false,
  onFailure: "fallback",
  allowedRoots: [process.cwd(), "C:\\repo"],
  quotaFailover: false,
  effort: undefined,
  modelListTimeoutMs: 120_000,
  taskTtlMs: 3_600_000,
};
const LISTING =
  "gemini-4-argon-medium\tGemini 4 Argon (Medium)\ngemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)\n";
function fakeDeps() {
  const runs: string[][] = [];
  const deps: RunnerDeps = {
    spawnChild: (_file, args) => {
      runs.push(args);
      const child: ChildHandle = {
        stdout: () =>
          JSON.stringify({
            response: "the answer",
            conversation_id: "sess-1",
            usage: { input_tokens: 1 },
          }),
        stderr: () => "",
        wait: () => Promise.resolve({ code: 0 }),
        kill: () => {},
      };
      return child;
    },
    readLog: async () => "",
    removeLog: async () => {},
    readSessionsFile: async () => "{}",
    makeLogPath: () => "C:\\Temp\\agy-bridge-test.log",
    pollMs: 5,
    graceMs: 20,
    killGraceMs: 5,
  };
  return { deps, runs };
}
function handlerFor(name: string, f: ReturnType<typeof fakeDeps>, overrides: Partial<Config> = {}) {
  return createToolHandler(
    TOOLS.find((tool) => tool.name === name)!,
    { ...cfg, ...overrides },
    new ModelRegistry(async () => LISTING),
    f.deps,
  );
}
describe("createToolHandler", () => {
  it("uses an explicit live model id and returns structured session metadata", async () => {
    const f = fakeDeps();
    const res = await handlerFor("delegate", f)({ prompt: "do x", model: "gemini-4-argon-medium" });
    const text = (res.content[0] as { text: string }).text;
    expect(res.isError).toBeUndefined();
    expect(text).toContain("the answer");
    expect(text).toContain("Gemini 4 Argon (Medium)");
    expect(text).toContain("sess-1");
    expect(text).toContain("usage");
    expect(f.runs[0]).toContain("--model");
    expect(f.runs[0]).toContain("Gemini 4 Argon (Medium)");
  });
  it("rejects a model not returned by agy", async () => {
    const f = fakeDeps();
    const res = await handlerFor("delegate", f)({ prompt: "do x", model: "not-a-real-model" });
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toMatch(/not available/i);
    expect(f.runs).toHaveLength(0);
  });
  it("continues a session without overriding its model", async () => {
    const f = fakeDeps();
    await handlerFor(
      "follow_up",
      f,
    )({ session_id: "abc", question: "more?", model: "gemini-4-argon-medium" });
    expect(f.runs[0]).toContain("--conversation");
    expect(f.runs[0]).toContain("abc");
    expect(f.runs[0]).not.toContain("--model");
  });
  it("enforces the configured working-directory roots", async () => {
    const f = fakeDeps();
    const res = await handlerFor("delegate", f, { allowedRoots: ["C:\\allowed"] })({
      cwd: "C:\\outside",
      prompt: "x",
    });
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toMatch(/outside AGY_ALLOWED_ROOTS/);
  });
  it("forwards the MCP abort signal", async () => {
    const f = fakeDeps();
    const ac = new AbortController();
    ac.abort();
    const res = await handlerFor("delegate", f)(
      { prompt: "x", model: "gemini-4-argon-medium" },
      { signal: ac.signal },
    );
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toMatch(/cancelled/i);
  });
});
