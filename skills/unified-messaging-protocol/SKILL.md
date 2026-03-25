---
name: unified-messaging-protocol
description: >
  统一消息协议（UMP）。定义 5 种标准消息类型覆盖所有 agent 间通讯：
  TaskRequest、TaskResult、StatusUpdate、ApprovalRequest、ApprovalResult。
  通过 ReplyTo + TaskId 实现零查找回传。TerminalSignal 的 SSOT。
---

# Unified Messaging Protocol (UMP)

所有 agent 间通讯使用 5 种标准消息类型，一个信封格式覆盖所有链路。

## 信封格式

```text
Type: <TaskRequest | TaskResult | StatusUpdate | ApprovalRequest | ApprovalResult>
From: <发送方 agent id>
To: <接收方 agent id>
ReplyTo: <发送方 sessionKey>
TaskId: <稳定 task_id>
---
<payload>
```

- `ReplyTo` 在 TaskRequest / ApprovalRequest 中必填
- `TaskId` 在 TaskRequest / TaskResult / StatusUpdate 中必填
- 飞书群汇报（StatusUpdate）走 `message` 工具，非 `sessions_send`

## 5 种消息类型

### 1. TaskRequest — 委派工作

via `sessions_send`。payload 自由填写（目标、背景、范围、验收标准等），按任务性质自行组织。

### 2. TaskResult — 终态回传（TerminalSignal SSOT）

via `sessions_send(replyTo)`。这是 TerminalSignal 的唯一正式定义：

```text
Status: <completed | failed | blocked>
Summary: <必填，一句话>
ChangedFiles: <可选>
Verification: <可选>
Blocker: <failed/blocked 时必填>
ChildSessionKey: <ACP 子会话时附带>
ResultLocation: <有独立产物时附带>
```

回传规则：
- 用 TaskRequest 中的 `ReplyTo` 作为 `sessions_send` 的 `sessionKey`
- `TaskId` 必须与原始 TaskRequest 相同
- 歧义无法消解时先回传 `Status: blocked`，不默默推断

### 3. StatusUpdate — 飞书群进度汇报

via `message` 工具。格式：`<emoji> [<阶段>] <Agent名> + payload`

| 阶段 | Emoji | 时机 |
|------|-------|------|
| 任务接收 | 📋 | 收到 TaskRequest 后 |
| 执行完成 | ✅ | 任务完成 |
| 执行阻塞 | ❌ | 失败或阻塞 |

频率：接收和终态必发；进度更新仅在有意义的里程碑时。

### 交付物飞书推送（硬规则）

任务产出可交付产物（文档/文件/报告/链接）时，task_completed 的飞书广播**必须附带交付物**：
- 文件类产物：用 `message` 工具的 `media` 参数发送
- 文档类产物：创建飞书文档后附带链接
- 数据类产物：写入飞书多维表格后附带链接
- 纯文本/摘要：直接包含在消息正文中

agent 根据产物类型自行选择最合适的飞书工具，不限定具体方式。

### 4. ApprovalRequest — 请求审批

via `sessions_send` → warden。payload：操作、上下文、风险。Warden 120s 无响应视为 REJECTED。

### 5. ApprovalResult — 审批结论

via `sessions_send(replyTo)`。payload：`Decision: APPROVED | REJECTED`，`Reason`。

## 核心约定

- 存在用户侧 orchestrator（如 Cartooner）时，只有 orchestrator 直接面对用户
- worker 默认只对 `ReplyTo` 回应
- `sessions_list` 只用于诊断，不是委派前提
- ACP spawn 不走本协议（见 `hierarchical-acp-delegation` skill）
- RuntimeEvent / watch_policy 不属于本协议（见 `hierarchical-acp-delegation` skill）
