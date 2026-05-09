// Admin-side resolution endpoint for `flagged_items` (F8 Phase 1).
//
// All four resolution flows that the admin panel exposes — `confirm`,
// `correct`, `reject`, `merge` — funnel through here so the actual writes
// (price contributions, alias inserts, auto-created product deletes,
// receipt_item reassignments) all happen with service_role in one place.
// That lets the database keep RLS narrow: admins only have SELECT on
// `receipts`/`receipt_items` and the column-scoped UPDATE on
// `flagged_items` granted by 0010. Everything sensitive lives here.
//
// Auth: caller's JWT is forwarded by supabase.functions.invoke(). We
// re-check `profiles.is_admin = true` via the JWT-bound client so even a
// signed-in non-admin gets a 403, then escalate to service role for the
// writes.
//
// Idempotency: if the flagged_item is already resolved we return ok with
// `skipped: true` — clicking twice from the UI is harmless.

// deno-lint-ignore-file no-explicit-any

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Reason =
  | 'unmatched'
  | 'low_confidence'
  | 'auto_created_product'
  | 'potential_duplicate';
type Action = 'confirm' | 'correct' | 'reject' | 'merge' | 'merge_duplicate';
type Resolution = 'confirmed' | 'corrected' | 'rejected' | 'merged';

// Optional per-resolve edits the admin can apply alongside the action.
// `productName`, `brand`, and `category` only apply to
// `auto_created_product` (we own that row — editing canonical catalog
// rows would have catalog-wide side effects). `lineTotalMinorUnits`
// and `unitPriceMinorUnits` apply on any path that contributes or
// updates a price — Gemini occasionally misreads totals, and admins
// also legitimately need to fix sale prices that came in transcribed
// wrong. Sale handling falls out for free: the contributed price's
// `observed_at` already captures *when*, so a sale-priced observation
// is just a normal price point dated to the receipt.
//
// Encoding: keys absent or undefined → leave alone. null on a nullable
// field → explicitly clear. We can't differentiate "absent" from
// "explicit null" for lineTotalMinorUnits because it can't be null
// (column is NOT NULL).
type Edits = {
  productName?: string;
  brand?: string | null;
  category?: string | null;
  lineTotalMinorUnits?: number;
  unitPriceMinorUnits?: number | null;
};

// Mirrors the CHECK constraint on products.category (migration 0004) and
// the manage-product Edge Function's allow-list. Drift here means valid
// admin edits get rejected, not bad data lands.
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

