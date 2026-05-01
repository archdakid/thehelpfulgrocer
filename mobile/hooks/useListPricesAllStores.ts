import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';

// Single observation row for the compare-stores reducer. Joined with stores
// so the consumer doesn't need a second lookup.
export type ListPriceObservation = {
  productId: string;
  storeId: string;
  storeName: string;
  amountMinorUnits: number;
  currency: string;
};

type RawJoinedRow = {
  product_id: string | null;
  store_id: string | null;
  amount_minor_units: number | null;
  currency: string | null;
  stores: { id: string; name: string } | null;
};

// Fetches every current price across every store for the given product set.
// Used by the compare-stores sheet to reduce client-side into per-store
// totals; deliberately separate from useListItemPrices, which is keyed on
// the active store and only carries one price per product.
export function useListPricesAllStores(productIds: readonly string[]) {
  return useQuery({
    queryKey: queryKeys.listPricesAllStores(productIds),
    enabled: productIds.length > 0,
    staleTime: 1000 * 60,
    queryFn: async (): Promise<ListPriceObservation[]> => {
      const { data, error } = await supabase
        .from('current_prices')
        .select('product_id, store_id, amount_minor_units, currency, stores(id, name)')
        .in('product_id', [...productIds])
        .returns<RawJoinedRow[]>();
      if (error) throw error;

      const out: ListPriceObservation[] = [];
      for (const row of data ?? []) {
        if (
          !row.product_id ||
          !row.store_id ||
          row.amount_minor_units == null ||
          !row.currency ||
          !row.stores
        ) continue;
        out.push({
          productId: row.product_id,
          storeId: row.store_id,
          storeName: row.stores.name,
          amountMinorUnits: row.amount_minor_units,
          currency: row.currency,
        });
      }
      return out;
    },
  });
}
