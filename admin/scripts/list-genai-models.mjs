// One-shot helper: list models available to your GOOGLE_AI_API_KEY on the
// Generative Language API, filtered to ones that support generateContent.
// Useful when an exact model ID gets rejected — Google sometimes ships
// Gemma under names that differ from the Studio UI labels.
//
// Usage (from admin/):
//   node scripts/list-genai-models.mjs

import { readFileSync } from 'node:fs';

loadEnvFile('.env.local');
loadEnvFile('.env');

const key = process.env.GOOGLE_AI_API_KEY;
if (!key) fail('GOOGLE_AI_API_KEY not set (check admin/.env.local)');

// v1beta first (most models), v1 as fallback (some Gemma routings only on v1).
const versions = ['v1beta', 'v1'];
for (const v of versions) {
  console.log(`\n=== ${v} ===`);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/${v}/models?key=${key}`);
    if (!res.ok) {
      console.log(`  ${res.status}: ${(await res.text()).slice(0, 200)}`);
      continue;
    }
    const json = await res.json();
    const models = (json.models ?? []).filter((m) =>
      (m.supportedGenerationMethods ?? []).includes('generateContent'),
    );
    for (const m of models) {
      const methods = (m.supportedGenerationMethods ?? []).join(',');
      console.log(`  ${m.name}  [${methods}]`);
    }
  } catch (err) {
    console.log(`  fetch failed: ${err.message}`);
  }
}

function loadEnvFile(path) {
  let content;
  try {
    content = readFileSync(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
