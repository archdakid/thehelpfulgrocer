import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';
import type { Store } from '@/hooks/useStores';

export type PriceAtStore = {
  store: Store;
  amountMinorUnits: number;
  currency: string;
  observedAt: string;
  source: string;
  // Sale snapshot (migration 0021). Non-null `regular` AND > amount means
  // this observation is a sale; `saleEndsAt` is informational, `promoLabel`
  // is vendor copy ("BOGO", "Member's Sale", etc.) preserved verbatim.
  regularAmountMinorUnits: number | null;
  saleEndsAt: string | null;
  promoLabel: string | null;
  // Per-store stock (migration 0017 + 0023). Default-when-absent: true
  // (no row at any specificity = available).
  isAvailable: boolean;
  // Branch breakdown when the chain has per-location availability data
  // (scraper writes one row per branch per product). Null when no per-
  // branch rows exist — admin manual writes are chain-wide and don't
  // populate this. UI surfaces "X of N locations" when present.
  branchAvailability: { available: number; total: number } | null;
};

type AvailabilityRow = {
  store_id: string | null;
  store_location_id: string | null;
  is_available: boolean | null;
};

type StoreAvailability = {
  isAvailable: boolean;
  branchAvailability: { available: number; total: number } | null;
};

export function usePricesForProduct(productId: string) {
  return useQuery({
    queryKey: queryKeys.pricesForProduct(productId),
    queryFn: async (): Promise<PriceAtStore[]> => {
      // Two cheap reads in parallel: the price view (with sale columns) and
      // every availability row for this product across both chain-wide
      // (store_location_id NULL) and per-branch (set) writes. We aggregate
      // client-side because PostgREST can't express "chain-wide if present
      // else any-available across branches" in one filter expression.
      const [pricesRes, availabilityRes] = await Promise.all([
        supabase
          .from('current_prices')
          .select(
            'amount_minor_units, currency, observed_at, source, regular_amount_minor_units, sale_ends_at, promo_label, stores(*)',
          )
          .eq('product_id', productId),
        supabase
          .from('product_store_availability')
          .select('store_id, store_location_id, is_available')
          .eq('product_id', productId)
          .returns<AvailabilityRow[]>(),
      ]);
      if (pricesRes.error) throw pricesRes.error;
      if (availabilityRes.error) throw availabilityRes.error;

      const availability = aggregateAvailability(availabilityRes.data ?? []);

      const rows: PriceAtStore[] = [];
      for (const row of pricesRes.data ?? []) {
        if (
          !row.stores ||
          row.amount_minor_units == null ||
          !row.currency ||
          !row.observed_at ||
          !row.source
        ) continue;
        // Default: chain-wide assumed in stock (0017 semantics) and no
        // branch breakdown to surface.
        const storeAvail = availability.get(row.stores.id) ?? {
          isAvailable: true,
          branchAvailability: null,
        };
        rows.push({
          store: row.stores,
          amountMinorUnits: row.amount_minor_units,
          currency: row.currency,
          observedAt: row.observed_at,
          source: row.source,
          regularAmountMinorUnits: row.regular_amount_minor_units,
          saleEndsAt: row.sale_ends_at,
          promoLabel: row.promo_label,
          isAvailable: storeAvail.isAvailable,
          branchAvailability: storeAvail.branchAvailability,
        });
      }

      // In-stock rows first, sorted cheapest by sale price; out-of-stock
      // bucketed at the bottom. "Cheapest" in the UI means "cheapest you can
      // actually buy right now", not "lowest number on the page".
      rows.sort((a, b) => {
        if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
        return a.amountMinorUnits - b.amountMinorUnits;
      });
      return rows;
    },
  });
}

// Per-store availability: chain-wide (store_location_id NULL) wins when
// present (admin manual override); otherwise the chain is "available" if
// ANY branch is available. The branch-count breakdown is reported when only
// per-branch rows exist (mixed admin + scraper data isn't a real scenario
// today, but if it happens the chain-wide intent dominates).
function aggregateAvailability(rows: AvailabilityRow[]): Map<string, StoreAvailability> {
  type Acc = {
    chainWide: boolean | null;
    branchTotal: number;
    branchAvailable: number;
  };
  const acc = new Map<string, Acc>();

  for (const row of rows) {
    if (!row.store_id) continue;
    let bucket = acc.get(row.store_id);
    if (!bucket) {
      bucket = { chainWide: null, branchTotal: 0, branchAvailable: 0 };
      acc.set(row.store_id, bucket);
    }
    const isAvailable = row.is_available !== false;
    if (row.store_location_id == null) {
      bucket.chainWide = isAvailable;
    } else {
      bucket.branchTotal++;
      if (isAvailable) bucket.branchAvailable++;
    }
  }

  const out = new Map<string, StoreAvailability>();
  for (const [storeId, b] of acc) {
    if (b.chainWide != null) {
      out.set(storeId, { isAvailable: b.chainWide, branchAvailability: null });
    } else if (b.branchTotal > 0) {
      out.set(storeId, {
        isAvailable: b.branchAvailable > 0,
        branchAvailability: { available: b.branchAvailable, total: b.branchTotal },
      });
    }
  }
  return out;
}
