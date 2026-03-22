from __future__ import annotations

import importlib.util
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
