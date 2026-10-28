# Antigravity Bridge

**Use your Antigravity subscription models from WorkBuddy — or any MCP client. It drives the official `agy` CLI. No cookies, no reverse-engineered endpoints.**

[![CI](https://github.com/Stemmaker/antigravity-bridge-workbuddy/actions/workflows/ci.yml/badge.svg)](https://github.com/Stemmaker/antigravity-bridge-workbuddy/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Stemmaker/antigravity-bridge-workbuddy?color=blue)](https://github.com/Stemmaker/antigravity-bridge-workbuddy/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)
[![MCP](https://img.shields.io/badge/MCP-stdio-purple)](https://modelcontextprotocol.io)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](#)

English · [中文](README.md)

---

## The problem

You pay for Antigravity (Gemini Ultra / Pro) and you have Claude Opus 5.5 and Gemini 4 Argon sitting there.
Your daily driver is WorkBuddy / Claude Code / Cursor — which cannot touch that quota.

This bridge wires your MCP client straight to the `agy` binary you are already logged into:

```
WorkBuddy  ──MCP(stdio)──▶  antigravity-bridge  ──spawn──▶  agy  ──▶  Google
   your chat                 protocol shim + sessions      official CLI    your quota
```

**Your main model is not replaced.** The bridge is a second opinion on demand: ask Opus to review a plan, ask Argon to digest a big file, and the answer comes back into your conversation.

---

## How it differs

|                         | **This project**                  | Cookie / reverse-engineered clients                | Official API key     |
| ----------------------- | --------------------------------- | -------------------------------------------------- | -------------------- |
| Auth                    | whatever `agy` already uses       | copies `__Secure-` cookies, scrapes session tokens | separate API key     |
| Transport               | `spawn` the official binary       | reimplements private endpoints, fakes a browser    | official REST API    |
| Ban exposure            | **zero added attack surface** ※   | high — you are a new fingerprint on the account    | none                 |
| Uses subscription quota | ✅ yes                            | partly                                             | ❌ billed separately |
| Survives model renames  | ✅ follows `agy models`           | ❌ hardcoded, breaks on every rename               | stable               |
| Multi-turn              | ✅ `follow_up` on the CLI session | re-sends context                                   | DIY                  |
| MCP tools               | ✅ 10 purpose-built tools         | mostly raw completion                              | DIY                  |

※ What "zero" means here: no browser emulation, no cookie copying, no private endpoints, no re-implemented OAuth —
just the official `agy` process. Google sees the exact same traffic as when you type the command yourself, so this adds no new
detection surface. It is not a legal guarantee about Google's terms, and it does not change your account's existing quotas or risk rules.

> Others imitate the Antigravity client. This one _is_ the Antigravity client.

---

## Features

|                                     |                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 🎯 **10 purpose-built tools**       | file analysis, repo archaeology, doc lookup, adversarial review — not one generic prompt box                             |
| 🔄 **Dynamic model catalog**        | asks `agy models` every 5 minutes; **no hardcoded model names**, so model churn cannot break it                          |
| 🧠 **Highest reasoning by default** | "use claude sonnet" resolves to `claude-sonnet-5-5-high`; explicit `-low` is honoured                                    |
| 🔗 **Session continuity**           | `follow_up(session_id)` — context stays on the CLI side, nothing is re-sent                                              |
| ⏱️ **Async tasks**                  | `start_task` / `task_status` / `cancel_task`, so a 20-minute job doesn't sit on an MCP timeout                           |
| 🌐 **Proxy autodetect**             | reads env vars or the Windows system proxy and injects it into the child — fixes `User location is not supported`        |
| 🛡️ **Safe defaults**                | no permission bypass, optional sandbox, directory allow-list, strict failure mode                                        |
| 🧯 **Tolerates agy's crash quirk**  | `agy` often writes a full JSON result and _then_ exits with `0xC0000409`; this parses first, checks the exit code second |
| 🪟 **Windows process-tree kill**    | `taskkill /T /F`, no orphaned children                                                                                   |
| 🧩 **Client agnostic**              | WorkBuddy, Claude Code, Cursor, Codex CLI — anything that speaks MCP over stdio                                          |

---

## Tools

| Tool                 | Use it when                                                      |
| -------------------- | ---------------------------------------------------------------- |
| `delegate`           | hand over an arbitrary task                                      |
| `analyze_files`      | a file is >200 lines, or you need several files at once          |
| `deep_search`        | git log / blame / wide greps across a repo                       |
| `web_lookup`         | docs, versions, external knowledge                               |
| `adversarial_review` | you want a **different model family** to poke holes in your plan |
| `follow_up`          | continue a previous delegation via `session_id`                  |
| `list_models`        | see the real catalog for the signed-in account                   |
| `start_task`         | long job: returns a `task_id` immediately                        |
| `task_status`        | poll state and final output                                      |
| `cancel_task`        | stop a running task                                              |

Every response ends with traceable metadata:

```
[antigravity-bridge] model: Claude Opus 5.5 (High) | session: 92faef66-… | usage: {"input_tokens":12339,"output_tokens":60}
```

---

## Quick start (let your agent install it)

Paste this into WorkBuddy (or any agent that can read and write files):

> Read https://raw.githubusercontent.com/Stemmaker/antigravity-bridge-workbuddy/main/AGENTS.md
> and follow it to install antigravity-bridge for me. Verify with list_models when done.

[`AGENTS.md`](AGENTS.md) is a machine-actionable install runbook: it checks that `agy` exists and is signed in, builds the project,
merges a `mcp.json` entry using **your** paths, points you at the trust toggle, and self-tests. No hand-edited JSON.

---

## Manual install

**Requires:** `agy` installed and authenticated.

```bash
agy --version     # prints a version
agy models        # lists models → you are signed in
```

> On Windows the default location is `%LOCALAPPDATA%\agy\bin\agy.exe`. Elsewhere use `which agy` and set `AGY_PATH`.

**1. Build**

```bash
git clone https://github.com/Stemmaker/antigravity-bridge-workbuddy.git
cd antigravity-bridge-workbuddy
npm ci
npm run build
```

**2. Add the MCP server** (WorkBuddy: `~/.workbuddy/mcp.json` — merge, don't overwrite)

```json
{
  "mcpServers": {
    "antigravity-bridge": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/path/to/antigravity-bridge-workbuddy/dist/index.js"],
      "env": {
        "AGY_PATH": "C:/Users/<you>/AppData/Local/agy/bin/agy.exe",
        "AGY_ALLOWED_ROOTS": "C:/Users/<you>/work",
        "AGY_SANDBOX": "true",
        "AGY_SKIP_PERMISSIONS": "false",
        "AGY_ON_FAILURE": "strict",
        "AGY_QUOTA_FAILOVER": "false"
      },
      "timeout": 1200000
    }
  }
}
```

**3. Restart and trust**

WorkBuddy: **fully quit the process** (closing the window is not enough) → reopen → **Settings → Security Center → Tool Control** → trust/connect `antigravity-bridge`.

Other clients: `claude mcp add` for Claude Code, `~/.cursor/mcp.json` for Cursor — same shape.

---

## Model selection

| You say                 | Actually called                                      |
| ----------------------- | ---------------------------------------------------- |
| "agy's Claude sonnet"   | `claude-sonnet-5-5-high`                             |
| "agy's Claude opus"     | `claude-opus-5-5-high`                               |
| "agy's Gemini argon"    | `gemini-4-argon-high`                                |
| "agy's Gemini flash"    | `gemini-3.8-flash-high`                              |
| `claude-sonnet-5-5-low` | low, as you asked                                    |
| nothing                 | the **High** tier of the first family in the catalog |

Two rules: **highest reasoning by default**, **family names auto-upgrade to High**. Ambiguous names (just "claude") are rejected with the real list instead of guessing.

`list_models` is always the source of truth — Google changes the catalog whenever it likes.

---

## Configuration

| Variable                    | Default     | Purpose                                                                   |
| --------------------------- | ----------- | ------------------------------------------------------------------------- |
| `AGY_PATH`                  | `agy`       | path to the `agy` binary                                                  |
| `AGY_ALLOWED_ROOTS`         | process cwd | directories the bridge may touch                                          |
| `AGY_SANDBOX`               | `false`     | pass `--sandbox` (recommended)                                            |
| `AGY_SKIP_PERMISSIONS`      | `false`     | pass `--dangerously-skip-permissions` (**not** recommended)               |
| `AGY_ON_FAILURE`            | `fallback`  | `strict` = fail loudly, never let the main model take over                |
| `AGY_QUOTA_FAILOVER`        | `false`     | auto-switch models on quota exhaustion (replays the task; off by default) |
| `AGY_DEFAULT_MODEL`         | none        | pin a default model; a missing tier upgrades to High                      |
| `AGY_PROXY`                 | `auto`      | `off` = direct, `http://host:port` = explicit, default = autodetect       |
| `AGY_TIMEOUT`               | `1200`      | global timeout (s); `AGY_TIMEOUT_<TOOL>` per tool                         |
| `AGY_MAX_OUTPUT_CHARS`      | `50000`     | output truncation cap                                                     |
| `AGY_MODEL_LIST_TIMEOUT_MS` | `120000`    | catalog fetch timeout                                                     |
| `AGY_TASK_TTL_MS`           | `3600000`   | how long finished tasks are kept                                          |

---

## Troubleshooting

| Symptom                                          | Fix                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User location is not supported for the API use` | `agy` only reads proxy env vars, not the Windows system proxy. The default `AGY_PROXY=auto` discovers the system proxy for you (keep it). To pin one manually use `AGY_PROXY=http://127.0.0.1:<port>` — Clash usually uses 7890, but **some clients pick a new port on every launch**, so a hardcoded port quietly breaks. Your egress IP may also be blocked → switch nodes |
| `agy exited with code 3221226505`                | That is `0xC0000409`, a teardown crash in `agy`. The bridge parses output before checking the exit code, so a real failure here means the output was genuinely empty                                                                                                                                                                                                         |
| `model not recognized`                           | name validation needs a live catalog fetch; retry once or call `list_models`                                                                                                                                                                                                                                                                                                 |
| `Model "X" is not available`                     | the name is stale — the error lists the real catalog                                                                                                                                                                                                                                                                                                                         |
| Connector missing in WorkBuddy                   | config changes need a **full restart**; then trust it in Settings → Security Center → Tool Control                                                                                                                                                                                                                                                                           |
| Task seems stuck                                 | use `start_task` + `task_status` instead of a blocking call                                                                                                                                                                                                                                                                                                                  |

---

## Security posture

- Never adds `--dangerously-skip-permissions` unless you ask for it.
- Working directories outside `AGY_ALLOWED_ROOTS` are refused.
- Automatic quota failover is **off** by default: replaying a file-writing task on another model can duplicate side effects.
- With `AGY_ON_FAILURE=strict`, a failed delegation errors out instead of letting the main model silently do the work.
- No credentials are read, cached, or proxied; auth stays entirely inside the official `agy`.

## Known limits

- It does not replace your main chat model — it is a side-channel.
- Quotas, model availability and regional policy are Antigravity's call; this project does not bypass them.
- `agy`'s JSON shape may change between releases — after upgrading, run `list_models` plus one short prompt.
- Gemini models are sensitive to egress IP/ASN; Claude tends to be more forgiving.

---

## Credits

Based on [sshahzaiib/agy-bridge](https://github.com/sshahzaiib/agy-bridge) (MIT), substantially rewritten: dynamic catalog,
highest-reasoning defaults, proxy autodetect, async tasks, Windows process-tree cleanup, `0xC0000409` tolerance, safer defaults.
The original copyright notice is preserved in [LICENSE](LICENSE).

## Roadmap

- [ ] `doctor` subcommand (auth / proxy / catalog in one shot)
- [ ] per-family usage accounting
- [ ] persist task results across process restarts

If this saved you an afternoon, a ⭐ helps other people find it.