type Payload = {
  flaggedItemId?: unknown;
  action?: unknown;
  targetProductId?: unknown;
  notes?: unknown;
  edits?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const body = (await req.json().catch(() => null)) as Payload | null;
    const flaggedItemId = typeof body?.flaggedItemId === 'string' ? body.flaggedItemId : null;
    const action = body?.action as Action | undefined;
    const targetProductId =
      typeof body?.targetProductId === 'string' ? body.targetProductId : null;
    const notes = typeof body?.notes === 'string' ? body.notes : null;
    const edits = parseEdits(body?.edits);

    if (!flaggedItemId) return jsonError(400, 'Missing flaggedItemId');
    if (
      !action ||
      !['confirm', 'correct', 'reject', 'merge', 'merge_duplicate'].includes(action)
    ) {
      return jsonError(400, 'Invalid action');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError(401, 'Missing Authorization header');
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return jsonError(401, 'Empty bearer token');

    // Verify the caller is an admin. JWT-bound client → RLS ensures we
    // only see profiles.is_admin for the calling user; if no row, they're
    // not an admin.
    //
    // getUser() must be called with the JWT explicitly — a server-side
    // client has no session storage to fall back on, and global.headers
    // only flows to PostgREST, not the auth client.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: who, error: whoErr } = await userClient.auth.getUser(jwt);
    const adminId = who?.user?.id;
    if (!adminId) {
      console.error('getUser failed', whoErr?.message, 'jwt-len', jwt.length);
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

    const result = await resolve(admin, {
      flaggedItemId,
      action,
      targetProductId,
      notes,
      edits,
      resolvedBy: adminId,
    });
    return jsonOk(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('resolve-flagged-item failed', message);
    return jsonError(500, message);
  }
});

type ResolveCtx = {
  flaggedItemId: string;
  action: Action;
  targetProductId: string | null;
  notes: string | null;
  edits: Edits;
  resolvedBy: string;
};

async function resolve(admin: SupabaseClient, ctx: ResolveCtx) {
  // Pull the full context. Receipt context (store/currency/date) drives
  // backfills for receipt-origin rows; flagged_product_id /
  // candidate_product_id drive ingest-origin (potential_duplicate) merges.
  // Receipt embed is a LEFT JOIN now (no `!inner`) so ingest-origin rows
  // with receipt_item_id null still load.
  const { data: flag, error } = await (admin.from('flagged_items') as any)
    .select(
      `
        id, reason, resolved_at, auto_created_product_id,
        flagged_product_id, candidate_product_id, match_score,
        receipt_item:receipt_items (
          id, raw_text, quantity, unit_price_minor_units, line_total_minor_units, matched_product_id,
          receipt:receipts (
            id, store_id, currency, captured_at, created_at
          )
        )
      `,
    )
    .eq('id', ctx.flaggedItemId)
    .maybeSingle();
  if (error) throw new Error(`Load flag failed: ${error.message}`);
  if (!flag) throw new Error('Flagged item not found');
  if (flag.resolved_at) return { ok: true, skipped: true };

  const reason = flag.reason as Reason;
  const item = flag.receipt_item;
  const receipt = item?.receipt;

  // Validate action ↔ reason combinations. The UI restricts these but a
  // direct API caller could try anything — fail loud rather than silently.
  validateActionReason(ctx.action, reason);

  // potential_duplicate is the ingest-origin path: no receipt context,
  // operates only on the two `products` rows. Branch out so the
  // receipt-required code below doesn't crash on null item/receipt.
  if (reason === 'potential_duplicate') {
    return await resolvePotentialDuplicate(admin, ctx, flag);
  }

  if (!item || !receipt) throw new Error('Missing item/receipt context');

  const observedAt = receipt.captured_at ?? receipt.created_at;
  const currency = receipt.currency ?? 'TTD';

  if ((ctx.action === 'correct' || ctx.action === 'merge') && !ctx.targetProductId) {
    throw new Error(`${ctx.action} requires targetProductId`);
  }

  // Apply admin edits (name / price corrections) before the action branches
  // run. We mutate `item` in place so downstream contributePrice / merge
  // logic sees the edited values and writes them through. Reject doesn't
  // contribute or keep anything, so editing alongside reject is meaningless
  // — skip to avoid surprise side effects on the receipt_item row.
  if (ctx.action !== 'reject') {
    await applyEdits(admin, ctx.edits, item, flag, reason);
  }

  let resolution: Resolution;

  if (ctx.action === 'confirm') {
    if (reason === 'low_confidence') {
      // The OCR pass deliberately skipped contributing a price for
      // low-confidence matches. Now that the admin says it's right,
      // backfill it. Also promote the raw_text to a product_alias so the
      // next receipt with the same line auto-matches at higher confidence.
      const productId = item.matched_product_id;
      if (!productId) throw new Error('low_confidence flag has no matched_product_id');
      await contributePrice(admin, item, productId, receipt.store_id, currency, observedAt);
      await upsertAlias(admin, productId, item.raw_text, 'admin');
      // Bump the receipt_item out of needs_review since the admin signed off.
      await (admin.from('receipt_items') as any)
        .update({ needs_review: false, match_confidence: item.match_confidence })
        .eq('id', item.id);
    } else if (reason === 'auto_created_product') {
      // The OCR pass already contributed a price for the auto-created
      // product. If the admin edited the line total / unit price, sync
      // the existing prices row to match. The update is idempotent when
      // nothing changed — no-op write of the same amount.
      const productId = flag.auto_created_product_id as string | null;
      const newAmount = computePriceAmount(item);
      if (productId && newAmount != null) {
        const { error: priceErr } = await (admin.from('prices') as any)
          .update({ amount_minor_units: newAmount })
          .eq('receipt_item_id', item.id)
          .eq('product_id', productId);
        if (priceErr) throw new Error(`Sync price failed: ${priceErr.message}`);
      }
    }
    resolution = 'confirmed';
  } else if (ctx.action === 'correct') {
    // Reassign the receipt_item to the admin-picked product. Contribute a
    // price (none existed for unmatched; for low_confidence the OCR pass
    // skipped it). Add an alias so future receipts reach this product
    // without a manual trip.
    const target = ctx.targetProductId!;
    await (admin.from('receipt_items') as any)
      .update({ matched_product_id: target, match_confidence: null, needs_review: false })
      .eq('id', item.id);
    await contributePrice(admin, item, target, receipt.store_id, currency, observedAt);
    await upsertAlias(admin, target, item.raw_text, 'admin');
    resolution = 'corrected';
  } else if (ctx.action === 'merge') {
    // auto_created_product → admin says "this is actually $existing". Move
    // the contributed price row over to the target, reassign the item,
    // alias the raw_text on the target, then delete the auto-created
    // product. Order matters: update prices BEFORE delete, otherwise the
    // FK cascade wipes the contribution.
    const target = ctx.targetProductId!;
    const autoProduct = flag.auto_created_product_id as string | null;
    if (!autoProduct) throw new Error('auto_created_product flag has no product id');

    // Reassign the contributed price to the merge target. If the admin
    // also edited the amount, fold that into the same UPDATE so the
    // observation reflects the corrected value on the right product.
    const priceUpdate: Record<string, unknown> = { product_id: target };
    const newAmount = computePriceAmount(item);
    if (newAmount != null) priceUpdate.amount_minor_units = newAmount;
    await (admin.from('prices') as any)
      .update(priceUpdate)
      .eq('receipt_item_id', item.id)
      .eq('product_id', autoProduct);

    await (admin.from('receipt_items') as any)
      .update({ matched_product_id: target, match_confidence: null, needs_review: false })
      .eq('id', item.id);

    await upsertAlias(admin, target, item.raw_text, 'admin');

    // Delete the orphaned auto-created product. Any *other* prices that
    // referenced it (none in practice — the auto-create dedupes within a
    // single receipt) cascade. The flagged_items.auto_created_product_id
    // FK is ON DELETE SET NULL so this row survives for the audit trail.
    await admin.from('products').delete().eq('id', autoProduct);

    resolution = 'merged';
  } else {
    // reject
    if (reason === 'auto_created_product' && flag.auto_created_product_id) {
      // Drop the bogus product. The contributed price (linked via
      // receipt_item_id) cascades through prices.product_id → products.id.
      await admin.from('products').delete().eq('id', flag.auto_created_product_id);
      await (admin.from('receipt_items') as any)
        .update({ matched_product_id: null, match_confidence: null, needs_review: false })
        .eq('id', item.id);
    } else if (reason === 'low_confidence') {
      // Clear the bad match so the item doesn't render as if it points at
      // a real product. No price was contributed for low_confidence so
      // nothing to clean up there.
      await (admin.from('receipt_items') as any)
        .update({ matched_product_id: null, match_confidence: null, needs_review: false })
        .eq('id', item.id);
    }
    // unmatched: nothing was written, just record the resolution.
    resolution = 'rejected';
  }

  const { error: resErr } = await (admin.from('flagged_items') as any)
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: ctx.resolvedBy,
      resolution,
      notes: ctx.notes,
    })
    .eq('id', ctx.flaggedItemId);
  if (resErr) throw new Error(`Mark resolved failed: ${resErr.message}`);

  return { ok: true, resolution };
}

