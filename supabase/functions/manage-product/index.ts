// Admin product CRUD endpoint (F8 Phase 2 — products as first-class admin
// resources). Mirrors `manage-store`: JWT-bound admin re-check, then
// service-role writes against `public.products`. The image side stays in
// `set-product-image` because that flow has its own storage cleanup
// concerns; this function handles only the relational fields.
//
// Three actions:
//   - create  { name, brand?, upc?, category? }  → insert, returns row
//   - update  { productId, fields: { name?, brand?, upc?, category? } } → patch
//   - delete  { productId, confirm: boolean } → preview counts (confirm=false)
//             or actually delete (confirm=true)
//
// Encoding for nullable fields on update:
//   - field absent / undefined → leave alone
//   - field === null           → explicit clear
//   - field === string         → set
// `name` cannot be null (NOT NULL on the column); we reject the clear
// attempt rather than letting Postgres throw.
//
// Delete cascade behavior (from migrations 0001/0009/0010/0014/0008):
//   - prices.product_id              → CASCADE (deleted)
//   - product_aliases.product_id     → CASCADE (deleted)
//   - receipt_items.matched_product_id   → SET NULL (preserved)
//   - circular_items.matched_product_id  → SET NULL (preserved)
//   - circular_items.contributed_product_id → SET NULL (preserved)
//   - flagged_items.auto_created_product_id → SET NULL (preserved)
// Storage objects under product-images/{productId}/* are cleaned up
// best-effort post-delete; orphans aren't fatal.

// deno-lint-ignore-file no-explicit-any

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mirror of the CHECK constraint added in migration 0004 and expanded in
// 0032. Keeping this list in sync with the migration is a manual concern
// (same as mobile/constants/categories.ts); a typo here just means the
// function rejects valid input, not that bad data lands.
const CATEGORIES = new Set([
  'produce',
  'dairy',
  'meat',
  'bakery',
  'pantry',
  'frozen',
  'beverage',
  'snacks',
  'household',
  'personal_care',
  'pharmacy',
  'baby',
]);

const UOMS = new Set(['each', 'g', 'kg', 'ml', 'L', 'oz', 'lb']);

type Action =
  | 'create'
  | 'update'
  | 'delete'
  | 'upsert_equivalent'
  | 'delete_equivalent';

type Payload = {
  action?: unknown;
  productId?: unknown;
  name?: unknown;
  brand?: unknown;
  upc?: unknown;
  category?: unknown;
  fields?: unknown;
  confirm?: unknown;
  largerProductId?: unknown;
  smallerProductId?: unknown;
  scaleFactor?: unknown;
  notes?: unknown;
  equivalentId?: unknown;
};

const BUCKET = 'product-images';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const body = (await req.json().catch(() => null)) as Payload | null;
    const action = body?.action as Action | undefined;
    if (
      !action ||
      ![
        'create',
        'update',
        'delete',
        'upsert_equivalent',
        'delete_equivalent',
      ].includes(action)
    ) {
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
      const name = normalizeName(body?.name);
      if (!name) return jsonError(400, 'name is required (1-200 chars)');
      const brand = normalizeOptionalString(body?.brand, 100);
      const upc = normalizeOptionalString(body?.upc, 64);
      const category = normalizeCategory(body?.category);
      if (category === 'invalid') {
        return jsonError(400, `category must be one of: ${[...CATEGORIES].join(', ')}`);
      }
      return await createProduct(admin, { name, brand, upc, category });
    }

    if (action === 'upsert_equivalent') {
      const largerProductId =
        typeof body?.largerProductId === 'string' ? body.largerProductId : null;
      const smallerProductId =
        typeof body?.smallerProductId === 'string' ? body.smallerProductId : null;
      const scaleFactor =
        typeof body?.scaleFactor === 'number' && Number.isFinite(body.scaleFactor)
          ? body.scaleFactor
          : null;
      const notes = normalizeOptionalString(body?.notes, 500) ?? null;

      if (!largerProductId || !smallerProductId) {
        return jsonError(400, 'largerProductId and smallerProductId are required');
      }
      if (largerProductId === smallerProductId) {
        return jsonError(400, 'Cannot link a product to itself');
      }
      if (scaleFactor === null || scaleFactor <= 1) {
        return jsonError(400, 'scaleFactor must be a number > 1');
      }

      const { data: eqRow, error: eqErr } = await (
        admin.from('product_equivalents') as any
      )
        .upsert(
          {
            product_id: largerProductId,
            equivalent_product_id: smallerProductId,
            scale_factor: scaleFactor,
            source: 'admin',
            notes,
            created_by: adminId,
          },
          { onConflict: 'product_id,equivalent_product_id' },
        )
        .select('id, product_id, equivalent_product_id, scale_factor, source, notes')
        .single();
      if (eqErr) return jsonError(500, eqErr.message);
      return jsonOk({ ok: true, equivalent: eqRow });
    }

    if (action === 'delete_equivalent') {
      const equivalentId =
        typeof body?.equivalentId === 'string' ? body.equivalentId : null;
      if (!equivalentId) return jsonError(400, 'equivalentId is required');
      const { error: delEqErr } = await (
        admin.from('product_equivalents') as any
      )
        .delete()
        .eq('id', equivalentId);
      if (delEqErr) return jsonError(500, delEqErr.message);
      return jsonOk({ ok: true, deleted: true });
    }

    const productId = typeof body?.productId === 'string' ? body.productId : null;
    if (!productId) return jsonError(400, 'productId is required');

    if (action === 'delete') {
      const confirm = body?.confirm === true;
      return await deleteProduct(admin, productId, confirm);
    }

    // update
    const fieldsRaw = body?.fields;
    if (!fieldsRaw || typeof fieldsRaw !== 'object') {
      return jsonError(400, 'fields object is required');
    }
    const patch = parseUpdate(fieldsRaw as Record<string, unknown>);
    if (typeof patch === 'string') return jsonError(400, patch);
    if (Object.keys(patch).length === 0) {
      return jsonError(400, 'fields object had no recognized keys');
    }
    return await updateProduct(admin, productId, patch);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('manage-product failed', message);
    return jsonError(500, message);
  }
});

function normalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 200) return null;
  return trimmed;
}

// Trims and length-caps. `null` (explicit clear) and empty string are
// treated identically for nullable fields. Returns:
//   - undefined → caller should leave alone
//   - null      → caller should explicitly clear
//   - string    → caller should set
function normalizeOptionalString(
  raw: unknown,
  maxLen: number,
): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLen) return null; // treat overflow as "clear" — caller can re-validate
  return trimmed;
}

// Returns the category string, null (clear), undefined (leave alone),
// or the literal 'invalid' so the caller can surface a 400.
function normalizeCategory(raw: unknown): string | null | undefined | 'invalid' {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== 'string') return 'invalid';
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0) return null;
  if (!CATEGORIES.has(trimmed)) return 'invalid';
  return trimmed;
}

type UpdatePatch = {
  name?: string;
  brand?: string | null;
  upc?: string | null;
  category?: string | null;
  unit_size?: number | null;
  unit_of_measure?: string | null;
  units_per_pack?: number | null;
  is_sold_by_weight?: boolean;
  description?: string | null;
};

// Build the column patch from a free-form `fields` object. Returns the
// patch on success or an error message string. Treats `name === null`
// as a hard 400 since the column is NOT NULL.
function parseUpdate(fields: Record<string, unknown>): UpdatePatch | string {
  const patch: UpdatePatch = {};

  if ('name' in fields) {
    if (fields.name === null) return 'name cannot be null';
    const name = normalizeName(fields.name);
    if (!name) return 'name must be 1-200 chars';
    patch.name = name;
  }

  if ('brand' in fields) {
    const brand = normalizeOptionalString(fields.brand, 100);
    if (brand !== undefined) patch.brand = brand;
  }

  if ('upc' in fields) {
    const upc = normalizeOptionalString(fields.upc, 64);
    if (upc !== undefined) patch.upc = upc;
  }

  if ('category' in fields) {
    const category = normalizeCategory(fields.category);
    if (category === 'invalid') {
      return `category must be one of: ${[...CATEGORIES].join(', ')}`;
    }
    if (category !== undefined) patch.category = category;
  }

  if ('unit_size' in fields) {
    const v = fields.unit_size;
    if (v === null) {
      patch.unit_size = null;
    } else if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      patch.unit_size = v;
    } else {
      return 'unit_size must be a number > 0 or null';
    }
  }

  if ('unit_of_measure' in fields) {
    const v = fields.unit_of_measure;
    if (v === null || v === '') {
      patch.unit_of_measure = null;
    } else if (typeof v === 'string' && UOMS.has(v)) {
      patch.unit_of_measure = v;
    } else {
      return `unit_of_measure must be one of: ${[...UOMS].join(', ')}`;
    }
  }

  if ('units_per_pack' in fields) {
    const v = fields.units_per_pack;
    if (v === null) {
      patch.units_per_pack = null;
    } else if (typeof v === 'number' && Number.isInteger(v) && v >= 1) {
      patch.units_per_pack = v;
    } else {
      return 'units_per_pack must be an integer >= 1 or null';
    }
  }

  if ('is_sold_by_weight' in fields) {
    if (typeof fields.is_sold_by_weight === 'boolean') {
      patch.is_sold_by_weight = fields.is_sold_by_weight;
    } else {
      return 'is_sold_by_weight must be a boolean';
    }
  }

  if ('description' in fields) {
    const desc = normalizeOptionalString(fields.description, 2000);
    if (desc !== undefined) patch.description = desc;
  }

  return patch;
}

