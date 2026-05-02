import { useQuery } from '@tanstack/react-query';

import { isCategoryId, type CategoryId } from '@/constants/categories';
import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';

export type CategoryPriceAtStore = {
  amountMinorUnits: number;
  currency: string;
  storeId: string;
  storeName: string;
};

// One row per product in the category. `here` is the price at the active
// store (or, when no store is selected, the cheapest price). `cheapest` is
// always the cross-store minimum. `savingsMinor` is positive when buying
// here costs more than the cheapest store; zero when active is cheapest or
// there's no observation here.
export type CategoryProductRow = {
  id: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  category: CategoryId;
  here: CategoryPriceAtStore | null;
  cheapest: CategoryPriceAtStore | null;
  savingsMinor: number;
  isBestHere: boolean;
};

type RawJoinedRow = {
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
};

export function useProductsInCategory(categoryId: string, storeId: string | null) {
  return useQuery({
    queryKey: queryKeys.productsInCategory(categoryId, storeId),
    enabled: isCategoryId(categoryId),
    staleTime: 1000 * 60,
    queryFn: async (): Promise<CategoryProductRow[]> => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, brand, image_url, category, current_prices(amount_minor_units, currency, store_id, stores(id, name))')
        .eq('category', categoryId)
        .order('name', { ascending: true })
        .returns<RawJoinedRow[]>();
      if (error) throw error;

      const rows: CategoryProductRow[] = [];
      for (const product of data ?? []) {
        if (!isCategoryId(product.category)) continue;

        let cheapest: CategoryPriceAtStore | null = null;
        let here: CategoryPriceAtStore | null = null;

        for (const price of product.current_prices ?? []) {
          if (
            price.amount_minor_units == null ||
            !price.currency ||
            !price.store_id ||
            !price.stores
          ) continue;
          const candidate: CategoryPriceAtStore = {
            amountMinorUnits: price.amount_minor_units,
            currency: price.currency,
            storeId: price.store_id,
            storeName: price.stores.name,
          };
          if (!cheapest || candidate.amountMinorUnits < cheapest.amountMinorUnits) {
            cheapest = candidate;
          }
          if (storeId && price.store_id === storeId) {
            here = candidate;
          }
        }

        if (!storeId && cheapest) {
          here = cheapest;
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
          category: product.category,
          here,
          cheapest,
          savingsMinor,
          isBestHere,
        });
      }
      return rows;
    },
  });
}
