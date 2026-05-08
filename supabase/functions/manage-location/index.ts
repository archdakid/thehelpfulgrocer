// Admin store-locations endpoint (F11 Phase 2 — locations CRUD).
//
// Mirrors manage-store / manage-product: anon-JWT admin re-check, then
// service-role writes against `public.store_locations`. The scraper ingest
// path already upserts locations on (store_id, external_id); this function
// gives admins the human-side path for adding/renaming/deactivating/deleting
// branches that vendors don't expose, or correcting names after a scrape.
//
// Four actions:
//   - create     { storeId, name, externalId?, region?, lat?, lng? }
//   - rename     { locationId, name }
//   - set_active { locationId, isActive }
//   - delete     { locationId, confirm: bool }
//
// Delete cascade:
//   - prices.store_location_id              → SET NULL (preserved as
//                                              chain-wide observations)
//   - product_store_availability.store_location_id → CASCADE (wiped; the
//                                              chain-wide row, if any,
//                                              survives because it has
//                                              store_location_id NULL)
// No RESTRICT FKs on store_locations, so unlike stores there's no path that
// can block the delete. We still preview the per-location availability count
// so the admin sees what's about to be wiped.

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
  locationId?: unknown;
  name?: unknown;
  externalId?: unknown;
  region?: unknown;
  lat?: unknown;
  lng?: unknown;
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
      const storeId = typeof body?.storeId === 'string' ? body.storeId : null;
      if (!storeId) return jsonError(400, 'storeId is required');
      const name = normalizeName(body?.name);
      if (!name) return jsonError(400, 'name is required (1-80 chars)');
      const externalId = normalizeOptionalString(body?.externalId, 64);
      const region = typeof body?.region === 'string' && body.region.trim().length > 0
        ? body.region.trim().toUpperCase()
        : 'TT';
      const lat = normalizeOptionalCoord(body?.lat, -90, 90);
      const lng = normalizeOptionalCoord(body?.lng, -180, 180);
      return await createLocation(admin, {
        storeId,
        name,
        externalId,
        region,
        lat,
        lng,
        createdBy: adminId,
      });
    }

    const locationId = typeof body?.locationId === 'string' ? body.locationId : null;
    if (!locationId) return jsonError(400, 'locationId is required');

    if (action === 'rename') {
      const name = normalizeName(body?.name);
      if (!name) return jsonError(400, 'name is required (1-80 chars)');
      return await renameLocation(admin, locationId, name);
    }

    if (action === 'set_active') {
      if (typeof body?.isActive !== 'boolean') {
        return jsonError(400, 'isActive (bool) required');
      }
      return await setActive(admin, locationId, body.isActive);
    }

    // delete
    const confirm = body?.confirm === true;
    return await deleteLocation(admin, locationId, confirm);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('manage-location failed', message);
    return jsonError(500, message);
  }
});

function normalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 80) return null;
  return trimmed;
}

// undefined → leave alone; null → explicit clear; string → set.
function normalizeOptionalString(
  raw: unknown,
  maxLen: number,
): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLen) return null;
  return trimmed;
}

function normalizeOptionalCoord(
  raw: unknown,
  min: number,
  max: number,
): number | null | undefined {
  if (raw === undefined || raw === null) return raw === null ? null : undefined;
  if (typeof raw === 'string') {
    if (raw.trim() === '') return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return undefined;
    return parsed >= min && parsed <= max ? parsed : undefined;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw >= min && raw <= max ? raw : undefined;
  }
  return undefined;
}

