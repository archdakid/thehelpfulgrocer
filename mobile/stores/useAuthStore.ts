import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';

// Auth state lives in a small Zustand store rather than React Query because
// it's read by many surfaces (Settings, future receipt-attribution, gated
// screens) and changes via Supabase's auth event stream — easier to mirror
// that stream into a singleton than to invalidate a query everywhere.
//
// `status === 'loading'` covers the brief window before getSession() resolves
// at app boot; consumers should wait for 'authed' or 'anon' before deciding
// what to render.

export type AuthStatus = 'loading' | 'authed' | 'anon';

type AuthState = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  setSession: (session: Session | null) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  session: null,
  user: null,
  setSession: (session) =>
    set({
      session,
      user: session?.user ?? null,
      status: session ? 'authed' : 'anon',
    }),
}));
