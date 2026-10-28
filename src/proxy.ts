import { execFileSync } from "node:child_process";

/**
 * `agy` is a standalone CLI: it reads HTTP(S)_PROXY from the environment and
 * ignores the Windows system proxy (WinINET). WorkBuddy spawns this MCP server
 * with its own environment, which typically carries no proxy variables, so
 * requests leave from the local ISP and Google answers
 *
 *   FAILED_PRECONDITION (400): User location is not supported for the API use.
 *
 * Detect the proxy once at startup and publish it into process.env, so every
 * child process (agy, taskkill) inherits it without further plumbing.
 *
 * AGY_PROXY:
 *   "off"        -> never set proxy variables (force direct connection)
 *   "<url>"      -> use exactly this proxy
 *   unset/"auto" -> reuse existing proxy vars, else read the Windows system proxy
 */
export function detectProxy(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const override = env.AGY_PROXY?.trim();
  if (override && override.toLowerCase() !== "auto") {
    return override.toLowerCase() === "off" ? undefined : withScheme(override);
  }
  const existing = env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy;
  if (existing) return existing;
  if (process.platform !== "win32") return undefined;
  return readWindowsProxy();
}

const WININET_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";

function readWindowsProxy(): string | undefined {
  try {
    const raw = execFileSync("reg", ["query", WININET_KEY], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 4000,
    });
    // ProxyEnable is a DWORD; treat anything but 1 as "no proxy".
    if (!/ProxyEnable\s+REG_DWORD\s+0x1\b/i.test(raw)) return undefined;
    const match = raw.match(/ProxyServer\s+REG_SZ\s+(.+)/i);
    return match ? parseProxyServer(match[1].trim()) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * WinINET stores either a bare `host:port` or a per-scheme list like
 * `http=1.2.3.4:8080;https=1.2.3.4:8080`. Prefer the https entry because
 * every Google endpoint agy touches is TLS.
 */
export function parseProxyServer(value: string): string | undefined {
  const parts = value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  const https = parts.find((part) => /^https=/i.test(part));
  const chosen = https
    ? https.slice("https=".length)
    : parts[0].replace(/^[a-z][a-z0-9+.-]*=/i, "");
  return chosen ? withScheme(chosen) : undefined;
}

function withScheme(value: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;
}

/** Mutates `env` in place and returns the proxy that was applied, if any. */
export function applyProxyEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const proxy = detectProxy(env);
  if (!proxy) return undefined;
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]) {
    if (!env[key]) env[key] = proxy;
  }
  // Never send loopback traffic through the proxy.
  const existing = (env.NO_PROXY || env.no_proxy || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const merged = [...new Set([...existing, "localhost", "127.0.0.1", "::1"])].join(",");
  env.NO_PROXY = merged;
  env.no_proxy = merged;
  return proxy;
}
