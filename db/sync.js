#!/usr/bin/env node

/**
 * 2X Sync Daemon
 * 
 * Runs in background. Two-way sync between local draft files and Supabase.
 * 
 * Local → Cloud: watches 2x-sessions/NUMBER/drafts/PLATFORM.md via fs.watch
 * Cloud → Local: polls Supabase every 5 seconds for updated drafts
 * 
 * Conflict resolution: last-write-wins (uses updated_at / mtime comparison)
 * Loop prevention: tracks files recently written by sync, skips watcher events for those
 * 
 * Usage:
 *   node sync.js          # run in foreground
 *   node sync.js &        # run in background
 *   node sync.js --daemon # detach from terminal
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, watch, statSync, mkdirSync } from 'fs';
import { join, basename, dirname } from 'path';
import { homedir } from 'os';
import { readdirSync } from 'fs';

// --- Paths ---
const WORKSPACE = join(homedir(), '.openclaw', 'workspace');
const AUTH_PATH = join(WORKSPACE, '2x-auth.json');
const SESSIONS_DIR = join(WORKSPACE, '2x-sessions');
const PID_PATH = join(WORKSPACE, '2x-sync.pid');

// Supabase project constants — hardcoded in repo, same for all users
const SKILL_DIR = new URL('.', import.meta.url).pathname;
const SUPABASE_JSON_PATH = join(SKILL_DIR, 'supabase.json');

// --- State ---
const recentlyWrittenBySync = new Map(); // filepath → timestamp (for loop prevention)
const WRITE_COOLDOWN_MS = 3000; // ignore watcher events within 3s of our own write
let lastPollTime = new Date().toISOString();

// --- Config & Auth ---
function loadSupabase() {
  if (!existsSync(SUPABASE_JSON_PATH)) {
    console.error('[sync] Missing db/supabase.json. Re-clone the repo.');
    process.exit(1);
  }
  return JSON.parse(readFileSync(SUPABASE_JSON_PATH, 'utf-8'));
}

function loadAuth() {
  if (!existsSync(AUTH_PATH)) return null;
  return JSON.parse(readFileSync(AUTH_PATH, 'utf-8'));
}

function saveAuth(data) {
  writeFileSync(AUTH_PATH, JSON.stringify(data, null, 2));
}

async function getClient() {
  const supa = loadSupabase();
  const auth = loadAuth();

  if (!auth?.access_token) {
    console.error('[sync] Not authenticated. Run: node client.js auth login');
    process.exit(1);
  }

  const client = createClient(supa.url, supa.publishable_key, {
    auth: { autoRefreshToken: true, persistSession: false }
  });

  const { data, error } = await client.auth.setSession({
    access_token: auth.access_token,
    refresh_token: auth.refresh_token,
  });

  if (error) {
    console.error(`[sync] Auth error: ${error.message}`);
    process.exit(1);
  }

  // Save refreshed tokens
  if (data.session) {
    saveAuth({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user_id: data.session.user.id,
      email: data.session.user.email,
    });
  }

  return client;
}

// --- Helpers ---

// Map local path to session UUID + platform
// Path format: 2x-sessions/{number}/drafts/{platform}.md
function parseLocalPath(filepath) {
  const parts = filepath.split('/');
  const draftsIdx = parts.indexOf('drafts');
  if (draftsIdx === -1) return null;

  const sessionNum = parts[draftsIdx - 1];
  const platform = basename(filepath, '.md');
  const sessionDir = join(SESSIONS_DIR, sessionNum);
  const idFile = join(sessionDir, '.supabase_session_id');

  if (!existsSync(idFile)) return null;

  const sessionId = readFileSync(idFile, 'utf-8').trim();
  return { sessionId, sessionNum, platform, sessionDir };
}

// Map Supabase draft to local file path
function draftToLocalPath(sessionNumber, platform) {
  return join(SESSIONS_DIR, String(sessionNumber), 'drafts', `${platform}.md`);
}

// Check if we recently wrote this file (loop prevention)
function wasRecentlyWrittenBySync(filepath) {
  const ts = recentlyWrittenBySync.get(filepath);
  if (!ts) return false;
  if (Date.now() - ts < WRITE_COOLDOWN_MS) return true;
  recentlyWrittenBySync.delete(filepath);
  return false;
}

function markAsWrittenBySync(filepath) {
  recentlyWrittenBySync.set(filepath, Date.now());
}

// --- Local → Cloud ---

async function pushLocalToCloud(client, filepath) {
  if (wasRecentlyWrittenBySync(filepath)) return; // skip our own writes

  const parsed = parseLocalPath(filepath);
  if (!parsed) return;

  const content = readFileSync(filepath, 'utf-8');
  const { sessionId, platform } = parsed;

  // Upsert: insert or update on (session_id, platform) unique constraint
  const { error } = await client
    .from('drafts')
    .upsert({
      session_id: sessionId,
      platform: platform,
      content: content,
      last_edited_by: 'agent',
    }, {
      onConflict: 'session_id,platform',
    });

  if (error) {
    console.error(`[sync] Push failed for ${platform}: ${error.message}`);
  } else {
    console.log(`[sync] ⬆ ${platform} → cloud`);
  }
}

// --- Cloud → Local ---

async function pullCloudToLocal(client) {
  // Fetch drafts updated since last poll
  const { data: drafts, error } = await client
    .from('drafts')
    .select('id, session_id, platform, content, updated_at, last_edited_by, sessions!inner(session_number)')
    .gt('updated_at', lastPollTime)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error(`[sync] Poll failed: ${error.message}`);
    return;
  }

  if (!drafts || drafts.length === 0) return;

  for (const draft of drafts) {
    const sessionNum = draft.sessions?.session_number;
    if (!sessionNum) continue;

    const localPath = draftToLocalPath(sessionNum, draft.platform);
    const localDir = dirname(localPath);

    // Check if local file is newer (last-write-wins)
    if (existsSync(localPath)) {
      const localMtime = statSync(localPath).mtime;
      const cloudUpdated = new Date(draft.updated_at);
      if (localMtime > cloudUpdated) {
        continue; // local is newer, skip
      }
    }

    // Write to local
    mkdirSync(localDir, { recursive: true });
    markAsWrittenBySync(localPath); // prevent watcher from pushing it back
    writeFileSync(localPath, draft.content);
    console.log(`[sync] ⬇ ${draft.platform} ← cloud (edited by ${draft.last_edited_by})`);
  }

  // Update poll cursor
  lastPollTime = new Date().toISOString();
}

// --- Watchers ---

function watchSessions(client) {
  // Watch the sessions directory for any .md changes in drafts/ subdirs
  // Node's fs.watch is recursive on macOS
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }

  try {
    watch(SESSIONS_DIR, { recursive: true }, (eventType, filename) => {
      if (!filename || !filename.endsWith('.md')) return;
      if (!filename.includes('drafts/')) return;

      const fullPath = join(SESSIONS_DIR, filename);
      if (!existsSync(fullPath)) return; // file was deleted

      // Debounce: small delay to let file writes complete
      setTimeout(() => pushLocalToCloud(client, fullPath), 500);
    });
    console.log(`[sync] Watching ${SESSIONS_DIR} for changes`);
  } catch (e) {
    console.error(`[sync] Watch error: ${e.message}`);
  }
}

function startPolling(client) {
  setInterval(() => pullCloudToLocal(client), 5000);
  console.log('[sync] Polling Supabase every 5s');
}

// --- Main ---

async function main() {
  // Write PID for daemon management
  writeFileSync(PID_PATH, String(process.pid));
  console.log(`[sync] Started (pid: ${process.pid})`);

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[sync] Stopping...');
    process.exit(0);
  });
  process.on('SIGINT', () => {
    console.log('[sync] Stopping...');
    process.exit(0);
  });

  const client = await getClient();

  // Initial sync: pull all drafts from active sessions
  const { data: activeDrafts } = await client
    .from('drafts')
    .select('id, session_id, platform, content, updated_at, sessions!inner(session_number, status)')
    .in('sessions.status', ['drafting', 'ready']);

  if (activeDrafts?.length) {
    console.log(`[sync] Initial pull: ${activeDrafts.length} active drafts`);
    for (const draft of activeDrafts) {
      const sessionNum = draft.sessions?.session_number;
      if (!sessionNum) continue;
      const localPath = draftToLocalPath(sessionNum, draft.platform);
      mkdirSync(dirname(localPath), { recursive: true });

      // Also ensure .supabase_session_id exists
      const sessionDir = join(SESSIONS_DIR, String(sessionNum));
      const idFile = join(sessionDir, '.supabase_session_id');
      if (!existsSync(idFile)) {
        writeFileSync(idFile, draft.session_id);
      }

      markAsWrittenBySync(localPath);
      writeFileSync(localPath, draft.content);
    }
  }

  // Start two-way sync
  watchSessions(client);
  startPolling(client);
}

// Daemon mode
if (process.argv.includes('--daemon')) {
  const { spawn } = await import('child_process');
  const child = spawn(process.argv[0], [process.argv[1]], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  console.log(`[sync] Daemon started (pid: ${child.pid})`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`[sync] Fatal: ${e.message}`);
  process.exit(1);
});
