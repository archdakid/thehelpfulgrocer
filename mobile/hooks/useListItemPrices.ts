import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';

export type ListItemPrice = {
  amountMinorUnits: number;
  currency: string;
};

// Per-product price info for the list view. We always know the cheapest
// across all stores; `current` is the price at the active store (or the
// cheapest itself when no store is selected). `isBestHere` is true when the
// active store happens to also be the cheapest — drives the "Best price"
// badge on rows.
export type ListItemPriceInfo = {
  current: ListItemPrice | undefined;
  cheapest: ListItemPrice;
  cheapestStoreId: string;
  isBestHere: boolean;
};

export function useListItemPrices(
  productIds: readonly string[],
  storeId: string | null,
) {
  return useQuery({
    queryKey: queryKeys.listItemPrices(productIds, storeId),
    enabled: productIds.length > 0,
    staleTime: 1000 * 60,
    queryFn: async (): Promise<Map<string, ListItemPriceInfo>> => {
      // Always fetch all prices for these products so we can compute the
      // cheapest. Filtering by store would lose that comparison.
      const { data, error } = await supabase
        .from('current_prices')
        .select('product_id, amount_minor_units, currency, store_id')
        .in('product_id', [...productIds]);
      if (error) throw error;

      type Aggregate = {
        cheapest: ListItemPrice;
        cheapestStoreId: string;
        atActiveStore: ListItemPrice | undefined;
      };
      const agg = new Map<string, Aggregate>();

      for (const row of data ?? []) {
        if (
          !row.product_id ||
          !row.store_id ||
          row.amount_minor_units == null ||
          !row.currency
        ) {
          continue;
        }
        const candidate: ListItemPrice = {
          amountMinorUnits: row.amount_minor_units,
          currency: row.currency,
        };
        const existing = agg.get(row.product_id);
        if (!existing) {
          agg.set(row.product_id, {
            cheapest: candidate,
            cheapestStoreId: row.store_id,
            atActiveStore: storeId === row.store_id ? candidate : undefined,
          });
          continue;
        }
        if (candidate.amountMinorUnits < existing.cheapest.amountMinorUnits) {
          existing.cheapest = candidate;
          existing.cheapestStoreId = row.store_id;
        }
        if (storeId && row.store_id === storeId) {
          existing.atActiveStore = candidate;
        }
      }

      const result = new Map<string, ListItemPriceInfo>();
      for (const [productId, value] of agg) {
        const current = storeId ? value.atActiveStore : value.cheapest;
        const isBestHere = storeId
          ? value.cheapestStoreId === storeId
          : true; // Cheapest mode always shows the cheapest, so it is best.
        result.set(productId, {
          current,
          cheapest: value.cheapest,
          cheapestStoreId: value.cheapestStoreId,
          isBestHere: isBestHere && current !== undefined,
        });
      }
      return result;
    },
  });
}
