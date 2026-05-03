// Admin manual price entry + per-store availability writes (F8 Phase 2).
// Mirrors the auth pattern in `manage-product` / `manage-store`: JWT-bound
// admin re-check, then service-role writes.
//
// Two actions:
//   - setPrice         { productId, storeId, amountMinorUnits, currency? }
//                      Inserts a new row into `prices` with source='manual'.
//                      Prices are append-only per docs/DECISIONS.md
//                      (2026-04-30); this is an observation, not an update.
//   - setAvailability  { productId, storeId, isAvailable }
//                      Upserts into `product_store_availability`. The
//                      table's default-when-absent semantics mean we
//                      could delete-on-true to keep it small, but
//                      keeping the explicit row gives the admin a
//                      visible record of "marked back in stock at T."
//
// Currency defaults to 'TTD' (CLAUDE.md: Trinidad & Tobago focus first).
// amountMinorUnits is integer cents; the UI converts $X.YY → X*100+YY.

// deno-lint-ignore-file no-explicit-any

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action = 'setPrice' | 'setAvailability';

type Payload = {
  action?: unknown;
  productId?: unknown;
  storeId?: unknown;
  amountMinorUnits?: unknown;
  currency?: unknown;
  isAvailable?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const body = (await req.json().catch(() => null)) as Payload | null;
    const action = body?.action as Action | undefined;
    if (!action || !['setPrice', 'setAvailability'].includes(action)) {
      return jsonError(400, 'Invalid action');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError(401, 'Missing Authorization header');
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return jsonError(401, 'Empty bearer token');

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: who, error: whoErr } = await userClient.auth.getUser(jwt);
    const adminId = who?.user?.id;
    if (!adminId) {
      return jsonError(401, `Invalid session: ${whoErr?.message ?? 'no user'}`);
    }
    const { data: profile } = await userClient
      .from('profiles')
      .select('is_admin')
      .eq('id', adminId)
      .maybeSingle();
    if (!profile?.is_admin) return jsonError(403, 'Not an admin');

    const productId = typeof body?.productId === 'string' ? body.productId : null;
    if (!productId) return jsonError(400, 'productId is required');
    const storeId = typeof body?.storeId === 'string' ? body.storeId : null;
    if (!storeId) return jsonError(400, 'storeId is required');

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (action === 'setPrice') {
      const amount = normalizeAmount(body?.amountMinorUnits);
      if (amount === null) {
        return jsonError(400, 'amountMinorUnits must be a non-negative integer');
      }
      const currency = normalizeCurrency(body?.currency);
      return await insertPrice(admin, { productId, storeId, amount, currency });
    }

    // setAvailability
    if (typeof body?.isAvailable !== 'boolean') {
      return jsonError(400, 'isAvailable must be a boolean');
    }
    return await upsertAvailability(admin, {
      productId,
      storeId,
      isAvailable: body.isAvailable,
      adminId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('manage-price failed', message);
    return jsonError(500, message);
  }
});

function normalizeAmount(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (!Number.isInteger(raw)) return null;
  if (raw < 0) return null;
  // Cap at $1,000,000 to catch UI bugs (forgotten *100, etc.) before
  // they pollute prices history.
  if (raw > 100_000_000) return null;
  return raw;
}

function normalizeCurrency(raw: unknown): string {
  if (typeof raw !== 'string') return 'TTD';
  const trimmed = raw.trim().toUpperCase();
  if (trimmed.length !== 3) return 'TTD';
  return trimmed;
}

async function insertPrice(
  admin: SupabaseClient,
  args: {
    productId: string;
    storeId: string;
    amount: number;
    currency: string;
  },
) {
  // Verify referenced rows exist — a missing FK would surface as a
  // generic 23503 from Postgres; explicit lookups give the admin a
  // clearer message.
  const [{ data: product }, { data: store }] = await Promise.all([
    admin.from('products').select('id').eq('id', args.productId).maybeSingle(),
    admin.from('stores').select('id').eq('id', args.storeId).maybeSingle(),
  ]);
  if (!product) return jsonError(404, 'Product not found');
  if (!store) return jsonError(404, 'Store not found');

  const { data, error } = await (admin.from('prices') as any)
    .insert({
      product_id: args.productId,
      store_id: args.storeId,
      amount_minor_units: args.amount,
      currency: args.currency,
      source: 'manual',
    })
    .select('id, product_id, store_id, amount_minor_units, currency, source, observed_at')
    .single();
  if (error) return jsonError(500, error.message);
  return jsonOk({ ok: true, price: data });
}

async function upsertAvailability(
  admin: SupabaseClient,
  args: {
    productId: string;
    storeId: string;
    isAvailable: boolean;
    adminId: string;
  },
) {
  const [{ data: product }, { data: store }] = await Promise.all([
    admin.from('products').select('id').eq('id', args.productId).maybeSingle(),
    admin.from('stores').select('id').eq('id', args.storeId).maybeSingle(),
  ]);
  if (!product) return jsonError(404, 'Product not found');
  if (!store) return jsonError(404, 'Store not found');

  const { data, error } = await (admin.from('product_store_availability') as any)
    .upsert(
      {
        product_id: args.productId,
        store_id: args.storeId,
        is_available: args.isAvailable,
        updated_at: new Date().toISOString(),
        updated_by: args.adminId,
      },
      { onConflict: 'product_id,store_id' },
    )
    .select('product_id, store_id, is_available, updated_at, updated_by')
    .single();
  if (error) return jsonError(500, error.message);
  return jsonOk({ ok: true, availability: data });
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
