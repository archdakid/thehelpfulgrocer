import AdminShell from '@/components/AdminShell';
import { requireAdmin } from '@/lib/requireAdmin';

export default async function ScrapeRunsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireAdmin();
  return (
    <AdminShell email={user.email ?? ''} active="scrape-runs">
      {children}
    </AdminShell>
  );
}
