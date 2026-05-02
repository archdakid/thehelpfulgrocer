'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';

import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { resolveFlaggedItem } from './actions';

type Reason = 'unmatched' | 'low_confidence' | 'auto_created_product';

type Props = {
  flaggedItemId: string;
  reason: Reason;
  currentProductId: string | null;
  resolved: boolean;
};

type ProductHit = { id: string; name: string; brand: string | null };

export default function ResolveActions({
  flaggedItemId,
  reason,
  currentProductId,
  resolved,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<ProductHit | null>(null);
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [searching, setSearching] = useState(false);

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  // Debounced product search. Public read on `products`, so no auth gating
  // needed; we just `ilike` the name. Trigram on the catalog scale we have
  // is overkill for a typeahead, ilike is plenty.
  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, brand')
        .ilike('name', `%${term}%`)
        .limit(8);
      if (cancelled) return;
      setHits((data ?? []).filter((p) => p.id !== currentProductId));
      setSearching(false);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, supabase, currentProductId]);

  const submit = (
    action: 'confirm' | 'correct' | 'reject' | 'merge',
    targetProductId?: string | null,
  ) => {
    setError(null);
    startTransition(async () => {
      const res = await resolveFlaggedItem({
        flaggedItemId,
        action,
        targetProductId: targetProductId ?? null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push('/queue');
    });
  };

  if (resolved) {
    return (
      <div className="bg-surface border border-border rounded-lg p-4 text-sm text-muted">
        This item is already resolved.
      </div>
    );
  }

  // Action layout per reason. Comments next to each button explain the
  // server-side effect — keeping them inline because the same word ("Match")
  // means slightly different things in `unmatched` vs `low_confidence`.
  return (
    <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
      <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
        Resolve
      </h2>

      {(reason === 'unmatched' ||
        reason === 'low_confidence' ||
        reason === 'auto_created_product') && (
        <div className="space-y-2">
          <label className="block text-sm">
            <span className="text-muted">
              {reason === 'auto_created_product'
                ? 'Merge into existing product'
                : 'Pick a product to assign'}
            </span>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPicked(null);
              }}
              placeholder="Search products by name…"
              className="mt-1 w-full border border-border rounded px-3 py-2 bg-bg focus:outline-none focus:ring-2 focus:ring-accent text-sm"
            />
          </label>

          {picked ? (
            <div className="flex items-center justify-between bg-bg border border-border rounded px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{picked.name}</span>
                {picked.brand ? (
                  <span className="text-muted"> · {picked.brand}</span>
                ) : null}
              </span>
              <button
                type="button"
                className="text-xs text-muted hover:text-text"
                onClick={() => {
                  setPicked(null);
                  setSearch('');
                }}
              >
                Clear
              </button>
            </div>
          ) : hits.length > 0 ? (
            <ul className="max-h-48 overflow-y-auto border border-border rounded divide-y divide-border">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-bg"
                    onClick={() => {
                      setPicked(h);
                      setHits([]);
                    }}
                  >
                    <span className="font-medium">{h.name}</span>
                    {h.brand ? <span className="text-muted"> · {h.brand}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : searching ? (
            <p className="text-xs text-muted">Searching…</p>
          ) : null}
        </div>
      )}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        {reason === 'low_confidence' ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => submit('confirm')}
            className="bg-accent text-white rounded px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            Confirm match
          </button>
        ) : null}

        {reason === 'auto_created_product' ? (
          <>
            <button
              type="button"
              disabled={isPending}
              onClick={() => submit('confirm')}
              className="bg-accent text-white rounded px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              Verify product
            </button>
            <button
              type="button"
              disabled={isPending || !picked}
              onClick={() => submit('merge', picked?.id)}
              className="bg-text text-bg rounded px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              Merge into picked
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={isPending || !picked}
            onClick={() => submit('correct', picked?.id)}
            className="bg-text text-bg rounded px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {reason === 'low_confidence' ? 'Replace match' : 'Match to picked'}
          </button>
        )}

        <button
          type="button"
          disabled={isPending}
          onClick={() => submit('reject')}
          className="bg-surface text-danger border border-danger/40 rounded px-3 py-1.5 text-sm font-medium hover:bg-danger/5 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
