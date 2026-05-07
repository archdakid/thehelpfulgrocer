// Admin store management endpoint (F8 Phase 2 — Stores CRUD).
//
// All admin-side writes to `public.stores` route through here. RLS on the
// table stays narrow (anon + authenticated SELECT only; admins additionally
// SELECT inactive rows via the policy added in 0013) — the trust boundary
// for writes is this function. Mirrors `resolve-flagged-item`:
//
//   1. Caller's JWT is forwarded by `supabase.functions.invoke()`. We verify
//      `profiles.is_admin = true` against the JWT-bound client.
//   2. We escalate to the service role for the actual write.
//
// Four actions:
//   - create     { name, region? }              → insert, returns new row
//   - rename     { storeId, name }              → update name only
//   - set_active { storeId, isActive }          → soft-delete via flag
//   - delete     { storeId, confirm: bool }     → preview counts (confirm=false)
//                                                 or actually delete (confirm=true)
//
// Hard delete cascade behavior:
//   - prices.store_id                       → CASCADE (deleted)
//   - product_store_availability.store_id   → CASCADE (deleted)
//   - store_locations.store_id              → CASCADE (deleted; their nested
//                                                       prices SET NULL, their
//                                                       per-location availability
//                                                       CASCADE)
//   - receipts.store_id                     → SET NULL (preserved, unlinked)
//   - circulars.store_id                    → RESTRICT (BLOCKS the delete)
//
// Soft-delete (set_active false) remains the right call most of the time —
// it preserves price history and lets you reactivate. Hard delete exists
// for genuine cleanup (a store added by mistake, a vendor we'll never
// support). The two-phase preview keeps the destructive click honest.

// deno-lint-ignore-file no-explicit-any

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action = 'create' | 'rename' | 'set_active' | 'delete';

type Payload = {
  action?: unknown;
  storeId?: unknown;
  name?: unknown;
  region?: unknown;
  isActive?: unknown;
  confirm?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const body = (await req.json().catch(() => null)) as Payload | null;
    const action = body?.action as Action | undefined;
    if (!action || !['create', 'rename', 'set_active', 'delete'].includes(action)) {
      return jsonError(400, 'Invalid action');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError(401, 'Missing Authorization header');
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return jsonError(401, 'Empty bearer token');

    // JWT-bound admin re-check. Same pattern as resolve-flagged-item:
    // explicit getUser(jwt) since the server-side client has no session
    // storage to fall back on.
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

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (action === 'create') {
      const name = normalizeName(body?.name);
      if (!name) return jsonError(400, 'name is required');
      const region = typeof body?.region === 'string' && body.region.trim().length > 0
        ? body.region.trim().toUpperCase()
        : 'TT';
      return await createStore(admin, { name, region, createdBy: adminId });
    }

    if (action === 'rename') {
      const storeId = typeof body?.storeId === 'string' ? body.storeId : null;
      const name = normalizeName(body?.name);
      if (!storeId) return jsonError(400, 'storeId is required');
      if (!name) return jsonError(400, 'name is required');
      return await renameStore(admin, storeId, name);
    }

    if (action === 'delete') {
      const storeId = typeof body?.storeId === 'string' ? body.storeId : null;
      if (!storeId) return jsonError(400, 'storeId is required');
      const confirm = body?.confirm === true;
      return await deleteStore(admin, storeId, confirm);
    }

    // set_active
    const storeId = typeof body?.storeId === 'string' ? body.storeId : null;
    if (!storeId) return jsonError(400, 'storeId is required');
    if (typeof body?.isActive !== 'boolean') return jsonError(400, 'isActive (bool) required');
    return await setActive(admin, storeId, body.isActive);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('manage-store failed', message);
    return jsonError(500, message);
  }
});

function normalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 80) return null;
  return trimmed;
}

async function createStore(
  admin: SupabaseClient,
  args: { name: string; region: string; createdBy: string },
) {
  // Surface the unique (name, region) violation as a friendly message
  // instead of the raw "duplicate key" Postgres returns.
  const { data, error } = await (admin.from('stores') as any)
    .insert({
      name: args.name,
      region: args.region,
      created_by: args.createdBy,
    })
    .select('id, name, region, is_active, created_at, updated_at')
    .single();
  if (error) {
    if (error.code === '23505') {
      return jsonError(409, `A store named "${args.name}" already exists in ${args.region}.`);
    }
    return jsonError(500, error.message);
  }
  return jsonOk({ ok: true, store: data });
}

