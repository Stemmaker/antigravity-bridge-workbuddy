export interface ModelEntry {
  /** Machine id, e.g. `gemini-3.7-flash-medium` (agy ≥1.1 only). */
  id?: string;
  /** Display name, e.g. `Gemini 3.7 Flash (Medium)` — what `agy --model` accepts on every version. */
  name: string;
}

/**
 * Parses `agy models` output. Handles both the legacy one-column format (one
 * display name per line) and the agy ≥1.1 two-column `<id>\t<display name>`
 * format, which also emits a `Fetching available models...` status line.
 */
export function parseModelEntries(output: string): ModelEntry[] {
  const entries: ModelEntry[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim().replace(/\s*\(current\)$/, "");
    if (!line || /fetching available models|error|sign in|timed out/i.test(line)) continue;
    const tab = line.match(/^([^\t]+)\t(.+)$/);
    const columns = tab ?? line.match(/^([a-z0-9][a-z0-9.-]+)\s{2,}(.+)$/i);
    if (columns) {
      entries.push({ id: columns[1].trim(), name: columns[2].trim() });
      continue;
    }
    if (/^(Gemini|Claude|GPT-OSS)/i.test(line)) entries.push({ name: line });
  }
  return entries;
}

/** Display names only — the values valid for `agy --model`. */
export function parseModels(output: string): string[] {
  return parseModelEntries(output).map((e) => e.name);
}

const TIER_SUFFIX = /[\s-]*\(?\s*(low|medium|high|thinking)\s*\)?\s*$/i;
const TIER_RANK: Record<string, number> = { high: 3, medium: 2, low: 1, thinking: 3 };

