# ACP 监控协议（RuntimeEvent + watch_policy）

本文件定义执行方如何声明监控需求，以及 heartbeat-monitor 的消费规则。
详细运行纪律见 `workspace-heartbeat/HEARTBEAT.md`。

## RuntimeEvent

任务需要监控时，执行方在启动时发送：

```text
task_id: <stable task_id>
status: started
summary: <任务摘要>
eta: <预计完成时间>
phase: <可选，当前阶段>
watch_policy: <可选，见下方>
```

### 状态枚举

`started` → `running` → `waiting_reply` → `delayed` → `stalled` → `completed | failed`

### watch_policy 结构

未声明等价于 `mode: normal`（常规观测）。需要高频监控时：

```text
mode: fast
interval: 1m
duration: <预估时长，必填>
reason: critical_acp_child_task | cross_agent_waiting | external_io_risk | approval_wait | user_requested_watch
```

可选扩展：
- `feishu_report: true` — 允许 heartbeat 将显著变化同步到飞书群
- `escalation: koder | mor` — 允许 heartbeat 在阻塞时委派解阻任务

这两个字段必须由执行方显式声明，heartbeat 不反向猜测。

## heartbeat 消费规则

- 有 RuntimeEvent 且在 ETA 内 → 静默
- 接近 ETA 未完成 → 轻量提醒
- 超 ETA 无进展 → 诊断 + 告警（sessions_send + 飞书）
- 等待审批/进程退出 → 立即告警
- 正常完成/失败 → 不广播

## 飞书群侧摘要模板

巡检：
```text
🔍 [ACP巡检]
task_id: <task_id>
状态: <status>
摘要: <summary>
```

阻塞升级（需声明 `escalation`）：
```text
🚨 [ACP阻塞]
task_id: <task_id>
原因: <diagnosis>
处理: 正在委派 <target> 介入
```
