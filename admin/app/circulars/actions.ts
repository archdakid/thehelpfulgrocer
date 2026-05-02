'use server';

import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '@/lib/supabase/server';

type Result<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

async function invokeFunction<T = unknown>(
  name: string,
  body: Record<string, unknown>,
): Promise<Result<T>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { ok: false, error: 'Not signed in' };

  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string } & T>(
    name,
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
        if (eb?.error) return { ok: false, error: eb.error };
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
  if (data && (data as { error?: string }).error) {
    return { ok: false, error: (data as { error: string }).error };
  }
  return { ok: true, data: data as T };
}

export async function createCircular(input: {
  circularId: string;
  storeId: string;
  imagePath: string;
  observedWeek: string;
}): Promise<Result<{ circularId: string }>> {
  const res = await invokeFunction<{ circularId: string }>('create-circular', input);
  if (res.ok) revalidatePath('/circulars');
  return res;
}

export async function reparseCircular(circularId: string): Promise<Result> {
  const res = await invokeFunction('parse-circular', { circular_id: circularId });
  if (res.ok) revalidatePath(`/circulars/${circularId}`);
  return res;
}

export async function resolveCircularItem(payload: {
  circularItemId: string;
  action: 'accept' | 'reject';
  name?: string;
  brand?: string | null;
  size?: string | null;
  amountMinorUnits?: number;
  targetProductId?: string | null;
  notes?: string | null;
}): Promise<Result> {
  const res = await invokeFunction('resolve-circular-item', payload);
  // The page server-renders from `circular_items` so we just need a
  // revalidate; we don't know the circular id here without an extra round
  // trip, so revalidate the whole list path the detail page rolls up to.
  if (res.ok) revalidatePath('/circulars', 'layout');
  return res;
}
