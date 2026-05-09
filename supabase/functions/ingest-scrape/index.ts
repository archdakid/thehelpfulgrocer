// Scraper ingest — the only HTTP boundary the runner sees.
//
// Per DECISIONS.md (2026-05-05, scraper automation): the runner is a separate
// process that fetches per-vendor catalogs, normalizes them into the unified
// row shape below, and POSTs here. This function:
//   1. Re-checks the caller is an admin (anon-JWT-bound, same trust pattern as
//      manage-store / resolve-flagged-item).
//   2. Opens a `scrape_runs` audit row.
//   3. Upserts `store_locations` for every location seen, keyed on
//      (store_id, external_id).
//   4. For each row: ensures a `products` row exists (lookup by UPC, then by
//      vendor-namespaced alias, else insert), inserts an append-only `prices`
//      observation, upserts `product_store_availability`, and (per migration
//      0025) upserts each supplied vendor category path into
//      `product_store_categories`.
//   5. Closes the audit row with counters + per-row errors.
//
// Per-row errors don't fail the whole call — the run flips to 'partial' and
// the runner can re-attempt only the failures next cycle. A fatal error
// (auth, payload shape, fundamental DB failure) flips the run to 'failed'
// and returns 5xx so the runner backs off.

// deno-lint-ignore-file no-explicit-any

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_UOMS = new Set(['each', 'g', 'kg', 'ml', 'L', 'oz', 'lb']);
const MAX_ERRORS = 200;

type LocationInput = {
  externalId: string;
  name: string;
  region?: string;
  lat?: number;
  lng?: number;
};

type ProductInput = {
  upc?: string;
  externalId: string; // Vendor SKU/id; recorded as a namespaced alias.
  name: string;
  brand?: string;
  description?: string;
  category?: string;
  imageUrl?: string;
  unitSize?: number;
  unitOfMeasure?: string;
  isSoldByWeight?: boolean;
  unitsPerPack?: number;
  // Per-store native taxonomy paths. Multiple paths allowed (Massy products
  // can sit in several categories at once). The runner is responsible for
  // joining segments with " › " and supplying `root` (the first segment) so
  // the function never has to reason about separator conventions.
  vendorCategories?: VendorCategoryInput[];
};

type VendorCategoryInput = {
  path: string;
  root: string;
};

type Row = {
  product: ProductInput;
  locationExternalId: string;
  price?: {
    amountMinorUnits: number;
    currency?: string;
    regularAmountMinorUnits?: number;
    saleEndsAt?: string;
    promoLabel?: string;
  };
  availability?: {
    isAvailable: boolean;
  };
};

type Payload = {
  vendor: string;
  mode: string;
  storeId: string;
  locations: LocationInput[];
  rows: Row[];
};

type Counters = {
  locations_upserted: number;
  products_upserted: number;
  prices_inserted: number;
  availability_writes: number;
  categories_writes: number;
};

