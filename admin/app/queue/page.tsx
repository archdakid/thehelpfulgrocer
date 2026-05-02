import Link from 'next/link';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatMoney, reasonLabel, reasonTone } from '@/lib/format';

type Props = {
  searchParams: Promise<{ reason?: string }>;
};

const REASON_TABS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'unmatched', label: 'Unmatched' },
  { key: 'low_confidence', label: 'Low confidence' },
  { key: 'auto_created_product', label: 'Auto-created' },
];

export default async function QueueListPage({ searchParams }: Props) {
  const { reason: reasonRaw } = await searchParams;
  const reason = REASON_TABS.find((t) => t.key === reasonRaw)?.key ?? 'all';

  const supabase = await createSupabaseServerClient();

  // Embed disambiguation: receipt_items has TWO FKs to products
  // (matched_product_id), and flagged_items has its own
  // (auto_created_product_id). Postgrest needs the FK name to pick the
  // right join.
  let query = supabase
    .from('flagged_items')
    .select(
      `
        id,
        reason,
        created_at,
        auto_created_product_id,
        auto_created_product:products!flagged_items_auto_created_product_id_fkey (
          id, name
        ),
        receipt_item:receipt_items!inner (
          id,
          raw_text,
          quantity,
          line_total_minor_units,
          match_confidence,
          matched_product:products!receipt_items_matched_product_id_fkey (
            id, name
          ),
          receipt:receipts!inner (
            id,
            currency,
            captured_at,
            created_at,
            store:stores ( id, name )
          )
        )
      `,
    )
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(200);

  if (reason !== 'all') {
    query = query.eq('reason', reason);
  }

  const { data, error } = await query;

  if (error) {
    return (
      <div className="bg-surface border border-border rounded-lg p-6">
        <p className="text-danger">Failed to load queue: {error.message}</p>
      </div>
    );
  }

  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Review queue</h1>
        <span className="text-sm text-muted">
          {rows.length} unresolved{reason !== 'all' ? ` · ${reasonLabel(reason)}` : ''}
        </span>
      </div>

      <nav className="flex gap-2">
        {REASON_TABS.map((tab) => {
          const active = tab.key === reason;
          const href = tab.key === 'all' ? '/queue' : `/queue?reason=${tab.key}`;
          return (
            <Link
              key={tab.key}
              href={href}
              className={`px-3 py-1.5 rounded-full text-sm border ${
                active
                  ? 'bg-text text-bg border-text'
                  : 'bg-surface text-text border-border hover:bg-bg'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-10 text-center">
          <p className="text-text font-medium">Queue is clear.</p>
          <p className="text-sm text-muted mt-1">
            Nothing matches this filter. Receipts that need review will land here as they
            come in.
          </p>
        </div>
      ) : (
        <ul className="bg-surface border border-border rounded-lg divide-y divide-border overflow-hidden">
          {rows.map((row) => {
            const item = row.receipt_item;
            const receipt = item?.receipt;
            const store = receipt?.store?.name ?? 'Unknown store';
            const matched =
              row.auto_created_product?.name ?? item?.matched_product?.name ?? null;
            const tone = reasonTone(row.reason);

            return (
              <li key={row.id} className="hover:bg-bg">
                <Link href={`/queue/${row.id}`} className="block px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span
                      className={`inline-block text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${tone}`}
                    >
                      {reasonLabel(row.reason)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item?.raw_text}</p>
                      <p className="text-xs text-muted mt-0.5 truncate">
                        {store}
                        {matched ? ` · matched: ${matched}` : ''}
                        {item?.match_confidence != null
                          ? ` · score ${item.match_confidence.toFixed(2)}`
                          : ''}
                      </p>
                    </div>
                    <div className="text-sm tabular-nums text-text shrink-0">
                      {formatMoney(item?.line_total_minor_units ?? 0, receipt?.currency ?? 'TTD')}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
