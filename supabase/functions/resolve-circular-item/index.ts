// Per-row resolution endpoint for circular_items (F8 Phase 2).
//
// The admin review screen calls this once per candidate, with either an
// 'accept' or 'reject' action. On accept, we contribute a price row
// (source='circular', linked back via circular_items.contributed_price_id)
// and — if the admin didn't pick an existing product — auto-create one
// (linked via contributed_product_id). Trust boundary mirrors
// resolve-flagged-item: JWT-bound admin re-check, then service-role writes.
//
// Idempotency: re-invoking on a 'rejected' or already-'accepted' item is
// a no-op. Editing fields on an already-accepted item is NOT supported
// from this endpoint — admin can re-parse the circular if needed.

// deno-lint-ignore-file no-explicit-any

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action = 'accept' | 'reject';

type Payload = {
  circularItemId?: unknown;
  action?: unknown;
  // Edited fields — admin may have tweaked them in the review UI.
  name?: unknown;
  brand?: unknown;
  size?: unknown;
  amountMinorUnits?: unknown;
  // Product to attach. If null on accept and no matched_product_id either,
  // we auto-create a product from {brand, name, size}.
  targetProductId?: unknown;
  notes?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const body = (await req.json().catch(() => null)) as Payload | null;
    const circularItemId =
      typeof body?.circularItemId === 'string' ? body.circularItemId : null;
    const action = body?.action as Action | undefined;
    if (!circularItemId) return jsonError(400, 'Missing circularItemId');
    if (!action || !['accept', 'reject'].includes(action)) {
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

    const result = await resolve(admin, {
      circularItemId,
      action,
      adminId,
      edits: {
        name: typeof body?.name === 'string' ? body.name.trim() : null,
        brand: typeof body?.brand === 'string' ? body.brand.trim() : null,
        size: typeof body?.size === 'string' ? body.size.trim() : null,
        amountMinorUnits:
          typeof body?.amountMinorUnits === 'number' && Number.isFinite(body.amountMinorUnits)
            ? Math.round(body.amountMinorUnits)
            : null,
      },
      targetProductId:
        typeof body?.targetProductId === 'string' ? body.targetProductId : null,
      notes: typeof body?.notes === 'string' ? body.notes : null,
    });
    return jsonOk(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('resolve-circular-item failed', message);
    return jsonError(500, message);
  }
});

type Edits = {
  name: string | null;
  brand: string | null;
  size: string | null;
  amountMinorUnits: number | null;
};

type Ctx = {
  circularItemId: string;
  action: Action;
  adminId: string;
  edits: Edits;
  targetProductId: string | null;
  notes: string | null;
};

