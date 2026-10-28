#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { applyProxyEnv } from "./proxy.js";

// agy ignores the Windows system proxy, so publish it before any child spawn.
const proxy = applyProxyEnv();
if (proxy) {
  // stderr is free here: stdio MCP only reserves stdout for protocol frames.
  console.error(`antigravity-bridge: routing agy through ${proxy}`);
}

createServer()
  .connect(new StdioServerTransport())
  .catch((err) => {
    console.error("antigravity-bridge failed to start:", err);
    process.exit(1);
  });
