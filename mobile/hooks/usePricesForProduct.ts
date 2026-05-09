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
};

type AvailabilityRow = {
  store_id: string | null;
  is_available: boolean | null;
};

export function usePricesForProduct(productId: string) {
  return useQuery({
    queryKey: queryKeys.pricesForProduct(productId),
    queryFn: async (): Promise<PriceAtStore[]> => {
      // Two cheap reads in parallel: the price view (with sale columns) and
      // the availability table for chain-wide rows. Out-of-stock semantics
      // require both — joining inside PostgREST is awkward because we only
      // want store_location_id IS NULL availability and an outer join.
      const [pricesRes, availabilityRes] = await Promise.all([
        supabase
          .from('current_prices')
          .select(
            'amount_minor_units, currency, observed_at, source, regular_amount_minor_units, sale_ends_at, promo_label, stores(*)',
          )
          .eq('product_id', productId),
        supabase
          .from('product_store_availability')
          .select('store_id, is_available')
          .eq('product_id', productId)
          .is('store_location_id', null)
          .returns<AvailabilityRow[]>(),
      ]);
      if (pricesRes.error) throw pricesRes.error;
      if (availabilityRes.error) throw availabilityRes.error;

      const availability = new Map<string, boolean>();
      for (const row of availabilityRes.data ?? []) {
        if (!row.store_id) continue;
        availability.set(row.store_id, row.is_available !== false);
      }

      const rows: PriceAtStore[] = [];
      for (const row of pricesRes.data ?? []) {
        if (
          !row.stores ||
          row.amount_minor_units == null ||
          !row.currency ||
          !row.observed_at ||
          !row.source
        ) continue;
        rows.push({
          store: row.stores,
          amountMinorUnits: row.amount_minor_units,
          currency: row.currency,
          observedAt: row.observed_at,
          source: row.source,
          regularAmountMinorUnits: row.regular_amount_minor_units,
          saleEndsAt: row.sale_ends_at,
          promoLabel: row.promo_label,
          // Default-true: absence of an availability row means "we haven't
          // recorded otherwise, assume in stock". Same semantics 0017
          // committed to.
          isAvailable: availability.get(row.stores.id) ?? true,
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
