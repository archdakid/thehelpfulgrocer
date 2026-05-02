import { useQuery } from '@tanstack/react-query';

import { isCategoryId, type CategoryId } from '@/constants/categories';
import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';

// Returns a Map<CategoryId, number> with the count of products per category.
// Categories with zero products are simply absent from the map.
//
// Implemented client-side over a single `select category from products` query
// rather than a SQL group-by RPC. Catalog size at MVP scale (low thousands)
// makes this trivially fast; we can swap in an RPC if it ever becomes a
// bottleneck.
export function useCategoryCounts() {
  return useQuery({
    queryKey: queryKeys.productsByCategory(),
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<Map<CategoryId, number>> => {
      const { data, error } = await supabase.from('products').select('category');
      if (error) throw error;

      const counts = new Map<CategoryId, number>();
      for (const row of data ?? []) {
        if (!isCategoryId(row.category)) continue;
        counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
      }
      return counts;
    },
  });
}
