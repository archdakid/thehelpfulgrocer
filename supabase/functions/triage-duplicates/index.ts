// LLM triage of `flagged_items.reason = 'potential_duplicate'`.
//
// Phase A (migration 0026 + the runner-side backfill) flagged thousands of
// pairs the trigram matcher thought might be duplicates. Phase B — this
// function — drains that queue with one NIM call per batch:
//   - same_product   → merge_products() collapses the loser into the winner
//   - pack_variant   → insert into product_equivalents (keeps both products)
//   - different      → resolve flag with 'rejected' (admin can re-flag if wrong)
//   - uncertain      → leave the flag unresolved for admin
//
// Backend: NVIDIA NIM (build.nvidia.com) hosting Llama 3.3 70B. Free tier
// is 40 RPM with no daily cap. The API is OpenAI-compatible (POST
// /v1/chat/completions, Bearer auth). Output structure is enforced by
// `response_format: {type: 'json_object'}` plus a worked-example prompt;
// initial testing of NIM's `nvext.guided_json` showed it being silently
// ignored on this endpoint, so we fall back to the standard OpenAI JSON
// mode (which Llama-on-NIM honors) and keep extractJson as a defensive
// parser for the rare fence-wrapped response.
//
// Earlier iterations targeted Gemini 2.5 Flash (5 RPM / 20 RPD — DOA for
// this volume) and Gemma 4 31B (15 RPM / 1.5K RPD — workable but tight).
//
// Auth: caller's JWT is forwarded by supabase.functions.invoke(). We
// re-check `profiles.is_admin = true` against the JWT-bound client first,
// then escalate to service role for the writes. Same trust pattern as
// resolve-flagged-item / parse-circular.

// deno-lint-ignore-file no-explicit-any

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const NVIDIA_API_KEY = Deno.env.get('NVIDIA_API_KEY') ?? '';

const NIM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
// Active models hosted on NVIDIA NIM (meta/llama-3.3-70b-instruct was
// retired on 2026-08-26 with HTTP 410 Gone). Ordered by latency & JSON
// reliability; callNIM falls back down the list on 404/410/429/5xx.
const NIM_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b',
  'openai/gpt-oss-20b',
  'google/gemma-4-31b-it',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 30;

type Decision = 'same_product' | 'pack_variant' | 'different' | 'uncertain';

type ProductSnapshot = {
  id: string;
  name: string;
  brand: string | null;
  unit_size: number | null;
  unit_of_measure: string | null;
  units_per_pack: number | null;
  description: string | null;
};

type FlagRow = {
  id: string;
  match_score: number | null;
  flagged: ProductSnapshot;
  candidate: ProductSnapshot;
};

type Verdict = {
  pair_index: number;
  decision: Decision;
  reason: string;
  // Only set when decision = 'pack_variant'. Indicates which product is the
  // larger pack (1 = flagged, 2 = candidate) and the multiplier.
  larger_is: 1 | 2 | null;
  scale_factor: number | null;
};

type Summary = {
  processed: number;
  merged: number;
  pack_variants: number;
  rejected: number;
  uncertain: number;
  errors: Array<{ flagged_item_id: string; message: string }>;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    if (!NVIDIA_API_KEY) {
      return jsonError(500, 'NVIDIA_API_KEY is not configured');
    }

    const body = (await req.json().catch(() => ({}))) as {
      batchSize?: unknown;
      minScore?: unknown;
    };
    const batchSize = clampBatchSize(body.batchSize);
    const minScore =
      typeof body.minScore === 'number' && body.minScore >= 0 ? body.minScore : null;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError(401, 'Missing Authorization header');
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return jsonError(401, 'Empty bearer token');

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: who, error: whoErr } = await userClient.auth.getUser(jwt);
    const adminId = who?.user?.id;
    if (!adminId) return jsonError(401, `Invalid session: ${whoErr?.message ?? 'no user'}`);

    const { data: profile } = await userClient
      .from('profiles')
      .select('is_admin')
      .eq('id', adminId)
      .maybeSingle();
    if (!profile?.is_admin) return jsonError(403, 'Not an admin');

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const flags = await loadBatch(admin, batchSize, minScore);
    if (flags.length === 0) {
      return jsonOk({ processed: 0, merged: 0, pack_variants: 0, rejected: 0, uncertain: 0, errors: [], remaining: 0 });
    }

    const { verdicts, rawSample } = await callNIM(flags);
    const summary = await applyVerdicts(admin, flags, verdicts, adminId);
    // Surface the raw model output when verdicts didn't materialize. Lets
    // the runner show what the model actually returned without us having
    // to chase function logs.
    const debug =
      verdicts.length === 0 || summary.processed + summary.uncertain === flags.length && summary.processed === 0
        ? { raw_sample: rawSample.slice(0, 800) }
        : undefined;

    // Cheap "is the runner done yet?" hint so the runner can stop without
    // an extra round trip. Not a strict count — just enough to know if there
    // are more flags waiting.
    const { count: remaining } = await admin
      .from('flagged_items')
      .select('id', { count: 'exact', head: true })
      .eq('reason', 'potential_duplicate')
      .is('resolved_at', null);

    return jsonOk({ ...summary, remaining: remaining ?? 0, ...(debug ? { debug } : {}) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('triage-duplicates failed', message);
    return jsonError(500, message);
  }
});