/** Split an id or display name into comparable lowercase tokens, dropping the tier suffix. */
export function familyTokens(value: string): string[] {
  return value
    .trim()
    .replace(TIER_SUFFIX, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function tierRank(value: string): number {
  const m = value.trim().match(TIER_SUFFIX);
  return m ? (TIER_RANK[m[1].toLowerCase()] ?? 0) : 0;
}

function sameFamily(a: string[], b: string[]): boolean {
  return a.every((t) => b.includes(t));
}

/** Highest-tier entry inside one family, falling back to catalog order. */
function highestOf(entries: ModelEntry[], tokens: string[]): ModelEntry | undefined {
  const family = entries.filter(
    (e) =>
      sameFamily(tokens, familyTokens(e.name)) || (e.id && sameFamily(tokens, familyTokens(e.id))),
  );
  if (family.length === 0) return undefined;
  return family.reduce((best, cur) => (tierRank(cur.name) > tierRank(best.name) ? cur : best));
}

/**
 * Resolve a loosely-specified model (e.g. `claude-sonnet-5-5`, `Claude Sonnet`,
 * `gemini argon`) to the highest reasoning tier of the matching family.
 * Returns undefined when nothing matches or the request spans several families.
 */
export function upgradeToHighestTier(
  entries: ModelEntry[],
  requested: string,
): ModelEntry | undefined {
  const tokens = familyTokens(requested);
  if (tokens.length === 0) return undefined;
  const candidates = entries.filter(
    (e) =>
      sameFamily(tokens, familyTokens(e.name)) || (e.id && sameFamily(tokens, familyTokens(e.id))),
  );
  if (candidates.length === 0) return undefined;
  // Ambiguous (e.g. just "claude"): refuse to guess between families.
  const families = new Set(candidates.map((e) => familyTokens(e.name).join(" ")));
  if (families.size > 1) return undefined;
  return highestOf(entries, familyTokens(candidates[0].name));
}

export interface ResolveOptions {
  explicit?: string;
  chain: string[];
  defaultModel?: string;
}

export interface Resolution {
  model?: string;
  note?: string;
}

export interface ChainResolution {
  models: (string | undefined)[];
  note?: string;
}

export class ModelRegistry {
  private entries: ModelEntry[] | null = null;
  private loadedAt = 0;
  private pending: Promise<ModelEntry[] | null> | null = null;

  constructor(
    private fetchListing: () => Promise<string>,
    private ttlMs = 5 * 60_000,
  ) {}

  private async load(force = false): Promise<ModelEntry[] | null> {
    if (!force && this.entries && Date.now() - this.loadedAt < this.ttlMs) return this.entries;
    // Cache the promise so concurrent first calls share one fetch.
    this.pending ??= this.fetchListing()
      .then(parseModelEntries)
      .catch(() => null);
    const result = await this.pending;
    this.pending = null;
    if (result) {
      this.entries = result;
      this.loadedAt = Date.now();
    }
    return result;
  }

  /** Available display names, or null when `agy models` could not be read. */
  async available(force = false): Promise<string[] | null> {
    return (await this.load(force))?.map((e) => e.name) ?? null;
  }

  /** Return the current model directory, preserving machine ids. */
  async entriesList(force = false): Promise<ModelEntry[] | null> {
    return await this.load(force);
  }

  invalidate(): void {
    this.entries = null;
    this.loadedAt = 0;
  }

  async resolve(opts: ResolveOptions): Promise<Resolution> {
    const r = await this.resolveChain(opts);
    return { model: r.models[0], note: r.note };
  }

  /**
   * Returns every viable model in preference order so callers can fail over
   * (e.g. on quota exhaustion). `[undefined]` means "let agy pick".
   * Caller-supplied names (`explicit`, `defaultModel`) may be either the id or
   * the display name; both are normalised to the display name.
   */
  async resolveChain(opts: ResolveOptions): Promise<ChainResolution> {
    const entries = await this.load();
    const available = entries?.map((e) => e.name) ?? null;
    const canonical = (m: string) => entries?.find((e) => e.id === m)?.name ?? m;

    if (opts.explicit) {
      if (available === null) {
        return {
          models: [opts.explicit],
          note: "could not list agy models; passing model through unvalidated",
        };
      }
      const explicit = canonical(opts.explicit);
      if (available.includes(explicit)) return { models: [explicit] };
      // Highest-tier rule: "Claude Sonnet 5.5" / "claude-sonnet-5-5" / "claude sonnet"
      // all resolve to the High variant instead of failing or silently picking a low tier.
      const upgraded = entries ? upgradeToHighestTier(entries, opts.explicit) : undefined;
      if (upgraded) {
        return { models: [upgraded.name], note: `"${opts.explicit}" resolved to ${upgraded.name}` };
      }
      throw new Error(
        `Model "${opts.explicit}" is not available. Available models:\n${available.join("\n")}`,
      );
    }

    if (available === null) {
      return {
        models: [undefined],
        note: "could not list agy models; using agy's own default model",
      };
    }
    const models = opts.chain.filter((m) => available.includes(m));
    const defaultModel = opts.defaultModel && canonical(opts.defaultModel);
    if (defaultModel && available.includes(defaultModel)) {
      return { models: [defaultModel] };
    }
    const defaultUpgraded =
      opts.defaultModel && entries ? upgradeToHighestTier(entries, opts.defaultModel) : undefined;
    if (defaultUpgraded) {
      return {
        models: [defaultUpgraded.name],
        note: `default model resolved to ${defaultUpgraded.name} (highest tier)`,
      };
    }
    if (models.length > 0) return { models };
    if (opts.chain.length > 0) {
      return { models: [undefined], note: "none of the configured models are available" };
    }
    if (entries && entries.length > 0) {
      // Highest-reasoning default: never fall back to whatever agy happens to list first.
      const best = highestOf(entries, familyTokens(entries[0].name)) ?? entries[0];
      return {
        models: [best.name],
        note: `no model specified; defaulted to ${best.name} (highest tier)`,
      };
    }
    return { models: [undefined], note: "could not resolve a model from agy" };
  }
}
