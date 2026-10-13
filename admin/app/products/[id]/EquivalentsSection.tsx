'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  deleteProductEquivalent,
  searchProductsForEquivalent,
  upsertProductEquivalent,
  type EquivalentSearchCandidate,
} from '../actions';

export type EquivalentRow = {
  id: string;
  product_id: string;
  equivalent_product_id: string;
  scale_factor: number;
  source: string;
  notes: string | null;
  other_product: {
    id: string;
    name: string;
    brand: string | null;
    unit_size: number | null;
    unit_of_measure: string | null;
    units_per_pack: number | null;
  } | null;
};

type Props = {
  productId: string;
  productName: string;
  equivalents: EquivalentRow[];
};

function formatUomBadge(p: {
  unit_size: number | null;
  unit_of_measure: string | null;
  units_per_pack: number | null;
}): string | null {
  const parts: string[] = [];
  if (p.units_per_pack && p.units_per_pack > 1) {
    parts.push(`${p.units_per_pack} pk`);
  }
  if (p.unit_size != null && p.unit_of_measure) {
    parts.push(`${p.unit_size} ${p.unit_of_measure}`);
  } else if (p.unit_size != null) {
    parts.push(String(p.unit_size));
  } else if (p.unit_of_measure) {
    parts.push(p.unit_of_measure);
  }
  return parts.length > 0 ? parts.join(' × ') : null;
}

export default function EquivalentsSection({
  productId,
  productName,
  equivalents,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<EquivalentSearchCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedOther, setSelectedOther] =
    useState<EquivalentSearchCandidate | null>(null);
  const [currentIsLarger, setCurrentIsLarger] = useState(true);
  const [scaleFactorStr, setScaleFactorStr] = useState('2');
  const [notes, setNotes] = useState('');

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const res = await searchProductsForEquivalent(q, productId);
    setSearching(false);
    if (res.ok) {
      setResults(res.products);
    } else {
      setError(res.error);
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOther) {
      setError('Select a product to link.');
      return;
    }
    const scaleFactor = Number(scaleFactorStr);
    if (!Number.isFinite(scaleFactor) || scaleFactor <= 1) {
      setError('Scale factor must be a number greater than 1.');
      return;
    }
    setError(null);
    const largerProductId = currentIsLarger ? productId : selectedOther.id;
    const smallerProductId = currentIsLarger ? selectedOther.id : productId;

    startTransition(async () => {
      const res = await upsertProductEquivalent({
        currentProductId: productId,
        largerProductId,
        smallerProductId,
        scaleFactor,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSelectedOther(null);
      setSearchQuery('');
      setResults([]);
      setNotes('');
      router.refresh();
    });
  };

  const handleDelete = (equivalentId: string) => {
    setError(null);
    startTransition(async () => {
      const res = await deleteProductEquivalent({
        equivalentId,
        currentProductId: productId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <section className="bg-surface border border-border rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
            Pack &amp; Size Variants ({equivalents.length})
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Links larger and smaller pack sizes of the same product for scaled
            cross-store price comparison.
          </p>
        </div>
      </div>

      {equivalents.length === 0 ? (
        <p className="text-sm text-muted">
          No pack/size variants linked to this product yet.
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {equivalents.map((eq) => {
            const thisIsLarger = eq.product_id === productId;
            const other = eq.other_product;
            const otherLabel = other
              ? `${other.brand ? `${other.brand} · ` : ''}${other.name}`
              : '<deleted product>';
            const uomBadge = other ? formatUomBadge(other) : null;

            return (
              <li
                key={eq.id}
                className="px-3.5 py-2.5 bg-bg/50 flex items-center justify-between gap-3 flex-wrap"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="font-mono text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded">
                      {thisIsLarger
                        ? `1 × this = ${eq.scale_factor} × smaller`
                        : `1 × larger = ${eq.scale_factor} × this`}
                    </span>
                    {other ? (
                      <Link
                        href={`/products/${other.id}`}
                        className="font-medium text-accent hover:underline truncate"
                      >
                        {otherLabel}
                      </Link>
                    ) : (
                      <span className="text-muted">{otherLabel}</span>
                    )}
                    {uomBadge ? (
                      <span className="text-xs font-mono text-muted border border-border rounded px-1.5 py-0.5">
                        {uomBadge}
                      </span>
                    ) : null}
                    <span className="text-[11px] uppercase tracking-wider text-muted px-1.5 py-0.5 rounded bg-surface border border-border">
                      {eq.source}
                    </span>
                  </div>
                  {eq.notes ? (
                    <p className="text-xs text-muted truncate">{eq.notes}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(eq.id)}
                  disabled={isPending}
                  className="text-xs text-danger hover:underline disabled:opacity-50 shrink-0"
                >
                  Unlink
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form
        onSubmit={handleAdd}
        className="border-t border-border pt-4 space-y-3"
      >
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">
          Link a pack/size variant
        </h3>

        {!selectedOther ? (
          <div className="space-y-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => void handleSearch(e.target.value)}
              disabled={isPending}
              placeholder="Search product by name, brand, or UPC…"
              className="w-full border border-border rounded px-3 py-2 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {searching ? (
              <p className="text-xs text-muted">Searching…</p>
            ) : null}
            {results.length > 0 ? (
              <ul className="border border-border rounded divide-y divide-border max-h-48 overflow-y-auto bg-bg">
                {results.map((r) => {
                  const badge = formatUomBadge(r);
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedOther(r);
                          setResults([]);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-surface flex items-center justify-between gap-2"
                      >
                        <span className="truncate">
                          {r.brand ? `${r.brand} · ` : ''}
                          {r.name}
                        </span>
                        {badge ? (
                          <span className="text-xs font-mono text-muted shrink-0">
                            {badge}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-bg border border-border rounded px-3 py-2 text-sm">
              <span className="font-medium truncate">
                Linked product:{' '}
                {selectedOther.brand ? `${selectedOther.brand} · ` : ''}
                {selectedOther.name}
              </span>
              <button
                type="button"
                onClick={() => setSelectedOther(null)}
                className="text-xs text-muted hover:text-text ml-2 shrink-0"
              >
                Change
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-xs text-muted">Which product is larger?</span>
                <select
                  value={currentIsLarger ? 'current' : 'other'}
                  onChange={(e) =>
                    setCurrentIsLarger(e.target.value === 'current')
                  }
                  disabled={isPending}
                  className="mt-1 w-full border border-border rounded px-3 py-2 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="current">This product ({productName})</option>
                  <option value="other">
                    Other ({selectedOther.name})
                  </option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-xs text-muted">
                  Scale factor (1 larger = N smaller)
                </span>
                <input
                  type="number"
                  step="any"
                  min="1.001"
                  value={scaleFactorStr}
                  onChange={(e) => setScaleFactorStr(e.target.value)}
                  disabled={isPending}
                  className="mt-1 w-full border border-border rounded px-3 py-2 bg-bg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </label>
            </div>

            <label className="block text-sm">
              <span className="text-xs text-muted">Notes (optional)</span>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isPending}
                placeholder="e.g. 2L bottle vs 500ml single"
                className="mt-1 w-full border border-border rounded px-3 py-1.5 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </label>

            <button
              type="submit"
              disabled={isPending}
              className="bg-accent text-white rounded px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? 'Saving…' : 'Save pack variant'}
            </button>
          </div>
        )}

        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </form>
    </section>
  );
}