async function resolve(admin: SupabaseClient, ctx: Ctx) {
  const { data: row, error } = await (admin.from('circular_items') as any)
    .select(
      `
        id, status, raw_name, brand, size, amount_minor_units,
        matched_product_id, contributed_price_id, contributed_product_id,
        circular:circulars!inner ( id, store_id, observed_week )
      `,
    )
    .eq('id', ctx.circularItemId)
    .maybeSingle();
  if (error) throw new Error(`Load item failed: ${error.message}`);
  if (!row) throw new Error('Circular item not found');
  if (row.status !== 'pending') {
    return { ok: true, skipped: true, status: row.status };
  }

  const circular = row.circular;
  if (!circular) throw new Error('Missing parent circular');

  // Apply edits to the canonical row before doing anything else, so audit
  // reflects what the admin saw on screen at accept time.
  const updates: Record<string, unknown> = {};
  if (ctx.edits.name && ctx.edits.name !== row.raw_name) updates.raw_name = ctx.edits.name;
  if (ctx.edits.brand !== null && ctx.edits.brand !== row.brand) {
    updates.brand = ctx.edits.brand || null;
  }
  if (ctx.edits.size !== null && ctx.edits.size !== row.size) {
    updates.size = ctx.edits.size || null;
  }
  if (
    ctx.edits.amountMinorUnits != null &&
    ctx.edits.amountMinorUnits !== row.amount_minor_units &&
    ctx.edits.amountMinorUnits >= 0
  ) {
    updates.amount_minor_units = ctx.edits.amountMinorUnits;
  }
  if (Object.keys(updates).length > 0) {
    const { error: updErr } = await (admin.from('circular_items') as any)
      .update(updates)
      .eq('id', ctx.circularItemId);
    if (updErr) throw new Error(`Apply edits failed: ${updErr.message}`);
  }

  const finalName = updates.raw_name ?? row.raw_name;
  const finalBrand = (updates.brand as string | null | undefined) ?? row.brand;
  const finalSize = (updates.size as string | null | undefined) ?? row.size;
  const finalAmount = (updates.amount_minor_units as number | undefined) ?? row.amount_minor_units;

  if (ctx.action === 'reject') {
    await (admin.from('circular_items') as any)
      .update({
        status: 'rejected',
        resolved_by: ctx.adminId,
        resolved_at: new Date().toISOString(),
        notes: ctx.notes,
      })
      .eq('id', ctx.circularItemId);
    return { ok: true, status: 'rejected' };
  }

  // accept
  if (!finalAmount || finalAmount <= 0) throw new Error('Amount must be positive to accept');
  if (!circular.store_id) throw new Error('Circular has no store_id');

  // Pick the product. Priority:
  //   1. Admin-supplied targetProductId (always wins).
  //   2. Existing matched_product_id (admin implicitly accepted the trigram match).
  //   3. Auto-create a fresh product from the edited fields.
  let productId = ctx.targetProductId ?? row.matched_product_id ?? null;
  let createdProductId: string | null = null;
  if (!productId) {
    const composedName = composeName(finalName, finalBrand, finalSize);
    const { data: created, error: createErr } = await admin
      .from('products')
      .insert({ name: composedName, brand: finalBrand })
      .select('id')
      .single();
    if (createErr || !created) {
      throw new Error(`Auto-create product failed: ${createErr?.message ?? 'no row'}`);
    }
    productId = created.id;
    createdProductId = created.id;
  }

  // Contribute the price. observed_at = the circular's observed_week
  // (start of the week the offer is valid for). source='circular'.
  const observedAt = `${circular.observed_week}T00:00:00Z`;
  const { data: priceRow, error: priceErr } = await admin
    .from('prices')
    .insert({
      product_id: productId,
      store_id: circular.store_id,
      amount_minor_units: finalAmount,
      currency: 'TTD',
      source: 'circular',
      observed_at: observedAt,
    })
    .select('id')
    .single();
  if (priceErr || !priceRow) {
    // If we just created a product, roll it back so an orphan doesn't
    // sit in the catalog. The contributed_price_id link below would
    // never be made.
    if (createdProductId) {
      await admin.from('products').delete().eq('id', createdProductId);
    }
    throw new Error(`Insert price failed: ${priceErr?.message ?? 'no row'}`);
  }

  // Alias the raw_name onto the chosen product so future receipts /
  // circulars with the same string auto-match. Source 'admin' since this
  // is an explicit admin action.
  await (admin.from('product_aliases') as any).upsert(
    { product_id: productId, alias: finalName, source: 'admin' },
    { onConflict: 'product_id,alias', ignoreDuplicates: true },
  );

  await (admin.from('circular_items') as any)
    .update({
      status: 'accepted',
      resolved_by: ctx.adminId,
      resolved_at: new Date().toISOString(),
      contributed_price_id: priceRow.id,
      contributed_product_id: createdProductId,
      matched_product_id: productId,
      notes: ctx.notes,
    })
    .eq('id', ctx.circularItemId);

  return {
    ok: true,
    status: 'accepted',
    price_id: priceRow.id,
    product_id: productId,
    created_product: Boolean(createdProductId),
  };
}

function composeName(name: string, brand: string | null, size: string | null): string {
  // Order: brand + name + size. Mirrors how product names look in the
  // existing catalog ("Kraft Cheddar Cheese Slices 250g").
  const parts = [brand, name, size].filter((p): p is string => Boolean(p && p.trim()));
  return parts.join(' ').trim().slice(0, 200);
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
