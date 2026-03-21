# OpenClaw Multi-Agent Protocol

**版本**: 2.1
**生效日期**: 2026-03-22
**事实来源**: 唯一（SSOT）

---

## 1. 启动清单

所有 Agent 启动时，按 §10「会话启动标准」执行完整流程。最低要求：先读取本文件和 `CAPABILITIES.md`。

---

## 2. 意图前缀

| 前缀 | 语义 | 示例 |
|------|------|------|
| `[Engineering→<Agent>]` | 技术实施、架构、代码任务 | `[Engineering→Cartooner]` 图片上传重构 |
| `[Creative→<Agent>]` | 艺术方向、审美、视觉资产 | `[Creative→Mor]` 美术风格定义 |
| `[Review→<Agent>]` | QA、审计、反馈、验收 | `[Review→Cartooner]` 代码审查 |
| `[Ops→<Agent>]` | 部署、运维、监控 | `[Ops→Warden]` 服务重启 |
| `[Protocol]` | 协议变更、协作流程 | `[Protocol]` 统一终态信号 |

**格式**：`[<Domain>→<Target>] <简短描述>`

---

## 3. 自主决策规则

### 业务层自主权（Koder / Mor）
- 白名单操作：直接执行，无需任何审批
- 灰色地带操作：执行 + 记录到飞书群
- 黑名单操作（毁灭性）：拒绝执行 + `sessions_send` Warden → Warden 通知 Kane 决策
- 详见 `CAPABILITIES.md` 安全边界规则引擎

### 域内事务
- **同域任务**：直接执行，事后同步结果到相关方
- **结果同步**：直接发送消息给目标 Agent，不经过 Kane 转述

### 跨域协作
- 需其他 Agent 介入时，直接发消息并附加 `[<Domain>→<Target>]` 前缀
- 不需要每次都 mention Kane

### 升级条件
- **升级给 Warden**：黑名单操作请求（毁灭性操作拦截）
- **升级给 Kane**（仅此时）：Warden 收到的黑名单操作、架构级取舍、跨域冲突无法协商、安全或合规边界

---

## 4. Agent 生命周期治理框架

### 四层职责

| 层级 | 角色 | 职责 |
|------|------|------|
| **决策层** | Kane | 战略发起、最终裁决（毁灭性操作审批） |
| **沟通层** | Cartooner | 需求翻译、任务路由、澄清收口、轻量验收（Kane 唯一窗口） |
| **业务层** | Koder / Mor | 自主规划执行、必要时回 Cartooner 澄清、飞书里程碑汇报、交付回传 Cartooner |
| **审计层** | Warden | 系统治理、毁灭性操作拦截、Agent 生命周期审计 |

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
| **Cartooner** | 沟通层 | `/Users/k/coding/.openclaw/workspace-cartooner` |
| **Koder** | 业务层 | `/Users/k/coding/.openclaw/workspace-koder` |
| **Mor** | 业务层 | `/Users/k/coding/.openclaw/workspace-mor` |
| **Warden** | 审计层 | `/Users/k/coding/.openclaw/workspace-warden` |
| **heartbeat-monitor** | 监控层 | `/Users/k/coding/.openclaw/workspace-heartbeat` |
| **hotspot-warden** | 监控层 | `/Users/k/coding/.openclaw/workspace-hotspot-warden` |

---

## 5. 会话与消息规范

### 会话路由
- 每 Agent 有独立 Feishu 账号，不得混用；存在显式例外时，必须写入 `CAPABILITIES.md` 的统一绑定表
- 消息路由通过 `channel:feishu` + `accountId` 明确匹配

### 消息格式
- Agent 间通讯遵循统一消息协议（UMP），定义在 `~/coding/.openclaw/workspace/skills/unified-messaging-protocol/SKILL.md`
- 5 种标准消息类型：TaskRequest、TaskResult、StatusUpdate、ApprovalRequest、ApprovalResult
- 每条 TaskRequest 必须附带 `ReplyTo` sessionKey 和稳定 `TaskId`，接收方完成后直接回传
- 不需要公文式确认（已确认意图后直接执行）
- 若存在用户侧 orchestrator（默认是 Cartooner），只有 orchestrator 直接面对用户；执行者默认只对 `ReplyTo` 回复

