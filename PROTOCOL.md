# OpenClaw Multi-Agent Protocol

**版本**: 1.1
**生效日期**: 2026-03-19
**事实来源**: 唯一（SSOT）

---

## 1. 启动清单

所有 Agent 启动时，必须先读取：

```
~/coding/.openclaw/workspace/PROTOCOL.md   ← 本文件
```

---

## 2. 意图前缀

| 前缀 | 语义 | 示例 |
|------|------|------|
| `[Engineering→<Agent>]` | 技术实施、架构、代码任务 | `[Engineering→Cartooner]` 图片上传重构 |
| `[Creative→<Agent>]` | 艺术方向、审美、视觉资产 | `[Creative→Mor]` 美术风格定义 |
| `[Review→<Agent>]` | QA、审计、反馈、验收 | `[Review→Cartooner]` 代码审查 |
| `[Ops→<Agent>]` | 部署、运维、监控 | `[Ops→Warden]` 服务重启 |
| `[Protocol]` | 协议变更、协作流程 | `[Protocol]` 新增前缀 `[Alert→]` |

**格式**：`[<Domain>→<Target>] <简短描述>`

---

## 3. 自主决策规则

### 域内事务
- **同域任务**：直接执行，事后同步结果到相关方
- **结果同步**：直接发送消息给目标 Agent，不经过 Kane 转述

### 跨域协作
- 需其他 Agent 介入时，直接发消息并附加 `[<Domain>→<Target>]` 前缀
- 不需要每次都 mention Kane

### 升级条件（仅此时升级给 Kane）
- 架构级取舍
- 跨域冲突无法协商
- 资源影响超出本工作区范围
- 安全或合规边界

---

## 4. Agent 生命周期治理框架

### 三层职责

| 层级 | 角色 | 职责 |
|------|------|------|
| **决策层** | Kane | Agent 创建/修改的战略发起人，拥有最终裁决权 |
| **治理层** | Warden | 所有 Agent 创建/修改的准入审计官，负责职能边界校验、工具链权限检查、将新 Agent 身份写入 `CAPABILITIES.md` |
| **执行层** | Cartooner | 根据 Warden 审计结果，执行 Agent 的具体部署与工作区构建 |

### Agent 创建/修改流程

```
Kane (决策)
    │ 发起创建/修改请求
    ▼
Warden (治理) ─── 审计失败 ──► 返回修改意见
    │ 审计通过
    ▼
Cartooner (执行) ── 构建/修改 ──► 更新写入 CAPABILITIES.md
```

### Warden 治理审计清单

新建或变更 Agent 时，Warden 必须校验：

1. **职能边界**：新 Agent 与现有 Agent 是否有职责重叠或冲突
2. **工具链权限**：该 Agent 需要哪些工具授权，是否符合最小权限原则
3. **身份写入**：`CAPABILITIES.md` 中 Agent 条目是否同步更新
4. **工作区隔离**：新 Agent 的 workspace 路径、记忆分层是否合理

### 现有 Agent 身份

| Agent | 层级 | 工作区 |
|-------|------|-------|
| **Kane** | 决策层 | — |
| **Warden** | 治理层 | `/Users/k/coding/.openclaw/workspace-warden` |
| **Cartooner** | 执行层 | `/Users/k/coding/.openclaw/workspace-cartooner` |
| **Mor** | 创意层 | `/Users/k/coding/.openclaw/workspace-mor` |
| **heartbeat-monitor** | 监控层 | `/Users/k/coding/.openclaw/workspace-heartbeat` |
| **hotspot-warden** | 监控层 | `/Users/k/coding/.openclaw/workspace-hotspot-warden` |

---

## 5. 会话与消息规范

### 会话路由
- 每 Agent 有独立 Feishu 账号，不得混用
- 消息路由通过 `channel:feishu` + `accountId` 明确匹配

### 消息格式
- Agent 间沟通使用自然语言 + 前缀
- 不需要公文式确认（已确认意图后直接执行）
- 结果汇报：简洁、结构化、附状态

