import Link from 'next/link';

import { signOut } from '@/app/sign-in/actions';
import { requireAdmin } from '@/lib/requireAdmin';

export default async function QueueLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-surface">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/queue" className="font-semibold">
            Admin · Review queue
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted">{user.email}</span>
            <form action={signOut}>
              <button type="submit" className="text-accent hover:underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-6">{children}</main>
    </div>
  );
}
