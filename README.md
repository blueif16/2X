# 2X

**[中文](./README.zh-CN.md)** | English

Turn your daily work into social media posts. X, LinkedIn, Reddit.

---

## Why "2X"

The original idea was simple: two chances a day to put out something that genuinely represents your thinking. Not AI-generated slop copy-pasted onto some platform — real words that actually reflect what's in your head, words that have a chance of being recognized by others.

The name turned out to be fun to think about. To X? Two times? Double? Half the effort, twice the result? Honestly, after I named it, I kept finding new ways to read it. But at the end of the day, it's just an OpenClaw skill. Nothing earth-shattering. I just hope it solves the problem I have as its first user.

As a young person in the AI/vibe-coding era — and as a programmer who, if I'm being honest, believes he has more to offer than the world has noticed yet (just not ripe yet) — every day brings a flood of ideas. Small technical innovations. Projects built with real effort. If you asked me to write a grand essay about any single one, I'd freeze up. But letting these things quietly die the moment they're built? In an age where information is accelerating beyond anyone's imagination? That feels like a real loss. I think it's precisely these half-formed, not-quite-mature ideas that we need to address. If even one more person sees them, that's already fulfilling a small part of their lifecycle.

So 2X isn't about writing the perfect thought. It's about the real, day-by-day accumulation of genuine thinking — with the hope that someday it all comes together, blooms, and reaches more people.

The whole flow is simple:

