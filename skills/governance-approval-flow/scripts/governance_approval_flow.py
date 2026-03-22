# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Optional


DEFAULT_LEDGER_PATH = Path("/Users/k/coding/.openclaw/workspace-warden/memory/pending-approvals.json")
DEFAULT_TARGET_ACCOUNT = "cartooner"
DEFAULT_TARGET_GROUP = "oc_5006225a09c968e88b01f66903fa1162"
DEFAULT_FORWARD_SESSION_KEY = "agent:warden:main"
DEFAULT_REPLY_TO_SESSION_KEY = "agent:warden:main"
RECOMMENDED_OWNER_TO_SESSION = {
    "koder": "agent:koder:main",
    "mor": "agent:mor:main",
}
TICKET_STATUSES = {"pending", "approved", "rejected", "completed", "dispatch_failed", "expired"}
FINAL_DISPATCH_STATUSES = {"completed", "dispatch_failed"}
APPROVE_RE = re.compile(r"^\s*批准\s+([A-Za-z0-9][\w.-]*)(?:\s+(.+?))?\s*$", re.DOTALL)
REJECT_RE = re.compile(r"^\s*拒绝\s+([A-Za-z0-9][\w.-]*)(?:\s+(.+?))?\s*$", re.DOTALL)


class LedgerError(Exception):
    pass


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def build_default_ledger() -> Dict[str, Any]:
    return {
        "version": 1,
        "owner": "warden",
        "target_account": DEFAULT_TARGET_ACCOUNT,
        "target_group": DEFAULT_TARGET_GROUP,
        "updated_at": None,
        "last_run": None,
        "tickets": [],
    }


def normalize_status(value: Any) -> str:
    normalized = str(value or "").strip().lower() or "pending"
    if normalized not in TICKET_STATUSES:
        raise LedgerError(f"Unsupported ticket status: {value}")
    return normalized


def load_ledger(path: Path) -> Dict[str, Any]:
    if not path.exists():
        data = build_default_ledger()
        save_ledger(path, data)
        return data

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise LedgerError(f"Invalid ledger JSON: {exc}") from exc

    if not isinstance(data, dict):
        raise LedgerError("Ledger root must be a JSON object")

    tickets = data.get("tickets")
    if tickets is None:
        tickets = []
    if not isinstance(tickets, list):
        raise LedgerError("Ledger 'tickets' must be a list")

    normalized = build_default_ledger()
    normalized["version"] = data.get("version", 1)
    normalized["owner"] = str(data.get("owner") or "warden")
    normalized["target_account"] = str(data.get("target_account") or DEFAULT_TARGET_ACCOUNT)
    normalized["target_group"] = str(data.get("target_group") or DEFAULT_TARGET_GROUP)
    normalized["updated_at"] = data.get("updated_at")
    normalized["last_run"] = data.get("last_run")
    normalized["tickets"] = []

    for raw_ticket in tickets:
        if not isinstance(raw_ticket, dict):
            continue
        ticket = dict(raw_ticket)
        approval_id = str(ticket.get("approval_id") or "").strip()
        if not approval_id:
            continue
        ticket["approval_id"] = approval_id
        ticket["status"] = normalize_status(ticket.get("status"))
        ticket["summary"] = str(ticket.get("summary") or "").strip()
        ticket["risk_level"] = str(ticket.get("risk_level") or "medium").strip().lower() or "medium"
        ticket["recommended_owner"] = str(ticket.get("recommended_owner") or "warden").strip().lower() or "warden"
        proposed_changes = ticket.get("proposed_changes")
        if isinstance(proposed_changes, list):
            ticket["proposed_changes"] = [str(item).strip() for item in proposed_changes if str(item).strip()]
        else:
            ticket["proposed_changes"] = []
        ticket["reason"] = str(ticket.get("reason") or "").strip()
        ticket["source_agent"] = str(ticket.get("source_agent") or "capability-evolver").strip()
        ticket["source_session"] = str(ticket.get("source_session") or "").strip() or None
        ticket["channel"] = str(ticket.get("channel") or "feishu").strip()
        ticket["group_id"] = str(ticket.get("group_id") or normalized["target_group"]).strip()
        ticket["created_at"] = str(ticket.get("created_at") or "").strip() or None
        ticket["updated_at"] = str(ticket.get("updated_at") or "").strip() or None
        ticket["decided_at"] = str(ticket.get("decided_at") or "").strip() or None
        ticket["decision_reason"] = str(ticket.get("decision_reason") or "").strip() or None
        ticket["operator_name"] = str(ticket.get("operator_name") or "").strip() or None
        ticket["message_id"] = str(ticket.get("message_id") or "").strip() or None
        dispatch = ticket.get("dispatch")
        ticket["dispatch"] = dispatch if isinstance(dispatch, dict) else None
        normalized["tickets"].append(ticket)

    return normalized