### 协作协议加载约定
- `PROTOCOL.md` 是全局协作协议 SSOT，不是经验记忆
- 所有 Agent 启动时应优先读取 `~/coding/.openclaw/workspace/PROTOCOL.md`
- 各 Agent 的本地 `SOUL.md` / `IDENTITY.md` / `AGENTS.md` / `MEMORY.md` 不得与 `PROTOCOL.md`、`CAPABILITIES.md` 冲突
- 若发现漂移，应先同步全局协议，再更新本地文档

### 声明层与运行时镜像
- `cartooner/.openclaw-config/workspace/*` 是**可编辑声明层**
- `/Users/k/coding/.openclaw/workspace/*` 是**运行时镜像**
- 变更流程固定为：先改声明层，再在同一轮修改中同步运行时镜像
- 不假设系统存在自动同步；若镜像未同步，视为配置漂移

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
- **阻塞**：回委派方说明阻塞原因与需要的输入
- **失败**：说明失败原因与下一步建议

禁止静默消失。

#### Cartooner First 默认路由

- Cartooner 默认是唯一用户窗口，尽可能自行吸收执行细节并对用户二次整理回复
- 代码任务默认直发 `agent:koder:main`
- 内容 / 资产任务默认直发 `agent:mor:main`
- 混合任务默认 `Cartooner -> Mor -> Koder`
- `sessions_list` 只用于诊断目标会话异常、卡死或无响应，不是正常委派前提
- Cartooner 默认不直接 `sessions_spawn`；真正的子任务树由 Koder / Mor 自行展开

#### 中途澄清标准格式

需要补充信息时，被委派方应先回委派方而不是直接找用户；最小字段：

- `task_id`
- `missing_info`
- `reason`
- `blocked_step`
- `tried`

委派方先尝试用已有上下文自行回答；只有缺少外部事实、需求多义会改变结果、或涉及高代价 / 不可逆决策时，才升级给用户。

#### 终态信号标准格式 (`TerminalSignal`)
所有跨 Agent 终态回报使用统一 payload：
- `task_id`
- `status: completed | failed | blocked`
- `summary`
- `changed_files?`
- `verification?`
- `blocker?`

补充规则：
- `changed_files` 可承载代码路径、文档路径、配置路径或创作产物路径
- `verification` 可承载测试命令、人工校验、投递确认或“未执行”的明确说明
- `failed` / `blocked` 时应提供 `blocker`
- 若终态来自 ACP 子会话或被委派 run，必须额外附带 `childSessionKey` / `sessionKey` 作为会话元数据，便于父会话回收日志

#### 回传要求
- 若任务失败或无法继续，必须显式通知委派方
- 若任务存在歧义且无法自行消解，必须回传问题而不是默默推断
- 若任务要求变更文件，优先通过 `changed_files` 与 `summary` 描述范围和结果
- `task_id` 必须在澄清、进度、终态回传中保持不变

#### 验收责任
- **委派方负责验收**，不能把验收责任外包给被委派方
- 被委派方的完成不等于任务真正完成；必须经过委派方审核
- 若结果不符合标准，委派方应明确打回原因或追加指令

#### 工具与职责的区分
- Agent 可以调用 Claude Code / Codex / 其他 ACP agent 作为工具完成自己的职责
- **工具不等于职责**：是否可调用某工具，不代表该 Agent 以该工具对应的能力为主身份

### 全局安全红线 (`SecurityRedlines`)
- 绝不外泄隐私数据、凭证、长期记忆或不必要的内部上下文
- 破坏性命令必须先问再做；不确定时先升级 Kane
- 可恢复删除优先于不可恢复删除；能用 `trash` 就不要直接 `rm`
- 下列 Git 操作视为全局禁止项，除非 Kane 对当次操作给出明确授权：
  - `git push --force` / `git push -f`
  - `git reset --hard`
  - `git checkout -- .` / `git restore .`
  - `git clean -f`
  - `git add .` / `git add -A`
  - `--no-verify`
- 禁止在 `openclaw/` 仓库做源码 commit 或 push
- 推送前必须经 Kane 确认，一次授权仅对当次推送有效

### RuntimeEvent 机制（ETA 驱动）

#### 基本规则
执行方在任务开始时必须发布一个结构化运行时事件，并提供 ETA。最小字段：
- `task_id`
- `status = started`
- `summary`
- `eta`
- `phase`（可选）
- `watch_policy`（可选）

