---
name: 2x-collect
description: "Collects activity from configured sources, summarizes each independently, writes a local session index."
user-invocable: false
---

# 2X Collector

You collect raw activity data from the user's configured sources, summarize each source independently, and write a local session folder. You do NOT interpret, combine, or editorialize. You are a mechanical grabber + per-source summarizer.

---

## Step 1: Read Config

```bash
cat ~/.openclaw/workspace/2x-config.json
```

Check which sources are enabled: `sources.github.enabled`, `sources.chrome_history.enabled`. Session (chat) is always available — it's whatever the user has told you in the current conversation.

---

## Step 2: Create Session Folder

```bash
# Find next session number
LAST=$(ls -1 ~/.openclaw/workspace/2x-sessions/ 2>/dev/null | sort -n | tail -1)
NEXT=$((${LAST:-0} + 1))
mkdir -p ~/.openclaw/workspace/2x-sessions/$NEXT/sources
mkdir -p ~/.openclaw/workspace/2x-sessions/$NEXT/drafts
echo $NEXT
```

Store this number — it's the session ID for this entire run.

---

## Step 3: Collect Sources (one at a time)

For each enabled source, do TWO things:
1. **Grab** raw data via bash (mechanical, no LLM)
2. **Summarize** that source alone (read ONLY that source file, nothing else)

**CRITICAL: Process one source completely before starting the next. Never load two source files into context simultaneously.**

### GitHub (if enabled)

**Grab:**
```bash
# Read config values
GITHUB_USER=$(cat ~/.openclaw/workspace/2x-config.json | jq -r '.sources.github.username')
GITHUB_PAT=$(cat ~/.openclaw/workspace/2x.env 2>/dev/null | grep GITHUB_PAT | cut -d= -f2)

# Fetch recent events (last 24h worth)
curl -s -H "Authorization: token $GITHUB_PAT" \
  "https://api.github.com/users/$GITHUB_USER/events?per_page=50" \
  > ~/.openclaw/workspace/2x-sessions/$NEXT/sources/github-events.json
```

**Summarize** (read the file, produce 2-5 bullet points):
- Count commits per repo, mention repo names and brief commit message themes
- Note any PRs opened/merged
- Note any issues commented on
- Format: `"- 3 commits to chrome-devtools-mcp (CDP pooling, retry logic)"`
- Do NOT include commit hashes, file paths, or raw diffs
- Write summary to a variable, you'll use it in the index

### Chrome History (if enabled)

**Grab:**
```bash
CHROME_PATH=$(cat ~/.openclaw/workspace/2x-config.json | jq -r '.sources.chrome_history.path')

# Copy, query, delete copy immediately
cp "$CHROME_PATH" /tmp/2x_chrome_history
sqlite3 /tmp/2x_chrome_history \
  "SELECT title, url FROM urls \
   WHERE (last_visit_time/1000000)-11644473600 > $(date -v-12H +%s) \
   ORDER BY last_visit_time DESC LIMIT 50" \
  > ~/.openclaw/workspace/2x-sessions/$NEXT/sources/chrome-history.txt
rm /tmp/2x_chrome_history
```

**Summarize** (read the file, produce 2-5 bullet points):
- Group by topic, not individual pages. "~40min on browser fingerprinting (6 pages)"
- Estimate time by counting pages on similar topics
- Do NOT list individual URLs or page titles — topics only
- Do NOT include anything obviously personal (banking, email, social media feeds)
- Write summary to a variable

---

## Step 4: Write Index

Write `~/.openclaw/workspace/2x-sessions/$NEXT/index.md`:

```markdown
# 2X Session {NEXT}

## GitHub
{github summary bullets, or "(not enabled)" if source disabled}
→ [full data](./sources/github-events.json)

## Browsing
{chrome summary bullets, or "(not enabled)" if source disabled}
→ [full data](./sources/chrome-history.txt)

## User Input
(waiting)
```

---

## Step 5: Return to Orchestrator

Output ONLY the index content. Do not output raw source data. Do not editorialize or suggest post topics. Just the structured summary.

The orchestrator will present this to the user and handle conversation.

---

## Rules

- NEVER combine sources in one summary. Each source is its own section.
- NEVER show raw URLs, commit hashes, or file paths in summaries.
- NEVER include obviously private browsing (email, banking, medical, social feeds).
- NEVER suggest what to post about. That's the orchestrator's job.
- ALWAYS delete the Chrome History copy immediately after querying.
- If a source fails (API error, file not found), note it: "⚠ GitHub: API error (token may be expired)" and continue with other sources.
