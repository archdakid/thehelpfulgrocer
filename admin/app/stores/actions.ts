'use server';

import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '@/lib/supabase/server';

type ManagePayload =
  | { action: 'create'; name: string; region?: string }
  | { action: 'rename'; storeId: string; name: string }
  | { action: 'set_active'; storeId: string; isActive: boolean }
  | { action: 'delete'; storeId: string; confirm: boolean };

type Result = { ok: true } | { ok: false; error: string };

export type StoreDeleteCounts = {
  prices: number;
  availability: number;
  locations: number;
  receipts: number;
  circulars: number;
};

type PreviewDeleteResult =
  | { ok: true; counts: StoreDeleteCounts; blocked: string | null }
  | { ok: false; error: string };

type DeleteResult =
  | { ok: true; counts: StoreDeleteCounts }
  | { ok: false; error: string };

async function invokeManageStore(payload: ManagePayload): Promise<Result> {
  const res = await rawInvokeManageStore<Record<string, unknown>>(payload);
  if ('error' in res) return { ok: false, error: res.error };
  revalidatePath('/stores');
  return { ok: true };
}

// Same JWT-passthrough pattern as queue/[id]/actions.ts — @supabase/ssr
// doesn't propagate the cookie-derived JWT to functions.invoke().
// Returns the parsed function body so callers that need extra fields
// (preview counts, blocked reason) can read them.
async function rawInvokeManageStore<T extends Record<string, unknown>>(
  payload: ManagePayload,
): Promise<{ data: T } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { error: 'Not signed in' };

  const { data, error } = await supabase.functions.invoke<T & { error?: string }>(
    'manage-store',
    {
      body: payload,
      headers: { Authorization: `Bearer ${session.access_token}` },
    },
  );

  if (error) {
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = (await ctx.clone().json()) as { error?: string };
        if (body?.error) return { error: body.error };
      } catch {
        try {
          const text = await ctx.clone().text();
          if (text) return { error: `${error.message}: ${text}` };
        } catch {
          /* fall through */
        }
      }
    }
    return { error: error.message };
  }
  if (!data) return { error: 'Empty response' };
  if (data.error) return { error: data.error };
  return { data: data as T };
}

export async function createStore(formData: FormData): Promise<Result> {
  const name = String(formData.get('name') ?? '').trim();
  const region = String(formData.get('region') ?? '').trim() || undefined;
  if (!name) return { ok: false, error: 'Name is required' };
  return invokeManageStore({ action: 'create', name, region });
}

export async function renameStore(storeId: string, name: string): Promise<Result> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Name is required' };
  return invokeManageStore({ action: 'rename', storeId, name: trimmed });
}

export async function setStoreActive(
  storeId: string,
  isActive: boolean,
): Promise<Result> {
  return invokeManageStore({ action: 'set_active', storeId, isActive });
}

// Two-phase delete. The preview returns cascade counts plus a `blocked`
// reason if the delete would fail (currently: a non-zero circular count,
// since circulars.store_id is ON DELETE RESTRICT). The UI shows the
// counts even when blocked so the admin sees the full picture.
export async function previewDeleteStore(
  storeId: string,
): Promise<PreviewDeleteResult> {
  const res = await rawInvokeManageStore<{
    counts?: StoreDeleteCounts;
    blocked?: string | null;
  }>({ action: 'delete', storeId, confirm: false });
  if ('error' in res) return { ok: false, error: res.error };
  if (!res.data.counts) return { ok: false, error: 'No counts in response' };
  return {
    ok: true,
    counts: res.data.counts,
    blocked: res.data.blocked ?? null,
  };
}

export async function deleteStore(storeId: string): Promise<DeleteResult> {
  const res = await rawInvokeManageStore<{ counts?: StoreDeleteCounts }>({
    action: 'delete',
    storeId,
    confirm: true,
  });
  if ('error' in res) return { ok: false, error: res.error };
  revalidatePath('/stores');
  return {
    ok: true,
    counts:
      res.data.counts ?? {
        prices: 0,
        availability: 0,
        locations: 0,
        receipts: 0,
        circulars: 0,
      },
  };
}
