---
name: antigravity-bridge
description: Use when you need a second model family or want heavy reading kept out of your context — delegates to the official Antigravity CLI (agy) through the antigravity-bridge MCP tools. Ask for it explicitly; do not outsource by default.
---

# Delegating to the Antigravity CLI

These tools are an **opt-in side channel**, not an automatic outsourcing policy. Use them when the user asks for a specific
model, or when the work is heavy enough that only the answer should come back.

| Situation                                    | Tool                                         |
| -------------------------------------------- | -------------------------------------------- |
| File >200 lines, logs, dumps, generated code | `analyze_files`                              |
| >3 files in one task                         | `analyze_files`                              |
| Git history / repo-wide search               | `deep_search`                                |
| Docs or external knowledge                   | `web_lookup`                                 |
| Plan critique, code review, second opinion   | `adversarial_review`                         |
| Follow-up on a prior delegation              | `follow_up` (pass the returned `session_id`) |
| Long job that must not block                 | `start_task` → `task_status` / `cancel_task` |
| See what the account can actually run        | `list_models`                                |
| Anything else heavy                          | `delegate`                                   |

Every response ends with:

```
[antigravity-bridge] model: … | session: … | usage: {…}
```

Reuse that `session_id` with `follow_up` for iterative work — the context stays on `agy`'s side, so nothing is re-sent.
Pass `cwd` as the project root so `agy` can read files and run git.

## Model selection

- **Highest reasoning by default.** `claude-sonnet-5-5` / `claude sonnet` resolves to `claude-sonnet-5-5-high`.
- Explicit `-low` / `-medium` is honoured — that is how a user opts out of the default.
- Ambiguous family names (just `claude`) are rejected with the real catalog rather than guessed.
- `list_models` is the source of truth; never hardcode model names in your own instructions.

## Do not delegate

- small single-file edits,
- questions already answerable from loaded context,
- work that needs tools only you have.
