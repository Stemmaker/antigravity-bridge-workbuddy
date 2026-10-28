import { describe, it, expect } from "vitest";
import { parseModels, parseModelEntries, ModelRegistry } from "../src/models.js";

const LISTING = `Gemini 3.5 Flash (Medium)
Gemini 3.5 Flash (High)
Gemini 3.1 Pro (High)
`;

const TABBED = `Fetching available models...
  gemini-3.7-flash-medium\tGemini 3.7 Flash (Medium)
  gemini-3.1-pro-high\tGemini 3.1 Pro (High)
`;

const SCREENSHOT_LISTING = `gemini-4-argon-medium  Gemini 4 Argon (Medium)
gemini-4-argon-high  Gemini 4 Argon (High)
gemini-4-argon-low  Gemini 4 Argon (Low)
gemini-3.8-flash-high  Gemini 3.8 Flash (High)
gemini-3.8-flash-medium  Gemini 3.8 Flash (Medium)
gemini-3.8-flash-low  Gemini 3.8 Flash (Low)
claude-opus-5-5-low  Claude Opus 5.5 (Low)
claude-opus-5-5-medium  Claude Opus 5.5 (Medium)
claude-opus-5-5-high  Claude Opus 5.5 (High)
claude-sonnet-5-5-low  Claude Sonnet 5.5 (Low)
claude-sonnet-5-5-medium  Claude Sonnet 5.5 (Medium)
claude-sonnet-5-5-high  Claude Sonnet 5.5 (High)
gpt-oss-120b-medium  GPT-OSS 120B (Medium)
`;

describe("parseModels", () => {
  it("parses the current Antigravity screenshot format", () => {
    const entries = parseModelEntries(SCREENSHOT_LISTING);
    expect(entries).toHaveLength(13);
    expect(entries[0]).toEqual({ id: "gemini-4-argon-medium", name: "Gemini 4 Argon (Medium)" });
    expect(entries.at(-1)).toEqual({ id: "gpt-oss-120b-medium", name: "GPT-OSS 120B (Medium)" });
  });

  it("returns one trimmed model per non-empty line", () => {
    expect(parseModels(LISTING)).toEqual([
      "Gemini 3.5 Flash (Medium)",
      "Gemini 3.5 Flash (High)",
      "Gemini 3.1 Pro (High)",
    ]);
  });

  it("strips a trailing ' (current)' marker", () => {
    expect(parseModels("Claude Opus 4.6 (Thinking) (current)\n")).toEqual([
      "Claude Opus 4.6 (Thinking)",
    ]);
  });

  // agy CLI ≥1.1 (issue #14): status line + `<id>\t<display name>` columns.
  it("handles the two-column format, dropping the status line", () => {
    expect(parseModelEntries(TABBED)).toEqual([
      { id: "gemini-3.7-flash-medium", name: "Gemini 3.7 Flash (Medium)" },
      { id: "gemini-3.1-pro-high", name: "Gemini 3.1 Pro (High)" },
    ]);
    expect(parseModels(TABBED)).toEqual(["Gemini 3.7 Flash (Medium)", "Gemini 3.1 Pro (High)"]);
  });
});

