#!/usr/bin/env bash
# 2X Reset — wipe all config, sessions, and state so setup wizard runs fresh
set -euo pipefail

BASE="$HOME/.openclaw/workspace"

# Kill sync daemon if running
if [ -f "$BASE/2x-sync.pid" ]; then
  kill "$(cat "$BASE/2x-sync.pid")" 2>/dev/null || true
  rm -f "$BASE/2x-sync.pid"
fi

# Config & auth
rm -f "$BASE/2x-config.json"
rm -f "$BASE/2x.env"
rm -f "$BASE/2x-auth.json"

# Session data
rm -rf "$BASE/2x-sessions"
rm -rf "$BASE/2x-voice-samples"
rm -f "$BASE/2x-posted.jsonl"

# Cron (best-effort)
if command -v openclaw &>/dev/null; then
  openclaw cron remove --name "2x-noon" 2>/dev/null || true
  openclaw cron remove --name "2x-evening" 2>/dev/null || true
fi

echo "2x reset complete. Next '2x now' will start setup wizard."
