import { useQuery } from '@tanstack/react-query';

import { fetchOffProduct, type OFFProduct } from '@/lib/openFoodFacts';
import { queryKeys } from '@/lib/queryKeys';

// "INTERNAL-" UPCs are placeholders for loose-produce / bakery items that
// don't carry a real barcode (see 0004_add_product_category.sql). OFF would
// 404 for them; skip the round trip.
function isQueryableBarcode(upc: string | null): upc is string {
  return upc !== null && upc.length > 0 && !upc.startsWith('INTERNAL-');
}

// Reads OFF's record for a UPC. Disabled when the product has no barcode or
// when the barcode is one of our internal placeholders. 24h staleTime is
// generous — nutrition data barely changes — and keeps us comfortably
// inside the 100 req/min anon rate limit even with a busy session.
export function useOpenFoodFacts(upc: string | null) {
  const enabled = isQueryableBarcode(upc);
  return useQuery({
    queryKey: queryKeys.offProduct(upc),
    enabled,
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24 * 7,
    retry: 1,
    queryFn: async (): Promise<OFFProduct | null> => {
      if (!enabled || !upc) return null;
      return fetchOffProduct(upc);
    },
  });
}
