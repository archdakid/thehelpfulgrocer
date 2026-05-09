import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';

export type StoreVendorCategoryRoot = {
  root: string;
  productCount: number;
};

// Top-level vendor categories for a store, with the count of distinct
// products under each root. Drives the Browse "By store" tile grid.
//
// Implemented client-side over a single
//   `select vendor_path_root, product_id from product_store_categories where store_id = ?`
// rather than a SQL group-by RPC. Same shape as the existing
// useCategoryCounts hook — at MVP scale (low thousands of rows per store)
// this is trivially fast. Swap in an RPC if it ever becomes a bottleneck.
//
// `productCount` counts DISTINCT products: a product that sits in multiple
// paths under the same root (Massy "On Sale" vs "Beverages") is counted once.
export function useStoreVendorCategories(storeId: string | null) {
  return useQuery({
    queryKey: storeId ? queryKeys.storeVendorCategories(storeId) : ['store-vendor-categories', 'none'],
    enabled: !!storeId,
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<StoreVendorCategoryRoot[]> => {
      // The (store_id, vendor_path_root) index covers this read. The limit
      // overrides PostgREST's default 1000-row cap which silently truncates
      // for stores with large catalogs (SuperPharm has ~16k rows here =
      // 11k products × ~1.5 paths each). Without it the by-store grid sees
      // only whatever roots the first 1000 rows happen to cover.
      const { data, error } = await supabase
        .from('product_store_categories')
        .select('vendor_path_root, product_id')
        .eq('store_id', storeId!)
        .limit(100000);
      if (error) throw error;

      const productsByRoot = new Map<string, Set<string>>();
      for (const row of data ?? []) {
        if (!row.vendor_path_root || !row.product_id) continue;
        let bucket = productsByRoot.get(row.vendor_path_root);
        if (!bucket) {
          bucket = new Set();
          productsByRoot.set(row.vendor_path_root, bucket);
        }
        bucket.add(row.product_id);
      }

      // Sort by count desc so the densest categories surface first; tie-break
      // alphabetically so the order stays stable between renders.
      const rows: StoreVendorCategoryRoot[] = [];
      for (const [root, products] of productsByRoot) {
        rows.push({ root, productCount: products.size });
      }
      rows.sort((a, b) => {
        if (b.productCount !== a.productCount) return b.productCount - a.productCount;
        return a.root.localeCompare(b.root);
      });
      return rows;
    },
  });
}
