// Server-side Supabase client. Cookies are read/written through Next's
// `cookies()` so the SSR flow keeps auth state in sync. Per @supabase/ssr's
// docs, set() can throw inside Server Components (read-only request scope) —
// we swallow that and rely on middleware.ts to refresh the session cookie
// on every request instead.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import type { Database } from '@/lib/database.types';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Set from a Server Component — middleware handles refresh.
          }
        },
      },
    },
  );
}
