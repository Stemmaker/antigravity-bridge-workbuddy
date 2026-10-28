# AGENTS.md — install & verify Antigravity Bridge

> **Audience: an AI agent (WorkBuddy, Claude Code, Cursor, Codex…).** You are expected to execute these steps yourself with your
> shell and file tools, not to hand the user a checklist. Exit only when step 7 passes, or when a precondition genuinely fails.
>
> Human readers: you can read this as a manual install guide — it is just more literal than usual.

**Goal:** register this repo's MCP server with the user's MCP client so that tools like `list_models` and `delegate` appear in the
client, and prove they work.

---

## 0. Ground rules

- **Never print, copy or transmit credentials.** Everything auth-related lives inside `agy`. Do not read token files.
- **Never overwrite an existing client config.** Read it, merge one key, write it back. Back it up first.
- **Never invent config fields.** For WorkBuddy stdio servers the accepted keys are exactly
  `type`, `command`, `args`, `env`, `timeout`, `disabled`. (`alwaysLoad` and friends do not exist and will be dropped.)
- **Do not enable `AGY_SKIP_PERMISSIONS`.** Do not set `AGY_QUOTA_FAILOVER=true` unless the user explicitly asks.
- Ask before creating a directory outside the user's home or workspace.

---

## 1. Preconditions — does `agy` exist and is it signed in?

```bash
agy --version
```

If `agy` is not on `PATH`, look here before giving up:

| OS            | Likely location                                       |
| ------------- | ----------------------------------------------------- |
| Windows       | `%LOCALAPPDATA%\agy\bin\agy.exe`                      |
| macOS / Linux | `~/.local/bin/agy`, `~/bin/agy`, `/usr/local/bin/agy` |

Use the resolved **absolute path** as `AGY_PATH` from now on.

Now verify the account:

```bash
agy models
```

- Prints a list (`id  Display Name` pairs) → signed in. **Record the exact display names**, you will need one in step 7.
- Prints "please sign in" / empty → **stop**, tell the user to run `agy` once in their own terminal and finish the browser login,
  then resume here.

> `agy models` is not proof that generation works (the catalog endpoint is not region-gated). Step 7 is.

## 2. Get the code

If the repo is not already local:

```bash
git clone https://github.com/Stemmaker/antigravity-bridge-workbuddy.git
cd antigravity-bridge-workbuddy
```

If you are already inside it, stay there. Let `REPO` = absolute path of this directory.

## 3. Build

```bash
npm ci
npm run build
```

Then assert the entry point exists: `REPO/dist/index.js`. It must be non-empty. If the build fails, report the compiler output
verbatim — do not "fix" it by editing `src/`.

Resolve the **absolute path to node** (`node -e "console.log(process.execPath)"`). Some clients spawn MCP servers without the
user's full `PATH`, and a bare `node` then fails silently. Prefer the absolute path in the config.

## 4. Pick the workspaces the bridge may touch

Ask the user (or infer from the current project) which directories the delegated tasks may read/write. That becomes
`AGY_ALLOWED_ROOTS` — **multiple roots separated by the OS path delimiter** (`;` on Windows, `:` elsewhere).
Default it to the user's current workspace, never to `/` or `C:\`.

## 5. Register the MCP server

### WorkBuddy

Config file: `~/.workbuddy/mcp.json` (on Windows: `%USERPROFILE%\.workbuddy\mcp.json`).

1. Back it up: copy to `mcp.json.bak-<timestamp>`.
2. Parse the JSON, add **one** entry under `mcpServers`, keep every existing server untouched.
3. Write it back with the same formatting level (2-space JSON).

