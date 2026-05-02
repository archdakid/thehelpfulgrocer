import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import CircularItemRow from './CircularItemRow';
import ReparseButton from './ReparseButton';

type Props = {
  params: Promise<{ id: string }>;
};

const STATUS_TONE: Record<string, string> = {
  uploaded: 'bg-border text-muted',
  processing: 'bg-accent/10 text-accent',
  processed: 'bg-success/10 text-success',
  failed: 'bg-danger/10 text-danger',
};

export default async function CircularDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: circular, error } = await supabase
    .from('circulars')
    .select(
      `
        id, observed_week, parse_status, processed_at, created_at, image_path,
        process_error,
        store:stores ( id, name, region )
      `,
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return (
      <div className="bg-surface border border-border rounded-lg p-6">
        <p className="text-danger">Failed to load: {error.message}</p>
      </div>
    );
  }
  if (!circular) notFound();

  const { data: items } = await supabase
    .from('circular_items')
    .select(
      `
        id, position, raw_name, brand, size, amount_minor_units,
        matched_product_id, match_confidence, status,
        matched_product:products!circular_items_matched_product_id_fkey (
          id, name, brand
        ),
        contributed_product:products!circular_items_contributed_product_id_fkey (
          id, name, brand
        )
      `,
    )
    .eq('circular_id', id)
    .order('position', { ascending: true });

  const { data: signed } = await supabase.storage
    .from('circulars')
    .createSignedUrl(circular.image_path, 60 * 5);

  const rows = items ?? [];
  const pending = rows.filter((r) => r.status === 'pending');
  const accepted = rows.filter((r) => r.status === 'accepted');
  const rejected = rows.filter((r) => r.status === 'rejected');

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/circulars" className="text-sm text-accent hover:underline">
          ← Back
        </Link>
        <span
          className={`text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${
            STATUS_TONE[circular.parse_status] ?? 'bg-border text-muted'
          }`}
        >
          {circular.parse_status}
        </span>
        <h1 className="text-xl font-semibold">
          {circular.store?.name ?? 'Unknown store'}{' '}
          <span className="text-muted font-normal">· week of {circular.observed_week}</span>
        </h1>
      </div>

      {circular.process_error ? (
        <div className="bg-danger/5 border border-danger/30 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium text-danger">Parsing failed</p>
          <p className="text-xs text-muted whitespace-pre-wrap">{circular.process_error}</p>
          <ReparseButton circularId={circular.id} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-5 items-start">
        {/* Source image */}
        <div className="bg-surface border border-border rounded-lg overflow-hidden lg:sticky lg:top-4">
          {signed?.signedUrl ? (
            <Image
              src={signed.signedUrl}
              alt="Circular"
              width={800}
              height={1200}
              unoptimized
              className="w-full h-auto"
            />
          ) : (
            <div className="aspect-[3/4] flex items-center justify-center text-sm text-muted">
              No image available
            </div>
          )}
        </div>

        {/* Candidates */}
        <div className="space-y-5">
          {circular.parse_status === 'uploaded' || circular.parse_status === 'processing' ? (
            <div className="bg-surface border border-border rounded-lg p-6 text-center">
              <p className="text-sm font-medium">
                {circular.parse_status === 'processing'
                  ? 'Parsing the circular…'
                  : 'Queued for parsing.'}
              </p>
              <p className="text-xs text-muted mt-1">
                Refresh in a few seconds. Vision parsing takes 10–30s.
              </p>
            </div>
          ) : null}

          {circular.parse_status === 'processed' ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
                  Candidates ({pending.length} pending)
                </h2>
                <ReparseButton circularId={circular.id} />
              </div>

              {pending.length === 0 && rows.length === 0 ? (
                <div className="bg-surface border border-border rounded-lg p-6 text-center">
                  <p className="text-sm text-muted">
                    Claude returned no items. Try re-parsing or upload a clearer image.
                  </p>
                </div>
              ) : pending.length > 0 ? (
                <ul className="bg-surface border border-border rounded-lg divide-y divide-border overflow-hidden">
                  {pending.map((row) => (
                    <CircularItemRow key={row.id} item={row} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">All candidates resolved.</p>
              )}

              {accepted.length > 0 ? (
                <details className="bg-surface border border-border rounded-lg overflow-hidden">
                  <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-muted uppercase tracking-wider">
                    Accepted ({accepted.length})
                  </summary>
                  <ul className="divide-y divide-border">
                    {accepted.map((row) => (
                      <CircularItemRow key={row.id} item={row} />
                    ))}
                  </ul>
                </details>
              ) : null}

              {rejected.length > 0 ? (
                <details className="bg-surface border border-border rounded-lg overflow-hidden">
                  <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-muted uppercase tracking-wider">
                    Rejected ({rejected.length})
                  </summary>
                  <ul className="divide-y divide-border">
                    {rejected.map((row) => (
                      <CircularItemRow key={row.id} item={row} />
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
