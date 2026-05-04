// Admin product-image candidate review (F8 Phase 2 — last piece).
//
// Three actions, all admin-gated via JWT re-check then service-role writes:
//
//   - fetchCandidates { productId }
//       Looks up the product's UPC, queries Open Food Facts v2 for the
//       four image fields (front, packaging, ingredients, nutrition),
//       returns whichever ones are populated. No DB writes; the admin
//       hasn't picked yet.
//
//   - import { productId, sourceUrl }
//       Downloads the bytes from `sourceUrl`, uploads them into our
//       `product-images/{productId}/import-{ts}.{ext}` path, and points
//       products.image_url at the new public URL. Cleans up the
//       previous object if the prior URL lived in our bucket. Mirrors
//       set-product-image's cleanup so the two flows can interleave.
//
//   - skip { productId }
//       Marks products.image_skipped = true so the queue stops showing
//       this row. Reversible by hand (admin edits the row directly) if
//       needed; not exposed in the queue UI.
//
// Why download instead of just storing the OFF URL?
//   1. Mobile renders straight from products.image_url with no OFF round
//      trip — meaningfully faster and works offline once expo-image
//      caches the bytes.
//   2. OFF can change or remove the image; once we've copied the bytes
//      they're ours.
//   3. Future cropping / background-removal can run against the stored
//      object without needing OFF in the loop.

// deno-lint-ignore-file no-explicit-any

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const BUCKET = 'product-images';
const PUBLIC_URL_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;

const OFF_BASE = 'https://world.openfoodfacts.org/api/v2';
// Mirrors mobile/lib/openFoodFacts.ts — OFF asks clients to identify
// themselves so they can throttle bad actors without nuking everyone.
const USER_AGENT = 'SmartShopper-Admin/0.1 (https://smartshopper.app)';
// OFF exposes per-section image URLs; we ask for all four so the admin
// can pick the most useful (often "front" but sometimes "packaging" is
// clearer for produce / loose items).
const OFF_FIELDS = [
  'image_url',
  'image_front_url',
  'image_packaging_url',
  'image_ingredients_url',
  'image_nutrition_url',
].join(',');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cap the import to a sensible size; OFF images are typically <500KB
// but a malicious or misconfigured source URL could otherwise stream
// us a giant file. 8MB is generous; flag anything bigger.
const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

type Action = 'fetchCandidates' | 'import' | 'skip';

type Payload = {
  action?: unknown;
  productId?: unknown;
  sourceUrl?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const body = (await req.json().catch(() => null)) as Payload | null;
    const action = body?.action as Action | undefined;
    if (!action || !['fetchCandidates', 'import', 'skip'].includes(action)) {
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

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (action === 'fetchCandidates') {
      return await fetchCandidates(admin, productId);
    }
    if (action === 'skip') {
      return await skipProduct(admin, productId);
    }
    // import
    const sourceUrl = typeof body?.sourceUrl === 'string' ? body.sourceUrl.trim() : '';
    if (!sourceUrl) return jsonError(400, 'sourceUrl is required');
    if (!/^https:\/\//i.test(sourceUrl)) {
      // HTTPS only — defense against being asked to fetch internal
      // addresses or unencrypted hosts.
      return jsonError(400, 'sourceUrl must be https');
    }
    return await importImage(admin, productId, sourceUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('import-product-image failed', message);
    return jsonError(500, message);
  }
});

type Candidate = { kind: string; url: string };