async function createProduct(
  admin: SupabaseClient,
  args: {
    name: string;
    brand: string | null | undefined;
    upc: string | null | undefined;
    category: string | null | undefined | 'invalid';
  },
) {
  const insert: Record<string, unknown> = { name: args.name };
  if (args.brand !== undefined) insert.brand = args.brand;
  if (args.upc !== undefined) insert.upc = args.upc;
  if (args.category !== undefined && args.category !== 'invalid') {
    insert.category = args.category;
  }

  const { data, error } = await (admin.from('products') as any)
    .insert(insert)
    .select('id, name, brand, upc, category, image_url, created_at')
    .single();
  if (error) {
    if (error.code === '23505') {
      // products.upc is the unique constraint we'd realistically hit.
      return jsonError(409, `A product with UPC "${args.upc}" already exists.`);
    }
    if (error.code === '23514') {
      return jsonError(400, 'category failed the database check constraint');
    }
    return jsonError(500, error.message);
  }
  return jsonOk({ ok: true, product: data });
}

async function updateProduct(
  admin: SupabaseClient,
  productId: string,
  patch: UpdatePatch,
) {
  const { data, error } = await (admin.from('products') as any)
    .update(patch)
    .eq('id', productId)
    .select(
      'id, name, brand, upc, category, unit_size, unit_of_measure, units_per_pack, is_sold_by_weight, description, image_url, updated_at:created_at',
    )
    .single();
  if (error) {
    if (error.code === '23505') {
      return jsonError(409, `Another product already uses UPC "${patch.upc}".`);
    }
    if (error.code === '23514') {
      return jsonError(400, 'Product field failed database check constraint');
    }
    return jsonError(500, error.message);
  }
  if (!data) return jsonError(404, 'Product not found');
  return jsonOk({ ok: true, product: data });
}

// Two-phase: confirm=false returns counts only (so the admin UI can show
// "this will delete N prices, M aliases — continue?"); confirm=true does
// the delete after re-counting. We re-count under confirm rather than
// trusting whatever the UI saw, because price observations may have
// arrived between preview and confirm — the admin should see the actual
// final tally in the response.
async function deleteProduct(
  admin: SupabaseClient,
  productId: string,
  confirm: boolean,
) {
  const { data: product, error: readErr } = await admin
    .from('products')
    .select('id, name, image_url')
    .eq('id', productId)
    .maybeSingle();
  if (readErr) return jsonError(500, readErr.message);
  if (!product) return jsonError(404, 'Product not found');

  const counts = await countDependents(admin, productId);
  if ('error' in counts) return jsonError(500, counts.error);

  if (!confirm) {
    return jsonOk({
      ok: true,
      preview: true,
      product: { id: product.id, name: product.name },
      counts: counts.value,
    });
  }

  // Delete the row. Cascades wipe prices + aliases; SET NULL on
  // receipt_items / circular_items / flagged_items preserves audit.
  const { error: delErr } = await (admin.from('products') as any)
    .delete()
    .eq('id', productId);
  if (delErr) return jsonError(500, delErr.message);

  // Best-effort storage cleanup — list and remove anything under the
  // product's prefix. Failure here is logged but not fatal: the row is
  // gone, so the orphan blob is just bucket lint.
  await cleanupProductImages(admin, productId);

  return jsonOk({
    ok: true,
    deleted: true,
    product: { id: product.id, name: product.name },
    counts: counts.value,
  });
}

async function countDependents(
  admin: SupabaseClient,
  productId: string,
): Promise<
  | { value: { prices: number; aliases: number } }
  | { error: string }
> {
  const [pricesRes, aliasesRes] = await Promise.all([
    (admin.from('prices') as any)
      .select('id', { count: 'exact', head: true })
      .eq('product_id', productId),
    (admin.from('product_aliases') as any)
      .select('id', { count: 'exact', head: true })
      .eq('product_id', productId),
  ]);
  if (pricesRes.error) return { error: `prices count: ${pricesRes.error.message}` };
  if (aliasesRes.error) return { error: `aliases count: ${aliasesRes.error.message}` };
  return {
    value: {
      prices: pricesRes.count ?? 0,
      aliases: aliasesRes.count ?? 0,
    },
  };
}

async function cleanupProductImages(admin: SupabaseClient, productId: string) {
  const { data, error } = await admin.storage.from(BUCKET).list(productId);
  if (error) {
    console.warn('Image list failed during product delete', {
      productId,
      error: error.message,
    });
    return;
  }
  if (!data || data.length === 0) return;
  const paths = data.map((f) => `${productId}/${f.name}`);
  const { error: rmErr } = await admin.storage.from(BUCKET).remove(paths);
  if (rmErr) {
    console.warn('Image cleanup failed during product delete', {
      productId,
      error: rmErr.message,
    });
  }
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
