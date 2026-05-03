'use server';

import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ProductCategory } from './categories';

type Result = { ok: true; imageUrl: string | null } | { ok: false; error: string };

export type ProductFields = {
  name?: string;
  brand?: string | null;
  upc?: string | null;
  category?: ProductCategory | null;
};

type CreateResult =
  | { ok: true; product: { id: string; name: string } }
  | { ok: false; error: string };

type UpdateResult = { ok: true } | { ok: false; error: string };

export type DeleteCounts = { prices: number; aliases: number };

type PreviewDeleteResult =
  | { ok: true; counts: DeleteCounts }
  | { ok: false; error: string };

type DeleteResult =
  | { ok: true; counts: DeleteCounts }
  | { ok: false; error: string };

// Returns the parsed function response or a normalized error string.
// Discriminated by `data` vs `error` so callers can narrow without
// optional-property dance.
async function invokeFunction<T>(
  fn: string,
  body: Record<string, unknown>,
): Promise<{ data: T } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { error: 'Not signed in' };

  const { data, error } = await supabase.functions.invoke<T & { error?: string }>(
    fn,
    {
      body,
      headers: { Authorization: `Bearer ${session.access_token}` },
    },
  );

  if (error) {
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const eb = (await ctx.clone().json()) as { error?: string };
        if (eb?.error) return { error: eb.error };
      } catch {
        /* fall through */
      }
    }
    return { error: error.message };
  }
  if (!data) return { error: 'Empty response' };
  if (data.error) return { error: data.error };
  return { data: data as T };
}

const invokeManageProduct = <T>(body: Record<string, unknown>) =>
  invokeFunction<T>('manage-product', body);

export async function createProduct(input: {
  name: string;
  brand?: string;
  upc?: string;
  category?: ProductCategory;
}): Promise<CreateResult> {
  const trimmedName = input.name.trim();
  if (!trimmedName) return { ok: false, error: 'Name is required' };

  const res = await invokeManageProduct<{
    product?: { id: string; name: string };
  }>({
    action: 'create',
    name: trimmedName,
    brand: input.brand?.trim() || undefined,
    upc: input.upc?.trim() || undefined,
    category: input.category ?? undefined,
  });
  if ('error' in res) return { ok: false, error: res.error };
  if (!res.data.product) return { ok: false, error: 'No product returned' };

  revalidatePath('/products');
  return { ok: true, product: res.data.product };
}

export async function updateProduct(
  productId: string,
  fields: ProductFields,
): Promise<UpdateResult> {
  if (Object.keys(fields).length === 0) {
    return { ok: false, error: 'No fields to update' };
  }
  const res = await invokeManageProduct<Record<string, unknown>>({
    action: 'update',
    productId,
    fields,
  });
  if ('error' in res) return { ok: false, error: res.error };

  revalidatePath('/products');
  revalidatePath(`/products/${productId}`);
  return { ok: true };
}

// Two-phase delete to keep the destructive confirm honest. The first
// call returns counts of cascaded rows (prices, aliases) so the UI can
// show "this will wipe N price observations" before the admin commits.
export async function previewDeleteProduct(
  productId: string,
): Promise<PreviewDeleteResult> {
  const res = await invokeManageProduct<{
    counts?: DeleteCounts;
  }>({ action: 'delete', productId, confirm: false });
  if ('error' in res) return { ok: false, error: res.error };
  if (!res.data.counts) return { ok: false, error: 'No counts in response' };
  return { ok: true, counts: res.data.counts };
}

export async function deleteProduct(
  productId: string,
): Promise<DeleteResult> {
  const res = await invokeManageProduct<{
    counts?: DeleteCounts;
  }>({ action: 'delete', productId, confirm: true });
  if ('error' in res) return { ok: false, error: res.error };

  revalidatePath('/products');
  revalidatePath(`/products/${productId}`);
  return { ok: true, counts: res.data.counts ?? { prices: 0, aliases: 0 } };
}

// Sets or clears products.image_url. The client uploaded the bytes
// directly to the `product-images` bucket via storage RLS (admins can
// insert per migration 0016); this server action just hands the path
// to the Edge Function, which re-checks admin and writes the column
// with service_role.
export async function setProductImage(
  productId: string,
  imagePath: string | null,
): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { ok: false, error: 'Not signed in' };

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    image_url?: string | null;
    error?: string;
  }>('set-product-image', {
    body: { productId, imagePath },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) {
    // Same error-unwrap dance as resolve-flagged-item: FunctionsHttpError
    // hides the structured `{ error }` body inside `.context`.
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = (await ctx.clone().json()) as { error?: string };
        if (body?.error) return { ok: false, error: body.error };
      } catch {
        /* fall through */
      }
    }
    return { ok: false, error: error.message };
  }
  if (data?.error) return { ok: false, error: data.error };

  revalidatePath('/products');
  revalidatePath(`/products/${productId}`);
  return { ok: true, imageUrl: data?.image_url ?? null };
}

// =============================================================================
// Manual price entry + per-store availability (manage-price Edge Function).
// Prices are append-only; setPrice always inserts a new observation row.
// Availability is upserted on (product_id, store_id).
// =============================================================================

type SetPriceResult = { ok: true } | { ok: false; error: string };
type SetAvailabilityResult = { ok: true } | { ok: false; error: string };

export async function setManualPrice(input: {
  productId: string;
  storeId: string;
  amountMinorUnits: number;
  currency?: string;
}): Promise<SetPriceResult> {
  const res = await invokeFunction<Record<string, unknown>>('manage-price', {
    action: 'setPrice',
    productId: input.productId,
    storeId: input.storeId,
    amountMinorUnits: input.amountMinorUnits,
    currency: input.currency,
  });
  if ('error' in res) return { ok: false, error: res.error };
  revalidatePath(`/products/${input.productId}`);
  return { ok: true };
}

export async function setStoreAvailability(input: {
  productId: string;
  storeId: string;
  isAvailable: boolean;
}): Promise<SetAvailabilityResult> {
  const res = await invokeFunction<Record<string, unknown>>('manage-price', {
    action: 'setAvailability',
    productId: input.productId,
    storeId: input.storeId,
    isAvailable: input.isAvailable,
  });
  if ('error' in res) return { ok: false, error: res.error };
  revalidatePath(`/products/${input.productId}`);
  return { ok: true };
}
