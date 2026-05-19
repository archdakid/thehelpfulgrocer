import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/hooks/useProduct';

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 10;

// Over-fetch multiplier for the multi-store path. We pull more candidates
// than MAX_RESULTS so the post-filter doesn't starve when the trigram
// match is dominated by single-store products. 5× has been enough on the
// MVP-scale catalog; raise if results feel sparse on Cheapest mode.
const MULTI_STORE_OVER_FETCH = 5;

type Options = {
  // When true, restrict results to products with prices at ≥2 distinct
  // stores (read from the current_prices view). Used by the List tab's
  // Cheapest mode where a single-store product has no comparison value.
  requireMultiStore?: boolean;
};

type ProductWithPrices = Product & {
  current_prices?: Array<{ store_id: string | null }> | null;
};

export function useSearchProducts(query: string, opts: Options = {}) {
  const trimmed = query.trim();
  const requireMultiStore = !!opts.requireMultiStore;
  return useQuery({
    queryKey: queryKeys.searchProducts(trimmed, requireMultiStore),
    enabled: trimmed.length >= MIN_QUERY_LENGTH,
    staleTime: 1000 * 30,
    queryFn: async (): Promise<Product[]> => {
      if (!requireMultiStore) {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .ilike('name', `%${trimmed}%`)
          .order('name', { ascending: true })
          .limit(MAX_RESULTS);
        if (error) throw error;
        return data;
      }

      // Multi-store filter: pull current_prices.store_id alongside, count
      // distinct stores per product, keep only those at ≥2 stores. Doing
      // it client-side over an over-fetched candidate window keeps the
      // query a single round trip; a SQL RPC would be cleaner but adds
      // a migration for what the MVP-scale catalog handles in JS fine.
      const { data, error } = await supabase
        .from('products')
        .select('*, current_prices(store_id)')
        .ilike('name', `%${trimmed}%`)
        .order('name', { ascending: true })
        .limit(MAX_RESULTS * MULTI_STORE_OVER_FETCH);
      if (error) throw error;

      const out: Product[] = [];
      for (const row of (data ?? []) as ProductWithPrices[]) {
        const stores = new Set<string>();
        for (const cp of row.current_prices ?? []) {
          if (cp.store_id) stores.add(cp.store_id);
        }
        if (stores.size >= 2) {
          // Strip the embedded join column before returning so the type
          // matches Product (the consumers don't use current_prices here).
          const { current_prices: _drop, ...rest } = row;
          out.push(rest as Product);
          if (out.length >= MAX_RESULTS) break;
        }
      }
      return out;
    },
  });
}
