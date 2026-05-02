import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatMoney, reasonLabel, reasonTone } from '@/lib/format';
import ResolveActions from './ResolveActions';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function QueueDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: flag, error } = await supabase
    .from('flagged_items')
    .select(
      `
        id,
        reason,
        notes,
        resolved_at,
        resolution,
        created_at,
        auto_created_product_id,
        auto_created_product:products!flagged_items_auto_created_product_id_fkey (
          id, name, brand, image_url
        ),
        receipt_item:receipt_items!inner (
          id,
          raw_text,
          quantity,
          unit_price_minor_units,
          line_total_minor_units,
          match_confidence,
          matched_product:products!receipt_items_matched_product_id_fkey (
            id, name, brand, image_url
          ),
          receipt:receipts!inner (
            id,
            currency,
            captured_at,
            created_at,
            image_path,
            parsed_store_name,
            store:stores ( id, name )
          )
        )
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
  if (!flag || !flag.receipt_item || !flag.receipt_item.receipt) notFound();

  const item = flag.receipt_item;
  const receipt = item.receipt;
  const matchedProduct = item.matched_product;
  const autoProduct = flag.auto_created_product;

  // 5-minute signed URL — the page is server-rendered, the URL is fresh on
  // every load, no caching considerations.
  const { data: signed } = await supabase.storage
    .from('receipts')
    .createSignedUrl(receipt.image_path, 60 * 5);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/queue" className="text-sm text-accent hover:underline">
          ← Back to queue
        </Link>
        <span className={`text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${reasonTone(flag.reason)}`}>
          {reasonLabel(flag.reason)}
        </span>
        {flag.resolved_at ? (
          <span className="text-xs text-muted">resolved · {flag.resolution}</span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Receipt image */}
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          {signed?.signedUrl ? (
            <Image
              src={signed.signedUrl}
              alt="Receipt"
              width={600}
              height={900}
              unoptimized
              className="w-full h-auto"
            />
          ) : (
            <div className="aspect-[2/3] flex items-center justify-center text-sm text-muted">
              No image available
            </div>
          )}
        </div>

        {/* Context + action panel */}
        <div className="space-y-4">
          <section className="bg-surface border border-border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-2">
              Line item
            </h2>
            <p className="text-base font-medium">{item.raw_text}</p>
            <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted">Qty</dt>
              <dd>{item.quantity}</dd>
              <dt className="text-muted">Line total</dt>
              <dd className="tabular-nums">
                {formatMoney(item.line_total_minor_units, receipt.currency ?? 'TTD')}
              </dd>
              {item.unit_price_minor_units != null ? (
                <>
                  <dt className="text-muted">Unit price</dt>
                  <dd className="tabular-nums">
                    {formatMoney(item.unit_price_minor_units, receipt.currency ?? 'TTD')}
                  </dd>
                </>
              ) : null}
              {item.match_confidence != null ? (
                <>
                  <dt className="text-muted">Match score</dt>
                  <dd className="tabular-nums">{item.match_confidence.toFixed(2)}</dd>
                </>
              ) : null}
            </dl>
          </section>

          <section className="bg-surface border border-border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-2">
              Receipt
            </h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted">Store</dt>
              <dd>
                {receipt.store?.name ??
                  (receipt.parsed_store_name
                    ? `${receipt.parsed_store_name} (unmatched)`
                    : 'Unknown')}
              </dd>
              <dt className="text-muted">Captured</dt>
              <dd>
                {new Date(receipt.captured_at ?? receipt.created_at).toLocaleString()}
              </dd>
            </dl>
          </section>

          {matchedProduct || autoProduct ? (
            <section className="bg-surface border border-border rounded-lg p-4">
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-2">
                {flag.reason === 'auto_created_product' ? 'Auto-created product' : 'Current match'}
              </h2>
              <p className="text-base font-medium">
                {(autoProduct ?? matchedProduct)?.name}
              </p>
              {(autoProduct ?? matchedProduct)?.brand ? (
                <p className="text-sm text-muted">{(autoProduct ?? matchedProduct)?.brand}</p>
              ) : null}
            </section>
          ) : null}

          <ResolveActions
            flaggedItemId={flag.id}
            reason={flag.reason as 'unmatched' | 'low_confidence' | 'auto_created_product'}
            currentProductId={matchedProduct?.id ?? autoProduct?.id ?? null}
            resolved={Boolean(flag.resolved_at)}
          />
        </div>
      </div>
    </div>
  );
}
