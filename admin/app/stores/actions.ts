'use server';

import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '@/lib/supabase/server';

type ManagePayload =
  | { action: 'create'; name: string; region?: string }
  | { action: 'rename'; storeId: string; name: string }
  | { action: 'set_active'; storeId: string; isActive: boolean };

type Result = { ok: true } | { ok: false; error: string };

async function invokeManageStore(payload: ManagePayload): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { ok: false, error: 'Not signed in' };

  // Same JWT-passthrough pattern as queue/[id]/actions.ts — @supabase/ssr
  // doesn't propagate the cookie-derived JWT to functions.invoke().
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
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
        if (body?.error) return { ok: false, error: body.error };
      } catch {
        try {
          const text = await ctx.clone().text();
          if (text) return { ok: false, error: `${error.message}: ${text}` };
        } catch {
          /* fall through */
        }
      }
    }
    return { ok: false, error: error.message };
  }
  if (data?.error) return { ok: false, error: data.error };

  revalidatePath('/stores');
  return { ok: true };
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
