import { useQuery } from '@tanstack/react-query';

import type { Product } from '@/hooks/useProduct';
import { fetchOffProduct, type OFFProduct } from '@/lib/openFoodFacts';
import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';

export type BarcodeLookupResult =
  | {
      source: 'catalog';
      barcode: string;
      product: Product;
      offProduct: null;
    }
  | {
      source: 'open_food_facts';
      barcode: string;
      product: null;
      offProduct: OFFProduct;
    }
  | {
      source: 'not_found';
      barcode: string;
      product: null;
      offProduct: null;
    };

function buildBarcodeCandidates(raw: string): string[] {
  const cleaned = raw.trim().replace(/\s+/g, '');
  if (!cleaned) return [];
  const stripped = cleaned.replace(/^0+/, '');
  const set = new Set<string>([cleaned]);
  if (stripped.length > 0) {
    set.add(stripped);
    if (stripped.length <= 12) set.add(stripped.padStart(12, '0'));
    if (stripped.length <= 13) set.add(stripped.padStart(13, '0'));
  }
  return Array.from(set);
}

export function useProductByBarcode(barcode: string | null) {
  const normalized = barcode?.trim() ?? '';

  return useQuery({
    queryKey: queryKeys.productByBarcode(normalized),
    enabled: normalized.length >= 6,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<BarcodeLookupResult> => {
      const candidates = buildBarcodeCandidates(normalized);

      const { data, error } = await supabase
        .from('products')
        .select('*')
        .in('upc', candidates)
        .limit(1);

      if (error) throw error;

      const matched = data?.[0] ?? null;
      if (matched) {
        return {
          source: 'catalog',
          barcode: normalized,
          product: matched,
          offProduct: null,
        };
      }

      // Fallback to Open Food Facts so users can still identify and add
      // unindexed items to their grocery list by barcode.
      try {
        const off = await fetchOffProduct(normalized);
        if (off && (off.productName || off.imageUrl)) {
          return {
            source: 'open_food_facts',
            barcode: normalized,
            product: null,
            offProduct: off,
          };
        }
      } catch {
        // Non-fatal: fall through to not_found
      }

      return {
        source: 'not_found',
        barcode: normalized,
        product: null,
        offProduct: null,
      };
    },
  });
}
