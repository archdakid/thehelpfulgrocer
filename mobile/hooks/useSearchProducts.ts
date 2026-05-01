import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/hooks/useProduct';

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 10;

export function useSearchProducts(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: queryKeys.searchProducts(trimmed),
    enabled: trimmed.length >= MIN_QUERY_LENGTH,
    staleTime: 1000 * 30,
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .ilike('name', `%${trimmed}%`)
        .order('name', { ascending: true })
        .limit(MAX_RESULTS);
      if (error) throw error;
      return data;
    },
  });
}
