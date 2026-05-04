// Circular parsing Edge Function (F8 Phase 2 — circular ingest).
//
// Admin uploads a weekly circular image; this function downloads it,
// asks Gemini 2.5 Flash vision to extract a structured list of products
// + prices, runs each candidate through the existing trigram matcher
// (match_receipt_text — same code path as receipts), and persists the
// candidates as `circular_items` rows for the admin's review screen.
//
// Reuses the same Gemini path the receipts pipeline uses — same provider,
// same structured-output discipline (`responseSchema`), same env var
// (`GOOGLE_AI_API_KEY`). Free tier (15 req/min, 1500/day) is more than
// enough for admin-bounded volume.
//
// Auth: caller's JWT is forwarded by supabase.functions.invoke().
//   1. JWT-bound admin re-check via profiles.is_admin = true.
//   2. Escalate to service role for the actual writes.
//
// Idempotency: re-invoking on a 'processed' circular is a no-op. On
// 'failed' or 'uploaded' we wipe any partial circular_items (cascade
// would only fire on circular delete) before re-running.

// deno-lint-ignore-file no-explicit-any

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY') ?? '';

const GEMINI_MODEL = 'gemini-2.5-flash';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Confidence threshold: same dial we use for receipts. Items below this
// still get inserted (with confidence < threshold), the admin just sees
// the lower score so they pay closer attention.
const NEEDS_REVIEW_THRESHOLD = 0.5;

type GeminiCircularItem = {
  name: string;
  brand: string | null;
  size: string | null;
  price: number;
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
    const circularId = typeof body?.circular_id === 'string' ? body.circular_id : null;
    if (!circularId) return jsonError(400, 'Missing circular_id');

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

    const { data: circular, error: cirErr } = await (admin.from('circulars') as any)
      .select('id, store_id, image_path, parse_status')
      .eq('id', circularId)
      .maybeSingle();
    if (cirErr) return jsonError(500, `Load circular failed: ${cirErr.message}`);
    if (!circular) return jsonError(404, 'Circular not found');

    if (circular.parse_status === 'processed') {
      return jsonOk({ status: 'processed', skipped: true });
    }

    await (admin.from('circulars') as any)
      .update({ parse_status: 'processing', process_error: null })
      .eq('id', circularId);

    try {
      const summary = await processCircular(admin, circularId, circular.image_path);
      return jsonOk(summary);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('parse-circular failed', { circularId, message });
      await (admin.from('circulars') as any)
        .update({ parse_status: 'failed', process_error: message.slice(0, 500) })
        .eq('id', circularId);
      return jsonError(500, message);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(500, message);
  }
});