若声明 `watch_policy`，则必须显式包含 `mode`。

#### 状态集合
- `started` — 刚开始
- `running` — 在推进
- `waiting_reply` — 等待其他 Agent 回复
- `delayed` — 超过 ETA，但仍有进展迹象
- `stalled` — 超过 ETA，且无有效进展或有异常
- `completed` / `failed` — 终态

#### `watch_policy` 结构（可选）
- 未声明 `watch_policy` 时，等价于 `mode=normal`
- `watch_policy` 只能由执行方声明；heartbeat-monitor 只消费，不反向改策略
- 字段结构：
  - `mode: normal | fast`
  - `interval: 1m`（仅 `mode=fast` 时使用，首版固定为 `1m`）
  - `duration`（仅 `mode=fast` 时必填，到期自动回落为普通观测）
  - `reason`
- `feishu_report: boolean`（可选，为 `true` 时 heartbeat-monitor 将巡检摘要推送飞书群）
- `escalation: "koder" | null`（可选，声明阻塞时的预授权升级目标；heartbeat-monitor 仅在此字段显式声明时才可向指定 Agent 发送解阻任务）
- `reason`
- `reason` 枚举：
  - `critical_acp_child_task`
  - `cross_agent_waiting`
  - `external_io_risk`
  - `approval_wait`
  - `user_requested_watch`

#### 投递目标
- **结构化 RuntimeEvent 默认投递给 `heartbeat-monitor`**
- 当前会话保留面向人类的自然语言进度，不强制镜像结构化事件
- 只有当人类需要感知关键状态变化时，才在当前会话补充简短说明

#### heartbeat-monitor 观测逻辑
- 在 ETA 内：视为 `Active`
- 若 `watch_policy.mode=fast`：heartbeat-monitor 必须为该 `task_id` 登记 `watchTasks`，并在 `duration` 窗口内按 `interval` 高频巡检（首版 `1m`）
- 接近 ETA 但未完成：标记 `delayed`，可发一次轻量提醒
- 超过 ETA 且无合理进展：标记 `stalled`，读取日志分析原因并输出诊断
- 对跨 Agent 等待同样适用；`waiting_reply` 必须带预估 ETA，且应优先声明 `watch_policy.reason=cross_agent_waiting`
- 对跨 Agent 未回复，heartbeat-monitor 需进一步判断原因：`TARGET_DEAD` / `DELIVERY_FAILED` / `NOT_PICKED_UP` / `BUSY_WITH_OTHER_TASK` / `INTERNAL_ERROR` / `UNKNOWN`

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

## 9. 飞书群委派生命周期通知

### 适用范围
所有跨 Agent 任务流转均须在飞书群同步生命周期事件。
目标群: `oc_fc0711cb56585f29457ddf640c354371`（统一 ops 视图）

### 发布者
- **Koder / Mor**（业务层）：任务全生命周期的主要发布者（接收、计划、进度、完成）
- **Cartooner**（沟通层）：验收结果发布者（验收通过/打回）
- **heartbeat-monitor**：ACP 巡检摘要（当 `watch_policy.feishu_report=true` 时）

### 生命周期事件

| 阶段 | 触发者 | 时机 | 必含字段 |
|------|--------|------|---------|
| `task_received` | Koder / Mor | 收到任务后 | source, task_summary, plan, eta |
| `progress_update` | Koder / Mor | 里程碑完成时 | task_summary, phase, progress |
| `task_completed` | Koder / Mor | 执行完成后 | task_summary, status, changed_files |
| `acp_watch_activated` | Koder | spawn ACP 后 | task_id, watch_policy, escalation_target |
| `acceptance_result` | Cartooner | 验收完成后 | task_id, status, summary, next_action? |

#### 9.1 委派通知 (`delegation_sent`)

委派方在通过 `sessions_send` 或 `sessions_spawn` 发出任务后，必须**同时**向飞书群发送通知：

```text
🔄 [委派通知]
委派方: <Agent名>
执行方: <Agent名>
任务: <一句话摘要>
计划:
- <步骤1>
- <步骤2>
预计完成: <ETA>
```

#### 9.2 接收确认 (`delegation_accepted`)

