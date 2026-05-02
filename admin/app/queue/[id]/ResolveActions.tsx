'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';

import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { resolveFlaggedItem, type ResolveEdits } from './actions';

type Reason = 'unmatched' | 'low_confidence' | 'auto_created_product';

type Props = {
  flaggedItemId: string;
  reason: Reason;
  currentProductId: string | null;
  currentProductName: string | null;
  currentLineTotalMinorUnits: number;
  currentUnitPriceMinorUnits: number | null;
  currency: string;
  resolved: boolean;
};

type ProductHit = { id: string; name: string; brand: string | null };

// Money inputs are decimal strings ("4.99"). Convert via Math.round to
// avoid floating-point drift on the round trip — "0.10" * 100 is 10.0
// in IEEE-754 but 12.95 * 100 is 1294.9999999999998 without rounding.
function minorToDecimal(minor: number): string {
  return (minor / 100).toFixed(2);
}

function decimalToMinor(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 100);
}

export default function ResolveActions({
  flaggedItemId,
  reason,
  currentProductId,
  currentProductName,
  currentLineTotalMinorUnits,
  currentUnitPriceMinorUnits,
  currency,
  resolved,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<ProductHit | null>(null);
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [searching, setSearching] = useState(false);

  // Edit fields. Pre-populated with current values so the admin sees
  // what's about to be saved and can tweak rather than re-enter from
  // scratch. We diff against the originals at submit time and only send
  // the fields that actually changed.
  const [nameInput, setNameInput] = useState(currentProductName ?? '');
  const [lineTotalInput, setLineTotalInput] = useState(
    minorToDecimal(currentLineTotalMinorUnits),
  );
  const [unitPriceInput, setUnitPriceInput] = useState(
    currentUnitPriceMinorUnits != null ? minorToDecimal(currentUnitPriceMinorUnits) : '',
  );

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

  // Build the edits diff. Only include fields that actually changed and,
  // for productName, only when this flag is for an auto-created product
  // (the Edge Function rejects rename attempts on other reasons).
  const buildEdits = (): ResolveEdits | undefined => {
    const edits: ResolveEdits = {};

    if (reason === 'auto_created_product' && currentProductName != null) {
      const trimmed = nameInput.trim();
      if (trimmed && trimmed !== currentProductName) {
        edits.productName = trimmed;
      }
    }

    const newLineTotal = decimalToMinor(lineTotalInput);
    if (newLineTotal != null && newLineTotal !== currentLineTotalMinorUnits) {
      edits.lineTotalMinorUnits = newLineTotal;
    }

    const newUnitPrice =
      unitPriceInput.trim() === '' ? null : decimalToMinor(unitPriceInput);
    // Only encode the unit-price edit when it materially differs. Treat
    // "blank → was already null" and "same number" as no-op.
    if (
      (newUnitPrice === null && currentUnitPriceMinorUnits !== null) ||
      (typeof newUnitPrice === 'number' && newUnitPrice !== currentUnitPriceMinorUnits)
    ) {
      edits.unitPriceMinorUnits = newUnitPrice;
    }

    return Object.keys(edits).length > 0 ? edits : undefined;
  };

  const submit = (
    action: 'confirm' | 'correct' | 'reject' | 'merge',
    targetProductId?: string | null,
  ) => {
    setError(null);
    // Edits are silently dropped on reject — the action throws away the
    // line item's contribution anyway, so committing partial edits would
    // leak into nowhere.
    const edits = action === 'reject' ? undefined : buildEdits();
    startTransition(async () => {
      const res = await resolveFlaggedItem({
        flaggedItemId,
        action,
        targetProductId: targetProductId ?? null,
        edits,
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

      {/* Edit fields. Always visible on reasons that contribute or update
          a price; the admin can correct OCR mistakes (wrong amount, wrong
          decimal point) and capture sale prices accurately. The product
          name input shows only for auto-created products — renaming a
          canonical match would have catalog-wide effects. */}
      <div className="space-y-3 border-b border-border pb-4">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">
          Review &amp; correct
        </h3>
        {reason === 'auto_created_product' && currentProductName != null ? (
          <label className="block text-sm">
            <span className="text-muted">Product name</span>
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={200}
              className="mt-1 w-full border border-border rounded px-3 py-2 bg-bg focus:outline-none focus:ring-2 focus:ring-accent text-sm"
            />
          </label>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-muted">Line total ({currency})</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={lineTotalInput}
              onChange={(e) => setLineTotalInput(e.target.value)}
              className="mt-1 w-full border border-border rounded px-3 py-2 bg-bg focus:outline-none focus:ring-2 focus:ring-accent text-sm tabular-nums"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Unit price ({currency})</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={unitPriceInput}
              onChange={(e) => setUnitPriceInput(e.target.value)}
              placeholder="—"
              className="mt-1 w-full border border-border rounded px-3 py-2 bg-bg focus:outline-none focus:ring-2 focus:ring-accent text-sm tabular-nums"
            />
          </label>
        </div>
      </div>

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
