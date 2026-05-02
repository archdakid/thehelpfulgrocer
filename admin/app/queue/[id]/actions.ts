'use server';

import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '@/lib/supabase/server';

type ResolveAction = 'confirm' | 'correct' | 'reject' | 'merge';

type ResolvePayload = {
  flaggedItemId: string;
  action: ResolveAction;
  targetProductId?: string | null;
  notes?: string | null;
};

export async function resolveFlaggedItem(
  payload: ResolvePayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { ok: false, error: 'Not signed in' };

  // The @supabase/ssr server client doesn't reliably propagate the
  // cookie-derived JWT to functions.invoke() — Authorization arrives empty
  // and the function's getUser() returns null ("Invalid session"). Pass the
  // access token explicitly to side-step it.
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
    'resolve-flagged-item',
    {
      body: payload,
      headers: { Authorization: `Bearer ${session.access_token}` },
    },
  );

  if (error) {
    // FunctionsHttpError stores the actual Response on `.context` — its body
    // has the `{ error }` JSON the Edge Function returned. Without this the
    // UI just shows the generic "Edge Function returned a non-2xx" string.
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

  revalidatePath('/queue');
  revalidatePath(`/queue/${payload.flaggedItemId}`);
  return { ok: true };
}
