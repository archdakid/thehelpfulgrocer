import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';

// Single observation row for the compare-stores reducer. Joined with stores
// so the consumer doesn't need a second lookup.
export type ListPriceObservation = {
  productId: string;
  storeId: string;
  storeName: string;
  amountMinorUnits: number;
  currency: string;
};

type RawJoinedRow = {
  product_id: string | null;
  store_id: string | null;
  amount_minor_units: number | null;
  currency: string | null;
  stores: { id: string; name: string } | null;
};

// Fetches every current price across every store for the given product set.
// Used by the compare-stores sheet to reduce client-side into per-store
// totals; deliberately separate from useListItemPrices, which is keyed on
// the active store and only carries one price per product.
export function useListPricesAllStores(productIds: readonly string[]) {
  return useQuery({
    queryKey: queryKeys.listPricesAllStores(productIds),
    enabled: productIds.length > 0,
    staleTime: 1000 * 60,
    queryFn: async (): Promise<ListPriceObservation[]> => {
      const ids = [...productIds];
      const [directRes, eqLargerRes, eqSmallerRes] = await Promise.all([
        supabase
          .from('current_prices')
          .select('product_id, store_id, amount_minor_units, currency, stores(id, name)')
          .in('product_id', ids)
          .returns<RawJoinedRow[]>(),
        supabase
          .from('product_equivalents')
          .select('product_id, equivalent_product_id, scale_factor')
          .in('product_id', ids),
        supabase
          .from('product_equivalents')
          .select('product_id, equivalent_product_id, scale_factor')
          .in('equivalent_product_id', ids),
      ]);
      if (directRes.error) throw directRes.error;

      const out: ListPriceObservation[] = [];
      const coveredPairs = new Set<string>();

      for (const row of directRes.data ?? []) {
        if (
          !row.product_id ||
          !row.store_id ||
          row.amount_minor_units == null ||
          !row.currency ||
          !row.stores
        ) continue;
        coveredPairs.add(`${row.product_id}:${row.store_id}`);
        out.push({
          productId: row.product_id,
          storeId: row.store_id,
          storeName: row.stores.name,
          amountMinorUnits: row.amount_minor_units,
          currency: row.currency,
        });
      }

      type LinkTarget = {
        listProductId: string;
        scaleFactor: number;
        direction: 'larger_pack' | 'smaller_unit';
      };
      const otherToTargets = new Map<string, LinkTarget[]>();
      for (const r of eqLargerRes.data ?? []) {
        if (!r.product_id || !r.equivalent_product_id || !r.scale_factor) continue;
        const arr = otherToTargets.get(r.equivalent_product_id) ?? [];
        arr.push({
          listProductId: r.product_id,
          scaleFactor: Number(r.scale_factor),
          direction: 'smaller_unit',
        });
        otherToTargets.set(r.equivalent_product_id, arr);
      }
      for (const r of eqSmallerRes.data ?? []) {
        if (!r.product_id || !r.equivalent_product_id || !r.scale_factor) continue;
        const arr = otherToTargets.get(r.product_id) ?? [];
        arr.push({
          listProductId: r.equivalent_product_id,
          scaleFactor: Number(r.scale_factor),
          direction: 'larger_pack',
        });
        otherToTargets.set(r.product_id, arr);
      }

      if (otherToTargets.size > 0) {
        const eqPricesRes = await supabase
          .from('current_prices')
          .select('product_id, store_id, amount_minor_units, currency, stores(id, name)')
          .in('product_id', Array.from(otherToTargets.keys()))
          .returns<RawJoinedRow[]>();

        for (const row of eqPricesRes.data ?? []) {
          if (
            !row.product_id ||
            !row.store_id ||
            row.amount_minor_units == null ||
            !row.currency ||
            !row.stores
          ) {
            continue;
          }
          const targets = otherToTargets.get(row.product_id) ?? [];
          for (const t of targets) {
            const pairKey = `${t.listProductId}:${row.store_id}`;
            if (coveredPairs.has(pairKey)) continue;
            coveredPairs.add(pairKey);
            const scaled =
              t.direction === 'larger_pack'
                ? Math.round(row.amount_minor_units / t.scaleFactor)
                : Math.round(row.amount_minor_units * t.scaleFactor);
            out.push({
              productId: t.listProductId,
              storeId: row.store_id,
              storeName: row.stores.name,
              amountMinorUnits: scaled,
              currency: row.currency,
            });
          }
        }
      }

      return out;
    },
  });
}
