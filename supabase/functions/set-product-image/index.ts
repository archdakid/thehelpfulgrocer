// Admin product-image endpoint (F8 Phase 2 — product image overrides).
//
// The admin upload flow:
//   1. Admin browser uploads bytes to storage at
//      product-images/{productId}/{uuid}.{ext} via their own JWT —
//      bucket RLS (migration 0016) lets admin profiles insert.
//   2. Admin server action invokes this function with `{ productId,
//      imagePath }` (or `imagePath: null` to clear).
//   3. We re-check admin via JWT, then write the public URL to
//      products.image_url with service_role and clean up the previous
//      object so the bucket doesn't accumulate orphans.
//
// Path-not-URL on the wire: the client sends the storage path it just
// uploaded to. We construct the public URL from SUPABASE_URL so the
// project URL stays in one place; image_url ends up
// `${SUPABASE_URL}/storage/v1/object/public/product-images/${path}`.
// The same shape lets us reverse-engineer the path on replace/clear
// to delete the old object.

// deno-lint-ignore-file no-explicit-any

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const BUCKET = 'product-images';
const PUBLIC_URL_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Payload = {
  productId?: unknown;
  imagePath?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const body = (await req.json().catch(() => null)) as Payload | null;
    const productId = typeof body?.productId === 'string' ? body.productId : null;
    if (!productId) return jsonError(400, 'productId is required');

    // null/undefined → clear; string → set. Reject any other shape so a
    // typo doesn't quietly become a clear.
    let imagePath: string | null;
    if (body?.imagePath === null || body?.imagePath === undefined) {
      imagePath = null;
    } else if (typeof body.imagePath === 'string') {
      imagePath = body.imagePath.trim();
      if (!imagePath) return jsonError(400, 'imagePath cannot be empty');
      // Defense-in-depth: reject anything that doesn't look like a path
      // inside our bucket (e.g. starts with http, has "..", absolute).
      if (
        imagePath.startsWith('http') ||
        imagePath.startsWith('/') ||
        imagePath.includes('..')
      ) {
        return jsonError(400, 'Invalid imagePath');
      }
    } else {
      return jsonError(400, 'imagePath must be a string or null');
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

    return await setImage(admin, productId, imagePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('set-product-image failed', message);
    return jsonError(500, message);
  }
});

async function setImage(
  admin: SupabaseClient,
  productId: string,
  imagePath: string | null,
) {
  // Read current state so we can clean up the old object on replace/clear.
  const { data: current, error: readErr } = await admin
    .from('products')
    .select('id, image_url')
    .eq('id', productId)
    .maybeSingle();
  if (readErr) return jsonError(500, readErr.message);
  if (!current) return jsonError(404, 'Product not found');

  // Sanity-check that the new object actually exists before pointing
  // image_url at it. The client may have failed mid-upload but still
  // called us; without this, we'd write a URL that 404s.
  if (imagePath !== null) {
    const { data: head, error: headErr } = await admin.storage
      .from(BUCKET)
      .list(folderOf(imagePath), { search: filenameOf(imagePath) });
    if (headErr) return jsonError(500, `Storage check failed: ${headErr.message}`);
    if (!head || head.length === 0) {
      return jsonError(404, `Uploaded file not found at ${imagePath}`);
    }
  }

  const newUrl = imagePath !== null ? `${PUBLIC_URL_PREFIX}${imagePath}` : null;
  const { error: updateErr } = await (admin.from('products') as any)
    .update({ image_url: newUrl })
    .eq('id', productId);
  if (updateErr) return jsonError(500, updateErr.message);

  // Best-effort cleanup of the previous object — only if it lived in
  // OUR bucket (legacy rows or admin-pasted URLs we don't manage stay
  // put). Failure here is logged but not fatal: image_url is already
  // updated, so the product is correct; we'll have an orphan blob.
  const oldPath = pathFromOurUrl(current.image_url);
  if (oldPath && oldPath !== imagePath) {
    const { error: rmErr } = await admin.storage.from(BUCKET).remove([oldPath]);
    if (rmErr) {
      console.warn('Old image cleanup failed', { productId, oldPath, error: rmErr.message });
    }
  }

  return jsonOk({ ok: true, image_url: newUrl });
}

// Extracts the storage path from a public URL we previously wrote.
// Anything else (OFF URL, hand-pasted URL, null) returns null.
function pathFromOurUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith(PUBLIC_URL_PREFIX)) return null;
  return url.slice(PUBLIC_URL_PREFIX.length);
}

function folderOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

function filenameOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
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
