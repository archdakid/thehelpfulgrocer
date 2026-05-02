// Receipt OCR Edge Function — Phase 2 of receipts (Session 16b).
//
// Extracts structured line items from a user-uploaded receipt image using
// Gemini 2.5 Flash (free tier; see DECISIONS.md for the ML-Kit→Gemini pivot).
// Idempotent: invoking on a receipt that's already 'processed' is a no-op.
//
// Auth flow: the caller's JWT is forwarded by supabase.functions.invoke().
// We verify ownership using a JWT-bound client (which reads through RLS),
// then escalate to a service-role client for the actual writes — both the
// status-flipping updates and the receipt_items insert require service_role
// because the column-level grants in 0006/0008 lock those out for everyone
// else.
//
// Failure mode: any thrown error inside processReceipt() lands in the
// `process_error` column with status='failed' so the mobile app can surface
// it on the detail screen and offer a retry.

// deno-lint-ignore-file no-explicit-any

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY') ?? '';

// gemini-2.5-flash is vision-capable, supports JSON-mode response schemas,
// and is available on the free tier (15 req/min, 1500/day).
const GEMINI_MODEL = 'gemini-2.5-flash';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type GeminiItem = {
  raw_text: string;
  quantity: number;
  unit_price: number | null;
  line_total: number;
};

