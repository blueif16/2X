---
name: 2x-post-reddit
description: "Posts or replies on Reddit via browser automation. Reads local draft, posts, calls publish-draft."
user-invocable: false
---

# 2X Post to Reddit

Post or reply on Reddit via browser. Two modes: reply to thread (primary) or new post.

---

## Inputs

- **session_number**: which session folder to read from
- **thread_url**: (reply mode) URL of thread to reply to
- **subreddit**: (new post mode) target subreddit

---

## Step 1: Read Draft

```bash
cat ~/.openclaw/workspace/2x-sessions/{session_number}/drafts/reddit.md
```

If file doesn't exist, stop: "No Reddit draft found."

---

## Step 2: Determine Mode

- If `thread_url` provided → reply mode
- If only `subreddit` provided → new post mode

---

## Mode A: Reply to Thread

1. `browser open "{thread_url}"`
2. Wait 3 seconds
3. `browser snapshot --interactive`
4. Find comment input area (textbox or contenteditable near top of comments)
5. Click to focus
6. Wait 1 second
7. `browser snapshot --interactive`
8. `browser type <ref> "{content}"`
9. Wait 1 second
10. `browser snapshot --interactive` → verify text visible
11. Find "Comment" submit button
12. `browser click <ref>`
13. Wait 3 seconds
14. `browser snapshot` → verify comment appeared

### Extract Comment URL

Find your comment in the page. Reddit comment URLs: `{thread_url}/comment/{comment_id}/`

---

## Mode B: New Post

1. `browser open "https://www.reddit.com/r/{subreddit}/submit"`
2. Wait 3 seconds
3. `browser snapshot --interactive`
4. Find title input → `browser type <ref> "{title}"`
   - Title = first line of draft, or from platform_context
5. Find body text area → `browser type <ref> "{body}"`
6. Wait 1 second
7. `browser snapshot --interactive` → verify
8. Find "Post" / "Submit" button → click
9. Wait 3 seconds → should redirect to new post

---

## Step 3: Record

```bash
SESSION_UUID=$(cat ~/.openclaw/workspace/2x-sessions/{session_number}/.supabase_session_id)

node ~/.openclaw/workspace/skills/2x/db/client.js publish-draft \
  --session "$SESSION_UUID" \
  --platform reddit \
  --platform-post-id "{extracted_id}" \
  --posted-url "{extracted_url}"
```

Local log:
```bash
echo '{"platform":"reddit","post_id":"{id}","url":"{url}","subreddit":"{subreddit}","posted_at":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","session":{session_number}}' \
  >> ~/.openclaw/workspace/2x-posted.jsonl
```

---

## Step 4: Return

```
✅ Posted to Reddit (r/{subreddit}): {url}
```

Or: `❌ Reddit posting failed: {reason}`

---

## Known Gotchas

- **Always use www.reddit.com** (new Reddit), not old.reddit.com.
- **Markdown mode**: If formatting breaks, look for "Markdown Mode" toggle, click first.
- **Login wall**: Reddit shows login prompts aggressively. If modal appears, not authenticated.
- **Rate limits**: New accounts ~1 post per 10 min. Established accounts higher.
- **Subreddit rules**: Some require flair, minimum karma, account age.
- **Locked threads**: If comment box not found, thread may be locked.
- NEVER retry automatically.
