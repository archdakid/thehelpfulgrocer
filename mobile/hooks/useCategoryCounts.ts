import { useQuery } from '@tanstack/react-query';

import { isCategoryId, type CategoryId } from '@/constants/categories';
import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';

type Options = {
  // When true, only count products with prices at ≥2 distinct stores —
  // matches the multi-store filter applied to category drill-down screens
  // in Cheapest / All Stores mode, so the tile count and the post-tap
  // product list agree. Adds an embed of current_prices.store_id to the
  // query (~2x bytes); MVP-scale catalog absorbs that without ceremony.
  requireMultiStore?: boolean;
  // When set together with requireMultiStore, additionally restrict the
  // count to products that have a price at THIS store (in addition to
  // ≥2 stores total). "Available here AND elsewhere" — matches the drill-
  // down filter when Browse is in All Stores mode in front of an active
  // store. Ignored when requireMultiStore is false.
  storeId?: string | null;
};

// Returns a Map<CategoryId, number> with the count of products per category.
// Categories with zero products are simply absent from the map.
//
// Implemented client-side over a single SELECT rather than a SQL group-by
// RPC. Catalog size at MVP scale (low thousands) makes this trivially fast;
// we can swap in an RPC if it ever becomes a bottleneck.
export function useCategoryCounts(opts: Options = {}) {
  const requireMultiStore = !!opts.requireMultiStore;
  const storeId = opts.storeId ?? null;
  return useQuery({
    queryKey: requireMultiStore
      ? [...queryKeys.productsByCategory(), 'multi', storeId ?? 'any']
      : queryKeys.productsByCategory(),
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<Map<CategoryId, number>> => {
      const counts = new Map<CategoryId, number>();
      // Two literal-select branches because PostgREST's type generator
      // can't parse a runtime select string — keeping each branch's
      // select as a string literal preserves the typed return shape.
      if (requireMultiStore) {
        const { data, error } = await supabase
          .from('products')
          .select('category, current_prices(store_id)');
        if (error) throw error;
        for (const row of data ?? []) {
          if (!isCategoryId(row.category)) continue;
          const stores = new Set<string>();
          for (const cp of row.current_prices ?? []) {
            if (cp.store_id) stores.add(cp.store_id);
          }
          if (stores.size < 2) continue;
          if (storeId && !stores.has(storeId)) continue;
          counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
        }
      } else {
        const { data, error } = await supabase.from('products').select('category');
        if (error) throw error;
        for (const row of data ?? []) {
          if (!isCategoryId(row.category)) continue;
          counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
        }
      }
      return counts;
    },
  });
}