describe("ModelRegistry.resolve", () => {
  const registry = (out: string | Error) =>
    new ModelRegistry(async () => {
      if (out instanceof Error) throw out;
      return out;
    });

  it("uses explicit model when available", async () => {
    const r = await registry(LISTING).resolve({ explicit: "Gemini 3.1 Pro (High)", chain: [] });
    expect(r.model).toBe("Gemini 3.1 Pro (High)");
  });

  it("accepts the model id as explicit or defaultModel and normalises to the display name", async () => {
    const a = await registry(TABBED).resolve({ explicit: "gemini-3.1-pro-high", chain: [] });
    expect(a.model).toBe("Gemini 3.1 Pro (High)");
    const b = await registry(TABBED).resolve({
      chain: ["X"],
      defaultModel: "gemini-3.7-flash-medium",
    });
    expect(b.model).toBe("Gemini 3.7 Flash (Medium)");
    const c = await registry(TABBED).resolve({ chain: ["Gemini 3.1 Pro (High)"] });
    expect(c.model).toBe("Gemini 3.1 Pro (High)");
  });

  it("throws on explicit model not available, listing options", async () => {
    await expect(registry(LISTING).resolve({ explicit: "Nope", chain: [] })).rejects.toThrow(
      /Gemini 3.5 Flash \(Medium\)/,
    );
  });

  it("picks first available model in chain", async () => {
    const r = await registry(LISTING).resolve({
      chain: ["Gemini 9.9 Ultra", "Gemini 3.5 Flash (High)"],
    });
    expect(r.model).toBe("Gemini 3.5 Flash (High)");
  });

  it("falls back to defaultModel when chain misses", async () => {
    const r = await registry(LISTING).resolve({
      chain: ["Gemini 9.9 Ultra"],
      defaultModel: "Gemini 3.5 Flash (Medium)",
    });
    expect(r.model).toBe("Gemini 3.5 Flash (Medium)");
  });

  it("returns undefined model when nothing matches", async () => {
    const r = await registry(LISTING).resolve({ chain: ["X"], defaultModel: "Y" });
    expect(r.model).toBeUndefined();
  });

  it("degrades when agy models fails: explicit passes through, chain yields undefined + note", async () => {
    const reg = registry(new Error("boom"));
    const a = await reg.resolve({ explicit: "Whatever", chain: [] });
    expect(a.model).toBe("Whatever");
    const b = await reg.resolve({ chain: ["Gemini 3.5 Flash (High)"] });
    expect(b.model).toBeUndefined();
    expect(b.note).toMatch(/could not list/i);
  });

  it("resolveChain returns every available chain model in order, then defaultModel", async () => {
    const r = await registry(LISTING).resolveChain({
      chain: ["Gemini 9.9 Ultra", "Gemini 3.5 Flash (Medium)", "Gemini 3.5 Flash (High)"],
      defaultModel: "Gemini 3.1 Pro (High)",
    });
    expect(r.models).toEqual(["Gemini 3.1 Pro (High)"]);
  });

  it("resolveChain with explicit model returns just that model", async () => {
    const r = await registry(LISTING).resolveChain({
      explicit: "Gemini 3.1 Pro (High)",
      chain: ["Gemini 3.5 Flash (High)"],
    });
    expect(r.models).toEqual(["Gemini 3.1 Pro (High)"]);
  });

  it("resolveChain yields [undefined] + note when nothing matches or listing fails", async () => {
    const a = await registry(LISTING).resolveChain({ chain: ["X"], defaultModel: "Y" });
    expect(a.models).toEqual([undefined]);
    expect(a.note).toMatch(/none of the configured models/i);
    const b = await registry(new Error("boom")).resolveChain({ chain: ["X"] });
    expect(b.models).toEqual([undefined]);
    expect(b.note).toMatch(/could not list/i);
  });

  it("fetches the listing only once under concurrent calls", async () => {
    let calls = 0;
    const reg = new ModelRegistry(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return LISTING;
    });
    const [a, b] = await Promise.all([
      reg.resolveChain({ chain: ["Gemini 3.5 Flash (High)"] }),
      reg.resolveChain({ chain: ["Gemini 3.1 Pro (High)"] }),
    ]);
    expect(calls).toBe(1);
    expect(a.models).toEqual(["Gemini 3.5 Flash (High)"]);
    expect(b.models).toEqual(["Gemini 3.1 Pro (High)"]);
  });

  it("retries the listing after a transient failure instead of caching null forever", async () => {
    let calls = 0;
    const reg = new ModelRegistry(async () => {
      if (++calls === 1) throw new Error("transient");
      return LISTING;
    });
    const a = await reg.resolveChain({ chain: ["Gemini 3.1 Pro (High)"] });
    expect(a.models).toEqual([undefined]);
    const b = await reg.resolveChain({ chain: ["Gemini 3.1 Pro (High)"] });
    expect(b.models).toEqual(["Gemini 3.1 Pro (High)"]);
  });

  it("caches the listing across calls", async () => {
    let calls = 0;
    const reg = new ModelRegistry(async () => {
      calls++;
      return LISTING;
    });
    await reg.resolve({ chain: ["Gemini 3.5 Flash (High)"] });
    await reg.resolve({ chain: ["Gemini 3.1 Pro (High)"] });
    expect(calls).toBe(1);
  });
});

describe("highest-reasoning default (老大定的永久规则)", () => {
  const fresh = () => new ModelRegistry(async () => SCREENSHOT_LISTING);

  it("upgrades a family name without a tier to the High variant", async () => {
    for (const asked of ["Claude Sonnet 5.5", "claude-sonnet-5-5", "claude sonnet"]) {
      const r = await fresh().resolve({ explicit: asked, chain: [] });
      expect(r.model, asked).toBe("Claude Sonnet 5.5 (High)");
    }
  });

  it("keeps an explicitly requested lower tier untouched", async () => {
    for (const asked of ["claude-sonnet-5-5-low", "claude-sonnet-5-5-medium"]) {
      const r = await fresh().resolve({ explicit: asked, chain: [] });
      expect(r.model, asked).toBe(
        `Claude Sonnet 5.5 (${asked.endsWith("low") ? "Low" : "Medium"})`,
      );
    }
  });

  it("resolves short family aliases for every family", async () => {
    const cases: [string, string][] = [
      ["gemini argon", "Gemini 4 Argon (High)"],
      ["gemini flash", "Gemini 3.8 Flash (High)"],
      ["opus", "Claude Opus 5.5 (High)"],
      ["sonnet", "Claude Sonnet 5.5 (High)"],
    ];
    for (const [asked, want] of cases) {
      const r = await fresh().resolve({ explicit: asked, chain: [] });
      expect(r.model, asked).toBe(want);
    }
  });

  it("refuses to guess between families when the request is ambiguous", async () => {
    await expect(fresh().resolve({ explicit: "claude", chain: [] })).rejects.toThrow(
      /not available/i,
    );
  });

  it("defaults to the highest tier of the first family when no model is given", async () => {
    const r = await fresh().resolve({ chain: [] });
    expect(r.model).toBe("Gemini 4 Argon (High)");
    expect(r.note).toMatch(/highest tier/i);
  });

  it("upgrades a configured default model that omits its tier", async () => {
    const r = await fresh().resolve({ chain: [], defaultModel: "claude-opus-5-5" });
    expect(r.model).toBe("Claude Opus 5.5 (High)");
  });
});
