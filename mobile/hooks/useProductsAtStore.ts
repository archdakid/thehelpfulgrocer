import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/hooks/useProduct';

export type ProductWithCurrentPrice = {
  product: Product;
  amountMinorUnits: number;
  currency: string;
  observedAt: string;
};

export function useProductsAtStore(storeId: string) {
  return useQuery({
    queryKey: queryKeys.productsAtStore(storeId),
    queryFn: async (): Promise<ProductWithCurrentPrice[]> => {
      const { data, error } = await supabase
        .from('current_prices')
        .select('amount_minor_units, currency, observed_at, products(*)')
        .eq('store_id', storeId);
      if (error) throw error;

      return (data ?? []).flatMap((row) => {
        if (!row.products || row.amount_minor_units == null || !row.currency || !row.observed_at) {
          return [];
        }
        return [{
          product: row.products,
          amountMinorUnits: row.amount_minor_units,
          currency: row.currency,
          observedAt: row.observed_at,
        }];
      }).sort((a, b) => a.product.name.localeCompare(b.product.name));
    },
  });
}