type RowError = { kind: string; detail: string; rowIndex?: number };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const rawText = await req.text();
    const payloadSizeBytes = new TextEncoder().encode(rawText).length;
    let body: Payload | null;
    try {
      body = JSON.parse(rawText) as Payload;
    } catch {
      return jsonError(400, 'Body must be JSON');
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

    if (!body || typeof body !== 'object') return jsonError(400, 'Empty payload');
    const vendor = typeof body.vendor === 'string' ? body.vendor.trim() : '';
    const mode = typeof body.mode === 'string' ? body.mode.trim() : '';
    const storeId = typeof body.storeId === 'string' ? body.storeId : '';
    if (!vendor) return jsonError(400, 'vendor is required');
    if (!mode) return jsonError(400, 'mode is required');
    if (!storeId) return jsonError(400, 'storeId is required');
    const locations = Array.isArray(body.locations) ? body.locations : [];
    const rows = Array.isArray(body.rows) ? body.rows : [];

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: store } = await admin
      .from('stores')
      .select('id')
      .eq('id', storeId)
      .maybeSingle();
    if (!store) return jsonError(404, 'Store not found');

    // Open the audit row before doing any work — if the function dies mid-run
    // (timeout, OOM, panic), the row stays as 'running' for the admin UI to
    // surface as broken rather than disappearing silently.
    const { data: run, error: runErr } = await (admin.from('scrape_runs') as any)
      .insert({
        vendor,
        mode,
        status: 'running',
        rows_received: rows.length,
        triggered_by: adminId,
        payload_size_bytes: payloadSizeBytes,
      })
      .select('id')
      .single();
    if (runErr || !run) {
      return jsonError(500, `Failed to open scrape_run: ${runErr?.message ?? 'unknown'}`);
    }
    const runId = run.id as string;

    const counters: Counters = {
      locations_upserted: 0,
      products_upserted: 0,
      prices_inserted: 0,
      availability_writes: 0,
      categories_writes: 0,
    };
    const errors: RowError[] = [];

    let locationMap: Map<string, string>;
    try {
      locationMap = await upsertLocations(admin, storeId, locations);
      counters.locations_upserted = locationMap.size;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await closeRun(admin, runId, 'failed', counters, errors, `Location upsert: ${msg}`);
      return jsonError(500, `Location upsert failed: ${msg}`);
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (!row?.product?.name || !row?.product?.externalId) {
          throw new Error('Row missing product.name or product.externalId');
        }
        const productId = await ensureProduct(admin, vendor, row.product);
        counters.products_upserted++;

        const locationId = row.locationExternalId
          ? locationMap.get(row.locationExternalId) ?? null
          : null;

        if (row.price) {
          await insertPrice(admin, {
            productId,
            storeId,
            storeLocationId: locationId,
            ...row.price,
          });
          counters.prices_inserted++;
        }

        if (row.availability && typeof row.availability.isAvailable === 'boolean') {
          await upsertAvailability(admin, {
            productId,
            storeId,
            storeLocationId: locationId,
            isAvailable: row.availability.isAvailable,
            adminId,
          });
          counters.availability_writes++;
        }

        if (Array.isArray(row.product.vendorCategories) && row.product.vendorCategories.length > 0) {
          const written = await upsertVendorCategories(
            admin,
            productId,
            storeId,
            row.product.vendorCategories,
          );
          counters.categories_writes += written;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (errors.length < MAX_ERRORS) {
          errors.push({ kind: 'row', detail: msg, rowIndex: i });
        } else if (errors.length === MAX_ERRORS) {
          errors.push({ kind: 'truncated', detail: `dropped after ${i} rows` });
        }
      }
    }

    const status = errors.length === 0 ? 'success' : 'partial';
    await closeRun(admin, runId, status, counters, errors, null);

    return jsonOk({
      ok: true,
      runId,
      status,
      counters,
      errorCount: errors.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('ingest-scrape failed', message);
    return jsonError(500, message);
  }
});