async function renameStore(admin: SupabaseClient, storeId: string, name: string) {
  const { data, error } = await (admin.from('stores') as any)
    .update({ name })
    .eq('id', storeId)
    .select('id, name, region, is_active, updated_at')
    .single();
  if (error) {
    if (error.code === '23505') {
      return jsonError(409, `Another store with name "${name}" already exists in this region.`);
    }
    return jsonError(500, error.message);
  }
  if (!data) return jsonError(404, 'Store not found');
  return jsonOk({ ok: true, store: data });
}

async function setActive(admin: SupabaseClient, storeId: string, isActive: boolean) {
  const { data, error } = await (admin.from('stores') as any)
    .update({ is_active: isActive })
    .eq('id', storeId)
    .select('id, name, is_active, updated_at')
    .single();
  if (error) return jsonError(500, error.message);
  if (!data) return jsonError(404, 'Store not found');
  return jsonOk({ ok: true, store: data });
}

// Two-phase delete: confirm=false returns the cascade counts (so the admin
// UI can render "this will wipe N prices, M availability rows, K locations
// — and L receipts will be unlinked"); confirm=true re-counts and deletes.
// We re-count under confirm rather than trusting whatever the UI saw,
// because rows may have arrived between preview and confirm.
//
// `circulars` references stores with ON DELETE RESTRICT. If any exist, the
// delete is blocked at the SQL level — we surface that as a 409 before the
// DELETE so the admin gets a clear message instead of a raw 23503.
async function deleteStore(
  admin: SupabaseClient,
  storeId: string,
  confirm: boolean,
) {
  const { data: store, error: readErr } = await admin
    .from('stores')
    .select('id, name, is_active')
    .eq('id', storeId)
    .maybeSingle();
  if (readErr) return jsonError(500, readErr.message);
  if (!store) return jsonError(404, 'Store not found');

  const counts = await countDependents(admin, storeId);
  if ('error' in counts) return jsonError(500, counts.error);

  // Preview: return counts and let the UI decide. Even if circulars > 0
  // we still hand back the preview so the admin sees the blocker
  // alongside the rest of the picture.
  if (!confirm) {
    return jsonOk({
      ok: true,
      preview: true,
      store: { id: store.id, name: store.name },
      counts: counts.value,
      blocked: counts.value.circulars > 0
        ? `Cannot delete while ${counts.value.circulars} circular(s) reference this store. Remove or reassign them first.`
        : null,
    });
  }

  if (counts.value.circulars > 0) {
    return jsonError(
      409,
      `Cannot delete: ${counts.value.circulars} circular(s) reference this store. Remove or reassign them first.`,
    );
  }

  const { error: delErr } = await (admin.from('stores') as any)
    .delete()
    .eq('id', storeId);
  if (delErr) {
    // Defense-in-depth: if a circular landed between count and delete,
    // surface the FK violation as the same 409 the count-gate produced.
    if (delErr.code === '23503') {
      return jsonError(
        409,
        'Cannot delete: a circular or other restricted row references this store.',
      );
    }
    return jsonError(500, delErr.message);
  }

  return jsonOk({
    ok: true,
    deleted: true,
    store: { id: store.id, name: store.name },
    counts: counts.value,
  });
}

async function countDependents(
  admin: SupabaseClient,
  storeId: string,
): Promise<
  | {
      value: {
        prices: number;
        availability: number;
        locations: number;
        receipts: number;
        circulars: number;
      };
    }
  | { error: string }
> {
  const [prices, availability, locations, receipts, circulars] = await Promise.all([
    (admin.from('prices') as any)
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId),
    (admin.from('product_store_availability') as any)
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId),
    (admin.from('store_locations') as any)
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId),
    (admin.from('receipts') as any)
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId),
    (admin.from('circulars') as any)
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId),
  ]);

  if (prices.error) return { error: `prices count: ${prices.error.message}` };
  if (availability.error) return { error: `availability count: ${availability.error.message}` };
  if (locations.error) return { error: `locations count: ${locations.error.message}` };
  if (receipts.error) return { error: `receipts count: ${receipts.error.message}` };
  if (circulars.error) return { error: `circulars count: ${circulars.error.message}` };

  return {
    value: {
      prices: prices.count ?? 0,
      availability: availability.count ?? 0,
      locations: locations.count ?? 0,
      receipts: receipts.count ?? 0,
      circulars: circulars.count ?? 0,
    },
  };
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
