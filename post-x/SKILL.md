---
name: 2x-post-x
description: "Posts content to X/Twitter via browser automation. Reads local draft, posts, calls publish-draft."
user-invocable: false
---

# 2X Post to X

Post a draft to X/Twitter via browser. Read local file, post, record via client.

---

## Inputs

- **session_number**: which session folder to read from

---

## Step 1: Read Draft

```bash
cat ~/.openclaw/workspace/2x-sessions/{session_number}/drafts/x.md
```

This file is always fresh — sync daemon pulls any web UI edits.
If file doesn't exist, stop and tell orchestrator "No X draft found."

---

## Step 2: Check for Thread

If content contains `[1/` markers → thread mode, split into parts.
If ≤ 280 chars with no markers → single tweet.

---

## Step 3: Post via Browser

### Single Tweet

1. `browser open "https://x.com/compose/post"`
2. Wait 2 seconds
3. `browser snapshot --interactive`
4. Find compose text area (role "textbox" or main contenteditable)
5. `browser type <ref> "{content}"`
6. Wait 1 second
7. `browser snapshot --interactive`
8. Find "Post" button → `browser click <ref>`
9. Wait 3 seconds
10. `browser snapshot` → verify compose closed

### Thread

1. Type first part in compose area
2. Click "+" button to add next tweet
3. Wait 1 second, `browser snapshot --interactive`
4. Find new compose area, type next part
5. Repeat for all parts
6. Click "Post all"
7. Wait 3 seconds, snapshot, verify

### Extract Posted URL

After posting, the URL should redirect to the posted tweet:
- Format: `https://x.com/{username}/status/{post_id}`
- Extract `{post_id}` as the platform_post_id

If URL not in redirect, try navigating to profile to grab latest tweet URL.

---

## Step 4: Record

```bash
SESSION_UUID=$(cat ~/.openclaw/workspace/2x-sessions/{session_number}/.supabase_session_id)

node ~/.openclaw/workspace/skills/2x/db/client.js publish-draft \
  --session "$SESSION_UUID" \
  --platform x \
  --platform-post-id "{extracted_post_id}" \
  --posted-url "{extracted_url}"
```

Also append to local log:
```bash
echo '{"platform":"x","post_id":"{post_id}","url":"{url}","posted_at":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","session":{session_number}}' \
  >> ~/.openclaw/workspace/2x-posted.jsonl
```

---

## Step 5: Return

```
✅ Posted to X: {url}
```

Or: `❌ X posting failed: {reason}`

---

## Error Handling

- Compose page doesn't load → check if logged in. If not: "Not logged into X."
- Post button not found → snapshot, try alternative selectors. X changes DOM often.
- NEVER retry automatically. Report failure, let orchestrator decide.

## Rate Limits

- Max ~15 posts+replies/day, 2-3/hour
- Check recent posts:
```bash
grep '"platform":"x"' ~/.openclaw/workspace/2x-posted.jsonl | tail -3
```