function validateActionReason(action: Action, reason: Reason) {
  const allowed: Record<Reason, Action[]> = {
    unmatched: ['correct', 'reject'],
    low_confidence: ['confirm', 'correct', 'reject'],
    auto_created_product: ['confirm', 'merge', 'reject'],
    potential_duplicate: ['merge_duplicate', 'reject'],
  };
  if (!allowed[reason].includes(action)) {
    throw new Error(`Action '${action}' not valid for reason '${reason}'`);
  }
}

// Ingest-origin merge resolver. Two valid actions on potential_duplicate:
//
//   - merge_duplicate: collapse flagged_product_id into candidate_product_id
//     (or admin-picked targetProductId if they prefer a different winner).
//     Calls the merge_products() Postgres function which moves prices,
//     aliases, availability, categories atomically and deletes the loser.
//   - reject: admin says "these aren't actually duplicates, keep both."
//     Just marks the flag resolved.
//
// The flagged_items row's flagged_product_id and candidate_product_id are
// both ON DELETE SET NULL — merge_products() repoints them at the winner
// before the loser delete, so the audit row survives with coherent
// references.
async function resolvePotentialDuplicate(
  admin: SupabaseClient,
  ctx: ResolveCtx,
  flag: any,
): Promise<{ ok: true; resolution: Resolution }> {
  const flaggedProductId = flag.flagged_product_id as string | null;
  if (!flaggedProductId) {
    throw new Error('potential_duplicate flag has no flagged_product_id');
  }

  let resolution: Resolution;

  if (ctx.action === 'merge_duplicate') {
    // Default winner is the original candidate the matcher suggested. Admin
    // can override via targetProductId if they decide a different existing
    // product is the better target (e.g. the candidate is itself a stale
    // duplicate of a third row).
    const winnerId = ctx.targetProductId ?? (flag.candidate_product_id as string | null);
    if (!winnerId) {
      throw new Error('merge_duplicate requires targetProductId or candidate_product_id');
    }
    if (winnerId === flaggedProductId) {
      throw new Error('merge_duplicate: target equals flagged product');
    }

    const { error: mErr } = await (admin.rpc as any)('merge_products', {
      p_loser_id: flaggedProductId,
      p_winner_id: winnerId,
    });
    if (mErr) throw new Error(`Merge failed: ${mErr.message}`);
    resolution = 'merged';
  } else if (ctx.action === 'reject') {
    // "Not actually a duplicate" — keep both products as-is.
    resolution = 'rejected';
  } else {
    throw new Error(`Action '${ctx.action}' not valid for potential_duplicate`);
  }

  const { error: resErr } = await (admin.from('flagged_items') as any)
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: ctx.resolvedBy,
      resolution,
      notes: ctx.notes,
    })
    .eq('id', ctx.flaggedItemId);
  if (resErr) throw new Error(`Mark resolved failed: ${resErr.message}`);

  return { ok: true, resolution };
}

