#!/bin/bash
# publish_web_vps.sh — Upload file to VPS, print public URL.
# Usage: bash publish_web_vps.sh <local_file> <tenant_id> [slug]
# See business-publish/SKILL.md for full docs.

set -euo pipefail

LOCAL_FILE="$1"
TENANT_ID="$2"
SLUG="${3:-}"

VPS_HOST="${VPS_HOST:-vps}"
VPS_WEB_ROOT="${VPS_WEB_ROOT:-/var/www/canvas}"
VPS_PUBLIC_IP="${VPS_PUBLIC_IP:-150.158.38.145}"

# --- 校验 ---
if [[ ! -f "$LOCAL_FILE" ]]; then
  echo "❌ 文件不存在: $LOCAL_FILE" >&2
  exit 1
fi

if [[ -z "$TENANT_ID" ]]; then
  echo "❌ 缺少 tenant_id 参数" >&2
  exit 1
fi

# --- 确定远端文件名 ---
BASENAME="$(basename "$LOCAL_FILE")"
EXT="${BASENAME##*.}"
if [[ -n "$SLUG" ]]; then
  REMOTE_NAME="${SLUG}.${EXT}"
else
  REMOTE_NAME="$BASENAME"
fi

REMOTE_DIR="${VPS_WEB_ROOT}/${TENANT_ID}"
REMOTE_PATH="${REMOTE_DIR}/${REMOTE_NAME}"

# --- 创建目录 + 上传 ---
ssh "$VPS_HOST" "mkdir -p ${REMOTE_DIR}"
scp -q "$LOCAL_FILE" "${VPS_HOST}:${REMOTE_PATH}"
ssh "$VPS_HOST" "chmod 644 ${REMOTE_PATH}"

# --- 输出结果 ---
PUBLIC_URL="http://${VPS_PUBLIC_IP}/${TENANT_ID}/${REMOTE_NAME}"

echo "✅ 已发布"
echo "   租户: ${TENANT_ID}"
echo "   路径: ${REMOTE_PATH}"
echo "   URL:  ${PUBLIC_URL}"

# 输出纯 URL 到 stdout 最后一行，方便调用方 capture
echo "${PUBLIC_URL}"
