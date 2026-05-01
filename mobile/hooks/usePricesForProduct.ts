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
};

export function usePricesForProduct(productId: string) {
  return useQuery({
    queryKey: queryKeys.pricesForProduct(productId),
    queryFn: async (): Promise<PriceAtStore[]> => {
      const { data, error } = await supabase
        .from('current_prices')
        .select('amount_minor_units, currency, observed_at, source, stores(*)')
        .eq('product_id', productId);
      if (error) throw error;

      return (data ?? []).flatMap((row) => {
        if (
          !row.stores ||
          row.amount_minor_units == null ||
          !row.currency ||
          !row.observed_at ||
          !row.source
        ) {
          return [];
        }
        return [{
          store: row.stores,
          amountMinorUnits: row.amount_minor_units,
          currency: row.currency,
          observedAt: row.observed_at,
          source: row.source,
        }];
      }).sort((a, b) => a.amountMinorUnits - b.amountMinorUnits);
    },
  });
}