### 协作协议加载约定
- `PROTOCOL.md` 是全局协作协议 SSOT，不是经验记忆
- 所有 Agent 启动时应优先读取 `~/coding/.openclaw/workspace/PROTOCOL.md`
- 各 Agent 的本地 `SOUL.md` / `IDENTITY.md` / `AGENTS.md` / `MEMORY.md` 不得与 `PROTOCOL.md`、`CAPABILITIES.md` 冲突
- 若发现漂移，应先同步全局协议，再更新本地文档

### 跨 Agent 协作规范

#### 委派最小格式
跨 Agent 委派至少应包含：
1. **背景**：为什么需要对方介入
2. **目标**：明确要交付什么
3. **约束**：不可突破的边界
4. **交付格式**：是方案、diff、直接修改、还是审计意见
5. **验收标准**：什么叫完成

#### 执行中状态
被委派方在执行过程中只允许三种状态：
- **完成**：按约定交付结果
- **阻塞**：说明阻塞原因与需要的输入
- **失败**：说明失败原因与下一步建议

禁止静默消失。

#### 回传要求
- 若任务失败或无法继续，必须显式通知委派方
- 若任务存在歧义且无法自行消解，必须回传问题而不是默默推断
- 若任务要求变更文件，优先说明修改范围与结果摘要

#### 验收责任
- **委派方负责验收**，不能把验收责任外包给被委派方
- 被委派方的完成不等于任务真正完成；必须经过委派方审核
- 若结果不符合标准，委派方应明确打回原因或追加指令

#### 工具与职责的区分
- Agent 可以调用 Claude Code / Codex / 其他 ACP agent 作为工具完成自己的职责
- **工具不等于职责**：是否可调用某工具，不代表该 Agent 以该工具对应的能力为主身份

### RuntimeEvent 机制（ETA 驱动）

#### 基本规则
执行方在任务开始时必须发布一个结构化运行时事件，并提供 ETA。最小字段：
- `task_id`
- `status = started`
- `summary`
- `eta`
- `phase`（可选）

#### 状态集合
- `started` — 刚开始
- `running` — 在推进
- `waiting_reply` — 等待其他 Agent 回复
- `delayed` — 超过 ETA，但仍有进展迹象
- `stalled` — 超过 ETA，且无有效进展或有异常
- `completed` / `failed` — 终态

#### 投递目标
- **结构化 RuntimeEvent 默认投递给 `heartbeat-monitor`**
- 当前会话保留面向人类的自然语言进度，不强制镜像结构化事件
- 只有当人类需要感知关键状态变化时，才在当前会话补充简短说明

#### heartbeat-monitor 观测逻辑
- 在 ETA 内：视为 `Active`
- 接近 ETA 但未完成：标记 `delayed`，可发一次轻量提醒
- 超过 ETA 且无合理进展：标记 `stalled`，读取日志分析原因并输出诊断
- 对跨 Agent 等待同样适用；`waiting_reply` 必须带预估 ETA

#### ETA 变更规则
- 若执行方发现原 ETA 不准，必须显式更新事件
- 若进入 `waiting_reply`，必须说明在等谁、等什么、预估多久、超时后如何处理
- 禁止把卡住任务伪装成无限等待

---

## 6. 冲突解决

1. 同域冲突 → 域内 Agent 协商解决
2. 跨域冲突 → 相关方直接协商，难则升级 Kane
3. **Kane 是最终裁决者**

---

## 7. 变更流程

| 变更类型 | 流程 |
|---------|------|
| 协议正文（本文） | 所有 Agent 确认 → Kane 批准 → 更新 |
| 前缀增删 | `[Protocol]` 提案 → 相关 Agent 反馈 → Kane 批准 |
| Agent 边界/身份 | Warden 审计 → Kane 批准 → 写入 `CAPABILITIES.md` |
| 单 Agent 内部流程 | Agent 自行决定，事后同步 |

---

## 8. 健康状态

- Agent 启动时在当前会话中 announce 身份（首次）
- 故障时通过 heartbeat-monitor 上报
- 长期无活动视为静默（normal）

---

*本文件是唯一事实来源，任何 Agent 的本地规则不得与本文冲突。*
