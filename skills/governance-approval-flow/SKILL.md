---
name: governance-approval-flow
description: Deterministic helpers for Warden governance approvals. Use this when capability-evolver needs to create a governance approval ticket, when Cartooner sees a Feishu reply like `批准 <approval_id>` / `拒绝 <approval_id> <原因>`, or when Warden receives an `ApprovalResult` and must update the ledger plus prepare the next dispatch.
---

# Governance Approval Flow

## Overview

This skill turns the governance approval chain into a deterministic workflow instead of manual ledger editing. It gives Warden and Cartooner one shared script for readiness checks, ticket creation, human-reply parsing, ledger updates, and approved-task dispatch templates.

## When To Use

- Warden is about to run `capability-evolver` in review-only mode.
- Warden found a governance change and needs a canonical `approval_id` plus a single Feishu approval message.
- Cartooner receives a human reply in the governance group that looks like `批准 <approval_id>` or `拒绝 <approval_id> <原因>`.
- Warden receives a UMP `ApprovalResult` from Cartooner and must update `memory/pending-approvals.json`.
- Warden needs the next `sessions_send` payload for Koder / Mor after approval.

## Shared Script

Use:

```bash
uv run /Users/k/coding/.openclaw/workspace/skills/governance-approval-flow/scripts/governance_approval_flow.py <subcommand> ...
```

Subcommands:

- `check-readiness`
  - Checks the approval ledger and required env vars like `A2A_NODE_ID`.
  - Writes a local `last_run` record and returns `ready` or `blocked`.
- `list-tickets`
  - Lists ledger tickets with optional status and age filters.
  - Useful for checking whether stale `pending` approvals are accumulating.
- `create-ticket`
  - Creates a pending ticket in Warden's ledger.
  - Returns `approval_id`, stored ticket fields, and the exact Feishu approval message to send.
  - If an equivalent pending proposal already exists, it reuses the existing `approval_id` instead of creating a duplicate ticket.
- `parse-reply`
  - Parses `批准 ...` / `拒绝 ...` human replies.
  - Verifies the `approval_id` exists and is still pending.
  - Returns the canonical UMP `ApprovalResult` message that Cartooner should forward to Warden.
- `apply-ump-result`
  - Parses the raw `ApprovalResult` UMP text that Warden receives from Cartooner.
  - Updates the ledger idempotently.
  - Returns either a `sessions_send` dispatch payload for Koder / Mor or a local-governance next step for Warden.
- `mark-dispatch`
  - Marks an approved ticket as `completed` or `dispatch_failed` after Warden finishes the next action.
  - Repeating the same final status is idempotent; attempting to flip from one final status to the other is rejected.
- `expire-ticket`
  - Marks a still-pending ticket as `expired`.
  - Useful for cleaning up abandoned rehearsal tickets without hand-editing the ledger.
- `expire-stale`
  - Finds `pending` tickets older than a threshold and expires them in batch.
  - Supports `--dry-run` for preview-only cleanup.

## Warden Workflow

1. Run `check-readiness --require-env A2A_NODE_ID`.
2. If blocked, stop quietly.
3. If evolver proposes governance changes, run `create-ticket` with summary, risk, owner, reason, and proposed changes.
4. Send the returned `approval_message` to Feishu using `accountId=cartooner`.
5. When Cartooner forwards an `ApprovalResult`, run `apply-ump-result --text "<raw message>"`.
6. If the result includes `dispatch.kind = sessions_send`, send `dispatch.task_request_message` to `dispatch.target_session_key`.
7. After successful dispatch or local governance completion, run `mark-dispatch --status completed`.
8. If the dispatch itself fails, run `mark-dispatch --status dispatch_failed --reason "<原因>"` once and keep the final state unchanged afterward.
9. If a rehearsal or approval attempt is abandoned before any human decision, run `expire-ticket --approval-id <approval_id>`.
10. If multiple old `pending` tickets accumulate, preview them with `list-tickets --status pending --older-than-minutes <N>` and batch clean them with `expire-stale --older-than-minutes <N>`.

## Cartooner Workflow

1. When the human message matches `批准 ...` or `拒绝 ...`, run `parse-reply --text "<raw human text>"`.
2. If the script returns `status=invalid`, do not forward anything; explain the expected format briefly.
3. If valid, send the returned `ump_message` to `agent:warden:main` with `sessions_send`.
4. Do not reinterpret the decision, re-score risk, or perform governance work locally.

## Ledger Contract

The script owns `/Users/k/coding/.openclaw/workspace-warden/memory/pending-approvals.json`.

Per-ticket fields:

- `approval_id`
- `status`
- `created_at`
- `updated_at`
- `summary`
- `risk_level`
- `recommended_owner`
- `reason`
- `proposed_changes`
- `source_agent`
- `source_session`
- `channel`
- `group_id`
- `decision_reason`
- `operator_name`
- `message_id`
- `dispatch`

Do not hand-edit the ledger unless the script itself is broken.
