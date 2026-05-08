import { useQuery } from '@tanstack/react-query';

import { isCategoryId, type CategoryId } from '@/constants/categories';
import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';

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

// All products at a store sitting under a vendor_path_root, with cross-store
// pricing context. Embeds `current_prices` so the row shows "best at X, save
// TT$Y" the same way the global category screen does.
//
// One product can have multiple paths under the same root (Massy "Beverages
// › Soft Drinks" + "Beverages › On Sale"); we de-dup on product_id.
export function useProductsAtStoreVendorRoot(storeId: string | null, root: string | null) {
  return useQuery({
    queryKey: storeId && root
      ? queryKeys.productsAtStoreVendorRoot(storeId, root)
      : ['products', 'store-vendor-root', 'none'],
    enabled: !!storeId && !!root,
    staleTime: 1000 * 60,
    queryFn: async (): Promise<StoreVendorProductRow[]> => {
      // REASON: see useStoreVendorCategories — same pending types regen.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (supabase as any)
        .from('product_store_categories')
        .select(
          'product_id, vendor_path, products!inner(id, name, brand, image_url, category, current_prices(amount_minor_units, currency, store_id, stores(id, name)))',
        )
        .eq('store_id', storeId!)
        .eq('vendor_path_root', root!);
      const error = result.error;
      const data = (result.data ?? null) as CategoryRow[] | null;
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
