// Runner for the `triage-duplicates` Edge Function.
//
// Drains the `flagged_items` queue of `potential_duplicate` rows by calling
// the Edge Function in a loop, paced to fit NVIDIA NIM's free-tier limit
// (40 RPM, no daily cap). One invocation = one model call = one batch.
// Default 10 pairs per batch → ~24 minutes wall-clock to drain ~9.4k pairs.
//
// Lives in `admin/` so it can borrow `@supabase/supabase-js` from the admin
// workspace's node_modules without a separate install, and so it can read
// `admin/.env.local` (already populated for `npm run dev`) without copying
// secrets around. The runner itself is just an HTTP loop — no admin-app
// coupling, no Next.js dependency.
//
// Auth: signs in as a designated admin user (email/password) and forwards
// the resulting JWT. The Edge Function re-checks `profiles.is_admin = true`,
// so the only requirement is that ADMIN_EMAIL points at a profile with the
// admin flag set.
//
// Usage (from `admin/`):
//   node scripts/triage-duplicates.mjs
//
// First-time setup — add to admin/.env.local (the same file Next.js reads):
//   ADMIN_EMAIL=admin@example.com
//   ADMIN_PASSWORD=...
//
// SUPABASE_URL + SUPABASE_ANON_KEY are read automatically (NEXT_PUBLIC_
// equivalents accepted), so the same .env.local that runs the admin app
// runs this script.
//
// Optional env (override on command line if desired):
//   BATCH_SIZE       (default 10, max 30 — Edge Function clamps)
//   MIN_SCORE        (default unset — limit to pairs with match_score ≥ X)
//   PACE_MS          (default 1600 — 40 RPM = 1500ms, +100ms safety margin)
//   MAX_BATCHES      (default unset — cap iterations for testing)
//   MAX_CALLS        (default 5000 — sanity cap so a runaway loop doesn't
//                    hammer indefinitely. NIM has no daily limit so this
//                    is purely a guardrail, not a quota concern.)

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const adminDir = resolve(__dirname, '..');

// Inline .env loader. Looks for .env.local then .env in admin/ and CWD.
loadEnvFile(resolve(adminDir, '.env.local'));
loadEnvFile(resolve(adminDir, '.env'));
loadEnvFile('.env.local');
loadEnvFile('.env');

function loadEnvFile(path) {
  let content;
  try {
    content = readFileSync(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

const env = process.env;
const SUPABASE_URL = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ADMIN_EMAIL = env.ADMIN_EMAIL;
const ADMIN_PASSWORD = env.ADMIN_PASSWORD;

const BATCH_SIZE = num(env.BATCH_SIZE, 10);
const MIN_SCORE = env.MIN_SCORE ? Number(env.MIN_SCORE) : null;
const PACE_MS = num(env.PACE_MS, 1600);
const MAX_BATCHES = env.MAX_BATCHES ? num(env.MAX_BATCHES, Infinity) : Infinity;
const MAX_CALLS = num(env.MAX_CALLS, 5000);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  fail('SUPABASE_URL + SUPABASE_ANON_KEY (or NEXT_PUBLIC_* equivalents) required');
}
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  fail('ADMIN_EMAIL + ADMIN_PASSWORD required');
}

// autoRefreshToken on so a multi-hour drain doesn't 401 once the 1-hour
// access-token TTL elapses. The Supabase JS client schedules an internal
// refresh ahead of expiry; we just read the freshest access_token before
// each request via getJwt() below.
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: true },
});

await signIn();
log(`Signed in as ${ADMIN_EMAIL}`);

async function signIn() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  if (error || !data?.session) {
    fail(`Sign-in failed: ${error?.message ?? 'no session'}`);
  }
}

// Returns the current access_token, refreshing or re-signing as needed.
// In normal operation getSession() returns the auto-refreshed value;
// the re-sign-in branch covers the edge case where the refresh token
// itself has expired (e.g. a multi-day pause between batches).
async function getJwt() {
  const { data } = await supabase.auth.getSession();
  if (data?.session?.access_token) return data.session.access_token;
  log('session lost, re-signing in');
  await signIn();
  const { data: again } = await supabase.auth.getSession();
  if (!again?.session?.access_token) fail('cannot recover session after re-sign-in');
  return again.session.access_token;
}

