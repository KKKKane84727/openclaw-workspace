from __future__ import annotations

import importlib.util
import json
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "governance_approval_flow.py"
SPEC = importlib.util.spec_from_file_location("governance_approval_flow", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC is not None and SPEC.loader is not None
SPEC.loader.exec_module(MODULE)

def call_command(tmp_path: Path, *args: str) -> dict:
    import contextlib
    import io
    import json

    ledger_path = tmp_path / "pending-approvals.json"
    stdout = io.StringIO()
    with contextlib.redirect_stdout(stdout):
        exit_code = MODULE.main(["--ledger-path", str(ledger_path), *args])
    assert exit_code == 0
    return json.loads(stdout.getvalue())


def rewrite_ticket_timestamps(tmp_path: Path, approval_id: str, *, created_at: str, updated_at: str) -> None:
    ledger_path = tmp_path / "pending-approvals.json"
    ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
    for ticket in ledger["tickets"]:
        if ticket["approval_id"] == approval_id:
            ticket["created_at"] = created_at
            ticket["updated_at"] = updated_at
    ledger_path.write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_ticket(tmp_path: Path, approval_id: str) -> dict:
    ledger_path = tmp_path / "pending-approvals.json"
    ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
    for ticket in ledger["tickets"]:
        if ticket["approval_id"] == approval_id:
            return ticket
    raise AssertionError(f"ticket not found: {approval_id}")


def test_check_readiness_blocks_when_required_env_missing(tmp_path, monkeypatch):
    monkeypatch.delenv("A2A_NODE_ID", raising=False)
    result = call_command(tmp_path, "check-readiness", "--require-env", "A2A_NODE_ID")

    assert result["status"] == "blocked"
    assert result["missing_env"] == ["A2A_NODE_ID"]


def test_create_ticket_and_parse_approval_reply(tmp_path):
    created = call_command(
        tmp_path,
        "create-ticket",
        "--summary",
        "更新 Warden 治理提示",
        "--risk-level",
        "medium",
        "--recommended-owner",
        "koder",
        "--reason",
        "需要补齐稳定的审批中继",
        "--proposed-change",
        "新增治理审批 skill",
    )

    approval_id = created["approval_id"]
    parsed = call_command(tmp_path, "parse-reply", "--text", f"批准 {approval_id}")

    assert parsed["status"] == "ok"
    assert parsed["approval_id"] == approval_id
    assert parsed["decision"] == "APPROVED"
    assert "Type: ApprovalResult" in parsed["ump_message"]


def test_parse_reply_reject_requires_reason(tmp_path):
    created = call_command(
        tmp_path,
        "create-ticket",
        "--summary",
        "更新协议",
        "--risk-level",
        "low",
        "--recommended-owner",
        "warden",
        "--reason",
        "补充协议字段",
    )

    result = call_command(tmp_path, "parse-reply", "--text", f"拒绝 {created['approval_id']}")

    assert result["status"] == "invalid"
    assert result["error_code"] == "missing_reject_reason"


def test_apply_ump_result_updates_ledger_and_dispatches(tmp_path):
    created = call_command(
        tmp_path,
        "create-ticket",
        "--summary",
        "委派 Koder 落地治理脚本",
        "--risk-level",
        "high",
        "--recommended-owner",
        "koder",
        "--reason",
        "需要代码实现",
        "--proposed-change",
        "新增脚本",
    )
    approval_id = created["approval_id"]
    parsed = call_command(tmp_path, "parse-reply", "--text", f"批准 {approval_id}")
    applied = call_command(tmp_path, "apply-ump-result", "--text", parsed["ump_message"])

    assert applied["status"] == "approved"
    assert applied["dispatch"]["kind"] == "sessions_send"
    assert applied["dispatch"]["target_session_key"] == "agent:koder:main"
    assert approval_id in applied["dispatch"]["task_request_message"]


def test_apply_ump_result_is_idempotent_after_terminal_state(tmp_path):
    created = call_command(
        tmp_path,
        "create-ticket",
        "--summary",
        "本地治理动作",
        "--risk-level",
        "medium",
        "--recommended-owner",
        "warden",
        "--reason",
        "只改规则文件",
    )
    approval_id = created["approval_id"]
    parsed = call_command(tmp_path, "parse-reply", "--text", f"拒绝 {approval_id} 风险过高")

    first = call_command(tmp_path, "apply-ump-result", "--text", parsed["ump_message"])
    second = call_command(tmp_path, "apply-ump-result", "--text", parsed["ump_message"])

    assert first["status"] == "rejected"
    assert second["status"] == "idempotent"
    assert second["ticket_status"] == "rejected"


def test_full_approved_lifecycle_marks_completed_and_stays_idempotent(tmp_path):
    created = call_command(
        tmp_path,
        "create-ticket",
        "--summary",
        "委派 Koder 落地批准提案",
        "--risk-level",
        "medium",
        "--recommended-owner",
        "koder",
        "--reason",
        "需要完成治理实施",
        "--proposed-change",
        "补齐审批流",
    )

    approval_id = created["approval_id"]
    parsed = call_command(tmp_path, "parse-reply", "--text", f"批准 {approval_id}")
    applied = call_command(tmp_path, "apply-ump-result", "--text", parsed["ump_message"])
    completed = call_command(
        tmp_path,
        "mark-dispatch",
        "--approval-id",
        approval_id,
        "--status",
        "completed",
        "--reason",
        "Koder 已完成治理任务",
    )
    repeated = call_command(
        tmp_path,
        "mark-dispatch",
        "--approval-id",
        approval_id,
        "--status",
        "completed",
    )

    assert applied["status"] == "approved"
    assert completed["status"] == "completed"
    assert completed["ticket"]["dispatch"]["final_status"] == "completed"
    assert repeated["status"] == "idempotent"
    assert repeated["ticket_status"] == "completed"


def test_mark_dispatch_rejects_conflicting_terminal_state(tmp_path):
    created = call_command(
        tmp_path,
        "create-ticket",
        "--summary",
        "委派 Mor 产出治理资产",
        "--risk-level",
        "medium",
        "--recommended-owner",
        "mor",
        "--reason",
        "需要创意资产",
    )

    approval_id = created["approval_id"]
    parsed = call_command(tmp_path, "parse-reply", "--text", f"批准 {approval_id}")
    call_command(tmp_path, "apply-ump-result", "--text", parsed["ump_message"])
    call_command(
        tmp_path,
        "mark-dispatch",
        "--approval-id",
        approval_id,
        "--status",
        "dispatch_failed",
        "--reason",
        "Mor 当前不可用",
    )
    conflicting = call_command(
        tmp_path,
        "mark-dispatch",
        "--approval-id",
        approval_id,
        "--status",
        "completed",
    )

    assert conflicting["status"] == "invalid"
    assert conflicting["error_code"] == "dispatch_already_finalized"


def test_apply_ump_result_returns_local_governance_for_warden_owner(tmp_path):
    created = call_command(
        tmp_path,
        "create-ticket",
        "--summary",
        "仅调整治理文档",
        "--risk-level",
        "low",
        "--recommended-owner",
        "warden",
        "--reason",
        "只涉及本地治理规则",
    )

    approval_id = created["approval_id"]
    parsed = call_command(tmp_path, "parse-reply", "--text", f"批准 {approval_id}")
    applied = call_command(tmp_path, "apply-ump-result", "--text", parsed["ump_message"])

    assert applied["status"] == "approved"
    assert applied["dispatch"]["kind"] == "local_governance"


def test_parse_reply_supports_multiline_reject_reason(tmp_path):
    created = call_command(
        tmp_path,
        "create-ticket",
        "--summary",
        "变更协议字段",
        "--risk-level",
        "high",
        "--recommended-owner",
        "warden",
        "--reason",
        "需要更严格审批",
    )

    result = call_command(
        tmp_path,
        "parse-reply",
        "--text",
        f"拒绝 {created['approval_id']} 风险过高\n需要先补审计记录",
    )

    assert result["status"] == "ok"
    assert result["decision"] == "REJECTED"
    assert "需要先补审计记录" in result["reason"]


def test_create_ticket_reuses_equivalent_pending_ticket(tmp_path):
    first = call_command(
        tmp_path,
        "create-ticket",
        "--summary",
        "重复治理提案",
        "--risk-level",
        "medium",
        "--recommended-owner",
        "koder",
        "--reason",
        "避免重复审批轰炸",
        "--proposed-change",
        "新增治理脚本",
    )
    second = call_command(
        tmp_path,
        "create-ticket",
        "--summary",
        "重复治理提案",
        "--risk-level",
        "medium",
        "--recommended-owner",
        "koder",
        "--reason",
        "避免重复审批轰炸",
        "--proposed-change",
        "新增治理脚本",
    )

    assert first["status"] == "created"
    assert second["status"] == "existing"
    assert second["approval_id"] == first["approval_id"]


def test_expire_ticket_marks_pending_ticket_expired(tmp_path):
    created = call_command(
        tmp_path,
        "create-ticket",
        "--summary",
        "待清理的演练票据",
        "--risk-level",
        "low",
        "--recommended-owner",
        "warden",
        "--reason",
        "演练后需要关闭",
    )

    expired = call_command(
        tmp_path,
        "expire-ticket",
        "--approval-id",
        created["approval_id"],
        "--reason",
        "演练结束",
    )
    repeated = call_command(
        tmp_path,
        "expire-ticket",
        "--approval-id",
        created["approval_id"],
    )

    assert expired["status"] == "expired"
    assert expired["ticket"]["status"] == "expired"
    assert expired["ticket"]["decision_reason"] == "演练结束"
    assert repeated["status"] == "idempotent"


def test_expire_ticket_rejects_non_pending_ticket(tmp_path):
    created = call_command(
        tmp_path,
        "create-ticket",
        "--summary",
        "已批准票据",
        "--risk-level",
        "medium",
        "--recommended-owner",
        "warden",
        "--reason",
        "验证非 pending 拒绝",
    )
    parsed = call_command(tmp_path, "parse-reply", "--text", f"批准 {created['approval_id']}")
    call_command(tmp_path, "apply-ump-result", "--text", parsed["ump_message"])

    result = call_command(
        tmp_path,
        "expire-ticket",
        "--approval-id",
        created["approval_id"],
    )

    assert result["status"] == "invalid"
    assert result["error_code"] == "invalid_ticket_state"


def test_list_tickets_filters_stale_pending(tmp_path):
    old_ticket = call_command(
        tmp_path,
        "create-ticket",
        "--summary",
        "旧挂单",
        "--risk-level",
        "low",
        "--recommended-owner",
        "warden",
        "--reason",
        "等待超时清理",
    )
    fresh_ticket = call_command(
        tmp_path,
        "create-ticket",
        "--summary",
        "新挂单",
        "--risk-level",
        "low",
        "--recommended-owner",
        "warden",
        "--reason",
        "最近创建",
    )
    rewrite_ticket_timestamps(
        tmp_path,
        old_ticket["approval_id"],
        created_at="2026-03-20T00:00:00Z",
        updated_at="2026-03-20T00:00:00Z",
    )

    result = call_command(
        tmp_path,
        "list-tickets",
        "--status",
        "pending",
        "--older-than-minutes",
        "60",
    )

    assert result["status"] == "ok"
    assert any(item["approval_id"] == old_ticket["approval_id"] for item in result["matches"])
    assert all(item["approval_id"] != fresh_ticket["approval_id"] for item in result["matches"])


def test_expire_stale_dry_run_does_not_mutate_ledger(tmp_path):
    created = call_command(
        tmp_path,
        "create-ticket",
        "--summary",
        "仅预览过期",
        "--risk-level",
        "medium",
        "--recommended-owner",
        "warden",
        "--reason",
        "验证 dry-run",
    )
    rewrite_ticket_timestamps(
        tmp_path,
        created["approval_id"],
        created_at="2026-03-20T00:00:00Z",
        updated_at="2026-03-20T00:00:00Z",
    )

    preview = call_command(
        tmp_path,
        "expire-stale",
        "--older-than-minutes",
        "60",
        "--dry-run",
    )
    status = read_ticket(tmp_path, created["approval_id"])

    assert preview["status"] == "dry_run"
    assert preview["matched_count"] == 1
    assert status["status"] == "pending"


def test_expire_stale_marks_matching_pending_tickets_expired(tmp_path):
    stale_ticket = call_command(
        tmp_path,
        "create-ticket",
        "--summary",
        "应过期挂单",
        "--risk-level",
        "high",
        "--recommended-owner",
        "koder",
        "--reason",
        "长时间无人处理",
    )
    fresh_ticket = call_command(
        tmp_path,
        "create-ticket",
        "--summary",
        "保留挂单",
        "--risk-level",
        "high",
        "--recommended-owner",
        "koder",
        "--reason",
        "不应过期",
    )
    rewrite_ticket_timestamps(
        tmp_path,
        stale_ticket["approval_id"],
        created_at="2026-03-20T00:00:00Z",
        updated_at="2026-03-20T00:00:00Z",
    )

    expired = call_command(
        tmp_path,
        "expire-stale",
        "--older-than-minutes",
        "60",
        "--reason",
        "批量清理超时挂单",
    )
    stale_status = read_ticket(tmp_path, stale_ticket["approval_id"])
    fresh_status = read_ticket(tmp_path, fresh_ticket["approval_id"])

    assert expired["status"] == "expired"
    assert expired["matched_count"] == 1
    assert stale_status["status"] == "expired"
    assert stale_status["decision_reason"] == "批量清理超时挂单"
    assert fresh_status["status"] == "pending"
