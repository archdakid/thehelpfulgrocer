import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';

export type ListItemPrice = {
  amountMinorUnits: number;
  currency: string;
};

// Per-product price info for the list view. We always know the cheapest
// across all stores; `current` is the price at the active store (or the
// cheapest itself when no store is selected). `isBestHere` is true when the
// active store happens to also be the cheapest — drives the "Best price"
// badge on rows.
export type ListItemPriceInfo = {
  current: ListItemPrice | undefined;
  cheapest: ListItemPrice;
  cheapestStoreId: string;
  isBestHere: boolean;
};

export function useListItemPrices(
  productIds: readonly string[],
  storeId: string | null,
) {
  return useQuery({
    queryKey: queryKeys.listItemPrices(productIds, storeId),
    enabled: productIds.length > 0,
    staleTime: 1000 * 60,
    queryFn: async (): Promise<Map<string, ListItemPriceInfo>> => {
      const ids = [...productIds];
      const [directRes, eqLargerRes, eqSmallerRes] = await Promise.all([
        supabase
          .from('current_prices')
          .select('product_id, amount_minor_units, currency, store_id')
          .in('product_id', ids),
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

      type Obs = {
        productId: string;
        storeId: string;
        amountMinorUnits: number;
        currency: string;
      };
      const observations: Obs[] = [];
      const directPairs = new Set<string>();

      for (const row of directRes.data ?? []) {
        if (
          !row.product_id ||
          !row.store_id ||
          row.amount_minor_units == null ||
          !row.currency
        ) {
          continue;
        }
        directPairs.add(`${row.product_id}:${row.store_id}`);
        observations.push({
          productId: row.product_id,
          storeId: row.store_id,
          amountMinorUnits: row.amount_minor_units,
          currency: row.currency,
        });
      }

      // Map otherProductId -> list of { listProductId, scaleFactor, direction }
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
          .select('product_id, amount_minor_units, currency, store_id')
          .in('product_id', Array.from(otherToTargets.keys()));

        for (const row of eqPricesRes.data ?? []) {
          if (
            !row.product_id ||
            !row.store_id ||
            row.amount_minor_units == null ||
            !row.currency
          ) {
            continue;
          }
          const targets = otherToTargets.get(row.product_id) ?? [];
          for (const t of targets) {
            const pairKey = `${t.listProductId}:${row.store_id}`;
            if (directPairs.has(pairKey)) continue;
            directPairs.add(pairKey);
            const scaled =
              t.direction === 'larger_pack'
                ? Math.round(row.amount_minor_units / t.scaleFactor)
                : Math.round(row.amount_minor_units * t.scaleFactor);
            observations.push({
              productId: t.listProductId,
              storeId: row.store_id,
              amountMinorUnits: scaled,
              currency: row.currency,
            });
          }
        }
      }

      type Aggregate = {
        cheapest: ListItemPrice;
        cheapestStoreId: string;
        atActiveStore: ListItemPrice | undefined;
      };
      const agg = new Map<string, Aggregate>();

      for (const obs of observations) {
        const candidate: ListItemPrice = {
          amountMinorUnits: obs.amountMinorUnits,
          currency: obs.currency,
        };
        const existing = agg.get(obs.productId);
        if (!existing) {
          agg.set(obs.productId, {
            cheapest: candidate,
            cheapestStoreId: obs.storeId,
            atActiveStore: storeId === obs.storeId ? candidate : undefined,
          });
          continue;
        }
        if (candidate.amountMinorUnits < existing.cheapest.amountMinorUnits) {
          existing.cheapest = candidate;
          existing.cheapestStoreId = obs.storeId;
        }
        if (storeId && obs.storeId === storeId) {
          existing.atActiveStore = candidate;
        }
      }

      const result = new Map<string, ListItemPriceInfo>();
      for (const [productId, value] of agg) {
        const current = storeId ? value.atActiveStore : value.cheapest;
        const isBestHere = storeId
          ? value.cheapestStoreId === storeId
          : true;
        result.set(productId, {
          current,
          cheapest: value.cheapest,
          cheapestStoreId: value.cheapestStoreId,
          isBestHere: isBestHere && current !== undefined,
        });
      }
      return result;
    },
  });
}
