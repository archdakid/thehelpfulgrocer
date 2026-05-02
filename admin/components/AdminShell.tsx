import Link from 'next/link';

import { signOut } from '@/app/sign-in/actions';

type Props = {
  email: string;
  active: 'queue' | 'stores';
  children: React.ReactNode;
};

const NAV: Array<{ key: 'queue' | 'stores'; label: string; href: string }> = [
  { key: 'queue', label: 'Review queue', href: '/queue' },
  { key: 'stores', label: 'Stores', href: '/stores' },
];

export default function AdminShell({ email, active, children }: Props) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-surface">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <span className="font-semibold">Admin</span>
            <nav className="flex items-center gap-4 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className={
                    item.key === active
                      ? 'text-text font-medium'
                      : 'text-muted hover:text-text'
                  }
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted">{email}</span>
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
