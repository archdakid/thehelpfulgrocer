import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

export type Profile = {
  id: string;
  displayName: string | null;
  isAdmin: boolean;
};

// Reads the signed-in user's own profile row. RLS on the table only allows
// id = auth.uid(), so this naturally returns nothing for anon callers — the
// query is also disabled in that case to avoid the round trip.
export function useProfile() {
  const userId = useAuthStore((s) => s.user?.id ?? null);

  return useQuery({
    queryKey: queryKeys.profile(userId),
    enabled: userId !== null,
    queryFn: async (): Promise<Profile | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, is_admin')
        .eq('id', userId)
        .single();
      if (error) {
        // PGRST116 = "no rows returned". Possible during the brief window
        // between sign-up and the auth.users trigger writing the profile
        // row. Treat as null; the next refetch will pick it up.
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return {
        id: data.id,
        displayName: data.display_name,
        isAdmin: data.is_admin,
      };
    },
  });
}

export function useUpdateProfile() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { displayName: string | null }) => {
      if (!userId) throw new Error('Not signed in');
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: input.displayName })
        .eq('id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.profile(userId) });
    },
  });
}
