#!/usr/bin/env bash
# 非中文音频转文字 — Whisper large-v3
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: bash transcribe_whisper.sh <audio_file>" >&2
  exit 1
fi

AUDIO_FILE="$1"
if [ ! -f "$AUDIO_FILE" ]; then
  echo "Error: file not found: $AUDIO_FILE" >&2
  exit 1
fi
BASENAME="$(basename "${AUDIO_FILE%.*}")"
OUTPUT_DIR="/tmp/whisper_output"

whisper "$AUDIO_FILE" \
  --model large-v3 \
  --output_format txt \
  --output_dir "$OUTPUT_DIR" \
  --verbose False

cat "$OUTPUT_DIR/${BASENAME}.txt"
