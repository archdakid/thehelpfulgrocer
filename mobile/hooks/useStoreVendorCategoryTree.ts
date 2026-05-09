import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';

export type StoreVendorChild = {
  name: string;
  productCount: number;
};

export type StoreVendorTree = {
  total: number;            // distinct products under (storeId, root)
  children: StoreVendorChild[];
};

const PATH_SEPARATOR = ' › ';

type RawRow = {
  vendor_path: string | null;
  product_id: string | null;
};

// Returns the immediate subcategories under (storeId, root) with distinct
// product counts, plus the total under the root. Drives the chip bar on
// the by-store category drill-down screen.
//
// Same client-side group-by pattern as useStoreVendorCategories — at MVP
// scale (low thousands of rows per root) this is trivially fast. Swap in
// an RPC if it ever becomes a bottleneck.
//
// Children that share a name across deeper paths roll up their distinct
// product sets ("Beverages › Soft Drinks › Cola" and "Beverages › Soft
// Drinks › Diet" both contribute to the "Soft Drinks" child count).
export function useStoreVendorCategoryTree(storeId: string | null, root: string | null) {
  return useQuery({
    queryKey: storeId && root
      ? queryKeys.storeVendorCategoryTree(storeId, root)
      : ['store-vendor-tree', 'none'],
    enabled: !!storeId && !!root,
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<StoreVendorTree> => {
      // .limit(50000) defends against PostgREST's default 1000-row cap;
      // popular roots (SP "School & Office" with 1360 products × ~1.5 paths)
      // exceed the default and would otherwise truncate the chip counts.
      const { data, error } = await supabase
        .from('product_store_categories')
        .select('vendor_path, product_id')
        .eq('store_id', storeId!)
        .eq('vendor_path_root', root!)
        .limit(50000)
        .returns<RawRow[]>();
      if (error) throw error;

      const allProducts = new Set<string>();
      const productsByChild = new Map<string, Set<string>>();

      for (const row of data ?? []) {
        if (!row.vendor_path || !row.product_id) continue;
        allProducts.add(row.product_id);
        const segments = row.vendor_path.split(PATH_SEPARATOR);
        const childName = segments[1];
        if (childName) {
          let bucket = productsByChild.get(childName);
          if (!bucket) {
            bucket = new Set();
            productsByChild.set(childName, bucket);
          }
          bucket.add(row.product_id);
        }
      }

      const children: StoreVendorChild[] = [];
      for (const [name, products] of productsByChild) {
        children.push({ name, productCount: products.size });
      }
      // By count desc; tie-break alphabetically for stable ordering.
      children.sort((a, b) => {
        if (b.productCount !== a.productCount) return b.productCount - a.productCount;
        return a.name.localeCompare(b.name);
      });

      return { total: allProducts.size, children };
    },
  });
}
