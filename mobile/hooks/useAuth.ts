import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

// Module-level guard: bootstrapAuth() is safe to call repeatedly (e.g. on
// fast-refresh or remount); only the first call wires up Supabase. Call once
// from the root layout effect.
let bootstrapped = false;

export function bootstrapAuth() {
  if (bootstrapped) return;
  bootstrapped = true;

  void supabase.auth.getSession().then(({ data }) => {
    useAuthStore.getState().setSession(data.session);
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.getState().setSession(session);
  });
}

export type AuthError = string | null;

export function useAuth() {
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);

  return {
    status,
    session,
    user,
    isAuthed: status === 'authed',
    isLoading: status === 'loading',
    signIn: async (email: string, password: string): Promise<AuthError> => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error?.message ?? null;
    },
    signUp: async (email: string, password: string): Promise<AuthError> => {
      const { error } = await supabase.auth.signUp({ email, password });
      return error?.message ?? null;
    },
    signOut: async (): Promise<AuthError> => {
      const { error } = await supabase.auth.signOut();
      return error?.message ?? null;
    },
  };
}