async function contributePrice(
  admin: SupabaseClient,
  item: any,
  productId: string,
  storeId: string | null,
  currency: string,
  observedAt: string,
) {
  // Same shape as the OCR pass's contribute pass — the receipt_item_id
  // FK gives us provenance. Skip silently if the receipt has no store
  // (admin can come back after pinning a store on the receipt).
  if (!storeId) return;
  const amount = computePriceAmount(item);
  if (amount == null) return;

  // Don't double-contribute. If a price row already exists for this
  // (receipt_item, product) pair — the auto_created_product confirm path
  // shouldn't reach here, but a re-run of correct on the same item could —
  // skip the insert.
  const { data: existing } = await (admin.from('prices') as any)
    .select('id')
    .eq('receipt_item_id', item.id)
    .eq('product_id', productId)
    .maybeSingle();
  if (existing) return;

  await admin.from('prices').insert({
    product_id: productId,
    store_id: storeId,
    amount_minor_units: amount,
    currency,
    source: 'receipt',
    observed_at: observedAt,
    receipt_item_id: item.id,
  } as any);
}

async function upsertAlias(
  admin: SupabaseClient,
  productId: string,
  rawText: string,
  source: 'admin' | 'receipt' | 'manual',
) {
  const alias = rawText.trim();
  if (!alias) return;
  await (admin.from('product_aliases') as any).upsert(
    { product_id: productId, alias, source },
    { onConflict: 'product_id,alias', ignoreDuplicates: true },
  );
}

// Coerces a raw `edits` field from the request body into the strict shape.
// Treats unexpected types as "field absent" rather than throwing — the
// admin client should be sending well-formed values, but a permissive
// parser keeps a typo from blocking an otherwise valid resolve.
function parseEdits(value: unknown): Edits {
  if (!value || typeof value !== 'object') return {};
  const v = value as Record<string, unknown>;
  const out: Edits = {};
  if (typeof v.productName === 'string') out.productName = v.productName;
  // brand + category are nullable. `null` = explicit clear, string = set,
  // anything else = leave alone. Empty string is treated as null so the
  // UI's "blank input means clear" behavior round-trips cleanly.
  if (v.brand === null) {
    out.brand = null;
  } else if (typeof v.brand === 'string') {
    const t = v.brand.trim();
    out.brand = t === '' ? null : t;
  }
  if (v.category === null) {
    out.category = null;
  } else if (typeof v.category === 'string') {
    const t = v.category.trim().toLowerCase();
    out.category = t === '' ? null : t;
  }
  if (typeof v.lineTotalMinorUnits === 'number') {
    out.lineTotalMinorUnits = v.lineTotalMinorUnits;
  }
  if (v.unitPriceMinorUnits === null) {
    out.unitPriceMinorUnits = null;
  } else if (typeof v.unitPriceMinorUnits === 'number') {
    out.unitPriceMinorUnits = v.unitPriceMinorUnits;
  }
  return out;
}