def save_ledger(path: Path, data: Dict[str, Any]) -> None:
    ensure_parent(path)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def find_ticket(ledger: Dict[str, Any], approval_id: str) -> Optional[Dict[str, Any]]:
    for ticket in ledger.get("tickets", []):
        if str(ticket.get("approval_id") or "").strip() == approval_id:
            return ticket
    return None


def ticket_signature(ticket: Dict[str, Any]) -> str:
    payload = {
        "summary": str(ticket.get("summary") or "").strip(),
        "risk_level": str(ticket.get("risk_level") or "").strip().lower(),
        "recommended_owner": str(ticket.get("recommended_owner") or "").strip().lower(),
        "reason": str(ticket.get("reason") or "").strip(),
        "proposed_changes": sorted(str(item).strip() for item in (ticket.get("proposed_changes") or []) if str(item).strip()),
        "source_agent": str(ticket.get("source_agent") or "").strip(),
        "channel": str(ticket.get("channel") or "").strip(),
        "group_id": str(ticket.get("group_id") or "").strip(),
    }
    return json.dumps(payload, ensure_ascii=False, sort_keys=True)


def find_equivalent_pending_ticket(ledger: Dict[str, Any], candidate: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    candidate_signature = ticket_signature(candidate)
    for ticket in ledger.get("tickets", []):
        if ticket.get("status") != "pending":
            continue
        if ticket_signature(ticket) == candidate_signature:
            return ticket
    return None


def update_last_run(
    ledger: Dict[str, Any],
    *,
    status: str,
    reason: Optional[str] = None,
    missing_env: Optional[Iterable[str]] = None,
) -> None:
    ledger["updated_at"] = now_iso()
    ledger["last_run"] = {
        "status": status,
        "reason": str(reason or "").strip() or None,
        "missing_env": [str(item) for item in (missing_env or []) if str(item).strip()],
        "updated_at": ledger["updated_at"],
    }


def print_json(payload: Dict[str, Any]) -> int:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    return 0


def build_approval_id() -> str:
    local_now = datetime.now()
    return f"evolver-{local_now.strftime('%Y%m%d-%H%M')}-{uuid.uuid4().hex[:4]}"


def render_approval_message(ticket: Dict[str, Any]) -> str:
    lines = [
        "🛡️ [治理审批请求]",
        f"approval_id: {ticket['approval_id']}",
        f"摘要: {ticket['summary']}",
        f"风险等级: {ticket['risk_level']}",
        f"建议执行方: {ticket['recommended_owner']}",
        "",
        "如批准，请回复：",
        f"批准 {ticket['approval_id']}",
        "",
        "如拒绝，请回复：",
        f"拒绝 {ticket['approval_id']} <原因>",
    ]
    return "\n".join(lines)


def render_approval_result_message(
    *,
    approval_id: str,
    decision: str,
    reason: str,
    operator_name: Optional[str],
    channel: Optional[str],
    group_id: Optional[str],
    message_id: Optional[str],
) -> str:
    payload_lines = [
        f"ApprovalId: {approval_id}",
        f"Decision: {decision}",
        f"Reason: {reason}",
    ]
    optional_fields = (
        ("OperatorName", operator_name),
        ("Channel", channel),
        ("GroupId", group_id),
        ("MessageId", message_id),
        ("DecidedAt", now_iso()),
    )
    for key, value in optional_fields:
        if isinstance(value, str) and value.strip():
            payload_lines.append(f"{key}: {value.strip()}")
    return "\n".join(
        [
            "Type: ApprovalResult",
            "From: cartooner",
            "To: warden",
            f"TaskId: {approval_id}",
            "---",
            *payload_lines,
        ]
    )


def parse_human_reply(text: str) -> Dict[str, Optional[str]]:
    raw = str(text or "")
    approve_match = APPROVE_RE.match(raw)
    if approve_match:
        approval_id = approve_match.group(1).strip()
        reason = (approve_match.group(2) or "").strip() or "Kane 群内批准"
        return {
            "matched": "true",
            "approval_id": approval_id,
            "decision": "APPROVED",
            "reason": reason,
        }

    reject_match = REJECT_RE.match(raw)
    if reject_match:
        approval_id = reject_match.group(1).strip()
        reason = (reject_match.group(2) or "").strip()
        if not reason:
            return {
                "matched": "false",
                "error_code": "missing_reject_reason",
                "message": "拒绝审批时必须附带原因，格式为：拒绝 <approval_id> <原因>",
            }
        return {
            "matched": "true",
            "approval_id": approval_id,
            "decision": "REJECTED",
            "reason": reason,
        }

    return {
        "matched": "false",
        "error_code": "invalid_reply_format",
        "message": "审批回复格式无效，应为：批准 <approval_id> 或 拒绝 <approval_id> <原因>",
    }


def unwrap_block(text: str) -> str:
    stripped = text.strip()
    if not stripped.startswith("```") or not stripped.endswith("```"):
        return stripped
    lines = stripped.splitlines()
    if len(lines) < 3:
        return stripped
    if not lines[0].startswith("```") or lines[-1].strip() != "```":
        return stripped
    return "\n".join(lines[1:-1]).strip()


def parse_ump_message(text: str) -> Dict[str, Dict[str, str]]:
    unwrapped = unwrap_block(str(text or ""))
    if not unwrapped:
        return {"headers": {}, "payload": {}}

    header_part, payload_part = unwrapped, ""
    if "\n---\n" in unwrapped:
        header_part, payload_part = unwrapped.split("\n---\n", 1)
    elif "\n---" in unwrapped:
        header_part, payload_part = unwrapped.split("\n---", 1)

    def parse_fields(block: str) -> Dict[str, str]:
        fields: Dict[str, str] = {}
        for raw_line in block.splitlines():
            if ":" not in raw_line:
                continue
            key, value = raw_line.split(":", 1)
            normalized_key = re.sub(r"[^a-z0-9]+", "_", key.strip().lower()).strip("_")
            if normalized_key:
                fields[normalized_key] = value.strip()
        return fields

    return {
        "headers": parse_fields(header_part),
        "payload": parse_fields(payload_part),
    }


def render_dispatch_task_request(ticket: Dict[str, Any]) -> Optional[Dict[str, str]]:
    owner = str(ticket.get("recommended_owner") or "warden").strip().lower()
    if owner not in RECOMMENDED_OWNER_TO_SESSION:
        return None

    target_session_key = RECOMMENDED_OWNER_TO_SESSION[owner]
    target_agent = owner
    change_lines = ticket.get("proposed_changes") or []
    proposed_changes = "\n".join(f"- {item}" for item in change_lines) if change_lines else "- 无额外变更清单"
    prefix = "[Governance→Koder]" if owner == "koder" else "[Governance→Mor]"
    task_message = "\n".join(
        [
            "Type: TaskRequest",
            "From: warden",
            f"To: {target_agent}",
            f"ReplyTo: {DEFAULT_REPLY_TO_SESSION_KEY}",
            f"TaskId: {ticket['approval_id']}",
            "---",
            prefix,
            "Objective: 落地已批准的治理提案",
            f"Summary: {ticket['summary']}",
            f"RiskLevel: {ticket['risk_level']}",
            f"Reason: {ticket['reason']}",
            "ProposedChanges:",
            proposed_changes,
            "Acceptance:",
            "- 仅实施 approval_id 对应的已批准范围",
            "- 完成后用 TaskResult 回复 Warden",
        ]
    )
    return {
        "kind": "sessions_send",
        "target_session_key": target_session_key,
        "task_request_message": task_message,
    }


def invalid_result(message: str, *, error_code: str) -> Dict[str, Any]:
    return {
        "status": "invalid",
        "error_code": error_code,
        "message": message,
    }


def cmd_check_readiness(args: argparse.Namespace) -> int:
    ledger_path = Path(args.ledger_path)
    ledger = load_ledger(ledger_path)
    missing = [name for name in args.require_env if not os.getenv(name)]
    if missing:
        update_last_run(
            ledger,
            status="blocked",
            reason="Missing required environment variables",
            missing_env=missing,
        )
        save_ledger(ledger_path, ledger)
        return print_json(
            {
                "status": "blocked",
                "ledger_path": str(ledger_path),
                "missing_env": missing,
                "pending_count": sum(1 for ticket in ledger["tickets"] if ticket["status"] == "pending"),
            }
        )

    update_last_run(ledger, status="ready")
    save_ledger(ledger_path, ledger)
    return print_json(
        {
            "status": "ready",
            "ledger_path": str(ledger_path),
            "pending_count": sum(1 for ticket in ledger["tickets"] if ticket["status"] == "pending"),
        }
    )


def cmd_create_ticket(args: argparse.Namespace) -> int:
    ledger_path = Path(args.ledger_path)
    ledger = load_ledger(ledger_path)
    base_ticket = {
        "summary": args.summary.strip(),
        "risk_level": args.risk_level,
        "recommended_owner": args.recommended_owner,
        "proposed_changes": [item.strip() for item in args.proposed_change if item.strip()],
        "reason": args.reason.strip(),
        "source_agent": args.source_agent.strip(),
        "source_session": args.source_session.strip() or None,
        "channel": args.channel.strip(),
        "group_id": args.group_id.strip(),
    }
    existing_ticket = find_equivalent_pending_ticket(ledger, base_ticket)
    if existing_ticket is not None:
        update_last_run(ledger, status="ticket_existing", reason=str(existing_ticket["approval_id"]))
        save_ledger(ledger_path, ledger)
        return print_json(
            {
                "status": "existing",
                "ledger_path": str(ledger_path),
                "approval_id": str(existing_ticket["approval_id"]),
                "ticket": existing_ticket,
                "approval_message": render_approval_message(existing_ticket),
            }
        )

    approval_id = build_approval_id()
    created_at = now_iso()
    ticket = {
        "approval_id": approval_id,
        "status": "pending",
        "created_at": created_at,
        "updated_at": created_at,
        **base_ticket,
        "decided_at": None,
        "decision_reason": None,
        "operator_name": None,
        "message_id": None,
        "dispatch": None,
    }
    ledger["tickets"].append(ticket)
    update_last_run(ledger, status="ticket_created", reason=approval_id)
    save_ledger(ledger_path, ledger)
    return print_json(
        {
            "status": "created",
            "ledger_path": str(ledger_path),
            "approval_id": approval_id,
            "ticket": ticket,
            "approval_message": render_approval_message(ticket),
        }
    )


def cmd_parse_reply(args: argparse.Namespace) -> int:
    ledger_path = Path(args.ledger_path)
    ledger = load_ledger(ledger_path)
    parsed = parse_human_reply(args.text)
    if parsed.get("matched") != "true":
        return print_json(
            {
                "status": "invalid",
                "error_code": parsed.get("error_code") or "invalid_reply_format",
                "message": parsed.get("message") or "审批回复格式无效",
            }
        )

    approval_id = str(parsed["approval_id"])
    ticket = find_ticket(ledger, approval_id)
    if ticket is None:
        return print_json(
            invalid_result(
                f"审批单不存在：{approval_id}",
                error_code="unknown_approval_id",
            )
        )
    if ticket["status"] != "pending":
        return print_json(
            invalid_result(
                f"审批单当前状态为 {ticket['status']}，不能重复处理：{approval_id}",
                error_code="approval_not_pending",
            )
        )

    operator_name = args.operator_name.strip() or None
    channel = args.channel.strip() or ticket.get("channel")
    group_id = args.group_id.strip() or ticket.get("group_id")
    message_id = args.message_id.strip() or None
    return print_json(
        {
            "status": "ok",
            "approval_id": approval_id,
            "decision": parsed["decision"],
            "reason": parsed["reason"],
            "target_session_key": DEFAULT_FORWARD_SESSION_KEY,
            "ump_message": render_approval_result_message(
                approval_id=approval_id,
                decision=str(parsed["decision"]),
                reason=str(parsed["reason"]),
                operator_name=operator_name,
                channel=str(channel) if channel else None,
                group_id=str(group_id) if group_id else None,
                message_id=message_id,
            ),
        }
    )


def cmd_apply_ump_result(args: argparse.Namespace) -> int:
    ledger_path = Path(args.ledger_path)
    ledger = load_ledger(ledger_path)
    parsed = parse_ump_message(args.text)
    headers = parsed["headers"]
    payload = parsed["payload"]
    if headers.get("type", "").lower() != "approvalresult":
        return print_json(invalid_result("UMP 类型不是 ApprovalResult", error_code="invalid_type"))

    approval_id = str(payload.get("approvalid") or payload.get("approval_id") or headers.get("taskid") or "").strip()
    if not approval_id:
        return print_json(invalid_result("缺少 ApprovalId", error_code="missing_approval_id"))

    decision = str(payload.get("decision") or "").strip().upper()
    if decision not in {"APPROVED", "REJECTED"}:
        return print_json(invalid_result("Decision 必须是 APPROVED 或 REJECTED", error_code="invalid_decision"))

    reason = str(payload.get("reason") or "").strip()
    if not reason:
        return print_json(invalid_result("ApprovalResult 缺少 Reason", error_code="missing_reason"))

    ticket = find_ticket(ledger, approval_id)
    if ticket is None:
        return print_json(
            invalid_result(
                f"审批单不存在：{approval_id}",
                error_code="unknown_approval_id",
            )
        )

    if ticket["status"] != "pending":
        return print_json(
            {
                "status": "idempotent",
                "approval_id": approval_id,
                "ticket_status": ticket["status"],
                "ticket": ticket,
            }
        )

    ticket["status"] = "approved" if decision == "APPROVED" else "rejected"
    ticket["updated_at"] = now_iso()
    ticket["decided_at"] = str(payload.get("decidedat") or payload.get("decided_at") or ticket["updated_at"]).strip()
    ticket["decision_reason"] = reason
    ticket["operator_name"] = str(payload.get("operatorname") or payload.get("operator_name") or "").strip() or None
    ticket["channel"] = str(payload.get("channel") or ticket.get("channel") or "feishu").strip()
    ticket["group_id"] = str(payload.get("groupid") or payload.get("group_id") or ticket.get("group_id") or "").strip()
    ticket["message_id"] = str(payload.get("messageid") or payload.get("message_id") or "").strip() or None

    dispatch: Optional[Dict[str, str]]
    if decision == "APPROVED":
        dispatch = render_dispatch_task_request(ticket)
        if dispatch is None:
            dispatch = {
                "kind": "local_governance",
                "note": "Warden 应在本地执行治理动作，然后调用 mark-dispatch --status completed。",
            }
    else:
        dispatch = {"kind": "none", "note": "审批已拒绝，不执行后续治理动作。"}
    ticket["dispatch"] = dispatch

    update_last_run(ledger, status=ticket["status"], reason=approval_id)
    save_ledger(ledger_path, ledger)
    return print_json(
        {
            "status": ticket["status"],
            "approval_id": approval_id,
            "ticket": ticket,
            "dispatch": dispatch,
        }
    )


def cmd_mark_dispatch(args: argparse.Namespace) -> int:
    ledger_path = Path(args.ledger_path)
    ledger = load_ledger(ledger_path)
    ticket = find_ticket(ledger, args.approval_id.strip())
    if ticket is None:
        return print_json(
            invalid_result(
                f"审批单不存在：{args.approval_id}",
                error_code="unknown_approval_id",
            )
        )
    if ticket["status"] not in {"approved", "completed", "dispatch_failed"}:
        return print_json(
            invalid_result(
                f"当前票据状态为 {ticket['status']}，不能标记派发结果",
                error_code="invalid_ticket_state",
            )
        )

    if ticket["status"] in FINAL_DISPATCH_STATUSES:
        if ticket["status"] == args.status:
            return print_json(
                {
                    "status": "idempotent",
                    "approval_id": ticket["approval_id"],
                    "ticket_status": ticket["status"],
                    "ticket": ticket,
                }
            )
        return print_json(
            invalid_result(
                f"审批单已进入终态 {ticket['status']}，不能再改为 {args.status}",
                error_code="dispatch_already_finalized",
            )
        )

    ticket["status"] = args.status
    ticket["updated_at"] = now_iso()
    ticket["dispatch"] = {
        **(ticket.get("dispatch") or {}),
        "final_status": args.status,
        "final_reason": args.reason.strip() or None,
        "finalized_at": ticket["updated_at"],
    }
    update_last_run(ledger, status=args.status, reason=ticket["approval_id"])
    save_ledger(ledger_path, ledger)
    return print_json(
        {
            "status": args.status,
            "approval_id": ticket["approval_id"],
            "ticket": ticket,
        }
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Deterministic helpers for Warden governance approvals")
    parser.add_argument(
        "--ledger-path",
        default=str(DEFAULT_LEDGER_PATH),
        help="Path to pending-approvals.json",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    check_parser = subparsers.add_parser("check-readiness")
    check_parser.add_argument("--require-env", action="append", default=[], help="Required env var name")
    check_parser.set_defaults(func=cmd_check_readiness)

    create_parser = subparsers.add_parser("create-ticket")
    create_parser.add_argument("--summary", required=True)
    create_parser.add_argument("--risk-level", required=True, choices=["low", "medium", "high"])
    create_parser.add_argument("--recommended-owner", required=True, choices=["warden", "koder", "mor"])
    create_parser.add_argument("--reason", required=True)
    create_parser.add_argument("--proposed-change", action="append", default=[])
    create_parser.add_argument("--source-agent", default="capability-evolver")
    create_parser.add_argument("--source-session", default="")
    create_parser.add_argument("--channel", default="feishu")
    create_parser.add_argument("--group-id", default=DEFAULT_TARGET_GROUP)
    create_parser.set_defaults(func=cmd_create_ticket)

    parse_reply_parser = subparsers.add_parser("parse-reply")
    parse_reply_parser.add_argument("--text", required=True)
    parse_reply_parser.add_argument("--operator-name", default="Kane")
    parse_reply_parser.add_argument("--channel", default="feishu")
    parse_reply_parser.add_argument("--group-id", default=DEFAULT_TARGET_GROUP)
    parse_reply_parser.add_argument("--message-id", default="")
    parse_reply_parser.set_defaults(func=cmd_parse_reply)

    apply_result_parser = subparsers.add_parser("apply-ump-result")
    apply_result_parser.add_argument("--text", required=True)
    apply_result_parser.set_defaults(func=cmd_apply_ump_result)

    mark_dispatch_parser = subparsers.add_parser("mark-dispatch")
    mark_dispatch_parser.add_argument("--approval-id", required=True)
    mark_dispatch_parser.add_argument("--status", required=True, choices=["completed", "dispatch_failed"])
    mark_dispatch_parser.add_argument("--reason", default="")
    mark_dispatch_parser.set_defaults(func=cmd_mark_dispatch)

    return parser


def main(argv: Optional[list[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.func(args))
    except LedgerError as exc:
        return print_json({"status": "error", "message": str(exc), "error_code": "ledger_error"})


if __name__ == "__main__":
    raise SystemExit(main())
