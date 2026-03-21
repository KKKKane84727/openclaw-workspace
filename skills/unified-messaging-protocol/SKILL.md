---
name: unified-messaging-protocol
description: >
  统一消息协议（UMP）。定义 5 种标准消息类型覆盖所有 agent 间通讯：
  TaskRequest、TaskResult、StatusUpdate、ApprovalRequest、ApprovalResult。
  所有 agent 共享同一套信封格式，通过 ReplyTo + TaskId 实现零查找回传。
---

# Unified Messaging Protocol (UMP)

所有 agent 间通讯使用本协议定义的 5 种标准消息类型。一个信封格式覆盖所有链路。

## 信封格式

```text
Type: <TaskRequest | TaskResult | StatusUpdate | ApprovalRequest | ApprovalResult>
From: <发送方 agent id>
To: <接收方 agent id>
ReplyTo: <发送方 sessionKey，可选>
TaskId: <稳定 task_id，可选>
---
<payload>
```

### 约定

- `Type` 是消息语义标识，接收方据此决定如何处理
- `ReplyTo` 在 `TaskRequest` 和 `ApprovalRequest` 中必填
- `TaskId` 在 `TaskRequest`、`TaskResult`、`StatusUpdate` 中必填
- `---` 分隔符后是自由格式 payload
- 飞书群汇报（`StatusUpdate`）走 `message` 工具而非 `sessions_send`
- 如果存在明确的用户侧 orchestrator（例如 Cartooner），只有 orchestrator 直接面对用户；worker 默认只对 `ReplyTo` 回应

## 1. TaskRequest — "请帮我做这件事"

**发送方式**: `sessions_send`
**使用场景**: 任何 agent 委派工作给另一个 agent

```text
Type: TaskRequest
From: <agent id>
To: <agent id>
ReplyTo: <发送方 sessionKey>
TaskId: <stable task_id>
---
[<Domain>→<Agent>] <任务标题>

<payload — 按任务类型自由填写>
```

### Payload 指南（按需填写，非强制）

代码任务：

- 目标
- 背景
- 范围
- 验收标准

创意任务：

- 目标
- 风格方向
- 参考
- 交付格式

### Cartooner First 附加约定

- Cartooner 默认直发稳定主会话：代码任务 -> `agent:koder:main`，内容任务 -> `agent:mor:main`
- 混合任务默认 `Cartooner -> Mor -> Koder`
- `sessions_list` 只用于诊断，不作为发送 `TaskRequest` 的前提

## 2. TaskResult — "我做完了 / 失败了 / 需要补充信息"

**发送方式**: `sessions_send(replyTo)`
**使用场景**: 任务完成后回传结果给委派方

```text
Type: TaskResult
From: <agent id>
To: <agent id>
TaskId: <stable task_id>
---
Status: <completed | failed | blocked>
Summary: <必填，一句话总结>
ChangedFiles: <可选，变更文件列表>
Verification: <可选，验证结果>
Blocker: <failed/blocked 时必填>
ChildSessionKey: <ACP 子会话时附带>
```

Payload 就是 `TerminalSignal`，不重新发明。

### 回传规则

- 接收方用 `TaskRequest` 中的 `ReplyTo` 作为 `sessions_send` 的 `sessionKey`
- 不需要 `sessions_list` 查找
- `TaskId` 必须与原始 `TaskRequest` 相同
- 如果任务歧义无法自行消解，先回传问题（`Status: blocked`），不默默推断

## 3. StatusUpdate — "我在做，进度如此"

**发送方式**: `message` 工具（飞书群）
**使用场景**: Koder / Mor / Cartooner 向飞书群汇报任务进展

```text
Type: StatusUpdate
From: <agent id>
TaskId: <stable task_id>
---
<emoji> [<阶段>] <Agent名>
<payload>
```

### 阶段类型

