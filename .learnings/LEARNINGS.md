# Learnings

## [LRN-20260312-001] best_practice

**Logged**: 2026-03-12T00:22:00+08:00
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
OpenClaw Gateway sessions must use the live default agent id and an agent-prefixed session key.

### Details
Real Gateway integration rejected the bridge when the client hardcoded `agentId="main"` and sent plain Cartooner session keys like `cartooner:session:project`. Live `agents.list` showed `defaultId="codex"`, and the Gateway required session keys shaped as `agent:<agentId>:...`. The stable approach is:
- resolve agent id from `OPENCLAW_AGENT_ID` or `~/.openclaw/openclaw.json` (`acp.defaultAgent`)
- normalize all outbound session keys to `agent:<agentId>:cartooner:<session>:<project>`

### Suggested Action
Keep agent id discovery and session key normalization in the shared WS client so backend callers can stay agnostic to Gateway internals.

### Metadata
- Source: conversation
- Related Files: /Users/k/coding/cartooner/src/utils/openclaw_config_parser.py, /Users/k/coding/cartooner/src/web/services/openclaw_ws_client.py
- Tags: openclaw, gateway, websocket, session-key

---

## [LRN-20260312-002] best_practice

**Logged**: 2026-03-12T00:22:00+08:00
**Priority**: medium
**Status**: pending
**Area**: frontend

### Summary
`layout:command` is a control plane event and must bypass websocket dedup plus target a real visible UI surface.

### Details
Live browser verification showed two separate issues. First, the backend delivered `layout:command` but the frontend never saw repeated commands because `websocket_dedup_manager._compute_hash()` ignores `timestamp`; control events were being swallowed as duplicates. Second, the original frontend handler wrote to `workbenchStore`, but that store does not drive the visible `/projects` layout. The reliable behavior is:
- whitelist `layout:command` in backend dedup
- handle `storyboard` by navigating to `/director/storyboard` from the live router context

### Suggested Action
Treat new layout/system control events as non-deduplicated by default and verify their target store/component is actually mounted in the active app shell.

### Metadata
- Source: conversation
- Related Files: /Users/k/coding/cartooner/src/web/services/websocket_dedup_manager.py, /Users/k/coding/cartooner/apps/web/src/services/layoutCommandService.ts, /Users/k/coding/cartooner/apps/web/src/components/Stream/GlobalSocketListener.tsx
- Tags: socketio, frontend, layout-command, dedup

---