被委派方收到任务后，必须向飞书群推送接收确认：

```text
✅ [接收确认]
任务来自: <委派方Agent名>
执行方: <本Agent名>
实施计划:
- <具体步骤1>
- <具体步骤2>
```

进度流更新规则：
- 每个主要阶段完成时推送一次进度到飞书群（里程碑粒度，非定时推送）
- 模板: `📊 [进度] <Agent名> | <task摘要> | 阶段 <N/M>: <当前阶段描述>`

#### 9.3 ACP 监控升级 (`acp_watch_activated`)

委派方使用 `sessions_spawn` 启动 ACP 子任务时：

1. 向 heartbeat-monitor 发送 RuntimeEvent，`watch_policy` 应声明：
   - `mode: fast`
   - `interval: 1m`
   - `duration: <预估时长>`
   - `reason: critical_acp_child_task`
   - `feishu_report: true`
   - `escalation: koder`

2. heartbeat-monitor 在高频巡检期间：
   - 每次巡检结果有显著变化（status / phase / blocker 变更）时推送飞书群
   - 模板: `🔍 [ACP巡检] task_id: <id> | 状态: <status> | <摘要>`

3. 发现阻塞时（仅当 `watch_policy.escalation` 已声明）：
   - 飞书群告警: `🚨 [ACP阻塞] task_id: <id> | 原因: <diagnosis> | 正在委派 Koder 处理`
   - 通过 `sessions_send` 向 Koder 发送解阻任务（使用 `[Ops→Koder]` 前缀 + 委派最小格式）
   - 前提：诊断结果为 `TOOL_HANG` / `PROCESS_DEAD` / `LLM_TIMEOUT`，且已通知任务发布者 5 分钟内无干预
   - Koder 解阻结果回传 heartbeat-monitor，heartbeat 再推飞书群

#### 9.4 验收结果 (`acceptance_result`)

委派方完成验收后，必须向飞书群推送结果：

验收通过：
```text
✅ [验收通过]
任务: <摘要>
执行方: <Agent名>
结果: <summary>
变更文件: <changed_files 摘要>
```

验收失败：
```text
❌ [验收未通过]
任务: <摘要>
执行方: <Agent名>
问题: <failure reason>
新计划:
- <修复步骤1>
- <修复步骤2>
状态: 已重新委派
```

验收失败时，委派方必须：
1. 制定新的修复计划
2. 重新委派（产生新的 `delegation_sent` 通知）
3. 继续推送直到验收通过

#### 9.5 治理审批转发 (`governance_approval_relay`)

适用范围：Warden 发到统一飞书群的治理审批请求（例如 `capability-evolver` 巡检发现需要变更）。

- Warden 发审批请求时固定使用 `channel:feishu + accountId: cartooner` 指向统一群
- Kane 可在群里直接回复（**无需 @ 任意机器人**）：
  - `批准 <approval_id>`
  - `拒绝 <approval_id> <原因>`
- Cartooner 作为 Kane 唯一窗口，负责把人类回复转发给 Warden
- 转发使用 `ApprovalResult`，并补充 `ApprovalId: <approval_id>`
- Warden 收到后自行匹配 `memory/pending-approvals.json` 中的待审批票据，再继续提案、治理或委派
- 若本轮无变更，Warden 不向飞书群发送审批请求

### 通用约束

- 飞书群通知是 Agent 间通信的**补充**，不替代 ACP 内部 RuntimeEvent / TerminalSignal 主链路
- 单条飞书群消息不超过 500 字；详细日志留在 `sessions_history`
- 同一 `task_id` 的同一阶段通知只发一次，除非状态有实质变化
- 所有飞书群通知使用 `message` 工具发送到统一目标群

---

## 10. 会话启动标准

所有 Agent 启动时，按以下顺序执行：

1. 读取 `~/coding/.openclaw/workspace/PROTOCOL.md`（本文件）
2. 读取 `~/coding/.openclaw/workspace/CAPABILITIES.md`
3. 读取本地 `SOUL.md` — Agent 内核与信条
4. 读取本地 `USER.md` — 服务对象（若存在）
5. 读取本地 `memory/`（今天 + 昨天的笔记，若存在）
6. 读取本地 `MEMORY.md`（仅在主会话中加载，安全考虑）

