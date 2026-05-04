'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { formatMoney } from '@/lib/format';
import { setManualPrice, setStoreAvailability } from '../actions';

export type StoreRow = {
  id: string;
  name: string;
  region: string;
};

export type PriceRow = {
  store_id: string;
  amount_minor_units: number;
  currency: string;
  source: string;
  observed_at: string;
};

export type AvailabilityRow = {
  store_id: string;
  is_available: boolean;
  updated_at: string;
};

type Props = {
  productId: string;
  stores: StoreRow[];
  prices: PriceRow[];
  availability: AvailabilityRow[];
};

// Per-store table: current price, availability toggle, manual entry
// input. Stores with no row in `prices` show a dash; absence-of-row in
// `product_store_availability` defaults to "available" per the
// migration's documented semantics.
export default function PricesSection({
  productId,
  stores,
  prices,
  availability,
}: Props) {
  const priceByStore = new Map(prices.map((p) => [p.store_id, p]));
  const availByStore = new Map(availability.map((a) => [a.store_id, a]));

  return (
    <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
          Prices &amp; availability
        </h2>
        <p className="text-xs text-muted mt-1">
          Manual entries append a new observation row (prices history is
          append-only). Out-of-stock requires an explicit toggle; the
          default for any untouched store is in-stock.
        </p>
      </div>

      {stores.length === 0 ? (
        <p className="text-sm text-muted">No active stores configured.</p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded">
          {stores.map((store) => (
            <StoreRowEditor
              key={store.id}
              productId={productId}
              store={store}
              currentPrice={priceByStore.get(store.id) ?? null}
              availability={availByStore.get(store.id) ?? null}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function StoreRowEditor({
  productId,
  store,
  currentPrice,
  availability,
}: {
  productId: string;
  store: StoreRow;
  currentPrice: PriceRow | null;
  availability: AvailabilityRow | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Effective availability = explicit row's value, else default true.
  const isAvailable = availability?.is_available ?? true;
  const hasExplicitRow = availability !== null;

  const submitPrice = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const minor = parseDollarsToMinor(draft);
    if (minor === null) {
      setError('Enter a price like 12.99');
      return;
    }
    startTransition(async () => {
      const res = await setManualPrice({
        productId,
        storeId: store.id,
        amountMinorUnits: minor,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDraft('');
      setSavedHint(true);
      setTimeout(() => setSavedHint(false), 1500);
      router.refresh();
    });
  };

  const toggleAvailability = () => {
    setError(null);
    startTransition(async () => {
      const res = await setStoreAvailability({
        productId,
        storeId: store.id,
        isAvailable: !isAvailable,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <li className="p-3 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[140px]">
        <div className="text-sm font-medium">{store.name}</div>
        <div className="text-xs text-muted">{store.region}</div>
      </div>

      <div className="text-sm tabular-nums w-24">
        {currentPrice ? (
          <>
            <div className="font-mono">
              {formatMoney(currentPrice.amount_minor_units, currentPrice.currency)}
            </div>
            <div className="text-[10px] text-muted uppercase">
              {currentPrice.source}
            </div>
          </>
        ) : (
          <span className="text-muted">—</span>
        )}
      </div>

      <button
        type="button"
        onClick={toggleAvailability}
        disabled={isPending}
        className={
          'text-xs rounded px-2 py-1 border transition-colors disabled:opacity-50 ' +
          (isAvailable
            ? 'border-success/40 text-success hover:bg-success/10'
            : 'border-danger/40 text-danger hover:bg-danger/10')
        }
        title={hasExplicitRow ? 'Click to flip' : 'Default (no explicit row)'}
      >
        {isAvailable ? 'In stock' : 'Out of stock'}
      </button>

      <form onSubmit={submitPrice} className="flex items-center gap-2">
        <span className="text-xs text-muted">TT$</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          disabled={isPending}
          className="w-24 border border-border rounded px-2 py-1 bg-bg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={isPending || draft.trim() === ''}
          className="bg-accent text-white rounded px-2 py-1 text-xs font-medium hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? '…' : 'Set'}
        </button>
        {savedHint ? (
          <span className="text-xs text-success">Saved</span>
        ) : null}
      </form>

      {error ? (
        <p className="text-xs text-danger basis-full">{error}</p>
      ) : null}
    </li>
  );
}

// "12.99" → 1299; "12" → 1200; ".5" → 50; bad input → null.
// Caps at 999999.99 to mirror the Edge Function's overflow guard.
function parseDollarsToMinor(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (!/^\d*(\.\d{0,2})?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  const minor = Math.round(n * 100);
  if (minor > 100_000_000) return null;
  return minor;
}
