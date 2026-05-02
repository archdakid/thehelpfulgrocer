'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';

import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { formatMoney } from '@/lib/format';
import { resolveCircularItem } from '../actions';

type ProductHit = { id: string; name: string; brand: string | null };

export type CircularItemView = {
  id: string;
  position: number;
  raw_name: string;
  brand: string | null;
  size: string | null;
  amount_minor_units: number;
  matched_product_id: string | null;
  match_confidence: number | null;
  // The DB column is `text` with a check constraint, so the generated
  // type is `string`. We narrow at the boundary.
  status: string;
  matched_product: { id: string; name: string; brand: string | null } | null;
  contributed_product: { id: string; name: string; brand: string | null } | null;
};

type Props = {
  item: CircularItemView;
};

export default function CircularItemRow({ item }: Props) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Editable mirrors of the parsed values. Admin tweaks stay local until
  // they hit Accept; on Accept the server action sends the edited values
  // along with the action.
  const [name, setName] = useState(item.raw_name);
  const [brand, setBrand] = useState(item.brand ?? '');
  const [size, setSize] = useState(item.size ?? '');
  const [amountMajor, setAmountMajor] = useState(
    (item.amount_minor_units / 100).toFixed(2),
  );

  // Product picker — same shape as the queue's ResolveActions.
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<ProductHit | null>(
    item.matched_product
      ? {
          id: item.matched_product.id,
          name: item.matched_product.name,
          brand: item.matched_product.brand,
        }
      : null,
  );

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
      setHits(data ?? []);
      setSearching(false);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, supabase]);

  const onAccept = () => {
    setError(null);
    const major = parseFloat(amountMajor);
    if (!Number.isFinite(major) || major <= 0) {
      setError('Price must be a positive number');
      return;
    }
    startTransition(async () => {
      const res = await resolveCircularItem({
        circularItemId: item.id,
        action: 'accept',
        name: name.trim(),
        brand: brand.trim() || null,
        size: size.trim() || null,
        amountMinorUnits: Math.round(major * 100),
        targetProductId: picked?.id ?? null,
      });
      if (!res.ok) setError(res.error);
    });
  };

  const onReject = () => {
    setError(null);
    startTransition(async () => {
      const res = await resolveCircularItem({
        circularItemId: item.id,
        action: 'reject',
      });
      if (!res.ok) setError(res.error);
    });
  };

  const isResolved = item.status !== 'pending';
  const resolvedProduct = item.matched_product ?? item.contributed_product;

  if (isResolved) {
    return (
      <li className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className={`inline-block text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${
              item.status === 'accepted'
                ? 'bg-success/10 text-success'
                : 'bg-border text-muted'
            }`}
          >
            {item.status}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {resolvedProduct?.name ?? item.raw_name}
              {item.size ? <span className="text-muted"> · {item.size}</span> : null}
            </p>
            <p className="text-xs text-muted truncate">
              {item.brand ? `${item.brand} · ` : ''}from circular
            </p>
          </div>
          <div className="text-sm tabular-nums shrink-0">
            {formatMoney(item.amount_minor_units, 'TTD')}
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="px-4 py-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_auto] gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isPending}
          placeholder="Name"
          className="border border-border rounded px-2 py-1.5 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <input
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          disabled={isPending}
          placeholder="Brand"
          className="border border-border rounded px-2 py-1.5 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <input
          value={size}
          onChange={(e) => setSize(e.target.value)}
          disabled={isPending}
          placeholder="Size"
          className="border border-border rounded px-2 py-1.5 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <input
          value={amountMajor}
          onChange={(e) => setAmountMajor(e.target.value)}
          disabled={isPending}
          inputMode="decimal"
          placeholder="0.00"
          className="w-24 border border-border rounded px-2 py-1.5 bg-bg text-sm tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted">
            {picked ? 'Linking to:' : 'Pick existing product (or leave blank to auto-create):'}
          </span>
          {item.match_confidence != null && !picked ? (
            <span className="text-xs text-muted tabular-nums">
              suggested score {item.match_confidence.toFixed(2)}
            </span>
          ) : null}
        </div>
        {picked ? (
          <div className="flex items-center justify-between bg-bg border border-border rounded px-2 py-1.5 text-sm">
            <span>
              <span className="font-medium">{picked.name}</span>
              {picked.brand ? <span className="text-muted"> · {picked.brand}</span> : null}
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
        ) : (
          <>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={isPending}
              placeholder="Search products by name…"
              className="w-full border border-border rounded px-2 py-1.5 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {hits.length > 0 ? (
              <ul className="max-h-32 overflow-y-auto border border-border rounded divide-y divide-border">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 text-sm hover:bg-bg"
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
          </>
        )}
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={onAccept}
          className="bg-accent text-white rounded px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          Accept
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={onReject}
          className="bg-surface text-danger border border-danger/40 rounded px-3 py-1.5 text-sm font-medium hover:bg-danger/5 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </li>
  );
}