Install the skill → pick your platforms (Reddit, X, LinkedIn, Xiaohongshu) → authenticate each one in the browser → choose what to monitor (for programmers: GitHub activity; for everyone: browser history, Claude chats — things you already spend hours on daily) → choose how many times a day and when to post (I recommend twice, obviously — it's in the name; too many and you stop caring, too few and you disappear; OpenClaw will nudge you at your chosen times and collect your activity from that window) → done.

Then there's a dry run just to get familiar → you type some thoughts → you go back and forth with the model until you're fully satisfied → OpenClaw generates platform-specific drafts internally, with a URL so you can watch each one take shape; after generation you can still edit on the web → hit publish → OpenClaw uses your browser to post to each platform → tells you it's done.

Every user also gets their own independent portal to monitor their data. On our platform, you can choose to make your notes public so others can read your content directly.

One last thing. I think the core message of this README is: if you have nothing to say, then maybe just say nothing. But if you have any independently formed thought at all — saying it out loud is always better than not. And in that process, I hope 2X can help.

PS: All the rest of the content is written by AI
---

## What this actually is

You do interesting work every day — committing code, reading papers, solving problems, having ideas in the shower. Most of it evaporates. Some of it deserves to exist outside your head.

2X is a writing partner that lives in [OpenClaw](https://openclaw.com). Twice a day (or whenever you want), it looks at what you've been up to, starts a conversation with you about it, and helps you shape your thinking into something worth posting. Then it handles the mechanical part — formatting for each platform, clicking buttons, posting.

That's it. It's not an autopilot. It doesn't post without you. It doesn't engage on your behalf. It doesn't optimize for reach. It's a 5-minute conversation that helps you think out loud, and then distributes the result.

## How a typical session works

You say `2x now` (or it pings you at noon).

```
Agent: Here's what I picked up:
       - GitHub: 3 commits to chrome-devtools-mcp (CDP pooling)
       - Browsing: ~40min on browser fingerprinting

       What feels most interesting to you right now?

You:   The pooling thing. I kept hitting connection limits and
       the fix was embarrassingly simple.

Agent: What was the fix?

You:   Just reusing the same CDP session instead of opening a new
       one per tab. Went from hitting the 10-connection wall to
       running 50+ tabs no problem.

Agent: Got it. Here are drafts:

       X:
       Was hitting Chrome's 10-connection CDP limit constantly.
       Fix: reuse sessions instead of opening new ones per tab.
       Went from crashing at 10 to running 50+ tabs clean.

       LinkedIn:
       Spent the morning debugging a connection limit in Chrome
       DevTools Protocol. Turns out I was opening a new CDP session
       per browser tab — Chrome caps you at 10.

       The fix was one of those "why didn't I do this from the start"
       moments: share a single session across tabs. Went from constant
       crashes to 50+ tabs running smooth.

       If you're building browser automation, check your connection
       pooling before you check everything else.

You:   Make the X one punchier. Skip Reddit today.

Agent: X:
       Opening a new CDP session per tab? Chrome kills you at 10.
       Reuse one session → 50+ tabs, zero crashes.

You:   Ship it.

Agent: ✅ Posted to X: https://x.com/you/status/123
       ✅ Posted to LinkedIn: https://linkedin.com/feed/update/456
       ⏭ Reddit: skipped
```

The conversation IS the product. The 3 minutes where you figured out what mattered about your work — that's the value. The posts are just distribution.

---

## Architecture

There are two halves to 2X: **local** (your machine, your data) and **cloud** (Supabase, only what you approve). They're connected by a sync daemon that bridges them, but the privacy boundary between them is hard and intentional.

```
┌──────────────────────────────────────────────────────────────────┐
│                        YOUR MACHINE (local)                      │
│                                                                  │
│  ┌─────────┐   ┌──────────┐   ┌────────────┐   ┌────────────┐  │
│  │ Collect  │──▶│ Converse │──▶│   Draft    │──▶│   Post     │  │
│  │          │   │          │   │            │   │            │  │
│  │ GitHub   │   │ You + AI │   │ Write local│   │ Browser    │  │
│  │ Chrome   │   │ back and │   │ .md files  │   │ automation │  │
│  │ Chat     │   │ forth    │   │            │   │            │  │
│  └─────────┘   └──────────┘   └─────┬──────┘   └────────────┘  │
│       │                              │                           │
│       │  never leaves                │  only after you say       │
│       │  your machine                │  "looks good"             │
│       ▼                              ▼                           │
│  2x-sessions/                   sync daemon                      │
│  └─ 1/                         (fs.watch + poll)                 │
│     ├─ sources/  ← raw data         │                            │
│     ├─ drafts/   ← your words       │                            │
│     └─ index.md  ← summary          │                            │
└──────────────────────────────────────┼───────────────────────────┘
                                       │
                              ─────────┼─────────
                              PRIVACY BOUNDARY
                              ─────────┼─────────
                                       │
┌──────────────────────────────────────┼───────────────────────────┐
│                     SUPABASE (cloud)  │                           │
│                                       ▼                           │
│  ┌────────────┐   ┌────────────┐   ┌────────────┐               │
│  │  sessions  │   │   drafts   │   │   posts    │               │
│  │            │   │            │   │            │               │
│  │ grouping   │   │ your       │   │ published  │               │
│  │ key only   │   │ approved   │   │ content +  │               │
│  │            │   │ words only │   │ engagement │               │
│  └────────────┘   └────────────┘   └────────────┘               │
│                                                                  │
│  RLS: every row scoped to auth.uid() = user_id                  │
│  Auth: GitHub OAuth (your GitHub identity)                       │
│  Key: publishable key only (safe, no server secrets)             │
└──────────────────────────────────────────────────────────────────┘
```

### The skill tree

```
2x/
├── SKILL.md              ← orchestrator: runs the whole flow
├── setup/SKILL.md        ← onboarding wizard (runs once)
├── collect/SKILL.md      ← grabs activity from your sources
├── draft/SKILL.md        ← generates one draft per platform
├── post-x/SKILL.md       ← browser automation for X/Twitter
├── post-linkedin/SKILL.md← browser automation for LinkedIn
├── post-reddit/SKILL.md  ← browser automation for Reddit
└── db/
    ├── 001_create_tables.sql  ← Supabase schema
    ├── client.js              ← CLI for auth + session management
    ├── sync.js                ← two-way sync daemon
    └── package.json
```

You invoke `2x` (or it triggers via cron). The orchestrator calls the sub-skills in order. You never call sub-skills directly.

### The sync model

The agent writes draft files to your local filesystem. The sync daemon watches those files and pushes them to Supabase. If you edit a draft in a web UI, the daemon polls Supabase every 5 seconds and pulls changes back to local files. Last-write-wins. Loop prevention via a 3-second cooldown on files the daemon itself wrote.

The agent doesn't talk to Supabase directly for drafts. It just edits local `.md` files. The daemon is the bridge.

---

## Let's talk about privacy

I know. "It reads your browser history" sounds terrifying. I'd close the tab too. So let me be very specific about what happens and what doesn't.

### What the collector actually does

**GitHub**: Calls the GitHub API with your PAT (read-only, which you generate yourself). Fetches your recent events — commits, PRs, issues. Saves raw JSON locally. Summarizes it as "3 commits to repo-name about topic." The summary goes to the conversation. The raw JSON stays on your machine. Forever.

**Chrome History**: Copies your Chrome History SQLite file to `/tmp`, queries the last 12 hours of page titles and URLs, deletes the copy immediately. Summarizes it as "~40 min researching browser fingerprinting (6 pages)." No individual URLs. No page titles. Just topic clusters. And here's the thing — the collector is instructed to actively ignore obviously private browsing: banking, email, medical, social feeds. It only keeps things related to work topics you'd plausibly want to post about.

**Chat session**: Whatever you tell the agent in conversation. This is always on — it's just... talking.

### What goes to the cloud (Supabase)

Three things, and only three things:

1. **Sessions** — a row with a number and a status (`drafting`, `ready`, `posted`). That's it. No content.
2. **Drafts** — the words you wrote (or approved) during the conversation. These are YOUR words that YOU said "looks good" to.
3. **Posts** — the published content + the URL where it went live + engagement metrics (likes, replies, etc.) for analytics later.

That's the full list. Your GitHub events, your browsing history, the conversation where you figured out what to say, your half-baked ideas that didn't make the cut — none of that ever leaves your machine.

### The moment of consent

Nothing crosses the privacy boundary until you've had a conversation about it. The flow is:

1. Collector grabs raw data → **stays local**
2. You and the agent talk about what's interesting → **stays local**
3. Agent generates drafts → written to local files first
4. You edit, iterate, say "looks good" → **only now** does the sync daemon push to Supabase
5. You say "post it" → browser automation posts to the platform

Step 4 is the consent moment. Before that, Supabase doesn't know you exist today. After that, it only knows the words you approved.

### So why have a cloud at all?

Fair question. If everything important stays local, why bother with Supabase?

Honestly — just for a better UI. Editing markdown files in a terminal or telegram works, but it's not great. Having your drafts in Supabase means we can build a clean web editor where you tweak your X post and LinkedIn draft side by side, see your edit history, and preview how things will look before posting. It also means you can check in on your posted content and engagement numbers from any browser without SSH-ing into your machine.

That's it. The cloud is a convenience layer for editing and viewing. The brain — collection, conversation, decision-making — stays on your machine. If Supabase went down tomorrow, you'd still have every draft and every post as local files. The cloud makes the experience nicer. It's not the source of truth.

### The database is yours

Every table has Row Level Security: `auth.uid() = user_id`. Your data is invisible to every other user. Auth is GitHub OAuth — no new passwords, no Supabase accounts to manage. The publishable key in the code is safe to be public (it can't bypass RLS — that's the whole point of Supabase's publishable keys).

### Bring Your Own Key (BYOK)

2X runs on OpenClaw. The LLM calls that power the conversation, the drafting, the summarization — those use YOUR API key, configured in YOUR OpenClaw instance. There's no 2X server sitting in the middle reading your conversations. The agent runs locally. The LLM calls go directly from your machine to your provider.

### What if you don't want collectors at all?

Then don't enable them. During setup, when it asks about data sources, say `skip`. The only source will be your chat session — meaning the agent works purely from what you tell it. No GitHub snooping, no browser history, nothing. Just you saying "hey, I built this cool thing today, help me post about it."

The collectors are opt-in. Every single one. The default is nothing.

---

## Setup

First time you say `2x`, the setup wizard walks you through everything:

1. Pick your platforms (X, LinkedIn, Reddit — any combination)
2. Log into each one in the browser (agent verifies, then moves on)
3. Optionally enable GitHub and/or Chrome History collection
4. Set your posting schedule (default: noon + 8pm your local time)
5. Paste 2-3 posts you've written before that felt like you (optional — helps voice matching)
6. Auth with Supabase via GitHub OAuth
7. Dry run to verify everything connects

Takes about 2 minutes. After that, it's just `2x now` or wait for the cron ping.

---

## What 2X is not

**Not a scheduler.** There's no queue of pre-written posts waiting to go out. Every post comes from a live conversation.

**Not an engagement bot.** No auto-likes, auto-follows, auto-replies to other people's content. 2X helps you create, not manipulate.

**Not an analytics tool.** It stores engagement data for potential future use, but there's no dashboard, no A/B testing, no follower tracking. (Yet — Phase 4.)

**Not an autopilot.** It literally cannot post without you being in the conversation and saying some version of "go." If you don't respond to the cron ping, nothing happens. If you say "skip," it skips. If there's nothing worth saying, it tells you so and moves on.

---

## How the pieces connect (for the curious)

### Orchestrator (`SKILL.md`)

The brain. When you say `2x now`:

1. Checks config exists (runs setup if not)
2. Checks auth status
3. Starts sync daemon if it's not running
4. Calls `collect` → gets activity summary
5. Presents summary, has a conversation with you
6. Creates a cloud session via `client.js create-session`
7. Calls `draft` once per platform with your core idea
8. Shows you all drafts, you iterate
9. Calls `post-x`, `post-linkedin`, `post-reddit` for approved platforms
10. Marks session as posted

### Collector (`collect/SKILL.md`)

Grabs raw data from each source via bash (no LLM). Summarizes each source independently (one at a time, never mixing). Writes a local session folder with an `index.md` summary and raw data in `sources/`. Returns the summary to the orchestrator. Never suggests what to post — that's the orchestrator's job after talking to you.

### Draft (`draft/SKILL.md`)

Takes one platform + your core idea. Loads your voice samples if they exist. Generates a single draft following platform-specific rules (280 chars for X, professional narrative for LinkedIn, genuinely helpful reply for Reddit). Writes to a local `.md` file. Sync daemon handles the rest.

### Posting skills (`post-x/`, `post-linkedin/`, `post-reddit/`)

Browser automation via OpenClaw's built-in browser. Each skill reads the local draft file, navigates to the platform, types the content, clicks Post, extracts the posted URL, and records it via `client.js publish-draft`. If something breaks, it reports the error — never retries automatically.

### Sync daemon (`db/sync.js`)

Background process. Watches local draft files with `fs.watch`, pushes changes to Supabase on file change. Polls Supabase every 5 seconds for changes made elsewhere (e.g., a future web UI). Conflict resolution is last-write-wins comparing `mtime` vs `updated_at`. Loop prevention tracks files it recently wrote and ignores watcher events for 3 seconds.

### Client CLI (`db/client.js`)

Five commands: `auth login`, `auth status`, `create-session`, `publish-draft`, `update-session`. Handles the structural Supabase operations that the sync daemon doesn't cover. All output is JSON for easy parsing by the agent.

---

## File map

| File | Where | What it knows |
|---|---|---|
| `2x-config.json` | Local | Your platforms, schedule, source preferences, subreddits |
| `2x-auth.json` | Local | Supabase access/refresh tokens |
| `2x.env` | Local | GitHub PAT |
| `2x-posted.jsonl` | Local | Log of every post (for dedup within a day) |
| `2x-voice-samples/` | Local | Your reference posts for voice matching |
| `2x-sessions/{n}/sources/` | Local | Raw collector data (GitHub JSON, Chrome titles) |
| `2x-sessions/{n}/index.md` | Local | Per-session activity summary |
| `2x-sessions/{n}/drafts/*.md` | Local → Cloud | Your approved drafts (sync'd to Supabase) |
| Supabase `sessions` | Cloud | Session number + status. No content. |
| Supabase `drafts` | Cloud | Your approved draft text, per platform |
| Supabase `posts` | Cloud | Published content + URL + engagement |

The arrow in "Local → Cloud" is the privacy boundary. Everything above it stays on your machine. Everything at or below it is content you explicitly approved.

---

## Current status

**Phase 1** ✅ — Skill structure + onboarding wizard
**Phase 2** ✅ — Collection, drafting, posting, Supabase sync
**Phase 3** 🔜 — Testing + integration (run the SQL, wire up auth, end-to-end flow)
**Phase 4** — Web UI for draft editing, cron triggers, style learning, engagement tracking

---

## License

Part of the [OpenClaw](https://openclaw.com) ecosystem.
