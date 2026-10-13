'use server';

import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '@/lib/supabase/server';

type BulkAction = 'confirm' | 'reject';

type BulkResult =
  | { ok: true; succeeded: number; failed: number; errors: Array<{ id: string; error: string }> }
  | { ok: false; error: string };

// Fans out parallel invokes to `resolve-flagged-item` — one per id. The
// Edge Function is the source of truth for admin checks and per-item
// state transitions; this wrapper just batches calls and aggregates
// results, so admin-only RLS stays narrow and the audit trail
// (resolved_at / resolved_by / resolution) is identical to single-row
// resolves.
//
// We tolerate partial failures: per-id errors are returned so the UI can
// keep the still-failing rows selected and show what went wrong without
// rolling back the ones that succeeded.
export async function resolveFlaggedItemsBulk(
  ids: string[],
  action: BulkAction,
): Promise<BulkResult> {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: 'No items selected' };
  }
  if (action !== 'confirm' && action !== 'reject') {
    return { ok: false, error: 'Invalid action' };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { ok: false, error: 'Not signed in' };
  const authHeader = `Bearer ${session.access_token}`;

  const settled = await Promise.all(
    ids.map(async (id) => {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
        'resolve-flagged-item',
        {
          body: { flaggedItemId: id, action },
          headers: { Authorization: authHeader },
        },
      );
      if (error) {
        const ctx = (error as unknown as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = (await ctx.clone().json()) as { error?: string };
            if (body?.error) return { id, error: body.error };
          } catch {
            // fall through
          }
        }
        return { id, error: error.message };
      }
      if (data?.error) return { id, error: data.error };
      return { id, error: null };
    }),
  );

  const errors = settled
    .filter((r): r is { id: string; error: string } => r.error !== null)
    .map(({ id, error }) => ({ id, error }));
  const succeeded = settled.length - errors.length;

  revalidatePath('/queue');
  return { ok: true, succeeded, failed: errors.length, errors };
}

export type TriageBatchResult = {
  ok?: boolean;
  processed: number;
  merged: number;
  pack_variants: number;
  rejected: number;
  uncertain: number;
  errors: Array<{ flagged_item_id: string; message: string }>;
  remaining: number;
};

export async function runTriageDuplicatesBatch(options?: {
  batchSize?: number;
  minScore?: number | null;
}): Promise<{ ok: true; result: TriageBatchResult } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { ok: false, error: 'Not signed in' };

  const body: Record<string, unknown> = {
    batchSize: options?.batchSize ?? 10,
  };
  if (options?.minScore != null && Number.isFinite(options.minScore)) {
    body.minScore = options.minScore;
  }

  const { data, error } = await supabase.functions.invoke<
    TriageBatchResult & { error?: string }
  >('triage-duplicates', {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) {
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const eb = (await ctx.clone().json()) as { error?: string };
        if (eb?.error) return { ok: false, error: eb.error };
      } catch {
        // fall through
      }
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: 'Empty response from triage-duplicates' };
  if (data.error) return { ok: false, error: data.error };

  revalidatePath('/queue');
  return { ok: true, result: data };
}

