// Page-level admin gate. Returns the user + supabase client when the
// caller is signed in AND `profiles.is_admin = true`; otherwise redirects
// to /sign-in. The redirect carries no message — non-admins who somehow
// reach a queue URL won't be told why they're bounced.

import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    await supabase.auth.signOut();
    redirect('/sign-in?denied=1');
  }

  return { supabase, user };
}
