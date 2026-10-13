import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';
import type { Store } from '@/hooks/useStores';

export type EquivalentVariantInfo = {
  otherProductId: string;
  otherProductName: string;
  shelfAmountMinorUnits: number;
  scaleFactor: number;
  // 'larger_pack': store sells a larger pack than this product (equivalent price = shelf / scaleFactor)
  // 'smaller_unit': store sells a smaller unit than this product (equivalent price = shelf * scaleFactor)
  direction: 'larger_pack' | 'smaller_unit';
};

export type PriceAtStore = {
  store: Store;
  amountMinorUnits: number;
  currency: string;
  observedAt: string;
  source: string;
  // Sale snapshot (migration 0021). Non-null `regular` AND > amount means
  // this observation is a sale; `saleEndsAt` is informational, `promoLabel`
  // is vendor copy ("BOGO", "Member's Sale", etc.) preserved verbatim.
  regularAmountMinorUnits: number | null;
  saleEndsAt: string | null;
  promoLabel: string | null;
  // Per-store stock (migration 0017 + 0023). Default-when-absent: true
  // (no row at any specificity = available).
  isAvailable: boolean;
  // Branch breakdown when the chain has per-location availability data
  // (scraper writes one row per branch per product). Null when no per-
  // branch rows exist — admin manual writes are chain-wide and don't
  // populate this. UI surfaces "X of N locations" when present.
  branchAvailability: { available: number; total: number } | null;
  // Non-null when this store's price comes from a linked pack/size variant
  // in `product_equivalents` (migration 0029) rather than the exact SKU.
  equivalentVariant: EquivalentVariantInfo | null;
};

type AvailabilityRow = {
  product_id?: string | null;
  store_id: string | null;
  store_location_id: string | null;
  is_available: boolean | null;
};

type StoreAvailability = {
  isAvailable: boolean;
  branchAvailability: { available: number; total: number } | null;
};

type EquivalentLink = {
  otherProductId: string;
  otherProductName: string;
  scaleFactor: number;
  direction: 'larger_pack' | 'smaller_unit';
};

