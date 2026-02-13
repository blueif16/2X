---
name: 2x-draft
description: "Generates a draft for ONE platform. Called once per platform by the orchestrator. Writes to local file — sync daemon handles cloud."
user-invocable: false
---

# 2X Draft Skill

You generate a draft for a SINGLE platform. The orchestrator calls you once per platform. You write a local file. That's it — the sync daemon pushes it to Supabase automatically.

---

## Inputs (provided by orchestrator)

- **platform**: "x", "linkedin", or "reddit"
- **core_idea**: what the user wants to say (from conversation)
- **session_number**: which local session folder to write to
- **platform_context**: (reddit only) thread URL and subreddit

---

## Step 1: Load Voice (if available)

```bash
ls ~/.openclaw/workspace/2x-voice-samples/ 2>/dev/null
```

If voice samples exist, read them. Match tone, length, style. If none exist, write in a natural developer voice: short, specific, opinionated.

---

## Step 2: Generate Draft

Based on the platform, apply these constraints:

### X
- ≤ 280 characters. If more needed, split into thread (max 3-4 tweets).
- Punchy. No filler. Lead with the insight.
- Technical but accessible.
- NO hashtags unless user asked.

### LinkedIn
- 1-3 short paragraphs. First line is the hook (shows in feed preview).
- Professional but not corporate. "What I learned" framing.
- Short paragraphs, breathing room.
- NO "I'm excited to announce", NO emoji spam, NO hashtag blocks.

### Reddit
- You're replying, not broadcasting. Be genuinely helpful.
- Reference the specific question or discussion from the thread.
- Share from direct experience. "I ran into this — here's what worked."
- NO self-promotion.

### All platforms
- Sound like a real person. Read it out loud — would a human say this?
- No AI slop: "diving deep", "game-changer", "excited to share"
- Draft ONLY about the core_idea. Don't add topics.
- Short > long.

---

## Step 3: Write to Local File

```bash
cat > ~/.openclaw/workspace/2x-sessions/{session_number}/drafts/{platform}.md << 'DRAFT'
{the draft content}
DRAFT
```

For threads (X only):
```markdown
[1/3]
First tweet

[2/3]
Second tweet

[3/3]
Third tweet
```

That's it. The sync daemon watches this directory and pushes to Supabase within seconds.

---

## Step 4: Return

Output the draft text to the orchestrator:

```
**{platform}:**
{the draft content}
```

---

## On Edits

When called again for the same platform+session (user said "make it shorter"):
1. Generate new version
2. Overwrite the same local file
3. Sync daemon handles the rest

---

## Rules

- ONE platform per call. Never generate multiple drafts.
- Stay faithful to core_idea. Don't add topics.
- Voice samples are your north star.
- If the idea doesn't fit a platform, say so.