各 Agent 可在本地 AGENTS.md 中追加差异步骤（如额外读取 `TOOLS.md`、`IDENTITY.md`、`IMPLEMENTATION_PLAN.md` 等），但上述 1-2 步不可省略或后置。

---

## 11. 记忆系统标准

### 分层模型

| 层级 | 文件 | 用途 | 写入条件 |
|------|------|------|---------|
| **短期** | `memory/YYYY-MM-DD.md` | 当日会话笔记、尝试记录、临时阻塞 | 随时 |
| **长期** | `MEMORY.md` | 跨会话稳定决策、协作偏好、反复验证的教训 | 稳定后提炼 |
| **环境** | `TOOLS.md`（可选） | 路径、端口、helper 地址、工具可用性 | 环境事实变更时 |

### 通用规则

- 同一事实只保留一个主落点，禁止跨文件重复维护
- 每次会话从零开始；想记住的内容必须写入文件
- `MEMORY.md` **仅在主会话**（与 Kane 直接对话）中加载，**禁止**在共享上下文中加载
- 定期从每日笔记提炼长期记忆，清理过时条目

各 Agent 可根据业务需求扩展存储位置（如 `heartbeat-state.json`），但分层原则不变。

---

## 12. 操作权限基线

### 可自由执行（所有 Agent 通用）

- 读取文件、探索代码库、分析架构
- 在本工作区内维护文档与记忆文件
- 搜索资料、查阅文档
- 运行只读检查（git status / log / diff、lint、type-check）

### 需先确认（所有 Agent 通用）

- 对外发布、推送代码
- 任何离开本机的操作
- 修改底层框架设计或系统级路由
- 影响多个工作区的变更
- 任何不确定的操作

各 Agent 在本地 AGENTS.md 中列出**增量权限**（如 Cartooner 可调度 ACP、heartbeat 可执行特定脚本），而非重复基线。

---

## 13. Heartbeat 响应标准协议

> 本节定义所有**被 heartbeat-monitor 通知的 Agent** 如何响应异常告警。

### 通用响应规则

1. 收到 heartbeat-monitor 的 `sessions_send` 通知时，**必须分析并决策**，禁止忽略
2. 收到提醒后立即进入响应流程，不等待 Kane 二次触发
3. 优先返回最小 ACK 或直接给出处置，不耗同步窗口在长篇铺垫上
4. 向繁忙 ACP 子会话发送 `sessions_send` 干预时，应显式设置 `timeoutSeconds`

### 幂等与去重规则

- 去重主键：`childSessionKey` > `sessionKey` > `session_id + action`
- 同一主键 + 同一异常终态只处理一次，除非有新证据、摘要变化或新 `runId`
- `DIAGNOSE_STALL`：`diagnosis` 变化、日志指纹变化、或超过冷却时间才再次干预
- `APPROVE_OR_REJECT`：审批对象变化、`riskLevel` 变化、或超过 10 分钟才再次处理
- canonical action 名称为 `DIAGNOSE_STALL`；收到 legacy `DIAGNOSE_STALLED` 先归一化
- 无新证据 + 无新状态 → 回复 `HEARTBEAT_OK`

### 业务决策（各 Agent 在本地补充）

各 Agent 根据自身职责定义 `DIAGNOSE_STALL` 和 `APPROVE_OR_REJECT` 的具体决策表。例如：
- Cartooner：LOW 风险审批直接通过，HIGH 转 Kane
- Koder：收到解阻委派时按编码任务处理

决策表在各 Agent 本地 AGENTS.md 中维护，不在本文重复。

---

## 14. 代码修改边界

| 仓库 | 可否修改源码 | 允许的操作 |
|------|-------------|-----------|
| `cartooner/` | **可以** | 自由编辑代码、配置、文档 |
| `openclaw/` | **禁止** | 仅允许修改 `openclaw/openclaw.yaml` 配置文件，或使用 `openclaw` CLI 命令 |

- 禁止在本工作区直接修改 `openclaw/` 的任何源码文件
- 如需调整 OpenClaw 行为，优先通过 `openclaw.yaml` 配置或 Plugin SDK 扩展
- 如确实需要修改 OpenClaw 源码，应向上游仓库提交 PR

---

*本文件是唯一事实来源，任何 Agent 的本地规则不得与本文冲突。*
