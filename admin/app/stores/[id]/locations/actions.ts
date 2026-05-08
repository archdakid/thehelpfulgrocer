'use server';

import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '@/lib/supabase/server';

type Result = { ok: true } | { ok: false; error: string };

export type LocationDeleteCounts = {
  prices: number;
  availability: number;
};

type PreviewDeleteResult =
  | { ok: true; counts: LocationDeleteCounts }
  | { ok: false; error: string };

type ManagePayload =
  | {
      action: 'create';
      storeId: string;
      name: string;
      externalId?: string;
      region?: string;
      lat?: number | null;
      lng?: number | null;
    }
  | { action: 'rename'; locationId: string; name: string }
  | { action: 'set_active'; locationId: string; isActive: boolean }
  | { action: 'delete'; locationId: string; confirm: boolean };

async function rawInvoke<T extends Record<string, unknown>>(
  payload: ManagePayload,
): Promise<{ data: T } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { error: 'Not signed in' };

  const { data, error } = await supabase.functions.invoke<T & { error?: string }>(
    'manage-location',
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

function revalidate(storeId: string) {
  revalidatePath('/stores');
  revalidatePath(`/stores/${storeId}/locations`);
}

export async function createLocation(input: {
  storeId: string;
  name: string;
  externalId?: string;
  region?: string;
  lat?: number | null;
  lng?: number | null;
}): Promise<Result> {
  const trimmedName = input.name.trim();
  if (!trimmedName) return { ok: false, error: 'Name is required' };
  const res = await rawInvoke<Record<string, unknown>>({
    action: 'create',
    storeId: input.storeId,
    name: trimmedName,
    externalId: input.externalId?.trim() || undefined,
    region: input.region?.trim() || undefined,
    lat: input.lat ?? undefined,
    lng: input.lng ?? undefined,
  });
  if ('error' in res) return { ok: false, error: res.error };
  revalidate(input.storeId);
  return { ok: true };
}

export async function renameLocation(
  storeId: string,
  locationId: string,
  name: string,
): Promise<Result> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Name is required' };
  const res = await rawInvoke<Record<string, unknown>>({
    action: 'rename',
    locationId,
    name: trimmed,
  });
  if ('error' in res) return { ok: false, error: res.error };
  revalidate(storeId);
  return { ok: true };
}

export async function setLocationActive(
  storeId: string,
  locationId: string,
  isActive: boolean,
): Promise<Result> {
  const res = await rawInvoke<Record<string, unknown>>({
    action: 'set_active',
    locationId,
    isActive,
  });
  if ('error' in res) return { ok: false, error: res.error };
  revalidate(storeId);
  return { ok: true };
}

export async function previewDeleteLocation(
  locationId: string,
): Promise<PreviewDeleteResult> {
  const res = await rawInvoke<{ counts?: LocationDeleteCounts }>({
    action: 'delete',
    locationId,
    confirm: false,
  });
  if ('error' in res) return { ok: false, error: res.error };
  if (!res.data.counts) return { ok: false, error: 'No counts in response' };
  return { ok: true, counts: res.data.counts };
}

export async function deleteLocation(
  storeId: string,
  locationId: string,
): Promise<Result> {
  const res = await rawInvoke<Record<string, unknown>>({
    action: 'delete',
    locationId,
    confirm: true,
  });
  if ('error' in res) return { ok: false, error: res.error };
  revalidate(storeId);
  return { ok: true };
}
