---
name: hierarchical-acp-delegation
description: >
  通用分层 ACP 委派协议。定义 orchestrator → builder → qa 多级任务链的
  启动、澄清、终态、日志回收口径。监控协议见 references/monitoring.md。
---

# Hierarchical ACP Delegation

多级编码或创作委派链路的共享协议，例如：

- `Cartooner -> Koder -> Claude(builder) -> Codex(qa)`
- `Cartooner -> Mor -> Koder`

本 skill 只定义委派协议，不包含工作区私有路由细节。
监控相关协议（RuntimeEvent / watch_policy）见 [references/monitoring.md](references/monitoring.md)。

## 触发场景

- 需要把任务拆成父会话、负责人会话、执行子会话
- 需要统一 `sessions_spawn` / `sessions_send` / `sessions_history` 的协作口径

## 角色分层

- **orchestrator**: 理解需求、定义边界、验收、决定是否升级给用户
- **builder**: 实现交付、必要验证、输出可审查结果
- **qa**: 审查验收、必要修复、输出最终结论

默认回报链：`builder → qa → orchestrator`。只有 orchestrator 直接面对用户。

## 启动语义

- `sessions_spawn` 返回 `accepted` + `childSessionKey` 即视为已启动
- 默认 `mode: "run"` + `streamTo: "parent"`
- **`mode: "run"` 无 auto-announce**：父会话不会自动收到完成信号
- task prompt 必须要求 harness 将结果写入约定的结果文件，作为兜底验证

## 委派提示必须自包含

每次委派至少写清：
- 工作目录、目标与验收标准
- 允许/禁止的操作范围
- 当前 `task_id` + 结果文件路径
- 终态信号格式（引用 UMP 的 TerminalSignal）

## 澄清合同

- worker 默认先向 orchestrator 澄清，不直接面对用户
- 每次澄清回带同一个 `task_id`
- 最小格式：`missing_info` / `reason` / `blocked_step` / `tried`
- 只有缺外部事实、需求多义或涉及不可逆决策时才升级给用户

## 终态信号

遵循 UMP 的 TerminalSignal 定义（SSOT 在 `unified-messaging-protocol` skill）。

ACP 子会话额外要求：
- 附带 `ChildSessionKey` / `SessionKey`
- 必填 `ResultLocation`（结果文件路径）
- 缺少必填字段时终态无效，父会话必须要求补报

## 父会话验收

收到终态后不直接当作最终结果，而应：
1. 用 `childSessionKey` 定位子会话
2. 读取 `sessions_history` / 日志 / 产物
3. 自行检查后决定验收、返工或升级

## 运行时约束

- `sessions_spawn` 是 OpenClaw 主会话工具，ACP harness 内部可能不可用
- 第二跳由上层 orchestrator 发起，而非 builder 自行嵌套
- 对繁忙 ACP 会话的协调消息建议 `timeoutSeconds: 60`

## 去重主键

优先级：`childSessionKey` → `sessionKey` → `task_id` → `sessionId + action`

同一主键的同一终态只处理一次。