const totals = {
  batches: 0,
  processed: 0,
  merged: 0,
  pack_variants: 0,
  rejected: 0,
  uncertain: 0,
  errors: 0,
};

const startedAt = Date.now();

for (let i = 0; i < MAX_BATCHES && totals.batches < MAX_CALLS; i++) {
  const batchStart = Date.now();
  let result;
  try {
    // Pull the freshest access_token. Auto-refresh is enabled so this is
    // a cheap memory read in the steady state; only crosses the wire when
    // the client decides it's time to refresh.
    const jwt = await getJwt();
    result = await invokeBatch(jwt, BATCH_SIZE, MIN_SCORE);
  } catch (err) {
    // Network / auth / model errors are retried after a longer back-off.
    // The Edge Function returns 5xx on upstream NIM failures, so we expect
    // to hit this on transient model issues.
    const message = err instanceof Error ? err.message : String(err);
    log(`batch ${totals.batches + 1} failed: ${message} — backing off 30s`);
    await sleep(30_000);
    continue;
  }

  totals.batches += 1;
  totals.processed += result.processed ?? 0;
  totals.merged += result.merged ?? 0;
  totals.pack_variants += result.pack_variants ?? 0;
  totals.rejected += result.rejected ?? 0;
  totals.uncertain += result.uncertain ?? 0;
  totals.errors += (result.errors ?? []).length;

  log(
    `batch ${totals.batches} (${result.processed}/${BATCH_SIZE}): ` +
      `merged=${result.merged} pack=${result.pack_variants} ` +
      `rejected=${result.rejected} uncertain=${result.uncertain} ` +
      `errors=${(result.errors ?? []).length} remaining=${result.remaining}`,
  );
  // First few errors per batch — we want signal on what's failing without
  // drowning the log. The function returns `{flagged_item_id, message}`
  // pairs; truncate the message to keep each line readable.
  for (const e of (result.errors ?? []).slice(0, 3)) {
    log(`  err ${e.flagged_item_id?.slice(0, 8) ?? '????????'}: ${(e.message ?? '').slice(0, 200)}`);
  }
  if ((result.errors ?? []).length > 3) {
    log(`  ... ${result.errors.length - 3} more errors this batch`);
  }
  // Diagnostic: when the function couldn't extract verdicts, it surfaces
  // the raw model output here. Print it so we can see what the model
  // actually returned vs what our parser expected.
  if (result.debug?.raw_sample) {
    log(`  raw_sample: ${result.debug.raw_sample.slice(0, 500).replace(/\n/g, ' ')}`);
  }

  if ((result.remaining ?? 0) === 0) {
    log('queue drained, stopping');
    break;
  }

  // Pace to respect NVIDIA NIM free-tier 40 RPM (= 1500ms/call).
  // Subtract the time the request itself already burned so the cap is a
  // wall-clock minimum, not a sleep-on-top.
  const elapsed = Date.now() - batchStart;
  const wait = Math.max(0, PACE_MS - elapsed);
  if (wait > 0) await sleep(wait);
}

const minutes = Math.round((Date.now() - startedAt) / 60_000);
log('');
log(`Done in ${minutes} min — ${totals.batches} batches, ${totals.processed} pairs processed`);
log(
  `  merged: ${totals.merged}, pack_variants: ${totals.pack_variants}, ` +
    `rejected: ${totals.rejected}, uncertain (left for admin): ${totals.uncertain}, ` +
    `errors: ${totals.errors}`,
);

async function invokeBatch(jwt, batchSize, minScore) {
  const url = `${SUPABASE_URL}/functions/v1/triage-duplicates`;
  const body = { batchSize };
  if (minScore != null) body.minScore = minScore;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 200)}`);
  }
}

function num(v, fallback) {
  if (v == null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}

function fail(msg) {
  console.error(`triage-duplicates: ${msg}`);
  process.exit(1);
}
