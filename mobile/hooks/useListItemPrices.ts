import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';

export type ListItemPrice = {
  amountMinorUnits: number;
  currency: string;
};

// Returns a Map keyed by productId to the relevant price for the current
// list view. When `storeId` is null we surface the cheapest current price
// across every store; when set, we surface only that store's price (and
// products with no observation there are simply absent from the map).
export function useListItemPrices(
  productIds: readonly string[],
  storeId: string | null,
) {
  return useQuery({
    queryKey: queryKeys.listItemPrices(productIds, storeId),
    enabled: productIds.length > 0,
    staleTime: 1000 * 60,
    queryFn: async (): Promise<Map<string, ListItemPrice>> => {
      let query = supabase
        .from('current_prices')
        .select('product_id, amount_minor_units, currency, store_id')
        .in('product_id', [...productIds]);
      if (storeId) {
        query = query.eq('store_id', storeId);
      }
      const { data, error } = await query;
      if (error) throw error;

      const result = new Map<string, ListItemPrice>();
      for (const row of data ?? []) {
        if (!row.product_id || row.amount_minor_units == null || !row.currency) continue;
        const candidate: ListItemPrice = {
          amountMinorUnits: row.amount_minor_units,
          currency: row.currency,
        };
        if (storeId) {
          // Filter already enforces one row per product. Last-wins is fine.
          result.set(row.product_id, candidate);
        } else {
          const existing = result.get(row.product_id);
          if (!existing || candidate.amountMinorUnits < existing.amountMinorUnits) {
            result.set(row.product_id, candidate);
          }
        }
      }
      return result;
    },
  });
}
