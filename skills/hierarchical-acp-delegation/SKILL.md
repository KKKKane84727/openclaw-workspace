---
name: hierarchical-acp-delegation
description: 通用分层 ACP 委派协议 skill。用于编排 orchestrator -> builder -> qa 多级任务链，统一 spawn 启动语义、回报语义、最小终态信号、父会话日志回收与按需监控。
---

# Hierarchical ACP Delegation

在多级编码委派链路中使用本 skill，例如：

- `Cartooner -> Claude(builder) -> Codex(qa)`
- `Warden -> Claude -> Codex`
- 任何需要父会话验收、子会话实施的 ACP 编排任务

本 skill 只定义通用协议，不包含工作区私有约束。像 `Kane`、`Mor`、浏览器 helper、资产路径、外部通知渠道等细节，继续留在各自工作区规则或本地 skill 中。

## 触发场景

- 需要把一个较大任务拆成父会话、负责人会话、执行子会话
- 需要统一 `sessions_spawn`、`sessions_list`、`sessions_history`、`sessions_send` 的协作口径
- 需要让父会话稳定收到“子任务已到终态”的可信信号
- 需要让父会话在收到终态后主动回收日志，而不是要求下游重复总结全部过程
- 需要给 heartbeat / monitor 一个可去重、可验收的交付合同

## 运行时现实约束

- `sessions_spawn` 是 OpenClaw 主会话工具，不保证会出现在 ACP harness 自身的工具面里。
- 如果 `builder` 本身运行在 ACP harness（例如 Claude Code ACP）且实际没有 `sessions_spawn`，不要假设它还能继续用 OpenClaw 工具再派发 `qa`。
- 这类情况下，仍然保留 `orchestrator -> builder -> qa` 的职责分层，但第二跳 ACP 委派应由 `orchestrator` 根据 `builder` 的交付结果继续发起，或改用当前运行环境真实支持的控制面。

## 核心协议

### 1. 角色分层

- `orchestrator`: 负责理解需求、定义边界、给出验收标准
- `builder`: 负责实现交付、必要验证、输出可审查结果
- `qa`: 负责审查验收、必要修复、输出最终审查结论

默认回报链：

- `builder -> qa`
- `qa -> orchestrator`
- 只有 orchestrator 直接面对主会话 / 用户

### 2. 启动语义

- `sessions_spawn` 返回 `accepted` 且带 `childSessionKey` / `sessionKey`，就视为子任务已经启动
- 除非上层显式要求，不额外索要一条“started”通知
- 父会话应立即记录这个 `childSessionKey`，把它当成后续查询、干预、去重的主键
- 默认使用 `mode: "run"` 启动 ACP 子任务；只有当前 surface 明确具备 thread binding 能力，且上层确实需要持久会话时，才使用 `thread: true + mode: "session"`
- 对 `webchat` / Control UI / 其他无 thread binding 的 surface，禁止把 ACP 委派默认写成 `thread: true` 或 `mode: "session"`，否则会在任务启动前就被 runtime 拒绝

### 3. 委派提示必须自包含

每次委派至少写清：

- 工作目录 / 仓库
- 目标与验收标准
- 允许做什么，不允许做什么
- 是否允许改代码、跑测试、安装依赖
- 输出必须返回给谁
- 完成与失败时的最小终态信号

### 4. 最小终态信号

任何子任务到达终态时，最少必须回传：

- `status`
- `childSessionKey` / `sessionKey`

推荐但非强制：

- 一行 `summary`
- `resultLocation`（仅当确实有独立报告、产物或落盘结果时）
- 对 `failed` / `blocked` 的一行 blocker/failure hint

缺少 `status` 或 `childSessionKey/sessionKey` 时，终态信号无效，父会话必须先要求补报。

### 5. 父会话验收模型

父会话收到终态信号后，不应直接把它当作最终验收结果，而应主动执行：

1. 使用 `childSessionKey` / `sessionKey` 定位子会话
2. 读取 `sessions_history`、日志和独立产物（如有）
3. 自己提炼改动、检查结果、风险与下一步
4. 再决定是验收通过、补报、返工还是升级

父会话至少要确认：

1. 确实拿到了 `status`
2. 确实拿到了 `childSessionKey` / `sessionKey`
3. 能从会话历史或独立产物中恢复事实

如果子会话说“完成了”，但历史为空、日志不足或产物不可读，仍视为“未完成验收”。

### 6. 跟踪与监控

- 默认优先依赖 push-based completion，不要让父会话持续轮询
- `sessions_list` / `sessions_history` 主要用于验收、诊断卡住、人工干预，不作为高频轮询机制
- 长任务或并发任务可以交给 heartbeat / monitor 跟踪，但 monitor 只负责发现、提醒、诊断，不负责最终验收

### 7. 去重主键

对 heartbeat 或 follow-up 事件，去重优先级应为：

1. `childSessionKey`
2. `sessionKey`
3. `sessionId + action`

同一主键的同一终态只处理一次；只有在摘要、证据、`runId` 或结果位置变化时才再次处理。

## 推荐交付块

优先要求下游返回轻量终态块：

```text
Status: <completed|failed|blocked>
SessionKey: <childSessionKey or sessionKey>
Summary: <optional one-line summary>
ResultLocation: <optional report path | artifact path | repo:<cwd> if a standalone artifact exists>
Blocker: <required for failed/blocked, optional otherwise>
```

## 推荐委派模板

```text
You are working in: <repo-or-dir>

Objective:
- <goal>

Acceptance:
- <what counts as done>

Scope:
- <in scope>
- <out of scope>

Constraints:
- <code change / test / safety limits>

Reporting:
- Report to <target session role> (builder default: qa; qa default: orchestrator)
- For qa tasks, direct report to orchestrator is the default chain
- Treat accepted + childSessionKey/sessionKey as the start signal

Required terminal output:
- status
- childSessionKey/sessionKey
- optional one-line summary
- resultLocation only if there is a standalone artifact
- blocker/failure hint when status is failed or blocked
```

## Surface-aware spawn guidance

- `webchat` / Control UI / 任意无 thread binding 的 surface：
  - 默认 `runtime: "acp"`
  - 默认 `mode: "run"`
  - 不写 `thread: true`
- Discord thread / Telegram topic / 其他已确认支持 thread binding 的 surface：
  - 只有在明确需要持久会话时，才使用 `thread: true + mode: "session"`
- 如果只是验证 ACP 链路是否通、是否能回传终态，优先坚持 `mode: "run"`，把 thread-bound persistent session 当成第二阶段 richer integration check

## 使用边界

- 这是“协议 skill”，不是业务 skill
- 它解决的是委派一致性、终态一致性、日志回收一致性、监控一致性
- 工作区私有规则依然应在本地 `AGENTS.md` / `SOUL.md` / 本地 skill 中覆盖
