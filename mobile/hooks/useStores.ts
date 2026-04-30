import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type Store = Database['public']['Tables']['stores']['Row'];

export function useStores() {
  return useQuery({
    queryKey: queryKeys.stores(),
    queryFn: async (): Promise<Store[]> => {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}