export function usePricesForProduct(productId: string) {
  return useQuery({
    queryKey: queryKeys.pricesForProduct(productId),
    queryFn: async (): Promise<PriceAtStore[]> => {
      // Fetch direct prices, direct availability, and any linked pack/size
      // equivalents (both where this product is the larger pack and where
      // this product is the smaller unit) in parallel.
      const [pricesRes, availabilityRes, eqLargerRes, eqSmallerRes] =
        await Promise.all([
          supabase
            .from('current_prices')
            .select(
              'amount_minor_units, currency, observed_at, source, regular_amount_minor_units, sale_ends_at, promo_label, stores(*)',
            )
            .eq('product_id', productId),
          supabase
            .from('product_store_availability')
            .select('store_id, store_location_id, is_available')
            .eq('product_id', productId)
            .returns<AvailabilityRow[]>(),
          // Rows where `productId` is the LARGER pack -> `equivalent_product_id` is smaller
          supabase
            .from('product_equivalents')
            .select(
              'equivalent_product_id, scale_factor, other:products!product_equivalents_equivalent_product_id_fkey(id, name)',
            )
            .eq('product_id', productId),
          // Rows where `productId` is the SMALLER unit -> `product_id` is larger
          supabase
            .from('product_equivalents')
            .select(
              'product_id, scale_factor, other:products!product_equivalents_product_id_fkey(id, name)',
            )
            .eq('equivalent_product_id', productId),
        ]);
      if (pricesRes.error) throw pricesRes.error;
      if (availabilityRes.error) throw availabilityRes.error;

      const availability = aggregateAvailability(availabilityRes.data ?? []);

      const rows: PriceAtStore[] = [];
      const coveredStoreIds = new Set<string>();

      for (const row of pricesRes.data ?? []) {
        if (
          !row.stores ||
          row.amount_minor_units == null ||
          !row.currency ||
          !row.observed_at ||
          !row.source
        ) continue;
        const storeAvail = availability.get(row.stores.id) ?? {
          isAvailable: true,
          branchAvailability: null,
        };
        coveredStoreIds.add(row.stores.id);
        rows.push({
          store: row.stores,
          amountMinorUnits: row.amount_minor_units,
          currency: row.currency,
          observedAt: row.observed_at,
          source: row.source,
          regularAmountMinorUnits: row.regular_amount_minor_units,
          saleEndsAt: row.sale_ends_at,
          promoLabel: row.promo_label,
          isAvailable: storeAvail.isAvailable,
          branchAvailability: storeAvail.branchAvailability,
          equivalentVariant: null,
        });
      }

      // Collect linked equivalents
      const links = new Map<string, EquivalentLink>();
      for (const r of (eqLargerRes.data ?? []) as Array<{
        equivalent_product_id: string;
        scale_factor: number;
        other: { id: string; name: string } | null;
      }>) {
        if (!r.equivalent_product_id || !r.scale_factor || r.scale_factor <= 0) continue;
        links.set(r.equivalent_product_id, {
          otherProductId: r.equivalent_product_id,
          otherProductName: r.other?.name ?? 'Smaller pack',
          scaleFactor: Number(r.scale_factor),
          direction: 'smaller_unit',
        });
      }
      for (const r of (eqSmallerRes.data ?? []) as Array<{
        product_id: string;
        scale_factor: number;
        other: { id: string; name: string } | null;
      }>) {
        if (!r.product_id || !r.scale_factor || r.scale_factor <= 0) continue;
        links.set(r.product_id, {
          otherProductId: r.product_id,
          otherProductName: r.other?.name ?? 'Larger pack',
          scaleFactor: Number(r.scale_factor),
          direction: 'larger_pack',
        });
      }

      if (links.size > 0) {
        const otherIds = Array.from(links.keys());
        const [eqPricesRes, eqAvailRes] = await Promise.all([
          supabase
            .from('current_prices')
            .select(
              'product_id, amount_minor_units, currency, observed_at, source, regular_amount_minor_units, sale_ends_at, promo_label, stores(*)',
            )
            .in('product_id', otherIds),
          supabase
            .from('product_store_availability')
            .select('product_id, store_id, store_location_id, is_available')
            .in('product_id', otherIds)
            .returns<AvailabilityRow[]>(),
        ]);

        // Group availability by product_id
        const availByProduct = new Map<string, AvailabilityRow[]>();
        for (const ar of eqAvailRes.data ?? []) {
          if (!ar.product_id) continue;
          const list = availByProduct.get(ar.product_id) ?? [];
          list.push(ar);
          availByProduct.set(ar.product_id, list);
        }

        for (const row of eqPricesRes.data ?? []) {
          if (
            !row.product_id ||
            !row.stores ||
            row.amount_minor_units == null ||
            !row.currency ||
            !row.observed_at ||
            !row.source
          ) {
            continue;
          }
          // Direct price at the same store takes precedence over a pack variant
          if (coveredStoreIds.has(row.stores.id)) continue;

          const link = links.get(row.product_id);
          if (!link) continue;

          const scaledAmount =
            link.direction === 'larger_pack'
              ? Math.round(row.amount_minor_units / link.scaleFactor)
              : Math.round(row.amount_minor_units * link.scaleFactor);

          const scaledRegular =
            row.regular_amount_minor_units != null
              ? link.direction === 'larger_pack'
                ? Math.round(row.regular_amount_minor_units / link.scaleFactor)
                : Math.round(row.regular_amount_minor_units * link.scaleFactor)
              : null;

          const prodAvailMap = aggregateAvailability(
            availByProduct.get(row.product_id) ?? [],
          );
          const storeAvail = prodAvailMap.get(row.stores.id) ?? {
            isAvailable: true,
            branchAvailability: null,
          };

          coveredStoreIds.add(row.stores.id);
          rows.push({
            store: row.stores,
            amountMinorUnits: scaledAmount,
            currency: row.currency,
            observedAt: row.observed_at,
            source: row.source,
            regularAmountMinorUnits: scaledRegular,
            saleEndsAt: row.sale_ends_at,
            promoLabel: row.promo_label,
            isAvailable: storeAvail.isAvailable,
            branchAvailability: storeAvail.branchAvailability,
            equivalentVariant: {
              otherProductId: link.otherProductId,
              otherProductName: link.otherProductName,
              shelfAmountMinorUnits: row.amount_minor_units,
              scaleFactor: link.scaleFactor,
              direction: link.direction,
            },
          });
        }
      }

      // In-stock rows first, sorted cheapest by normalized price; out-of-stock
      // bucketed at the bottom.
      rows.sort((a, b) => {
        if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
        return a.amountMinorUnits - b.amountMinorUnits;
      });
      return rows;
    },
  });
}

// Per-store availability: chain-wide (store_location_id NULL) wins when
// present (admin manual override); otherwise the chain is "available" if
// ANY branch is available. The branch-count breakdown is reported when only
// per-branch rows exist (mixed admin + scraper data isn't a real scenario
// today, but if it happens the chain-wide intent dominates).
function aggregateAvailability(rows: AvailabilityRow[]): Map<string, StoreAvailability> {
  type Acc = {
    chainWide: boolean | null;
    branchTotal: number;
    branchAvailable: number;
  };
  const acc = new Map<string, Acc>();

  for (const row of rows) {
    if (!row.store_id) continue;
    let bucket = acc.get(row.store_id);
    if (!bucket) {
      bucket = { chainWide: null, branchTotal: 0, branchAvailable: 0 };
      acc.set(row.store_id, bucket);
    }
    const isAvailable = row.is_available !== false;
    if (row.store_location_id == null) {
      bucket.chainWide = isAvailable;
    } else {
      bucket.branchTotal++;
      if (isAvailable) bucket.branchAvailable++;
    }
  }

  const out = new Map<string, StoreAvailability>();
  for (const [storeId, b] of acc) {
    if (b.chainWide != null) {
      out.set(storeId, { isAvailable: b.chainWide, branchAvailability: null });
    } else if (b.branchTotal > 0) {
      out.set(storeId, {
        isAvailable: b.branchAvailable > 0,
        branchAvailability: { available: b.branchAvailable, total: b.branchTotal },
      });
    }
  }
  return out;
}