async function upsertLocations(
  admin: SupabaseClient,
  storeId: string,
  locations: LocationInput[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (locations.length === 0) return map;

  // De-dup by externalId so a runner double-add (or two location entries
  // sharing one external id) doesn't trip the on-conflict resolution.
  const seen = new Set<string>();
  const insertRows: Record<string, unknown>[] = [];
  for (const loc of locations) {
    if (!loc?.externalId || !loc?.name) continue;
    if (seen.has(loc.externalId)) continue;
    seen.add(loc.externalId);
    insertRows.push({
      store_id: storeId,
      external_id: loc.externalId,
      name: loc.name,
      region: typeof loc.region === 'string' && loc.region.trim() ? loc.region.trim() : 'TT',
      lat: typeof loc.lat === 'number' && Number.isFinite(loc.lat) ? loc.lat : null,
      lng: typeof loc.lng === 'number' && Number.isFinite(loc.lng) ? loc.lng : null,
    });
  }
  if (insertRows.length === 0) return map;

  const { data, error } = await (admin.from('store_locations') as any)
    .upsert(insertRows, { onConflict: 'store_id,external_id' })
    .select('id, external_id');
  if (error) throw new Error(error.message);
  for (const r of (data ?? []) as Array<{ id: string; external_id: string }>) {
    map.set(r.external_id, r.id);
  }
  return map;
}

async function ensureProduct(
  admin: SupabaseClient,
  vendor: string,
  p: ProductInput,
): Promise<string> {
  const realUpc = isPromotableUpc(p.upc) ? (p.upc as string).trim() : null;
  // Vendor-namespaced alias key — globally unique by construction so two
  // vendors using the same internal SKU number can't collide.
  const aliasKey = `${vendor}:${p.externalId}`;

  // 1. Real UPC → look up by it. If found, the row is canonical; just record
  //    the vendor alias so future matching can find it by the vendor's SKU too.
  if (realUpc) {
    const { data } = await admin
      .from('products')
      .select('id')
      .eq('upc', realUpc)
      .maybeSingle();
    if (data) {
      await ensureAlias(admin, data.id, aliasKey);
      return data.id;
    }
  }

  // 2. No real UPC (or no match) → look up by vendor alias. Scoped to source
  //    'scrape' so we don't collide with admin/receipt aliases that happen to
  //    share a string.
  const { data: aliasRow } = await admin
    .from('product_aliases')
    .select('product_id')
    .eq('alias', aliasKey)
    .eq('source', 'scrape')
    .maybeSingle();
  if (aliasRow) return aliasRow.product_id;

  // 2.5. Cross-vendor identity match (DECISIONS.md 2026-05-09). UPC missed,
  //      vendor alias missed. Fuzzy-match against the rest of the catalog by
  //      brand + name + size. Auto-link at high confidence; otherwise insert
  //      new and possibly flag for admin review (handled by the caller after
  //      insert returns).
  const matchResult = await tryMatchExisting(admin, p);
  if (matchResult.action === 'auto_link') {
    await ensureAlias(admin, matchResult.productId, aliasKey);
    return matchResult.productId;
  }

  // 3. Brand new product. Insert with the real UPC if we have one; otherwise
  //    use INTERNAL-<VENDOR>-<id> following the existing OFF-skip convention.
  const placeholderUpc = `INTERNAL-${vendor.toUpperCase()}-${p.externalId}`;
  const insertPayload: Record<string, unknown> = {
    upc: realUpc ?? placeholderUpc,
    name: p.name.trim().slice(0, 500),
    brand: stringOrNull(p.brand),
    description: stringOrNull(p.description),
    category: stringOrNull(p.category),
    image_url: stringOrNull(p.imageUrl),
    unit_size: numberOrNull(p.unitSize),
    unit_of_measure:
      typeof p.unitOfMeasure === 'string' && VALID_UOMS.has(p.unitOfMeasure)
        ? p.unitOfMeasure
        : null,
    is_sold_by_weight: p.isSoldByWeight === true,
    units_per_pack: numberOrNull(p.unitsPerPack),
  };

  const { data, error } = await (admin.from('products') as any)
    .insert(insertPayload)
    .select('id')
    .single();
  if (error || !data) {
    // 23505 = unique violation. Possible if a parallel run inserted the same
    // UPC between our lookup and our insert; re-fetch and use that row.
    if (error?.code === '23505' && realUpc) {
      const { data: existing } = await admin
        .from('products')
        .select('id')
        .eq('upc', realUpc)
        .maybeSingle();
      if (existing) {
        await ensureAlias(admin, existing.id, aliasKey);
        return existing.id;
      }
    }
    throw new Error(`Product insert failed: ${error?.message ?? 'unknown'}`);
  }

  await ensureAlias(admin, data.id, aliasKey);

  // If the matcher found a tentative candidate (medium confidence), file a
  // potential_duplicate row so admin can decide. Best-effort: a queue-write
  // failure shouldn't block the price ingest, so swallow + log.
  if (matchResult.action === 'flag') {
    try {
      await flagPotentialDuplicate(admin, {
        flaggedProductId: data.id,
        candidateProductId: matchResult.candidateId,
        score: matchResult.score,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('flagPotentialDuplicate failed', msg);
    }
  }
  return data.id;
}

type MatchAction =
  | { action: 'auto_link'; productId: string }
  | { action: 'flag'; candidateId: string; score: number }
  | { action: 'insert' };

// Cross-vendor identity match. Calls `match_existing_product` RPC and
// applies the auto-link / flag / insert decision policy. The thresholds
// were calibrated against real cross-vendor name pairs (DECISIONS.md
// 2026-05-09): trigram alone tops out around 0.65–0.75 for clear matches
// when word counts differ, so brand + size are essential confidence
// boosters rather than refinements.
async function tryMatchExisting(
  admin: SupabaseClient,
  p: ProductInput,
): Promise<MatchAction> {
  const name = p.name?.trim() ?? '';
  if (!name) return { action: 'insert' };

  type Candidate = {
    product_id: string;
    candidate_name: string | null;
    candidate_brand: string | null;
    similarity: number;
    same_brand: boolean;
    same_size: boolean;
  };

  let candidates: Candidate[] = [];
  try {
    const { data, error } = await (admin.rpc as any)('match_existing_product', {
      p_name: name,
      p_brand: p.brand ?? null,
      p_unit_size: p.unitSize ?? null,
      p_unit_of_measure: p.unitOfMeasure ?? null,
      p_exclude_id: null,
    });
    if (error) {
      console.warn('match_existing_product RPC failed', error.message);
      return { action: 'insert' };
    }
    candidates = (data ?? []) as Candidate[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('match_existing_product threw', msg);
    return { action: 'insert' };
  }

  const best = candidates[0];
  if (!best) return { action: 'insert' };
  const score = Number(best.similarity);
  if (!Number.isFinite(score)) return { action: 'insert' };

  // Multipack mismatch detector. PriceSmart sells "Pepsi Cola Soft Drink 24
  // Units / 500 mL" cases; Massy sells "Pepsi 500 Ml" singles. Trigram +
  // brand + size could otherwise over-confidently merge them — and merging
  // loses the per-unit math we'd want from product_equivalents. If exactly
  // one of the two has a multipack marker, never auto-link and downgrade
  // the flag confidence so admin treats it as a pack-variant pair.
  const newHasPack = hasMultipackMarker(name);
  const candHasPack = hasMultipackMarker(best.candidate_name ?? '');
  const packMismatch = newHasPack !== candHasPack;

  // Auto-link policy: requires same_size AND no pack mismatch.
  if (best.same_size && !packMismatch) {
    if (score >= 0.85) {
      return { action: 'auto_link', productId: best.product_id };
    }
    if (score >= 0.7 && best.same_brand) {
      return { action: 'auto_link', productId: best.product_id };
    }
  }

  // Flag policy: 0.50+ goes to admin queue. Tightened to require either
  // same_size or same_brand so we don't generate noise from coincidental
  // name overlap.
  if (score >= 0.5 && (best.same_size || best.same_brand)) {
    return { action: 'flag', candidateId: best.product_id, score };
  }

  return { action: 'insert' };
}

// Patterns that signal a multipack/wholesale SKU: "24 Units", "12 Pack",
// "12-Pack", "Case of 12", "4'S" / "4`S" (Massy convention), "x4" / "x 24".
function hasMultipackMarker(s: string): boolean {
  if (!s) return false;
  return (
    /\b\d+\s*(units?|pack|pks?|case|ct|count)\b/i.test(s) ||
    /\bcase\s+of\s+\d+\b/i.test(s) ||
    /\b\d+\s*['`]\s*s\b/i.test(s) ||
    /\bx\s*\d+\b/i.test(s)
  );
}

async function flagPotentialDuplicate(
  admin: SupabaseClient,
  args: {
    flaggedProductId: string;
    candidateProductId: string;
    score: number;
  },
): Promise<void> {
  // Idempotent: the partial unique index on
  // (flagged_product_id, candidate_product_id, reason) for ingest-origin
  // rows handles double-inserts when a chunk is replayed.
  const { error } = await (admin.from('flagged_items') as any).upsert(
    {
      receipt_item_id: null,
      flagged_product_id: args.flaggedProductId,
      candidate_product_id: args.candidateProductId,
      reason: 'potential_duplicate',
      match_score: Number(args.score.toFixed(3)),
    },
    {
      onConflict: 'flagged_product_id,candidate_product_id,reason',
      ignoreDuplicates: true,
    },
  );
  if (error) throw new Error(error.message);
}

async function ensureAlias(
  admin: SupabaseClient,
  productId: string,
  alias: string,
): Promise<void> {
  // unique (product_id, alias) — onConflict: ignore. We don't need an update
  // path; if the alias already exists for this product, that's the desired
  // end state.
  const { error } = await (admin.from('product_aliases') as any)
    .upsert(
      { product_id: productId, alias, source: 'scrape' },
      { onConflict: 'product_id,alias', ignoreDuplicates: true },
    );
  if (error) throw new Error(`Alias upsert failed: ${error.message}`);
}

async function insertPrice(
  admin: SupabaseClient,
  args: {
    productId: string;
    storeId: string;
    storeLocationId: string | null;
    amountMinorUnits: number;
    currency?: string;
    regularAmountMinorUnits?: number;
    saleEndsAt?: string;
    promoLabel?: string;
  },
): Promise<void> {
  const amount = normalizeAmount(args.amountMinorUnits);
  if (amount === null) throw new Error('amountMinorUnits invalid');
  const currency = normalizeCurrency(args.currency);
  const regular =
    args.regularAmountMinorUnits != null ? normalizeAmount(args.regularAmountMinorUnits) : null;

  const insertPayload: Record<string, unknown> = {
    product_id: args.productId,
    store_id: args.storeId,
    store_location_id: args.storeLocationId,
    amount_minor_units: amount,
    currency,
    source: 'scrape',
  };
  if (regular != null) insertPayload.regular_amount_minor_units = regular;
  if (args.saleEndsAt) insertPayload.sale_ends_at = args.saleEndsAt;
  if (args.promoLabel) insertPayload.promo_label = args.promoLabel.slice(0, 200);

  const { error } = await (admin.from('prices') as any).insert(insertPayload);
  if (error) throw new Error(`Price insert failed: ${error.message}`);
}

// Per-store vendor categories (migration 0025). Returns the count of distinct
// (path) entries actually written so the run can report it. Per-row errors
// bubble up to the caller's try/catch and become a partial-run row error —
// categories are nice-to-have, never block a price write.
async function upsertVendorCategories(
  admin: SupabaseClient,
  productId: string,
  storeId: string,
  categories: VendorCategoryInput[],
): Promise<number> {
  // De-dup within the row so a vendor that lists the same path twice doesn't
  // trip the unique constraint or inflate the counter.
  const seen = new Set<string>();
  const inserts: Record<string, unknown>[] = [];
  for (const c of categories) {
    if (typeof c?.path !== 'string' || typeof c?.root !== 'string') continue;
    const path = c.path.trim();
    const root = c.root.trim();
    if (!path || !root) continue;
    if (path.length > 500 || root.length > 200) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    inserts.push({
      product_id: productId,
      store_id: storeId,
      vendor_path: path,
      vendor_path_root: root,
      source: 'scrape',
      last_seen_at: new Date().toISOString(),
    });
  }
  if (inserts.length === 0) return 0;

  // unique (product_id, store_id, vendor_path). On conflict, bump last_seen_at
  // so admins can see when a path was last observed for this product (helps
  // identify stale assignments after a vendor restructures its taxonomy).
  const { error } = await (admin.from('product_store_categories') as any)
    .upsert(inserts, { onConflict: 'product_id,store_id,vendor_path' });
  if (error) throw new Error(`Vendor categories upsert failed: ${error.message}`);
  return inserts.length;
}

async function upsertAvailability(
  admin: SupabaseClient,
  args: {
    productId: string;
    storeId: string;
    storeLocationId: string | null;
    isAvailable: boolean;
    adminId: string;
  },
): Promise<void> {
  const { error } = await (admin.from('product_store_availability') as any)
    .upsert(
      {
        product_id: args.productId,
        store_id: args.storeId,
        store_location_id: args.storeLocationId,
        is_available: args.isAvailable,
        updated_at: new Date().toISOString(),
        updated_by: args.adminId,
      },
      { onConflict: 'product_id,store_id,store_location_id' },
    );
  if (error) throw new Error(`Availability upsert failed: ${error.message}`);
}

async function closeRun(
  admin: SupabaseClient,
  runId: string,
  status: 'success' | 'partial' | 'failed',
  counters: Counters,
  errors: RowError[],
  fatalError: string | null,
): Promise<void> {
  await (admin.from('scrape_runs') as any)
    .update({
      status,
      ended_at: new Date().toISOString(),
      locations_upserted: counters.locations_upserted,
      products_upserted: counters.products_upserted,
      prices_inserted: counters.prices_inserted,
      availability_writes: counters.availability_writes,
      categories_writes: counters.categories_writes,
      errors,
      fatal_error: fatalError,
    })
    .eq('id', runId);
}

function isPromotableUpc(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (trimmed.length !== 12 && trimmed.length !== 13) return false;
  return /^\d+$/.test(trimmed);
}

function normalizeAmount(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (!Number.isInteger(raw)) return null;
  if (raw < 0) return null;
  if (raw > 100_000_000) return null;
  return raw;
}

function normalizeCurrency(raw: unknown): string {
  if (typeof raw !== 'string') return 'TTD';
  const trimmed = raw.trim().toUpperCase();
  if (trimmed.length !== 3) return 'TTD';
  return trimmed;
}

function stringOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function numberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
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
