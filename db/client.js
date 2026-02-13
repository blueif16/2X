#!/usr/bin/env node

/**
 * 2X Supabase Client
 * 
 * CLI tool for explicit Supabase operations. The sync daemon handles
 * all draft read/write. This client handles structural operations only:
 *   - auth login / status
 *   - create-session
 *   - publish-draft
 *   - update-session
 * 
 * Usage:
 *   node client.js auth login [--provider github|google]
 *   node client.js auth status
 *   node client.js create-session
 *   node client.js publish-draft --session <uuid> --platform <x|linkedin|reddit> --platform-post-id <id> --posted-url <url>
 *   node client.js update-session --session <uuid> --status <drafting|ready|posted>
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createServer } from 'http';
import { homedir } from 'os';

// --- Paths ---
const WORKSPACE = join(homedir(), '.openclaw', 'workspace');
const CONFIG_PATH = join(WORKSPACE, '2x-config.json');
const AUTH_PATH = join(WORKSPACE, '2x-auth.json');
const SESSIONS_DIR = join(WORKSPACE, '2x-sessions');

// Supabase project constants — hardcoded in repo, same for all users
const SKILL_DIR = new URL('.', import.meta.url).pathname;
const SUPABASE_JSON_PATH = join(SKILL_DIR, 'supabase.json');

// --- Config ---
function loadSupabase() {
  if (!existsSync(SUPABASE_JSON_PATH)) {
    console.error(JSON.stringify({ error: 'Missing db/supabase.json. Re-clone the repo.' }));
    process.exit(1);
  }
  return JSON.parse(readFileSync(SUPABASE_JSON_PATH, 'utf-8'));
}

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    // Config is optional for auth commands — only needed for main flow
    return {};
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
}

function loadAuth() {
  if (!existsSync(AUTH_PATH)) return null;
  try {
    return JSON.parse(readFileSync(AUTH_PATH, 'utf-8'));
  } catch { return null; }
}

function saveAuth(data) {
  writeFileSync(AUTH_PATH, JSON.stringify(data, null, 2));
}

function getClient() {
  const supa = loadSupabase();
  const auth = loadAuth();
  const client = createClient(supa.url, supa.publishable_key, {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
      flowType: 'implicit',
    }
  });

  return { client, auth };
}

async function getAuthenticatedClient() {
  const { client, auth } = getClient();
  if (!auth?.access_token) {
    console.error(JSON.stringify({ error: 'Not authenticated. Run: node client.js auth login' }));
    process.exit(1);
  }

  // Set the session from stored tokens
  const { data, error } = await client.auth.setSession({
    access_token: auth.access_token,
    refresh_token: auth.refresh_token,
  });

  if (error) {
    console.error(JSON.stringify({ error: `Auth failed: ${error.message}. Run: node client.js auth login` }));
    process.exit(1);
  }

  // If tokens were refreshed, save them
  if (data.session) {
    saveAuth({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user_id: data.session.user.id,
      email: data.session.user.email,
      expires_at: data.session.expires_at,
    });
  }

  return { client, user: data.session.user };
}

// --- Commands ---

async function authLogin(provider = 'github') {
  const VALID_PROVIDERS = ['github', 'google'];
  if (!VALID_PROVIDERS.includes(provider)) {
    console.error(JSON.stringify({ error: `Invalid provider: ${provider}. Use: ${VALID_PROVIDERS.join(', ')}` }));
    process.exit(1);
  }

  const { client } = getClient();
  const port = 54321;
  const redirectUrl = `http://localhost:${port}/callback`;

  // Start a temporary local server to catch the OAuth redirect
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);

      if (url.pathname === '/callback') {
        // Supabase redirects with tokens in the hash, but for server-side
        // we need to extract from query params. Serve a page that extracts hash params.
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html><body>
          <script>
            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const access_token = params.get('access_token');
            const refresh_token = params.get('refresh_token');
            if (access_token) {
              fetch('/save-tokens?access_token=' + access_token + '&refresh_token=' + refresh_token)
                .then(() => { document.body.innerHTML = '<h2>✅ Authenticated! You can close this tab.</h2>'; });
            } else {
              document.body.innerHTML = '<h2>❌ No tokens found. Try again.</h2>';
            }
          </script>
          <h2>Authenticating...</h2>
          </body></html>
        `);
      } else if (url.pathname === '/save-tokens') {
        const access_token = url.searchParams.get('access_token');
        const refresh_token = url.searchParams.get('refresh_token');

        // Get user info
        const { data: { user }, error } = await client.auth.getUser(access_token);

        if (error || !user) {
          res.writeHead(500);
          res.end('Failed to get user');
          server.close();
          console.error(JSON.stringify({ error: 'Failed to get user info' }));
          resolve();
          return;
        }

        saveAuth({
          access_token,
          refresh_token,
          user_id: user.id,
          email: user.email,
          provider: provider,
          expires_at: null,
        });

        res.writeHead(200);
        res.end('ok');
        server.close();
        console.log(JSON.stringify({ ok: true, user_id: user.id, email: user.email, provider }));
        resolve();
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(port, async () => {
      const { data, error } = await client.auth.signInWithOAuth({
        provider: provider,
        options: { redirectTo: redirectUrl },
      });

      if (error) {
        console.error(JSON.stringify({ error: error.message }));
        server.close();
        resolve();
        return;
      }

      console.error(`Open this URL to authenticate with ${provider}:\n${data.url}`);
      console.error(`Waiting for callback on port ${port}...`);

      // Auto-timeout after 2 minutes
      setTimeout(() => {
        server.close();
        console.error(JSON.stringify({ error: 'Auth timed out after 2 minutes' }));
        resolve();
      }, 120000);
    });
  });
}

async function authStatus() {
  try {
    const { client, user } = await getAuthenticatedClient();
    console.log(JSON.stringify({ ok: true, user_id: user.id, email: user.email }));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: e.message }));
  }
}

async function createSession() {
  const { client, user } = await getAuthenticatedClient();

  // Find next session number for this user
  const { data: latest } = await client
    .from('sessions')
    .select('session_number')
    .eq('user_id', user.id)
    .order('session_number', { ascending: false })
    .limit(1);

  const nextNum = (latest?.[0]?.session_number || 0) + 1;

  const { data, error } = await client
    .from('sessions')
    .insert({ session_number: nextNum, status: 'drafting' })
    .select()
    .single();

  if (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  }

  // Store session UUID locally so sync daemon knows the mapping
  const sessionDir = join(SESSIONS_DIR, String(nextNum));
  mkdirSync(join(sessionDir, 'sources'), { recursive: true });
  mkdirSync(join(sessionDir, 'drafts'), { recursive: true });
  writeFileSync(join(sessionDir, '.supabase_session_id'), data.id);
  writeFileSync(join(sessionDir, '.session_number'), String(nextNum));

  console.log(JSON.stringify({ ok: true, session_id: data.id, session_number: nextNum }));
}

async function publishDraft(args) {
  const sessionId = args['--session'];
  const platform = args['--platform'];
  const platformPostId = args['--platform-post-id'] || null;
  const postedUrl = args['--posted-url'] || null;

  if (!sessionId || !platform) {
    console.error(JSON.stringify({ error: 'Missing --session or --platform' }));
    process.exit(1);
  }

  const { client } = await getAuthenticatedClient();

  // Find the draft by session + platform
  const { data: draft, error: draftErr } = await client
    .from('drafts')
    .select('*')
    .eq('session_id', sessionId)
    .eq('platform', platform)
    .single();

  if (draftErr || !draft) {
    console.error(JSON.stringify({ error: `Draft not found for ${platform}: ${draftErr?.message}` }));
    process.exit(1);
  }

  // Create post from draft
  const { data: post, error: postErr } = await client
    .from('posts')
    .insert({
      draft_id: draft.id,
      session_id: draft.session_id,
      platform: draft.platform,
      platform_post_id: platformPostId,
      posted_url: postedUrl,
      content: draft.content,
      char_count: draft.content.length,
      is_thread: draft.content.includes('[1/'),
      platform_metadata: draft.platform_context,
    })
    .select()
    .single();

  if (postErr) {
    console.error(JSON.stringify({ error: postErr.message }));
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, post_id: post.id, platform: post.platform, posted_url: postedUrl }));
}

async function updateSession(args) {
  const sessionId = args['--session'];
  const status = args['--status'];

  if (!sessionId || !status) {
    console.error(JSON.stringify({ error: 'Missing --session or --status' }));
    process.exit(1);
  }

  const { client } = await getAuthenticatedClient();

  const { error } = await client
    .from('sessions')
    .update({ status })
    .eq('id', sessionId);

  if (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, session_id: sessionId, status }));
}

// --- CLI Router ---

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      args[argv[i]] = argv[i + 1] || true;
      i++;
    }
  }
  return args;
}

const [cmd, subcmd, ...rest] = process.argv.slice(2);
const args = parseArgs([subcmd, ...rest].filter(Boolean));

switch (cmd) {
  case 'auth':
    if (subcmd === 'login') await authLogin(args['--provider'] || 'github');
    else if (subcmd === 'status') await authStatus();
    else console.error(JSON.stringify({ error: `Unknown auth command: ${subcmd}` }));
    break;
  case 'create-session':
    await createSession();
    break;
  case 'publish-draft':
    await publishDraft(parseArgs(rest));
    break;
  case 'update-session':
    await updateSession(parseArgs(rest));
    break;
  default:
    console.error('Commands: auth login|status, create-session, publish-draft, update-session');
    process.exit(1);
}