async function processCircular(
  admin: SupabaseClient,
  circularId: string,
  imagePath: string,
): Promise<Record<string, unknown>> {
  // Wipe any partial items from a prior failed run. circular_items has
  // ON DELETE CASCADE on circular_id but no implicit cleanup for retries
  // on the same id, so we do it explicitly.
  await admin.from('circular_items').delete().eq('circular_id', circularId);

  // Pull image bytes via service role (storage RLS bypassed).
  const { data: blob, error: dlErr } = await admin.storage
    .from('circulars')
    .download(imagePath);
  if (dlErr || !blob) throw new Error(`Image download failed: ${dlErr?.message ?? 'no blob'}`);

  const mimeType = inferMimeType(blob.type, imagePath);
  const base64 = await blobToBase64(blob);

  // Call Gemini.
  const items = await callGemini(base64, mimeType);

  // Persist as circular_items + pre-match each row.
  const rows = items
    .filter((item) => item.name && Number.isFinite(item.price) && item.price > 0)
    .map((item, index) => ({
      circular_id: circularId,
      position: index + 1,
      raw_name: item.name.trim().slice(0, 200),
      brand: item.brand ? item.brand.trim().slice(0, 80) : null,
      size: item.size ? item.size.trim().slice(0, 40) : null,
      // Prices come back as dollars; convert to minor units.
      amount_minor_units: Math.round(item.price * 100),
    }));

  let prematched = 0;
  if (rows.length > 0) {
    const { data: inserted, error: insErr } = await (admin.from('circular_items') as any)
      .insert(rows)
      .select('id, raw_name, brand');
    if (insErr) throw new Error(`Insert circular_items failed: ${insErr.message}`);

    // Pre-match each item via the existing trigram function. We feed
    // "{brand} {raw_name}" when brand is set so trigram has more signal.
    for (const row of inserted as Array<{ id: string; raw_name: string; brand: string | null }>) {
      const needle = row.brand ? `${row.brand} ${row.raw_name}` : row.raw_name;
      const { data: match, error: rpcErr } = await admin.rpc('match_receipt_text', { needle });
      if (rpcErr) {
        console.warn('match_receipt_text rpc failed', { itemId: row.id, err: rpcErr.message });
        continue;
      }
      const best = Array.isArray(match) && match.length > 0 ? (match[0] as any) : null;
      if (!best) continue;
      const confidence = Number(best.confidence);
      if (!Number.isFinite(confidence)) continue;
      await (admin.from('circular_items') as any)
        .update({ matched_product_id: best.product_id, match_confidence: confidence })
        .eq('id', row.id);
      prematched += 1;
    }
  }

  await (admin.from('circulars') as any)
    .update({
      parse_status: 'processed',
      processed_at: new Date().toISOString(),
      process_error: null,
      parsed: { items },
    })
    .eq('id', circularId);

  return {
    status: 'processed',
    items: rows.length,
    prematched,
    needs_review: rows.length - prematched,
    threshold: NEEDS_REVIEW_THRESHOLD,
  };
}

async function callGemini(
  base64Image: string,
  mimeType: string,
): Promise<GeminiCircularItem[]> {
  const prompt = [
    'You are extracting a structured product list from a Trinidad & Tobago grocery store circular (weekly flyer / advertisement).',
    'Return EVERY visible product offer. Multi-column layouts are common — scan the whole image.',
    'Default currency is TTD. Prices are in dollars (major units), not cents.',
    'If a price has both a regular and a sale price shown, return the sale price.',
    'Skip section headers, store contact info, and decorative elements.',
  ].join(' ');

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      items: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            name: {
              type: 'STRING',
              description: 'Product name as printed (e.g. "Cheddar Cheese Slices").',
            },
            brand: {
              type: 'STRING',
              nullable: true,
              description: 'Brand if printed (e.g. "Kraft"); null if absent.',
            },
            size: {
              type: 'STRING',
              nullable: true,
              description: 'Pack size as printed (e.g. "1 KG", "500 ML"); null if absent.',
            },
            price: {
              type: 'NUMBER',
              description: 'Featured price in TTD dollars. E.g. "TT$24.99" → 24.99.',
            },
          },
          required: ['name', 'price'],
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
    throw new Error(`Gemini ${res.status}: ${errBody.slice(0, 400)}`);
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

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Gemini result is not an object');
  }
  const r = parsed as Record<string, unknown>;
  const items = Array.isArray(r.items) ? (r.items as unknown[]) : [];
  return items.flatMap((raw): GeminiCircularItem[] => {
    if (typeof raw !== 'object' || raw === null) return [];
    const i = raw as Record<string, unknown>;
    const name = typeof i.name === 'string' ? i.name : null;
    const price = typeof i.price === 'number' ? i.price : null;
    if (!name || price == null || !Number.isFinite(price)) return [];
    return [
      {
        name,
        brand: typeof i.brand === 'string' ? i.brand : null,
        size: typeof i.size === 'string' ? i.size : null,
        price,
      },
    ];
  });
}

function inferMimeType(blobType: string, path: string): string {
  if (blobType && blobType !== 'application/octet-stream') return blobType;
  const ext = path.toLowerCase().split('.').pop() ?? '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
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
