// Admin product CRUD endpoint (F8 Phase 2 — products as first-class admin
// resources). Mirrors `manage-store`: JWT-bound admin re-check, then
// service-role writes against `public.products`. The image side stays in
// `set-product-image` because that flow has its own storage cleanup
// concerns; this function handles only the relational fields.
//
// Two actions:
//   - create  { name, brand?, upc?, category? }  → insert, returns row
//   - update  { productId, fields: { name?, brand?, upc?, category? } } → patch
//
// Encoding for nullable fields on update:
//   - field absent / undefined → leave alone
//   - field === null           → explicit clear
//   - field === string         → set
// `name` cannot be null (NOT NULL on the column); we reject the clear
// attempt rather than letting Postgres throw.

// deno-lint-ignore-file no-explicit-any

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mirror of the CHECK constraint added in migration 0004. Keeping this
// list in sync with the migration is a manual concern (same as
// mobile/constants/categories.ts); a typo here just means the function
// rejects valid input, not that bad data lands.
const CATEGORIES = new Set([
  'produce',
  'dairy',
  'meat',
  'bakery',
  'pantry',
  'frozen',
  'beverage',
  'snacks',
]);

type Action = 'create' | 'update';

type Payload = {
  action?: unknown;
  productId?: unknown;
  name?: unknown;
  brand?: unknown;
  upc?: unknown;
  category?: unknown;
  fields?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const body = (await req.json().catch(() => null)) as Payload | null;
    const action = body?.action as Action | undefined;
    if (!action || !['create', 'update'].includes(action)) {
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

    // update
    const productId = typeof body?.productId === 'string' ? body.productId : null;
    if (!productId) return jsonError(400, 'productId is required');
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
    .select('id, name, brand, upc, category, image_url, updated_at:created_at')
    .single();
  if (error) {
    if (error.code === '23505') {
      return jsonError(409, `Another product already uses UPC "${patch.upc}".`);
    }
    if (error.code === '23514') {
      return jsonError(400, 'category failed the database check constraint');
    }
    return jsonError(500, error.message);
  }
  if (!data) return jsonError(404, 'Product not found');
  return jsonOk({ ok: true, product: data });
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
