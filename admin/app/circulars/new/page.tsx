import Link from 'next/link';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import UploadForm from './UploadForm';

export default async function NewCircularPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('stores')
    .select('id, name, region')
    .eq('is_active', true)
    .order('name', { ascending: true });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/circulars" className="text-sm text-accent hover:underline">
          ← Back
        </Link>
        <h1 className="text-xl font-semibold">Upload circular</h1>
      </div>

      {error ? (
        <div className="bg-surface border border-border rounded-lg p-6">
          <p className="text-danger">Failed to load stores: {error.message}</p>
        </div>
      ) : (
        <UploadForm stores={data ?? []} />
      )}

      <p className="text-sm text-muted">
        Upload the circular image (JPG / PNG / WEBP, max 10MB). Claude will extract candidate
        products and prices; you&apos;ll review each one on the next screen.
      </p>
    </div>
  );
}
