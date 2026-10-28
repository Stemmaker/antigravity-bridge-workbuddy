# Antigravity Bridge

**让 WorkBuddy（以及任何 MCP 客户端）直接调用你 Antigravity 订阅里的模型额度 —— 走官方 `agy` CLI，不碰 Cookie、不逆向接口。**

[![CI](https://github.com/Stemmaker/antigravity-bridge-workbuddy/actions/workflows/ci.yml/badge.svg)](https://github.com/Stemmaker/antigravity-bridge-workbuddy/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Stemmaker/antigravity-bridge-workbuddy?color=blue)](https://github.com/Stemmaker/antigravity-bridge-workbuddy/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)
[![MCP](https://img.shields.io/badge/MCP-stdio-purple)](https://modelcontextprotocol.io)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](#)

[English](README.en.md) · 中文

---

## 它解决什么问题

你在 Antigravity 里有一份能用的订阅（Gemini Ultra / Pro），手上有 Claude Opus 5.5、Gemini 4 Argon 这些模型。
但你日常写代码的助手是 WorkBuddy / Claude Code / Cursor —— 它们用不上那份额度。

这个桥接把 **WorkBuddy 的 MCP 工具** 直接对接到 **本机已登录的 `agy`**：

```
WorkBuddy  ──MCP(stdio)──▶  antigravity-bridge  ──spawn──▶  agy.exe  ──▶  Google
   你的对话                    协议翻译 + 会话管理            官方 CLI       订阅额度
```

**主对话模型不会被替换。** 桥接是「外援」：你点名让 Opus 审方案、让 Argon 读大文件，结果回到你的对话里，主模型继续干活。

---

## 和其他方案的区别（这是重点）

|                | **本项目**                  | Cookie / 逆向类客户端                     | 官方 API Key     |
| -------------- | --------------------------- | ----------------------------------------- | ---------------- |
| 认证方式       | 官方 `agy` 自己的登录态     | 搬运 `__Secure-` Cookie、抓 session token | 单独申请 API Key |
| 调用路径       | `spawn` 官方二进制          | 复刻私有接口、模拟浏览器                  | 官方 REST API    |
| 封号风险       | **零风险**（不新增检测面）※ | 高：等于给账号加了一个可被识别的客户端    | 无               |
| 用得上订阅额度 | ✅ 是                       | 部分是                                    | ❌ 另计费        |
| 模型改名后     | ✅ 自动跟随 `agy models`    | ❌ 硬编码，一改就废                       | 稳定             |
| 多轮会话       | ✅ `follow_up` 原生续接     | 自己拼上下文                              | 自己管理         |
| MCP 工具       | ✅ 10 个专用工具            | 多为裸 completion                         | 需自己封装       |

※ **「零风险」的准确含义**：本项目不模拟浏览器、不搬运 Cookie、不逆向私有接口、不复刻 OAuth —— 它只是启动官方 `agy`，
Google 侧看到的流量与你自己敲命令**完全一样**，因此不新增任何检测面。这不是对 Google 服务条款的法律保证，也不改变你账号原有的配额与风控规则。

> 一句话：**别人在模仿 Antigravity 的客户端，这个项目直接用 Antigravity 的客户端。**

---

## 功能

| 能力                         | 说明                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| 🎯 **10 个专用工具**         | 不是裸问答：读文件、搜代码、查文档、对抗式评审各有专用入口                                             |
| 🔄 **模型目录动态发现**      | 每 5 分钟问一次 `agy models`，**永不硬编码模型名**。Google 换模型不会把它弄坏                          |
| 🧠 **默认最高推理档**        | 说「用 claude sonnet」自动落到 `claude-sonnet-5-5-high`，不静默降智；显式写 `-low` 才降档              |
| 🔗 **会话续接**              | `follow_up(session_id)`，上下文留在 CLI 侧，不重发、不重复烧 token                                     |
| ⏱️ **异步任务三件套**        | `start_task` / `task_status` / `cancel_task`，20 分钟的活不用顶着 MCP 超时干等                         |
| 🌐 **代理自动探测**          | 启动时读环境变量或 Windows 系统代理并注入子进程，直接治「User location is not supported」              |
| 🛡️ **安全默认值**            | 默认不跳过权限、可选 sandbox、限制可访问目录；失败时严格报错，不让主模型偷偷自己接管                   |
| 🧯 **兼容 agy 的退出码怪癖** | `agy` 常在**写完结果后**以 `0xC0000409` 收尾崩溃，本项目先解析输出再判退出码，不会把成功结果当失败丢掉 |
| 🪟 **Windows 进程树清理**    | 取消任务时 `taskkill /T /F`，不留孤儿进程                                                              |
| 🧩 **客户端无关**            | WorkBuddy、Claude Code、Cursor、Codex CLI 等任何 MCP 客户端都能接                                      |

---

## 工具一览

| 工具                 | 什么时候用                                           |
| -------------------- | ---------------------------------------------------- |
| `delegate`           | 通用委派：把一整段任务丢过去                         |
| `analyze_files`      | 单文件 >200 行、或一次要看好几个文件                 |
| `deep_search`        | 跨仓库 git log / blame / 大范围 grep                 |
| `web_lookup`         | 查文档、查版本、外部知识                             |
| `adversarial_review` | 要一个**不同模型家族**的第二意见（交叉验证最有价值） |
| `follow_up`          | 接着上一次委派继续问，传回 `session_id` 即可         |
| `list_models`        | 看当前账号真实可用的模型目录                         |
| `start_task`         | 长任务：提交后立即返回 `task_id`                     |
| `task_status`        | 查长任务进度与最终结果                               |
| `cancel_task`        | 取消运行中的任务                                     |

每次调用末尾都会附一行元信息，方便追溯：

```
[antigravity-bridge] model: Claude Opus 5.5 (High) | session: 92faef66-… | usage: {"input_tokens":12339,"output_tokens":60}
```

---

## 快速开始（让 AI 帮你装）

把这句话发给 WorkBuddy（或任何能读写文件的 AI 助手）：

> 读 https://raw.githubusercontent.com/Stemmaker/antigravity-bridge-workbuddy/main/AGENTS.md
> 按里面的步骤帮我安装 antigravity-bridge，装完用 list_models 验证。

`AGENTS.md` 是**写给 agent 的可执行安装说明**：它会检查 `agy` 是否已登录、构建项目、生成 `mcp.json` 片段（不会写死任何人的路径）、
然后告诉你去哪里点「信任」，最后自检。你不需要手改 JSON。

---

## 手动安装

**前置条件：`agy` 已安装并登录。**

```bash
agy --version     # 能出版本号
agy models        # 能列出模型 = 登录态有效
```

> Windows 实测默认位置：`%LOCALAPPDATA%\agy\bin\agy.exe`。其他平台用 `which agy` 找到路径，再设 `AGY_PATH`。

**1. 构建**

```bash
git clone https://github.com/Stemmaker/antigravity-bridge-workbuddy.git
cd antigravity-bridge-workbuddy
npm ci
npm run build
```

**2. 写 MCP 配置**（WorkBuddy：`~/.workbuddy/mcp.json`，与已有内容合并，别整体覆盖）

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

**3. 重启客户端并信任**

WorkBuddy：**完全退出进程**（关窗口不算）→ 重新打开 → **设置 → 安全中心 → 工具管控** → 找到 `antigravity-bridge` → 信任 / 连接。

其他客户端：Claude Code 用 `claude mcp add`；Cursor 写 `~/.cursor/mcp.json`；格式同上。

---

## 模型怎么选

| 你说                    | 实际调用                       |
| ----------------------- | ------------------------------ |
| `agy 的 Claude sonnet`  | `claude-sonnet-5-5-high`       |
| `agy 的 Claude opus`    | `claude-opus-5-5-high`         |
| `agy 的 Gemini argon`   | `gemini-4-argon-high`          |
| `agy 的 Gemini flash`   | `gemini-3.8-flash-high`        |
| `claude-sonnet-5-5-low` | 就低档，尊重你的明确选择       |
| 什么都不说              | 目录里第一个家族的 **High** 档 |

规则只有两条：**默认最高推理**；**说家族名自动补 High**。模型名带歧义（例如只说 `claude`）时它**拒绝猜**，直接把可用列表甩给你。

真实目录永远以 `list_models` 为准 —— 官方随时会改。

---

## 配置项

| 环境变量                    | 默认值     | 作用                                                      |
| --------------------------- | ---------- | --------------------------------------------------------- |
| `AGY_PATH`                  | `agy`      | `agy` 可执行文件路径                                      |
| `AGY_ALLOWED_ROOTS`         | 进程 cwd   | 允许访问的目录，多值用路径分隔符                          |
| `AGY_SANDBOX`               | `false`    | 传 `--sandbox`，建议开启                                  |
| `AGY_SKIP_PERMISSIONS`      | `false`    | 传 `--dangerously-skip-permissions`，**不建议开**         |
| `AGY_ON_FAILURE`            | `fallback` | `strict` = 失败就报错，禁止主模型自行接管                 |
| `AGY_QUOTA_FAILOVER`        | `false`    | 配额耗尽时自动换模型（会重放任务，默认关）                |
| `AGY_DEFAULT_MODEL`         | 无         | 固定默认模型，缺档位会自动升到 High                       |
| `AGY_PROXY`                 | `auto`     | `off` 强制直连；`http://host:port` 指定代理；默认自动探测 |
| `AGY_TIMEOUT`               | `1200`     | 全局超时（秒）；`AGY_TIMEOUT_<TOOL>` 单独设置某个工具     |
| `AGY_MAX_OUTPUT_CHARS`      | `50000`    | 单次输出截断上限                                          |
| `AGY_MODEL_LIST_TIMEOUT_MS` | `120000`   | 拉模型目录的超时                                          |
| `AGY_TASK_TTL_MS`           | `3600000`  | 已完成任务的保留时长                                      |

---

## 故障排查

| 现象                                             | 原因 / 处理                                                                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `User location is not supported for the API use` | `agy` 只认环境变量代理，不读 Windows 系统代理。桥接已自动探测；仍失败就显式设 `AGY_PROXY=http://127.0.0.1:7890`。也可能是出口 IP 被判定为不支持地区 → 换节点 |
| `agy exited with code 3221226505`                | 这是 `0xC0000409`，`agy` 的收尾崩溃。本项目已兼容「先解析输出再判退出码」，若仍报错说明输出确实是空的                                                        |
| `model not recognized`                           | `agy` 校验模型名时要联网拉目录，网络慢会误报。重试一次或先 `list_models`                                                                                     |
| `Model "X" is not available`                     | 模型名过期了，看报错附带的真实列表                                                                                                                           |
| WorkBuddy 里看不到这个连接器                     | 配置改了必须**完全重启**客户端；然后去 设置 → 安全中心 → 工具管控 信任                                                                                       |
| 任务卡住不返回                                   | 用 `start_task` + `task_status`，别用同步调用硬等                                                                                                            |

---

## 安全边界

- 默认**不加** `--dangerously-skip-permissions`，权限仍受 `agy` 自己的规则约束。
- `AGY_ALLOWED_ROOTS` 之外的工作目录会被直接拒绝。
- 默认**关闭**配额耗尽的自动换模型：写文件、跑命令的任务中途换模型重放，可能造成重复副作用。
- `AGY_ON_FAILURE=strict` 时，委派失败会明确报错，不会让主模型悄悄自己把活干了。
- 桥接不存储、不缓存任何凭据；登录态完全由官方 `agy` 管理。

## 已知限制

- **不替换主对话模型**，只是外援。
- 额度、可用模型、地区策略由 Antigravity 官方决定，本项目不绕过。
- `agy` 的 JSON 输出结构可能随版本变化，升级后建议先跑一次 `list_models` + 一句短问答。
- 某些模型（尤其 Gemini 系列）对出口 IP / ASN 敏感，Claude 通常更稳。

---

## 致谢与来源

本项目基于 [sshahzaiib/agy-bridge](https://github.com/sshahzaiib/agy-bridge)（MIT）重写与扩展：
动态模型目录、最高推理默认、代理自动探测、异步任务、Windows 进程树清理、`0xC0000409` 兼容、安全默认值等。
原始版权声明保留在 [LICENSE](LICENSE) 中。

## Roadmap

- [ ] `doctor` 自检命令（登录态 / 代理 / 模型目录一键体检）
- [ ] 按模型家族统计用量
- [ ] 任务结果落盘，支持跨进程续查

如果这个项目帮你省下了一个下午，给个 ⭐ 能让更多人搜到它。
