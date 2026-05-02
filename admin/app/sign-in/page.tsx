import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { signIn } from './actions';

type Props = {
  searchParams: Promise<{ error?: string; denied?: string }>;
};

export default async function SignInPage({ searchParams }: Props) {
  const { error, denied } = await searchParams;

  // If they're already signed in and admin, just send them in.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.is_admin) redirect('/queue');
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-surface border border-border rounded-lg p-6 shadow-sm">
        <h1 className="text-xl font-semibold mb-1">SmartShopper admin</h1>
        <p className="text-sm text-muted mb-5">
          Sign in with your admin account to review the queue.
        </p>

        {denied ? (
          <p className="mb-4 text-sm text-danger">
            That account isn&apos;t an admin. You&apos;ve been signed out.
          </p>
        ) : null}
        {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

        <form action={signIn} className="space-y-3">
          <label className="block text-sm">
            <span className="text-muted">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full border border-border rounded px-3 py-2 bg-bg focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full border border-border rounded px-3 py-2 bg-bg focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          <button
            type="submit"
            className="w-full bg-accent text-white rounded px-3 py-2 text-sm font-medium hover:opacity-90"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