async function applyEdits(
  admin: SupabaseClient,
  edits: Edits,
  item: any,
  flag: any,
  reason: Reason,
): Promise<void> {
  // 1. Product fields (name / brand / category). Only auto-created
  // products can be edited here — matched/canonical products are shared
  // catalog rows and editing them from a receipt context would have
  // catalog-wide side effects. We bundle the three writes into one
  // UPDATE so the row only ticks once.
  const productPatch: Record<string, unknown> = {};
  if (edits.productName !== undefined) {
    if (reason !== 'auto_created_product') {
      throw new Error('Product name edits only allowed for auto_created_product');
    }
    const trimmed = edits.productName.trim();
    if (trimmed.length === 0) throw new Error('Product name cannot be empty');
    if (trimmed.length > 200) throw new Error('Product name too long (max 200)');
    productPatch.name = trimmed;
  }
  if (edits.brand !== undefined) {
    if (reason !== 'auto_created_product') {
      throw new Error('Brand edits only allowed for auto_created_product');
    }
    if (edits.brand !== null && edits.brand.length > 100) {
      throw new Error('Brand too long (max 100)');
    }
    productPatch.brand = edits.brand;
  }
  if (edits.category !== undefined) {
    if (reason !== 'auto_created_product') {
      throw new Error('Category edits only allowed for auto_created_product');
    }
    if (edits.category !== null && !CATEGORIES.has(edits.category)) {
      throw new Error(`category must be one of: ${[...CATEGORIES].join(', ')}`);
    }
    productPatch.category = edits.category;
  }
  if (Object.keys(productPatch).length > 0) {
    if (!flag.auto_created_product_id) {
      throw new Error('No auto-created product to edit');
    }
    const { error } = await admin
      .from('products')
      .update(productPatch)
      .eq('id', flag.auto_created_product_id);
    if (error) throw new Error(`Update product failed: ${error.message}`);
  }

  // 2. Line total / unit price on the receipt_item. Mutate the in-memory
  // `item` too so the contributePrice / merge paths downstream see the
  // edited values without re-fetching.
  const itemPatch: Record<string, number | null> = {};
  if (edits.lineTotalMinorUnits !== undefined) {
    if (!Number.isInteger(edits.lineTotalMinorUnits) || edits.lineTotalMinorUnits <= 0) {
      throw new Error('lineTotalMinorUnits must be a positive integer');
    }
    itemPatch.line_total_minor_units = edits.lineTotalMinorUnits;
    item.line_total_minor_units = edits.lineTotalMinorUnits;
  }
  if (edits.unitPriceMinorUnits !== undefined) {
    if (
      edits.unitPriceMinorUnits !== null &&
      (!Number.isInteger(edits.unitPriceMinorUnits) || edits.unitPriceMinorUnits <= 0)
    ) {
      throw new Error('unitPriceMinorUnits must be a positive integer or null');
    }
    itemPatch.unit_price_minor_units = edits.unitPriceMinorUnits;
    item.unit_price_minor_units = edits.unitPriceMinorUnits;
  }
  if (Object.keys(itemPatch).length > 0) {
    const { error } = await admin
      .from('receipt_items')
      .update(itemPatch)
      .eq('id', item.id);
    if (error) throw new Error(`Update receipt item failed: ${error.message}`);
  }
}

// Same logic as contributePrice's amount derivation, lifted to a helper
// so the auto_created_product confirm and merge paths can re-derive the
// observed amount after applyEdits mutated the item.
function computePriceAmount(item: any): number | null {
  if (item.line_total_minor_units == null || item.line_total_minor_units <= 0) return null;
  const amount =
    item.unit_price_minor_units != null && item.unit_price_minor_units > 0
      ? item.unit_price_minor_units
      : item.quantity > 0
        ? Math.round(item.line_total_minor_units / item.quantity)
        : item.line_total_minor_units;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
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
