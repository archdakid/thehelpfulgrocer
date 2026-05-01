import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';
import type { Store } from '@/hooks/useStores';

export function useStore(id: string) {
  return useQuery({
    queryKey: queryKeys.store(id),
    queryFn: async (): Promise<Store> => {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
  });
}