function clampBatchSize(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return DEFAULT_BATCH_SIZE;
  return Math.min(Math.floor(raw), MAX_BATCH_SIZE);
}

async function loadBatch(
  admin: SupabaseClient,
  batchSize: number,
  minScore: number | null,
): Promise<FlagRow[]> {
  // Highest-confidence flags first — the LLM's hit rate is best on the
  // strongest trigram signals, and processing those first means the
  // remaining queue gets less ambiguous over time. Same ordering as the
  // partial index `flagged_items_potential_dup_score_idx`.
  let q = (admin.from('flagged_items') as any)
    .select(
      `
        id, match_score,
        flagged:flagged_product_id (
          id, name, brand, unit_size, unit_of_measure, units_per_pack, description
        ),
        candidate:candidate_product_id (
          id, name, brand, unit_size, unit_of_measure, units_per_pack, description
        )
      `,
    )
    .eq('reason', 'potential_duplicate')
    .is('resolved_at', null)
    .order('match_score', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (minScore != null) q = q.gte('match_score', minScore);

  const { data, error } = await q;
  if (error) throw new Error(`Load flags failed: ${error.message}`);

  // Drop rows where one side has been deleted (FKs are ON DELETE SET NULL,
  // so a stale flag could survive if the underlying product was removed
  // by an unrelated admin action).
  return (data as any[])
    .filter((r) => r.flagged && r.candidate)
    .map((r) => ({
      id: r.id as string,
      match_score: r.match_score as number | null,
      flagged: r.flagged as ProductSnapshot,
      candidate: r.candidate as ProductSnapshot,
    }));
}

async function callNIM(flags: FlagRow[]): Promise<{ verdicts: Verdict[]; rawSample: string }> {
  const pairs = flags.map((f, i) => ({
    pair_index: i,
    flagged: describe(f.flagged),
    candidate: describe(f.candidate),
    trigram_score: f.match_score,
  }));

  const systemPrompt = [
    'You are deduplicating products in a Trinidad & Tobago grocery price-comparison catalog.',
    'You MUST respond with a single JSON object and no other text. No markdown, no headers, no bullet lists, no preamble like "To evaluate these pairs". Output JSON only.',
    '',
    'For each pair the user supplies, decide whether the two products are:',
    '- "same_product": same physical item across stores. Brands/sizes match (or one is a generic abbreviation). Safe to merge into one product row.',
    '- "pack_variant": same physical item but DIFFERENT pack sizes (e.g. single can vs case-of-24, or 500ml bottle vs 2L bottle of identical contents). Do NOT merge — these need to stay separate so per-unit price can be computed.',
    '- "different": genuinely different products (different flavor, different brand, different formulation, different category).',
    '- "uncertain": the information is insufficient to decide confidently. A human will review.',
    '',
    'Be conservative. Caribbean retailers carry many region-exclusive items where a wrong "same_product" merge poisons the comparison feature. Prefer "uncertain" over guessing.',
    '',
    'For pack_variant: scale_factor must be a number > 1 (e.g. 24 for case-of-24, 6 for six-pack, 10 for "1 kg bag" vs "100 g pack"). larger_is = 1 if "flagged" is the larger pack, 2 if "candidate" is. For any other decision, set both larger_is and scale_factor to null.',
    '',
    'Return a verdict for EVERY pair, identified by pair_index.',
    '',
    'Required JSON shape — return ONLY this object, no surrounding text:',
    '{"verdicts":[{"pair_index":0,"decision":"same_product","reason":"Both are Heinz Ketchup 397g.","larger_is":null,"scale_factor":null},{"pair_index":1,"decision":"pack_variant","reason":"Single can vs case-of-24 of Coke 330ml.","larger_is":2,"scale_factor":24}]}',
  ].join('\n');

  let text: string | undefined;
  let lastError = 'NIM returned no text';

  for (const model of NIM_MODELS) {
    const res = await fetch(NIM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Pairs to evaluate:\n${JSON.stringify({ pairs }, null, 2)}`,
          },
        ],
        temperature: 0,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      lastError = `NIM ${res.status} (${model}): ${errBody.slice(0, 500)}`;
      console.warn(lastError);
      continue;
    }

    const payload = await res.json();
    const candidateText: string | undefined = payload?.choices?.[0]?.message?.content;
    if (candidateText && candidateText.trim().length > 0) {
      text = candidateText;
      break;
    }
    lastError = `NIM returned empty content (${model})`;
  }

  if (!text) throw new Error(lastError);

  // guided_json guarantees structure, but defensive parse + extract for
  // the rare case the schema is rejected and the server falls back to
  // unconstrained generation. Cheap insurance.
  let parsed: unknown = null;
  try {
    parsed = extractJson(text);
  } catch {
    // Leave parsed = null; the empty-verdicts branch below will surface
    // rawSample so the caller can see what came back.
  }
  const list = Array.isArray((parsed as any)?.verdicts) ? (parsed as any).verdicts : [];
  const verdicts = list.flatMap((raw: any): Verdict[] => {
    const idx = typeof raw?.pair_index === 'number' ? raw.pair_index : null;
    const decision = raw?.decision as Decision | undefined;
    if (idx === null || !decision) return [];
    if (!['same_product', 'pack_variant', 'different', 'uncertain'].includes(decision)) return [];
    return [
      {
        pair_index: idx,
        decision,
        reason: typeof raw.reason === 'string' ? raw.reason : '',
        larger_is: raw.larger_is === 1 || raw.larger_is === 2 ? raw.larger_is : null,
        scale_factor:
          typeof raw.scale_factor === 'number' && Number.isFinite(raw.scale_factor) && raw.scale_factor > 1
            ? raw.scale_factor
            : null,
      },
    ];
  });
  return { verdicts, rawSample: text };
}

async function applyVerdicts(
  admin: SupabaseClient,
  flags: FlagRow[],
  verdicts: Verdict[],
  adminId: string,
): Promise<Summary> {
  const summary: Summary = {
    processed: 0,
    merged: 0,
    pack_variants: 0,
    rejected: 0,
    uncertain: 0,
    errors: [],
  };

  // Index verdicts by pair_index so a stray missing entry doesn't shift
  // the rest. If the model drops a pair, that flag stays unresolved for
  // the next batch — same outcome as 'uncertain'.
  const byIndex = new Map<number, Verdict>();
  for (const v of verdicts) byIndex.set(v.pair_index, v);

  // Within-batch transitivity guard. Each successful merge deletes the
  // loser product from `products`. If a subsequent flag in this same
  // batch references that deleted id (in either position), our cached
  // flag.flagged.id / flag.candidate.id is stale — the actual DB row
  // was already repointed by merge_products' UPDATE, but we'd send the
  // pre-merge id to merge_products / product_equivalents and trip a
  // "not found" or FK violation. Skip and let the next batch reload
  // with fresh references.
  const consumed = new Set<string>();

  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    const verdict = byIndex.get(i);
    if (!verdict) {
      summary.uncertain += 1;
      continue;
    }

    if (consumed.has(flag.flagged.id) || consumed.has(flag.candidate.id)) {
      // Don't increment any counter — flag stays unresolved, will be
      // picked up next batch with refreshed product ids.
      continue;
    }

    try {
      summary.processed += 1;
      if (verdict.decision === 'same_product') {
        await applyMerge(admin, flag, verdict, adminId);
        // Loser product was deleted by merge_products; remember it so
        // subsequent flags in this batch don't reference it.
        consumed.add(flag.flagged.id);
        summary.merged += 1;
      } else if (verdict.decision === 'pack_variant') {
        const ok = await applyPackVariant(admin, flag, verdict, adminId);
        if (ok) summary.pack_variants += 1;
        else summary.uncertain += 1;
      } else if (verdict.decision === 'different') {
        await markResolved(admin, flag.id, 'rejected', adminId, verdict.reason);
        summary.rejected += 1;
      } else {
        // uncertain → leave for admin
        summary.uncertain += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('apply verdict failed', { flag_id: flag.id, message });
      summary.errors.push({ flagged_item_id: flag.id, message });
      // Don't double-count; an errored flag is neither merged nor resolved.
      summary.processed -= 1;
    }
  }

  return summary;
}

async function applyMerge(
  admin: SupabaseClient,
  flag: FlagRow,
  verdict: Verdict,
  adminId: string,
) {
  // Convention: flagged is the just-inserted "loser", candidate is the
  // pre-existing "winner". The matcher always frames it that way (0026:
  // "the just-inserted product the matcher is unsure about" vs
  // "the existing product it might be a duplicate of"), so we don't ask
  // the LLM to pick a direction — we just trust the matcher's framing.
  // merge_products bumps prices/aliases/availability/categories from loser
  // to winner and deletes the loser.
  const { error } = await (admin.rpc as any)('merge_products', {
    p_loser_id: flag.flagged.id,
    p_winner_id: flag.candidate.id,
  });
  if (error) throw new Error(`merge_products: ${error.message}`);

  // merge_products() repoints flagged_items.flagged_product_id +
  // candidate_product_id at the winner before deleting the loser, so the
  // flag row survives. Mark it resolved with the LLM's note.
  await markResolved(admin, flag.id, 'merged', adminId, verdict.reason);
}

async function applyPackVariant(
  admin: SupabaseClient,
  flag: FlagRow,
  verdict: Verdict,
  adminId: string,
): Promise<boolean> {
  // The LLM tells us which side is the larger pack (1 = flagged, 2 = candidate)
  // and the scale factor. We need both to write a usable equivalence row;
  // missing either downgrades to 'uncertain' and the flag stays for admin.
  if (verdict.larger_is == null || verdict.scale_factor == null) {
    return false;
  }
  const larger = verdict.larger_is === 1 ? flag.flagged : flag.candidate;
  const smaller = verdict.larger_is === 1 ? flag.candidate : flag.flagged;

  // ON CONFLICT DO NOTHING via the unique (product_id, equivalent_product_id)
  // constraint — re-runs of the same pair are idempotent. We accept the
  // first-write's scale_factor as authoritative.
  const { error: insErr } = await (admin.from('product_equivalents') as any)
    .insert({
      product_id: larger.id,
      equivalent_product_id: smaller.id,
      scale_factor: verdict.scale_factor,
      source: 'triage_llm',
      notes: verdict.reason || null,
      created_by: adminId,
    });

  // 23505 = unique violation. The pair is already linked, which is fine —
  // we still want to resolve the flag so the queue drains.
  if (insErr && (insErr as any).code !== '23505') {
    throw new Error(`product_equivalents insert: ${insErr.message}`);
  }

  await markResolved(admin, flag.id, 'pack_variant', adminId, verdict.reason);
  return true;
}

async function markResolved(
  admin: SupabaseClient,
  flaggedItemId: string,
  resolution: 'rejected' | 'merged' | 'pack_variant',
  adminId: string,
  notes: string,
) {
  const { error } = await (admin.from('flagged_items') as any)
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: adminId,
      resolution,
      notes: notes ? `[triage_llm] ${notes}`.slice(0, 1000) : '[triage_llm]',
    })
    .eq('id', flaggedItemId)
    // Idempotency: if another concurrent runner already resolved this row,
    // the eq filter on resolved_at IS NULL drops the update silently.
    .is('resolved_at', null);
  if (error) throw new Error(`mark resolved: ${error.message}`);
}

// Defensive JSON extractor for Gemma output. The prompt asks for bare JSON
// but Gemma sometimes ignores that and wraps in ```json ... ```, prefixes
// "Here is the JSON:", or appends a tail comment. Try the cheapest parse
// first, then fall back to substring extraction.
function extractJson(raw: string): unknown {
  let s = raw.trim();

  // Strip a single fenced block if present. Capture-group works for both
  // ```json\n...\n``` and ```\n...\n```.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  try {
    return JSON.parse(s);
  } catch {
    // Fall through to bracket-bounded substring extraction.
  }

  // Fallback: find the outermost {...} or [...] in the raw text. Useful
  // when Gemma adds a preamble line before the JSON.
  const firstObj = s.indexOf('{');
  const firstArr = s.indexOf('[');
  const start =
    firstObj < 0 ? firstArr : firstArr < 0 ? firstObj : Math.min(firstObj, firstArr);
  if (start < 0) throw new Error('No JSON found in model response');
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  const end = s.lastIndexOf(close);
  if (end <= start) throw new Error('Unbalanced JSON in model response');
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Unable to parse model JSON: ${message}`);
  }
}

function describe(p: ProductSnapshot): Record<string, unknown> {
  // Compact, model-readable view. Drop nulls so the prompt isn't padded
  // with `"description": null` lines for every product.
  const out: Record<string, unknown> = { id: p.id, name: p.name };
  if (p.brand) out.brand = p.brand;
  if (p.unit_size != null && p.unit_of_measure) {
    out.size = `${p.unit_size}${p.unit_of_measure}`;
  }
  if (p.units_per_pack != null && p.units_per_pack > 1) {
    out.units_per_pack = p.units_per_pack;
  }
  if (p.description) out.description = p.description.slice(0, 200);
  return out;
}

function jsonOk(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