type GeminiResult = {
  store_name: string | null;
  receipt_date: string | null;
  total_amount: number | null;
  currency: string | null;
  items: GeminiItem[];
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    if (!GOOGLE_AI_API_KEY) {
      return jsonError(500, 'GOOGLE_AI_API_KEY is not configured');
    }

    const body = await req.json().catch(() => null);
    const receiptId = typeof body?.receipt_id === 'string' ? body.receipt_id : null;
    if (!receiptId) return jsonError(400, 'Missing receipt_id');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError(401, 'Missing Authorization header');

    // Caller-scoped client: every read goes through RLS, so we can't
    // accidentally process someone else's receipt even if the caller spoofs
    // an id — RLS returns no row, we 404.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: ownerCheck, error: ownerErr } = await userClient
      .from('receipts')
      .select('id, status, image_path, store_id, captured_at, created_at')
      .eq('id', receiptId)
      .single();
    if (ownerErr || !ownerCheck) return jsonError(404, 'Receipt not found');

    // Idempotency: a 'processed' row already has its items, no work to do.
    if (ownerCheck.status === 'processed') {
      return jsonOk({ status: 'processed', skipped: true });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    await admin
      .from('receipts')
      .update({ status: 'processing', process_error: null })
      .eq('id', receiptId);

    try {
      const result = await processReceipt(admin, receiptId, {
        imagePath: ownerCheck.image_path,
        existingStoreId: ownerCheck.store_id,
        capturedAt: ownerCheck.captured_at,
        createdAt: ownerCheck.created_at,
      });
      return jsonOk(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('process-receipt failed', { receiptId, message });
      await admin
        .from('receipts')
        .update({ status: 'failed', process_error: message.slice(0, 500) })
        .eq('id', receiptId);
      return jsonError(500, message);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(500, message);
  }
});

type ProcessContext = {
  imagePath: string;
  existingStoreId: string | null;
  capturedAt: string | null;
  createdAt: string;
};

type ProcessSummary = {
  status: string;
  items: number;
  matched: number;
  prices_contributed: number;
  products_auto_created: number;
  flagged: number;
};

async function processReceipt(
  admin: SupabaseClient,
  receiptId: string,
  ctx: ProcessContext,
): Promise<ProcessSummary> {
  // 0. If this is a retry of a previously-failed receipt, clear any items
  //    a partial earlier run left behind. The unique (receipt_id, position)
  //    constraint would otherwise reject the re-insert. flagged_items
  //    cascades from the FK so the admin queue auto-clears for this
  //    receipt; the contributed `prices` rows have receipt_item_id ON
  //    DELETE SET NULL so their price observations stay (append-only
  //    invariant) but lose their link.
  await admin.from('receipt_items').delete().eq('receipt_id', receiptId);

  // 1. Pull the image bytes. Service role bypasses storage RLS.
  const { data: blob, error: dlErr } = await admin.storage
    .from('receipts')
    .download(ctx.imagePath);
  if (dlErr || !blob) throw new Error(`Image download failed: ${dlErr?.message ?? 'no blob'}`);

  const mimeType = blob.type || 'image/jpeg';
  const base64 = await blobToBase64(blob);

  // 2. Call Gemini.
  const result = await callGemini(base64, mimeType);

  // 3. Resolve the store name to a known stores row. The user may have
  //    pinned one manually before processing — preserve that over the
  //    fuzzy-matched value.
  const fuzzyStoreId = await matchStore(admin, result.store_name);
  const storeId = ctx.existingStoreId ?? fuzzyStoreId;
  const currency = result.currency ?? 'TTD';
  // Receipt-sourced prices use the receipt's own captured_at when set
  // (when the user actually shopped) and fall back to created_at (when
  // they uploaded) so observed_at is always populated.
  const observedAt = ctx.capturedAt ?? ctx.createdAt;

  // 4. Persist items.
  const items = result.items
    .filter((item) => item.raw_text && Number.isFinite(item.line_total))
    .map((item, index) => ({
      receipt_id: receiptId,
      position: index + 1,
      raw_text: item.raw_text.trim(),
      quantity: Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1,
      unit_price_minor_units:
        item.unit_price != null && Number.isFinite(item.unit_price)
          ? Math.round(item.unit_price * 100)
          : null,
      line_total_minor_units: Math.round(item.line_total * 100),
    }));

  let summary: Omit<ProcessSummary, 'status' | 'items'> = {
    matched: 0,
    prices_contributed: 0,
    products_auto_created: 0,
    flagged: 0,
  };

  if (items.length > 0) {
    const { error: insertErr } = await (admin.from('receipt_items') as any).insert(items);
    if (insertErr) throw new Error(`Insert items failed: ${insertErr.message}`);

    // 5. Match each line item to a product via the trigram-backed
    //    public.match_receipt_text() function. Failure here is non-fatal —
    //    the items are inserted and the receipt is still useful for the
    //    user; matching can be re-run later by re-invoking this function.
    try {
      await matchItems(admin, receiptId);
    } catch (err) {
      console.warn('matcher pass failed (continuing)', { receiptId, err });
    }

    // 6. Contribute prices for confident matches, auto-create unmatched
    //    items that meet the metric gate, and flag everything that needs
    //    admin attention. Also non-fatal — the admin queue is the safety
    //    net for everything that breaks here.
    try {
      summary = await contributeAndFlag(admin, receiptId, { storeId, currency, observedAt });
    } catch (err) {
      console.warn('contribute/flag pass failed (continuing)', { receiptId, err });
    }
  }

  const update: Record<string, unknown> = {
    status: 'processed',
    processed_at: new Date().toISOString(),
    process_error: null,
    ocr_text: JSON.stringify(result),
    parsed_store_name: result.store_name,
    total_amount_minor_units:
      result.total_amount != null && Number.isFinite(result.total_amount)
        ? Math.round(result.total_amount * 100)
        : null,
    currency,
    receipt_date: result.receipt_date,
  };
  if (storeId && !ctx.existingStoreId) update.store_id = storeId;

  const { error: updErr } = await admin.from('receipts').update(update).eq('id', receiptId);
  if (updErr) throw new Error(`Update receipt failed: ${updErr.message}`);

  return { status: 'processed', items: items.length, ...summary };
}

async function callGemini(base64Image: string, mimeType: string): Promise<GeminiResult> {
  const prompt = [
    'You are extracting structured data from a Trinidad & Tobago grocery receipt.',
    'Default currency is TTD. Amounts are in dollars (major units), not cents.',
    'Quantity defaults to 1 if not printed. Preserve item order as printed.',
    'For raw_text, copy the line as it appears (do not interpret or normalize).',
    'If the date or total is missing, return null. Skip non-item lines (subtotals, tax, totals, change, dates).',
  ].join(' ');

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      store_name: { type: 'STRING', nullable: true },
      receipt_date: {
        type: 'STRING',
        nullable: true,
        description: 'ISO 8601 date (YYYY-MM-DD) or null',
      },
      total_amount: { type: 'NUMBER', nullable: true },
      currency: { type: 'STRING', nullable: true },
      items: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            raw_text: { type: 'STRING' },
            quantity: { type: 'NUMBER' },
            unit_price: { type: 'NUMBER', nullable: true },
            line_total: { type: 'NUMBER' },
          },
          required: ['raw_text', 'quantity', 'line_total'],
        },
      },
    },
    required: ['items'],
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GOOGLE_AI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Image } }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema,
        temperature: 0,
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini ${res.status}: ${errBody.slice(0, 300)}`);
  }
  const payload = await res.json();
  const text: string | undefined = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no text');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Gemini returned invalid JSON');
  }

  return normalizeResult(parsed);
}

function normalizeResult(raw: unknown): GeminiResult {
  if (typeof raw !== 'object' || raw === null) throw new Error('Gemini result is not an object');
  const r = raw as Record<string, unknown>;
  const items = Array.isArray(r.items) ? (r.items as unknown[]) : [];
  return {
    store_name: typeof r.store_name === 'string' ? r.store_name : null,
    receipt_date: typeof r.receipt_date === 'string' ? r.receipt_date : null,
    total_amount: typeof r.total_amount === 'number' ? r.total_amount : null,
    currency: typeof r.currency === 'string' ? r.currency : null,
    items: items.flatMap((item) => {
      if (typeof item !== 'object' || item === null) return [];
      const i = item as Record<string, unknown>;
      const rawText = typeof i.raw_text === 'string' ? i.raw_text : null;
      const lineTotal = typeof i.line_total === 'number' ? i.line_total : null;
      if (!rawText || lineTotal == null) return [];
      return [
        {
          raw_text: rawText,
          quantity: typeof i.quantity === 'number' ? i.quantity : 1,
          unit_price: typeof i.unit_price === 'number' ? i.unit_price : null,
          line_total: lineTotal,
        },
      ];
    }),
  };
}

// Confidence at or above this threshold is auto-matched silently. Below it
// (but >= the function's 0.30 floor) we still write the match but flip
// `needs_review` so the UI can flag it. Tuned conservatively: trigram on a
// well-formed grocery name typically scores 0.55–0.85.
const NEEDS_REVIEW_THRESHOLD = 0.5;

async function matchItems(admin: SupabaseClient, receiptId: string): Promise<void> {
  const { data: rows, error: selErr } = await (admin.from('receipt_items') as any)
    .select('id, raw_text')
    .eq('receipt_id', receiptId)
    .is('matched_product_id', null);
  if (selErr) throw new Error(`Read items for matching failed: ${selErr.message}`);
  if (!rows || rows.length === 0) return;

  // Per-item RPC: match_receipt_text() returns the single best candidate
  // (or no rows) for each line. We loop in JS because the function returns
  // a setof and Postgres has no clean way to LATERAL-join setof returns
  // through PostgREST without an extra view. Receipts are typically
  // ≤30 items so the round trips are cheap.
  for (const row of rows as Array<{ id: string; raw_text: string }>) {
    const { data: match, error: rpcErr } = await admin.rpc('match_receipt_text', {
      needle: row.raw_text,
    });
    if (rpcErr) {
      console.warn('match_receipt_text rpc failed', { itemId: row.id, err: rpcErr.message });
      continue;
    }
    const best = Array.isArray(match) && match.length > 0 ? (match[0] as any) : null;
    if (!best) continue;
    const confidence = typeof best.confidence === 'number' ? best.confidence : Number(best.confidence);
    if (!Number.isFinite(confidence)) continue;

    const { error: updErr } = await (admin.from('receipt_items') as any)
      .update({
        matched_product_id: best.product_id,
        match_confidence: confidence,
        needs_review: confidence < NEEDS_REVIEW_THRESHOLD,
      })
      .eq('id', row.id);
    if (updErr) {
      console.warn('matched_product update failed', { itemId: row.id, err: updErr.message });
    }
  }
}

// =============================================================================
// Contribute prices + auto-create + flag for admin review
// =============================================================================

type ContributeContext = {
  storeId: string | null;
  currency: string;
  observedAt: string;
};

type ItemForContribution = {
  id: string;
  raw_text: string;
  quantity: number;
  unit_price_minor_units: number | null;
  line_total_minor_units: number;
  matched_product_id: string | null;
  match_confidence: number | null;
  needs_review: boolean;
};

type FlagInsert = {
  receipt_item_id: string;
  reason: 'unmatched' | 'low_confidence' | 'auto_created_product';
  auto_created_product_id?: string | null;
};

type PriceInsert = {
  product_id: string;
  store_id: string;
  amount_minor_units: number;
  currency: string;
  source: 'receipt';
  observed_at: string;
  receipt_item_id: string;
};

async function contributeAndFlag(
  admin: SupabaseClient,
  receiptId: string,
  ctx: ContributeContext,
): Promise<Omit<ProcessSummary, 'status' | 'items'>> {
  const { data: rows, error } = await (admin.from('receipt_items') as any)
    .select(
      'id, raw_text, quantity, unit_price_minor_units, line_total_minor_units, matched_product_id, match_confidence, needs_review',
    )
    .eq('receipt_id', receiptId);
  if (error || !rows) {
    throw new Error(`Read items for contribute pass failed: ${error?.message ?? 'no rows'}`);
  }
  const items = rows as ItemForContribution[];

  const flags: FlagInsert[] = [];
  const prices: PriceInsert[] = [];
  // Within-receipt dedup: 3 instances of "MILK 1L" become a single new
  // product, not three duplicates. Keyed off the normalized raw_text.
  const newProducts = new Map<string, string>();

  let matched = 0;
  let pricesContributed = 0;
  let productsAutoCreated = 0;

  for (const item of items) {
    if (item.matched_product_id) {
      matched += 1;
      const conf = item.match_confidence;
      // Low confidence: flag for admin review, no price contribution
      // until they confirm.
      if (conf != null && conf < NEEDS_REVIEW_THRESHOLD) {
        flags.push({ receipt_item_id: item.id, reason: 'low_confidence' });
        continue;
      }
      // Confident match (or auto-created earlier; null confidence) →
      // contribute price if we have a store and a positive amount.
      const price = buildPrice(item, item.matched_product_id, ctx);
      if (price) prices.push(price);
      continue;
    }

    // Unmatched. Decide whether to auto-create.
    if (!meetsAutoCreateMetrics(item, ctx)) {
      flags.push({ receipt_item_id: item.id, reason: 'unmatched' });
      continue;
    }

    const dedupKey = normalizeForDedup(item.raw_text);
    let productId = newProducts.get(dedupKey) ?? null;
    if (!productId) {
      productId = await createProductFromItem(admin, item.raw_text);
      if (!productId) {
        flags.push({ receipt_item_id: item.id, reason: 'unmatched' });
        continue;
      }
      newProducts.set(dedupKey, productId);
      productsAutoCreated += 1;
    }

    // Link the receipt_item to its newly-minted product. confidence stays
    // null so the UI can distinguish "trigram match" from "we made this
    // up." needs_review stays false because the admin queue (flagged_items
    // with reason='auto_created_product') is the source of truth for
    // verification, not the user-facing badge.
    await (admin.from('receipt_items') as any)
      .update({ matched_product_id: productId, match_confidence: null, needs_review: false })
      .eq('id', item.id);

    flags.push({
      receipt_item_id: item.id,
      reason: 'auto_created_product',
      auto_created_product_id: productId,
    });

    const price = buildPrice(item, productId, ctx);
    if (price) prices.push(price);
  }

  if (flags.length > 0) {
    // upsert with ignoreDuplicates honors the unique (receipt_item_id, reason)
    // constraint — re-runs of the same receipt won't create duplicate flags.
    const { error: flagErr } = await (admin.from('flagged_items') as any).upsert(flags, {
      onConflict: 'receipt_item_id,reason',
      ignoreDuplicates: true,
    });
    if (flagErr) console.warn('flagged_items upsert failed', { err: flagErr.message });
  }

  if (prices.length > 0) {
    const { error: priceErr } = await admin.from('prices').insert(prices);
    if (priceErr) console.warn('prices insert failed', { err: priceErr.message });
    else pricesContributed = prices.length;
  }

  return {
    matched,
    prices_contributed: pricesContributed,
    products_auto_created: productsAutoCreated,
    flagged: flags.length,
  };
}

function buildPrice(
  item: ItemForContribution,
  productId: string,
  ctx: ContributeContext,
): PriceInsert | null {
  if (!ctx.storeId) return null;
  if (item.line_total_minor_units <= 0) return null;
  // Prefer printed unit price; fall back to line_total / quantity. We round
  // to whole cents because amount_minor_units is an int per migration 0001.
  const amount =
    item.unit_price_minor_units != null && item.unit_price_minor_units > 0
      ? item.unit_price_minor_units
      : item.quantity > 0
        ? Math.round(item.line_total_minor_units / item.quantity)
        : item.line_total_minor_units;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return {
    product_id: productId,
    store_id: ctx.storeId,
    amount_minor_units: amount,
    currency: ctx.currency,
    source: 'receipt',
    observed_at: ctx.observedAt,
    receipt_item_id: item.id,
  };
}

// Auto-create gate. The thresholds here are deliberately conservative — a
// false positive pollutes the canonical product catalog, a false negative
// just routes to the admin queue. Tighten if spam appears; loosen if too
// much manual work piles up.
function meetsAutoCreateMetrics(item: ItemForContribution, ctx: ContributeContext): boolean {
  if (!ctx.storeId) return false;
  if (item.line_total_minor_units <= 0) return false;
  const text = item.raw_text.trim();
  if (text.length < 3 || text.length > 80) return false;
  // Reject lines with no letters (pure digits, separators, etc.) — those are
  // almost always misparsed footer rows that slipped through Gemini's filter.
  if (!/[a-zA-Z]/.test(text)) return false;
  return true;
}

function normalizeForDedup(rawText: string): string {
  return rawText.toLowerCase().trim().replace(/\s+/g, ' ');
}

async function createProductFromItem(
  admin: SupabaseClient,
  rawText: string,
): Promise<string | null> {
  // Title-case the raw text as a starter name; admin will edit during
  // verification. We don't try to be clever here — the raw form preserves
  // information the admin needs to pick the right canonical name.
  const name = rawText.trim().slice(0, 200);
  const { data, error } = await admin
    .from('products')
    .insert({ name })
    .select('id')
    .single();
  if (error) {
    console.warn('product auto-create failed', { rawText, err: error.message });
    return null;
  }
  return data.id;
}

async function matchStore(admin: SupabaseClient, storeName: string | null): Promise<string | null> {
  if (!storeName) return null;
  const needle = storeName.trim().toLowerCase();
  if (!needle) return null;

  const { data: stores } = await admin.from('stores').select('id, name');
  if (!stores) return null;

  // Exact match wins. Otherwise prefer the longest stored name that's
  // contained in (or contains) the parsed name — this handles franchises
  // ("Massy Stores" vs "Massy Stores - Maraval") without overfitting on
  // a 2-letter overlap. If nothing meets the bar, the receipt stays
  // unmatched and the user can pin a store manually later.
  const exact = stores.find((s) => s.name.toLowerCase() === needle);
  if (exact) return exact.id;

  let best: { id: string; score: number } | null = null;
  for (const store of stores) {
    const haystack = store.name.toLowerCase();
    if (haystack.length < 4) continue;
    if (haystack.includes(needle) || needle.includes(haystack)) {
      const score = Math.min(haystack.length, needle.length);
      if (!best || score > best.score) best = { id: store.id, score };
    }
  }
  return best?.id ?? null;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  // btoa fails on binary >100KB chunks in some Deno builds; chunk it.
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < buf.length; i += chunkSize) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunkSize));
  }
  return btoa(binary);
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
