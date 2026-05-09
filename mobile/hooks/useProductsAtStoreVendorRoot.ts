import { useQuery } from '@tanstack/react-query';

import { isCategoryId, type CategoryId } from '@/constants/categories';
import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';

const PATH_SEPARATOR = ' › ';

// Mirrors the category-detail shape in useProductsInCategory so the
// existing CategoryProductRow component can render this list unchanged.
export type StoreVendorProductRow = {
  id: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  category: CategoryId; // Falls back when the global category is null/unknown.
  here: {
    amountMinorUnits: number;
    currency: string;
    storeId: string;
    storeName: string;
  } | null;
  cheapest: {
    amountMinorUnits: number;
    currency: string;
    storeId: string;
    storeName: string;
  } | null;
  savingsMinor: number;
  isBestHere: boolean;
};

type CategoryRow = {
  product_id: string;
  vendor_path: string | null;
  products: {
    id: string;
    name: string;
    brand: string | null;
    image_url: string | null;
    category: string | null;
    current_prices: Array<{
      amount_minor_units: number | null;
      currency: string | null;
      store_id: string | null;
      stores: { id: string; name: string } | null;
    }> | null;
  } | null;
};

// Products at a store under a vendor_path prefix. Two modes:
//   - child = null:  all products under the root (vendor_path_root = root)
//   - child set:     products at "root › child" exactly OR descendants
//                    ("root › child › grandchild", etc.)
//
// Embeds `current_prices` so the row shows "best at X, save TT$Y" the same
// way the global category screen does. One product can have multiple paths
// under the same root/child filter (Massy "Beverages › Soft Drinks" +
// "Beverages › On Sale"); we de-dup on product_id.
export function useProductsAtStoreVendorPath(
  storeId: string | null,
  root: string | null,
  child: string | null = null,
) {
  return useQuery({
    queryKey: storeId && root
      ? queryKeys.productsAtStoreVendorPath(storeId, root, child)
      : ['products', 'store-vendor-path', 'none'],
    enabled: !!storeId && !!root,
    staleTime: 1000 * 60,
    queryFn: async (): Promise<StoreVendorProductRow[]> => {
      // .limit(50000) defends against PostgREST's default 1000-row cap;
      // popular roots can exceed it once vendor catalogs land. The natural
      // listing length (1000-2000 products per root) sits well below this.
      let query = supabase
        .from('product_store_categories')
        .select(
          'product_id, vendor_path, products!inner(id, name, brand, image_url, category, current_prices(amount_minor_units, currency, store_id, stores(id, name)))',
        )
        .eq('store_id', storeId!)
        .eq('vendor_path_root', root!)
        .limit(50000);

      if (child) {
        // Exact match on "root › child" + LIKE for descendants. PostgREST
        // .or() takes comma-separated `column.op.value` pairs. Our paths
        // never contain commas (the separator is ` › `) or like-wildcards
        // (`%` / `_`), so the values pass through verbatim.
        const exactPath = `${root}${PATH_SEPARATOR}${child}`;
        const descendantsPattern = `${exactPath}${PATH_SEPARATOR}%`;
        query = query.or(
          `vendor_path.eq.${exactPath},vendor_path.like.${descendantsPattern}`,
        );
      }

      const { data, error } = await query.returns<CategoryRow[]>();
      if (error) throw error;

      const seen = new Set<string>();
      const rows: StoreVendorProductRow[] = [];

      for (const item of data ?? []) {
        const product = item.products;
        if (!product) continue;
        if (seen.has(product.id)) continue;
        seen.add(product.id);

        let cheapest: StoreVendorProductRow['cheapest'] = null;
        let here: StoreVendorProductRow['here'] = null;

        for (const price of product.current_prices ?? []) {
          if (
            price.amount_minor_units == null ||
            !price.currency ||
            !price.store_id ||
            !price.stores
          ) continue;
          const candidate = {
            amountMinorUnits: price.amount_minor_units,
            currency: price.currency,
            storeId: price.store_id,
            storeName: price.stores.name,
          };
          if (!cheapest || candidate.amountMinorUnits < cheapest.amountMinorUnits) {
            cheapest = candidate;
          }
          if (price.store_id === storeId) {
            here = candidate;
          }
        }

        const savingsMinor = here && cheapest && here.amountMinorUnits > cheapest.amountMinorUnits
          ? here.amountMinorUnits - cheapest.amountMinorUnits
          : 0;
        const isBestHere = !!here && !!cheapest && here.storeId === cheapest.storeId;

        rows.push({
          id: product.id,
          name: product.name,
          brand: product.brand,
          imageUrl: product.image_url,
          category: isCategoryId(product.category) ? product.category : 'pantry',
          here,
          cheapest,
          savingsMinor,
          isBestHere,
        });
      }

      rows.sort((a, b) => a.name.localeCompare(b.name));
      return rows;
    },
  });
}

// Backward-compat shim so the old name keeps working until consumers migrate.
// Same as useProductsAtStoreVendorPath without the child filter.
export const useProductsAtStoreVendorRoot = (
  storeId: string | null,
  root: string | null,
) => useProductsAtStoreVendorPath(storeId, root, null);