async function createLocation(
  admin: SupabaseClient,
  args: {
    storeId: string;
    name: string;
    externalId: string | null | undefined;
    region: string;
    lat: number | null | undefined;
    lng: number | null | undefined;
    createdBy: string;
  },
) {
  // Verify the parent chain exists. A stale UUID would surface as a generic
  // 23503 from Postgres; an explicit lookup gives the admin a clearer message.
  const { data: store } = await admin
    .from('stores')
    .select('id')
    .eq('id', args.storeId)
    .maybeSingle();
  if (!store) return jsonError(404, 'Store not found');

  const insert: Record<string, unknown> = {
    store_id: args.storeId,
    name: args.name,
    region: args.region,
    created_by: args.createdBy,
  };
  if (args.externalId !== undefined) insert.external_id = args.externalId;
  if (args.lat !== undefined) insert.lat = args.lat;
  if (args.lng !== undefined) insert.lng = args.lng;

  const { data, error } = await (admin.from('store_locations') as any)
    .insert(insert)
    .select('id, store_id, name, external_id, region, is_active, lat, lng, created_at, updated_at')
    .single();
  if (error) {
    if (error.code === '23505') {
      // unique (store_id, name) or (store_id, external_id) violation
      return jsonError(
        409,
        `A location with that name or external id already exists for this store.`,
      );
    }
    return jsonError(500, error.message);
  }
  return jsonOk({ ok: true, location: data });
}

async function renameLocation(
  admin: SupabaseClient,
  locationId: string,
  name: string,
) {
  const { data, error } = await (admin.from('store_locations') as any)
    .update({ name })
    .eq('id', locationId)
    .select('id, name, is_active, updated_at')
    .single();
  if (error) {
    if (error.code === '23505') {
      return jsonError(409, `Another location with name "${name}" exists for this store.`);
    }
    return jsonError(500, error.message);
  }
  if (!data) return jsonError(404, 'Location not found');
  return jsonOk({ ok: true, location: data });
}

async function setActive(
  admin: SupabaseClient,
  locationId: string,
  isActive: boolean,
) {
  const { data, error } = await (admin.from('store_locations') as any)
    .update({ is_active: isActive })
    .eq('id', locationId)
    .select('id, name, is_active, updated_at')
    .single();
  if (error) return jsonError(500, error.message);
  if (!data) return jsonError(404, 'Location not found');
  return jsonOk({ ok: true, location: data });
}

// Two-phase delete. Cascade is benign — prices SET NULL (preserved as
// chain-wide), per-location availability CASCADE (wiped). We still preview
// the availability count so the admin sees what's about to vanish.
async function deleteLocation(
  admin: SupabaseClient,
  locationId: string,
  confirm: boolean,
) {
  const { data: location, error: readErr } = await admin
    .from('store_locations')
    .select('id, name, store_id')
    .eq('id', locationId)
    .maybeSingle();
  if (readErr) return jsonError(500, readErr.message);
  if (!location) return jsonError(404, 'Location not found');

  const counts = await countDependents(admin, locationId);
  if ('error' in counts) return jsonError(500, counts.error);

  if (!confirm) {
    return jsonOk({
      ok: true,
      preview: true,
      location: { id: location.id, name: location.name, store_id: location.store_id },
      counts: counts.value,
    });
  }

  const { error: delErr } = await (admin.from('store_locations') as any)
    .delete()
    .eq('id', locationId);
  if (delErr) return jsonError(500, delErr.message);

  return jsonOk({
    ok: true,
    deleted: true,
    location: { id: location.id, name: location.name, store_id: location.store_id },
    counts: counts.value,
  });
}

async function countDependents(
  admin: SupabaseClient,
  locationId: string,
): Promise<
  | { value: { prices: number; availability: number } }
  | { error: string }
> {
  const [prices, availability] = await Promise.all([
    (admin.from('prices') as any)
      .select('id', { count: 'exact', head: true })
      .eq('store_location_id', locationId),
    (admin.from('product_store_availability') as any)
      .select('id', { count: 'exact', head: true })
      .eq('store_location_id', locationId),
  ]);
  if (prices.error) return { error: `prices count: ${prices.error.message}` };
  if (availability.error) return { error: `availability count: ${availability.error.message}` };
  return {
    value: {
      prices: prices.count ?? 0,
      availability: availability.count ?? 0,
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
