#!/bin/bash
# 2X Doctor — diagnostic health check
# Usage: bash doctor.sh
# This is for debugging, NOT for users. The setup wizard handles everything automatically.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE="$HOME/.openclaw/workspace"

echo "🩺 2X Doctor"
echo ""

# --- 1. supabase.json ---
if [ -f "$SCRIPT_DIR/supabase.json" ]; then
  SUPA_URL=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('$SCRIPT_DIR/supabase.json','utf8')).url)")
  echo "✅ supabase.json: $SUPA_URL"
else
  echo "❌ supabase.json: MISSING"
fi

# --- 2. node_modules ---
if [ -f "$SCRIPT_DIR/node_modules/@supabase/supabase-js/package.json" ]; then
  echo "✅ node_modules: installed"
else
  echo "❌ node_modules: missing (setup wizard will install automatically)"
fi

# --- 3. Tables ---
if [ -n "$SUPA_URL" ]; then
  SUPA_KEY=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('$SCRIPT_DIR/supabase.json','utf8')).publishable_key)")
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "apikey: $SUPA_KEY" \
    "$SUPA_URL/rest/v1/sessions?limit=0")
  if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ database tables: exist"
  else
    echo "❌ database tables: not found (HTTP $HTTP_CODE)"
    echo "   → Run 001_create_tables.sql in Supabase SQL Editor"
  fi
fi

# --- 4. Auth ---
if [ -f "$WORKSPACE/2x-auth.json" ]; then
  AUTH_STATUS=$(node "$SCRIPT_DIR/client.js" auth status 2>&1 || true)
  if echo "$AUTH_STATUS" | grep -q '"ok":true'; then
    EMAIL=$(echo "$AUTH_STATUS" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).email || 'unknown')")
    echo "✅ auth: $EMAIL"
  else
    echo "⚠️  auth: token expired or invalid"
  fi
else
  echo "❌ auth: not logged in"
fi

# --- 5. Config ---
if [ -f "$WORKSPACE/2x-config.json" ]; then
  PLATFORMS=$(cat "$WORKSPACE/2x-config.json" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).platforms?.join(', ') || 'none')")
  echo "✅ config: platforms = $PLATFORMS"
else
  echo "❌ config: not set up yet"
fi

# --- 6. Sync daemon ---
if [ -f "$WORKSPACE/2x-sync.pid" ] && kill -0 "$(cat "$WORKSPACE/2x-sync.pid")" 2>/dev/null; then
  echo "✅ sync daemon: running (pid $(cat "$WORKSPACE/2x-sync.pid"))"
else
  echo "❌ sync daemon: not running"
fi

# --- 7. Sessions ---
SESSION_COUNT=$(ls -1d "$WORKSPACE/2x-sessions"/*/ 2>/dev/null | wc -l | tr -d ' ')
echo "📁 sessions: $SESSION_COUNT"

echo ""
echo "Done."
