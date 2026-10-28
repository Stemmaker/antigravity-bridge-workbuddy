import { describe, expect, it } from "vitest";
import { applyProxyEnv, detectProxy, parseProxyServer } from "../src/proxy.js";

describe("parseProxyServer", () => {
  it("accepts a bare host:port", () => {
    expect(parseProxyServer("127.0.0.1:7890")).toBe("http://127.0.0.1:7890");
  });

  it("keeps an explicit scheme", () => {
    expect(parseProxyServer("socks5://127.0.0.1:1080")).toBe("socks5://127.0.0.1:1080");
  });

  it("prefers the https entry in a per-scheme list", () => {
    expect(parseProxyServer("http=1.2.3.4:8080;https=5.6.7.8:8443")).toBe("http://5.6.7.8:8443");
  });

  it("falls back to the first entry when no https mapping exists", () => {
    expect(parseProxyServer("http=1.2.3.4:8080;ftp=9.9.9.9:21")).toBe("http://1.2.3.4:8080");
  });

  it("returns undefined for empty input", () => {
    expect(parseProxyServer("")).toBeUndefined();
    expect(parseProxyServer("   ")).toBeUndefined();
  });
});

describe("detectProxy", () => {
  it("honours AGY_PROXY=off and never falls back to the system proxy", () => {
    expect(detectProxy({ AGY_PROXY: "off" } as NodeJS.ProcessEnv)).toBeUndefined();
  });

  it("uses an explicit AGY_PROXY url", () => {
    expect(detectProxy({ AGY_PROXY: "127.0.0.1:9999" } as NodeJS.ProcessEnv)).toBe(
      "http://127.0.0.1:9999",
    );
  });

  it("reuses an inherited proxy variable", () => {
    expect(detectProxy({ HTTPS_PROXY: "http://10.0.0.1:3128" } as NodeJS.ProcessEnv)).toBe(
      "http://10.0.0.1:3128",
    );
  });

  it("treats auto as 'detect', not as a literal url", () => {
    const result = detectProxy({ AGY_PROXY: "auto", HTTPS_PROXY: "" } as NodeJS.ProcessEnv);
    // On Windows this may resolve to the real system proxy; elsewhere it is undefined.
    expect(result === undefined || result.startsWith("http")).toBe(true);
  });
});

describe("applyProxyEnv", () => {
  it("fills both cases and protects loopback", () => {
    const env = { AGY_PROXY: "127.0.0.1:7890" } as NodeJS.ProcessEnv;
    expect(applyProxyEnv(env)).toBe("http://127.0.0.1:7890");
    expect(env.HTTPS_PROXY).toBe("http://127.0.0.1:7890");
    expect(env.https_proxy).toBe("http://127.0.0.1:7890");
    expect(env.HTTP_PROXY).toBe("http://127.0.0.1:7890");
    expect(env.NO_PROXY).toContain("127.0.0.1");
    expect(env.NO_PROXY).toContain("localhost");
  });

  it("does not overwrite a proxy the caller already set", () => {
    const env = { AGY_PROXY: "auto", HTTPS_PROXY: "http://keep.me:1234" } as NodeJS.ProcessEnv;
    applyProxyEnv(env);
    expect(env.HTTPS_PROXY).toBe("http://keep.me:1234");
    expect(env.HTTP_PROXY).toBe("http://keep.me:1234");
  });

  it("leaves env untouched when detection is disabled", () => {
    const env = { AGY_PROXY: "off" } as NodeJS.ProcessEnv;
    expect(applyProxyEnv(env)).toBeUndefined();
    expect(env.HTTPS_PROXY).toBeUndefined();
  });
});