| 阶段 | Emoji | 时机 |
|------|-------|------|
| 任务接收 | 📋 | 收到 `TaskRequest` 后 |
| 进度 | 📊 | 里程碑完成时 |
| 执行完成 | ✅ | 任务执行完成（已回传委派方验收） |
| 执行阻塞 | ❌ | 失败或阻塞 |
| 验收通过 | ✅ | 委派方验收通过 |
| 验收未通过 | ❌ | 委派方验收未通过 |
| 灰色操作记录 | ⚠️ | 执行灰色地带操作时 |

目标群: `oc_fc0711cb56585f29457ddf640c354371`

治理审批场景固定通过 `channel:feishu + accountId: cartooner` 发往该群；群内审批回复无需 `@`。

### 频率控制

- 必发：任务接收、执行完成 / 阻塞
- 按需：进度更新只在有意义的里程碑时
- 不发：日常文件操作、内部思考
- 单条消息不超过 500 字

## 4. ApprovalRequest — "这个操作需要批准"

**发送方式**: `sessions_send`
**使用场景**: Koder / Mor 命中安全规则引擎黑名单时

```text
Type: ApprovalRequest
From: <agent id>
To: warden
ReplyTo: <发送方 sessionKey>
TaskId: <stable task_id>
---
操作: <具体命令>
上下文: <为什么需要执行>
风险: <可能的后果>
```

### 超时规则

- Warden 120 秒无响应 -> 视为 `REJECTED`
- 向飞书群记录超时事件
- 寻找替代方案或在 `TaskResult` 中标记 blocker

## 5. ApprovalResult — "批准 / 拒绝"

**发送方式**: `sessions_send(replyTo)` 或 `sessions_send`
**使用场景**:

- Warden 回复 Koder / Mor 的审批请求
- Cartooner 转发 Kane 对 Warden 治理审批的最终结论

```text
Type: ApprovalResult
From: <warden | cartooner>
To: <agent id>
TaskId: <stable task_id>
---
ApprovalId: <approval_id，可选；转发治理审批时必填>
Decision: <APPROVED | REJECTED>
Reason: <决策原因>
```

## 通讯链路总表

| 链路 | 消息类型 | 方式 |
|------|---------|------|
| Kane ↔ Cartooner | 自然语言 | 飞书 DM / webchat |
| Cartooner → Koder / Mor | TaskRequest | sessions_send |
| Koder / Mor → Cartooner | TaskResult | sessions_send(replyTo) |
| Mor → Gemini / Koder | TaskRequest | sessions_send |
| Gemini / Koder → Mor | TaskResult | sessions_send(replyTo) |
| Koder / Mor / Cartooner → 飞书群 | StatusUpdate | message |
| Koder / Mor → Warden | ApprovalRequest | sessions_send |
| Warden → Koder / Mor | ApprovalResult | sessions_send(replyTo) |
| Cartooner → Warden | ApprovalResult | sessions_send |
| Koder → Claude / Codex | — | sessions_spawn (ACP, 非本协议) |
| heartbeat → 各 agent | — | sessions_send (保留现有格式) |

## 混合任务链路

Mor 全权负责混合任务，用户侧仍只看到 Cartooner：

```text
Cartooner -> Mor (TaskRequest, ReplyTo=cartooner_session, TaskId=<id>)
  Mor -> Koder (TaskRequest, ReplyTo=mor_session, TaskId=<same id>)
  Koder -> Mor (TaskResult, TaskId=<same id>)
Mor -> Cartooner (TaskResult, TaskId=<same id>)
```

## 与现有机制的关系

- `TerminalSignal`: 保留为 `TaskResult` 的 payload 格式
- `RuntimeEvent + watch_policy`: 保留，面向 heartbeat-monitor 的结构化事件，不属于本协议
- 意图前缀 `[Domain→Agent]`: 保留为 `TaskRequest` payload 的一部分
- `sessions_spawn`: ACP spawn 不走本协议
