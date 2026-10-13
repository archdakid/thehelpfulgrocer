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

type Options = {
  // Filter to products with prices at ≥2 distinct stores. When `storeId`
  // is also set, additionally requires that the active store is one of
  // them — i.e. "available here AND elsewhere", which is the contract
  // the Browse "All Stores" toggle wants in front of a chosen store.
  // Cheapest mode (storeId null) collapses to the simpler ≥2-store rule.
  requireMultiStore?: boolean;
};

export function useProductsInCategory(
  categoryId: string,
  storeId: string | null,
  opts: Options = {},
) {
  // Default: when no store is picked, the only meaningful view is
  // multi-store (Cheapest mode). When a store is set, the caller decides
  // explicitly via opts.requireMultiStore.
  const requireMultiStore = opts.requireMultiStore ?? storeId === null;
  return useQuery({
    queryKey: [
      ...queryKeys.productsInCategory(categoryId, storeId),
      requireMultiStore ? 'multi' : 'any',
    ] as const,
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
        const storesSeen = new Set<string>();

        for (const price of product.current_prices ?? []) {
          if (
            price.amount_minor_units == null ||
            !price.currency ||
            !price.store_id ||
            !price.stores
          ) continue;
          storesSeen.add(price.store_id);
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

        // Multi-store filter:
        //   - Always require ≥2 distinct stores.
        //   - When a specific store is set (Browse "All Stores" toggle in
        //     front of an active store), additionally require the product
        //     is at that store. "Available here AND elsewhere."
        // When the caller passes opts.requireMultiStore=false explicitly,
        // skip the filter entirely.
        if (requireMultiStore) {
          if (storesSeen.size < 2) continue;
          if (storeId && !here) continue;
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