```json
{
  "mcpServers": {
    "antigravity-bridge": {
      "type": "stdio",
      "command": "<ABSOLUTE_NODE_PATH>",
      "args": ["<REPO>/dist/index.js"],
      "env": {
        "AGY_PATH": "<ABSOLUTE_AGY_PATH>",
        "AGY_ALLOWED_ROOTS": "<WORKSPACE_ROOT>",
        "AGY_SANDBOX": "true",
        "AGY_SKIP_PERMISSIONS": "false",
        "AGY_ON_FAILURE": "strict",
        "AGY_QUOTA_FAILOVER": "false",
        "AGY_MODEL_LIST_TIMEOUT_MS": "120000"
      },
      "timeout": 1200000
    }
  }
}
```

Notes:

- `timeout` is **milliseconds** and covers long delegations. 1200000 = 20 min.
- Do **not** set proxy variables here unless the user is behind one that requires it; the server autodetects the system proxy.
  If autodetection is unavailable (e.g. `reg.exe` blocked by policy), add `"AGY_PROXY": "http://127.0.0.1:<port>"`.

### Claude Code

```bash
claude mcp add antigravity-bridge --env AGY_PATH="<ABSOLUTE_AGY_PATH>" -- <ABSOLUTE_NODE_PATH> <REPO>/dist/index.js
```

### Cursor / other JSON-based clients

Same `mcpServers` object, in the client's own config file (`~/.cursor/mcp.json` for Cursor). Keep the same `type: "stdio"` shape.

## 6. Restart + trust (do not skip)

WorkBuddy reads MCP config **at process start** and never re-reads it. A user who "closes the window" is still running the old
process — this is the single most common reason a newly added server is invisible.

Tell the user, explicitly:

1. Fully quit the client (tray icon → Quit; verify the process is gone).
2. Reopen it.
3. Go to **Settings → Security Center → Tool Control** (设置 → 安全中心 → 工具管控) and trust / connect `antigravity-bridge`.

For other clients: restart the app; Cursor may also require toggling the MCP server on.

## 7. Verify — in this order

**7.1 Catalog.** Call `list_models` (MCP). It must return the same names `agy models` printed in step 1.

**7.2 Real generation.** Call `delegate` with a cheap prompt and an explicit high-tier model from the catalog:

```
prompt: "Do not use any tools. Reply with exactly: OK"
model:  "<a display name from the catalog, High tier if it exists>"
cwd:    "<WORKSPACE_ROOT>"
```

Expected: text containing `OK` plus a metadata line

```
[antigravity-bridge] model: … | session: … | usage: {…}
```

**7.3 Session continuity (optional, proves B-stage).** Call `follow_up` with the `session` id from 7.2 and ask something that
depends on the previous turn. If it answers correctly, multi-turn is live.

### If the client cannot see the tools yet

Run the server by hand to separate "our problem" from "client problem":

```bash
printf '%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}' \
 '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
 | node "<REPO>/dist/index.js"
```

Ten tool names in the response = the server is fine; the problem is config location or the restart/trust step.

---

## 8. Troubleshooting matrix

| Symptom                                           | Diagnosis                                         | Action                                                                                              |
| ------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `User location is not supported for the API use`  | Request reached Google but the egress is rejected | Set `AGY_PROXY` / switch egress node. `agy` reads **env vars only**, never the Windows system proxy |
| `agy exited with code 3221226505`                 | `0xC0000409`, `agy`'s teardown crash              | Only fatal if the output is empty. The server already parses output before checking the exit code   |
| `model not recognized`                            | Name validation needs a live catalog fetch        | Retry once, or call `list_models` first                                                             |
| `Model "X" is not available`                      | Stale/incorrect name                              | Use a name from the `list_models` output                                                            |
| Connector absent in UI                            | Config was written after the client started       | Full restart (step 6)                                                                               |
| `Invalid model` on a name that is obviously right | Tier suffix omitted                               | The server auto-upgrades family names to `High`; if it still fails, paste the exact catalog entry   |

## 9. Handing back to the user

Report:

- `REPO` path, `AGY_PATH`, node path, config file you modified, and the backup path.
- The exact verification output from 7.1 and 7.2 (model name + `usage`).
- Which workspace roots you allowed.
- Anything you could not verify, stated as unverified — never as "should work".
