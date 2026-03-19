# Errors

## [ERR-20260311-001] cartooner-mcp-bridge-stdio-client

**Logged**: 2026-03-11T03:20:00+08:00
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
Cartooner's custom `StdioMCPClient.connect()` references a non-existent `MCPClientState.CONNECTED` enum value and crashes before MCP initialization.

### Error
```
AttributeError: CONNECTED. Did you mean: 'CONNECTING'?
```

### Context
- Command/operation attempted: End-to-end smoke test for the new `mcp_memory_server`
- File: `src/agents/tools/mcp_bridge/client.py`
- Code path: line 377 assigns `self._state = MCPClientState.CONNECTED`
- `MCPClientState` only defines `DISCONNECTED`, `CONNECTING`, `INITIALIZING`, `READY`, `ERROR`, `CLOSED`

### Suggested Fix
Replace the invalid transition with the intended state model, likely keeping `CONNECTING` until `initialize()` succeeds and then switching to `READY`.

### Metadata
- Reproducible: yes
- Related Files: src/agents/tools/mcp_bridge/client.py

---

## [ERR-20260312-001] python-playwright-add-init-script

**Logged**: 2026-03-12T00:22:00+08:00
**Priority**: low
**Status**: pending
**Area**: tests

### Summary
Python Playwright's `Page.add_init_script()` does not accept multiple positional args like the JS API patterns sometimes suggest.

### Error
```
TypeError: Page.add_init_script() takes from 1 to 2 positional arguments but 4 were given
```

### Context
- Command/operation attempted: quick one-off browser validation script for Cartooner layout routing
- Attempted call: `page.add_init_script(script, arg1, arg2, ...)`
- Environment: Python `playwright.sync_api`

### Suggested Fix
Serialize needed data into the init script string, or call `add_init_script(path=...)` / `add_init_script(script=...)` with a single argument.

### Metadata
- Reproducible: yes
- Related Files: /Users/k/.openclaw/workspace/.learnings/LEARNINGS.md

---

## [ERR-20260312-002] codex-workspace-file-boundaries

**Logged**: 2026-03-12T01:36:00+08:00
**Priority**: medium
**Status**: pending
**Area**: docs

### Summary
This shell environment does not provide `rg`, and `apply_patch` cannot edit files outside the session root.

### Error
```
zsh:1: command not found: rg
apply_patch verification failed: Failed to read /Users/k/coding/openclaw/skills/script-writing-expert/SKILL.md: access to /Users/k/coding/openclaw/skills/script-writing-expert/SKILL.md denied (outside session root /Users/k/.openclaw/workspace)
```

### Context
- Command/operation attempted: workspace startup file discovery and direct patching of an external skill file
- Session root: `/Users/k/.openclaw/workspace`
- Target file: `/Users/k/coding/openclaw/skills/script-writing-expert/SKILL.md`

### Suggested Fix
Use `find` / `grep` when `rg` is unavailable. If a required edit is outside the session root, do not assume `apply_patch` can reach it; switch to an escalated shell write flow and verify the result immediately.

### Metadata
- Reproducible: yes
- Related Files: /Users/k/.openclaw/workspace/AGENTS.md, /Users/k/coding/openclaw/skills/script-writing-expert/SKILL.md

---
## 2026-03-12

### 错误：Cartooner 前端端口记忆错误

**问题**：误以为 Cartooner 前端端口是 5173（Vite 默认端口），实际是 15173

**原因**：没有先查配置文件，凭记忆回答

**纠正**：查看 `~/coding/cartooner/apps/web/vite.config.ts` 确认端口

```typescript
const VITE_PORT = Number(process.env.PORT || 15173)
```

**教训**：涉及本地环境配置时，先查证再回答

---

## [ERR-20260312-003] openclaw-skill-noncompliance

**Logged**: 2026-03-12T13:20:00+08:00
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
OpenClaw successfully loaded `script-writing-expert`, but the live run still used unrestricted `exec` calls and direct writes instead of strictly honoring the skill's declared file-only, atomic-write workflow.

### Error
```
Live chat history showed tool calls to:
- exec "date -u +\"%Y-%m-%dT%H:%M:%SZ\""
- exec "cd ~/cartooner-shared/narrative/script && rm -f _current && ln -s v1 _current"
```

### Context
- Operation attempted: end-to-end verification that OpenClaw had taken over Cartooner's shared workspace
- Observed result: the run completed and wrote the correct files, but it violated `SKILL.md` hard rules
- Root cause in source:
  - `src/agents/system-prompt.ts` injects skills as prompt instructions only
  - `src/agents/skills/workspace.ts` builds a prompt block from skill paths/descriptions
  - `src/agents/skills/types.ts` only supports `userInvocable` and `disableModelInvocation`
  - `src/agents/bash-tools.exec.ts` still exposes the generic `exec` tool to the model

### Suggested Fix
Add runtime enforcement for skill-specific tool policy instead of relying on prompt compliance alone. Candidate options:
1. Add frontmatter fields for allowed/blocked tools and enforce them before agent run dispatch.
2. Add a post-run validator for skills with strict write protocols.
3. For creative file-output skills, run with a reduced tool catalog that omits `exec`.

### Metadata
- Reproducible: yes
- Related Files: /Users/k/coding/openclaw/src/agents/system-prompt.ts, /Users/k/coding/openclaw/src/agents/skills/workspace.ts, /Users/k/coding/openclaw/src/agents/skills/types.ts, /Users/k/coding/openclaw/src/agents/bash-tools.exec.ts

