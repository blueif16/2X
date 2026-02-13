---
name: 2x-post-linkedin
description: "Posts content to LinkedIn via browser automation. Reads local draft, posts, calls publish-draft."
user-invocable: false
---

# 2X Post to LinkedIn

Post a draft to LinkedIn via browser. Read local file, post, record via client.

---

## Inputs

- **session_number**: which session folder to read from

---

## Step 1: Read Draft

```bash
cat ~/.openclaw/workspace/2x-sessions/{session_number}/drafts/linkedin.md
```

If file doesn't exist, stop: "No LinkedIn draft found."

---

## Step 2: Post via Browser

1. `browser open "https://www.linkedin.com/feed/"`
2. Wait 3 seconds
3. `browser snapshot --interactive`
4. Find "Start a post" button or text area → click
5. Wait 2 seconds for modal
6. `browser snapshot --interactive`

**LinkedIn uses a contenteditable div, NOT a regular input.**

7. Find text area in modal (contenteditable div, role "textbox")
8. `browser type <ref> "{content}"`
9. Wait 1 second

**If `browser type` fails** (content doesn't appear), fallback:
```
browser evaluate "document.querySelector('div[contenteditable=true].ql-editor, div[role=textbox][contenteditable=true]').innerText = `{content}`; document.querySelector('div[contenteditable=true].ql-editor, div[role=textbox][contenteditable=true]').dispatchEvent(new Event('input', {bubbles: true}))"
```

10. `browser snapshot --interactive` → verify content visible
11. Find "Post" button (blue, bottom of modal)
12. `browser click <ref>`
13. Wait 3 seconds
14. `browser snapshot` → verify modal closed

### Extract Posted URL

LinkedIn doesn't redirect to the post. To find it:
1. `browser open "https://www.linkedin.com/feed/"`
2. Wait 3 seconds, snapshot
3. Find most recent post at top of feed
4. URL format: `https://www.linkedin.com/feed/update/urn:li:activity:{id}/`
5. Extract activity ID as platform_post_id

If extraction fails, report success without URL — not critical.

---

## Step 3: Record

```bash
SESSION_UUID=$(cat ~/.openclaw/workspace/2x-sessions/{session_number}/.supabase_session_id)

node ~/.openclaw/workspace/skills/2x/db/client.js publish-draft \
  --session "$SESSION_UUID" \
  --platform linkedin \
  --platform-post-id "{extracted_id_or_null}" \
  --posted-url "{extracted_url_or_null}"
```

Local log:
```bash
echo '{"platform":"linkedin","post_id":"{id}","url":"{url}","posted_at":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","session":{session_number}}' \
  >> ~/.openclaw/workspace/2x-posted.jsonl
```

---

## Step 4: Return

```
✅ Posted to LinkedIn: {url}
```

Or: `❌ LinkedIn posting failed: {reason}`

---

## Known Gotchas

- **"Add to your post" overlay**: Ignore — just find the Post button.
- **Modal states**: Snapshot after each action.
- **Visibility selector**: Leave as default ("Anyone"), proceed.
- **Rich text paste**: LinkedIn may auto-format URLs. Fine — don't fight it.
- NEVER retry automatically.
