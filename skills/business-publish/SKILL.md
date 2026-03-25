---
name: business-publish
description: >
  业务层统一发布 skill。当 Mor、Koder、Scout 等需要把已验收产物投递到
  飞书消息/文档/多维表格等外部渠道时使用。
---

# Business Publish

统一承接"已通过验收的产物如何安全投递到外部渠道"。

## 何时使用

- 业务层 agent 需要把**已批准产物**发送到飞书消息、文档、多维表格或其他已配置渠道

## 不适用

- 主会话给用户的自然语言回复
- heartbeat 告警 / 催办
- Warden 治理审批广播
- 未通过验收的中间产物

## 输入前提

- `task_id`
- 发布主体（哪个 agent）
- 产物路径或内容摘要
- 目标渠道 / 群 / 文档 / 表
- 是否 `dry_run`
- 是否已获人类批准或预先授权

## 标准流程

1. 确认是**外部交付**，不是用户窗口回复
2. 确认产物已通过委派方验收
3. 命中法律/合规风险时，先走 `enterprise-legal-guardrails`
4. 根据目标类型选择底层 skill：
   - 消息分发：`feishu-messaging`
   - 文档发布：`feishu-doc-manager`
   - 表格写入：`feishu-bitable`
5. 执行前优先 `dry_run`
6. 发布完成后回传 TerminalSignal（定义见 UMP skill），`summary` 中带上 delivery 结果和链接

## 边界

- 外部发布属于高风险动作，无授权时先确认
- 本 skill 只负责交付封装与投递，不替上游 agent 重写内容
- 渠道失败必须返回结构化失败信号

## 可执行入口

- `scripts/publish_hotspot_feishu_assets.ts`：热点/研究类结果的飞书文档 + 多维表格发布 helper
- 后续新增发布适配器应放在 `scripts/` 中
