import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';

export type CheapestPrice = {
  amountMinorUnits: number;
  currency: string;
};

// Returns a Map keyed by productId. Products with no observed prices are
// simply absent from the map.
export function useCheapestPricesForProducts(productIds: readonly string[]) {
  return useQuery({
    queryKey: queryKeys.cheapestPricesForProducts(productIds),
    enabled: productIds.length > 0,
    staleTime: 1000 * 60,
    queryFn: async (): Promise<Map<string, CheapestPrice>> => {
      const { data, error } = await supabase
        .from('current_prices')
        .select('product_id, amount_minor_units, currency')
        .in('product_id', [...productIds]);
      if (error) throw error;

      const cheapest = new Map<string, CheapestPrice>();
      for (const row of data ?? []) {
        if (!row.product_id || row.amount_minor_units == null || !row.currency) continue;
        const existing = cheapest.get(row.product_id);
        if (!existing || row.amount_minor_units < existing.amountMinorUnits) {
          cheapest.set(row.product_id, {
            amountMinorUnits: row.amount_minor_units,
            currency: row.currency,
          });
        }
      }
      return cheapest;
    },
  });
}
