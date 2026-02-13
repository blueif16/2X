-- 2X Schema — Cloud (Supabase)
-- Multi-user with RLS. Publishable key is public in repo.
-- Each user only sees their own data via auth.uid().

-- Sessions: grouping key for drafts.
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_number int not null default 1,
  created_at timestamptz not null default now(),
  status text not null default 'drafting'
    check (status in ('drafting', 'ready', 'posted'))
);

-- Drafts: one per platform per session.
create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  platform text not null,
  content text not null default '',

  version int not null default 1,
  last_edited_by text not null default 'agent'
    check (last_edited_by in ('agent', 'user')),

  platform_context jsonb not null default '{}',

  unique (session_id, platform)
);

-- Posts: published content + analytics.
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  draft_id uuid references drafts(id) on delete set null,
  session_id uuid references sessions(id) on delete set null,
  created_at timestamptz not null default now(),

  platform text not null,
  platform_post_id text,
  posted_url text,
  content text not null,

  char_count int,
  is_thread boolean not null default false,

  platform_metadata jsonb not null default '{}',

  engagement jsonb not null default '{}',
  engagement_synced_at timestamptz,

  unique (platform, platform_post_id)
);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger drafts_updated_at
  before update on drafts
  for each row execute function update_updated_at();

-- Indexes
create index if not exists idx_sessions_user on sessions(user_id);
create index if not exists idx_drafts_session on drafts(session_id);
create index if not exists idx_drafts_user on drafts(user_id);
create index if not exists idx_posts_session on posts(session_id);
create index if not exists idx_posts_user on posts(user_id);
create index if not exists idx_posts_created on posts(created_at desc);

-- ============================================================
-- RLS: each user only sees/modifies their own rows
-- ============================================================

alter table sessions enable row level security;
alter table drafts enable row level security;
alter table posts enable row level security;

-- Sessions
create policy "Users see own sessions"
  on sessions for select
  using (auth.uid() = user_id);

create policy "Users create own sessions"
  on sessions for insert
  with check (auth.uid() = user_id);

create policy "Users update own sessions"
  on sessions for update
  using (auth.uid() = user_id);

create policy "Users delete own sessions"
  on sessions for delete
  using (auth.uid() = user_id);

-- Drafts
create policy "Users see own drafts"
  on drafts for select
  using (auth.uid() = user_id);

create policy "Users create own drafts"
  on drafts for insert
  with check (auth.uid() = user_id);

create policy "Users update own drafts"
  on drafts for update
  using (auth.uid() = user_id);

create policy "Users delete own drafts"
  on drafts for delete
  using (auth.uid() = user_id);

-- Posts
create policy "Users see own posts"
  on posts for select
  using (auth.uid() = user_id);

create policy "Users create own posts"
  on posts for insert
  with check (auth.uid() = user_id);

create policy "Users update own posts"
  on posts for update
  using (auth.uid() = user_id);

create policy "Users delete own posts"
  on posts for delete
  using (auth.uid() = user_id);