async function fetchCandidates(
  admin: SupabaseClient,
  productId: string,
): Promise<Response> {
  const { data: product, error } = await admin
    .from('products')
    .select('id, upc')
    .eq('id', productId)
    .maybeSingle();
  if (error) return jsonError(500, error.message);
  if (!product) return jsonError(404, 'Product not found');
  if (!product.upc) {
    return jsonOk({ ok: true, candidates: [], reason: 'no_upc' });
  }
  // Internal placeholder UPCs (per mobile/lib/openFoodFacts.ts pattern)
  // would 404 on OFF; skip the round-trip.
  if (product.upc.startsWith('INTERNAL-')) {
    return jsonOk({ ok: true, candidates: [], reason: 'internal_upc' });
  }

  const url = `${OFF_BASE}/product/${encodeURIComponent(product.upc)}?fields=${OFF_FIELDS}`;
  const offRes = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (offRes.status === 404) {
    return jsonOk({ ok: true, candidates: [], reason: 'off_not_found' });
  }
  if (!offRes.ok) {
    return jsonError(502, `OpenFoodFacts request failed: ${offRes.status}`);
  }
  const data = (await offRes.json()) as {
    status?: number;
    product?: Record<string, unknown>;
  };
  if (data.status !== 1 || !data.product) {
    return jsonOk({ ok: true, candidates: [], reason: 'off_no_product' });
  }

  const p = data.product;
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  const push = (kind: string, raw: unknown) => {
    if (typeof raw !== 'string') return;
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    candidates.push({ kind, url: trimmed });
  };
  push('front', p.image_front_url);
  push('main', p.image_url);
  push('packaging', p.image_packaging_url);
  push('ingredients', p.image_ingredients_url);
  push('nutrition', p.image_nutrition_url);

  return jsonOk({ ok: true, candidates });
}

async function skipProduct(
  admin: SupabaseClient,
  productId: string,
): Promise<Response> {
  const { error } = await (admin.from('products') as any)
    .update({ image_skipped: true })
    .eq('id', productId);
  if (error) return jsonError(500, error.message);
  return jsonOk({ ok: true, skipped: true });
}

async function importImage(
  admin: SupabaseClient,
  productId: string,
  sourceUrl: string,
): Promise<Response> {
  const { data: product, error: readErr } = await admin
    .from('products')
    .select('id, image_url')
    .eq('id', productId)
    .maybeSingle();
  if (readErr) return jsonError(500, readErr.message);
  if (!product) return jsonError(404, 'Product not found');

  const fetched = await fetch(sourceUrl, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!fetched.ok) {
    return jsonError(502, `Source fetch failed: ${fetched.status}`);
  }
  const contentType = fetched.headers.get('content-type') ?? 'image/jpeg';
  if (!contentType.startsWith('image/')) {
    return jsonError(400, `Source is not an image (got ${contentType})`);
  }
  const bytes = new Uint8Array(await fetched.arrayBuffer());
  if (bytes.byteLength === 0) {
    return jsonError(502, 'Source returned empty body');
  }
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    return jsonError(413, `Source too large (${bytes.byteLength} bytes)`);
  }

  const ext = extFromContentType(contentType);
  const path = `${productId}/import-${Date.now()}.${ext}`;
  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (uploadErr) return jsonError(500, `Upload failed: ${uploadErr.message}`);

  const newUrl = `${PUBLIC_URL_PREFIX}${path}`;
  const { error: updateErr } = await (admin.from('products') as any)
    .update({ image_url: newUrl, image_skipped: false })
    .eq('id', productId);
  if (updateErr) {
    // Roll back the upload so we don't leave an orphan we then point
    // nothing at — the whole transaction failed.
    await admin.storage.from(BUCKET).remove([path]).catch(() => {});
    return jsonError(500, updateErr.message);
  }

  // Best-effort cleanup of the previous object if it was ours.
  const oldPath = pathFromOurUrl(product.image_url);
  if (oldPath && oldPath !== path) {
    const { error: rmErr } = await admin.storage.from(BUCKET).remove([oldPath]);
    if (rmErr) {
      console.warn('Old image cleanup failed', {
        productId,
        oldPath,
        error: rmErr.message,
      });
    }
  }

  return jsonOk({ ok: true, image_url: newUrl, source_url: sourceUrl });
}

function extFromContentType(ct: string): string {
  const lower = ct.toLowerCase();
  if (lower.includes('png')) return 'png';
  if (lower.includes('webp')) return 'webp';
  if (lower.includes('gif')) return 'gif';
  // Default to jpg — covers image/jpeg and the common no-subtype case.
  return 'jpg';
}

function pathFromOurUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith(PUBLIC_URL_PREFIX)) return null;
  return url.slice(PUBLIC_URL_PREFIX.length);
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
