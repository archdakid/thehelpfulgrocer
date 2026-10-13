import Link from 'next/link';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { reasonLabel } from '@/lib/format';
import QueueList, { type QueueRow } from './QueueList';
import TriageDuplicatesPanel from './TriageDuplicatesPanel';

type Props = {
  searchParams: Promise<{
    reason?: string;
    status?: string;
    resolution?: string;
  }>;
};

const REASON_TABS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'potential_duplicate', label: 'Potential duplicates' },
  { key: 'unmatched', label: 'Unmatched' },
  { key: 'low_confidence', label: 'Low confidence' },
  { key: 'auto_created_product', label: 'Auto-created' },
];

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: 'unresolved', label: 'Unresolved' },
  { key: 'triage_llm', label: 'LLM Triaged ([triage_llm])' },
  { key: 'resolved', label: 'All Resolved' },
];

const RESOLUTION_FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All resolutions' },
  { key: 'merged', label: 'merged' },
  { key: 'pack_variant', label: 'pack_variant' },
  { key: 'rejected', label: 'rejected' },
  { key: 'confirmed', label: 'confirmed' },
  { key: 'corrected', label: 'corrected' },
];

function buildQueueHref(params: {
  reason: string;
  status: string;
  resolution: string;
}): string {
  const sp = new URLSearchParams();
  if (params.reason !== 'all') sp.set('reason', params.reason);
  if (params.status !== 'unresolved') sp.set('status', params.status);
  if (params.status !== 'unresolved' && params.resolution !== 'all') {
    sp.set('resolution', params.resolution);
  }
  const qs = sp.toString();
  return qs ? `/queue?${qs}` : '/queue';
}

export default async function QueueListPage({ searchParams }: Props) {
  const {
    reason: reasonRaw,
    status: statusRaw,
    resolution: resolutionRaw,
  } = await searchParams;
  const reason = REASON_TABS.find((t) => t.key === reasonRaw)?.key ?? 'all';
  const status =
    STATUS_TABS.find((t) => t.key === statusRaw)?.key ?? 'unresolved';
  const resolution =
    RESOLUTION_FILTERS.find((t) => t.key === resolutionRaw)?.key ?? 'all';

  const supabase = await createSupabaseServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // REASON: 0026's columns + FK relationships are in the DB. Cast through
  // `any` so the nested embeds resolve cleanly.
  let query = (supabase.from('flagged_items') as any)
    .select(
      `
        id,
        reason,
        match_score,
        resolution,
        notes,
        resolved_at,
        created_at,
        auto_created_product_id,
        auto_created_product:products!flagged_items_auto_created_product_id_fkey (
          id, name
        ),
        flagged_product:products!flagged_items_flagged_product_id_fkey (
          id, name, brand
        ),
        candidate_product:products!flagged_items_candidate_product_id_fkey (
          id, name, brand
        ),
        receipt_item:receipt_items (
          id,
          raw_text,
          quantity,
          line_total_minor_units,
          match_confidence,
          matched_product:products!receipt_items_matched_product_id_fkey (
            id, name
          ),
          receipt:receipts (
            id,
            currency,
            captured_at,
            created_at,
            store:stores ( id, name )
          )
        )
      `,
    )
    .limit(200);

  if (status === 'unresolved') {
    query = query
      .is('resolved_at', null)
      .order('created_at', { ascending: false });
  } else if (status === 'triage_llm') {
    query = query
      .not('resolved_at', 'is', null)
      .like('notes', '[triage_llm]%')
      .order('resolved_at', { ascending: false });
  } else {
    query = query
      .not('resolved_at', 'is', null)
      .order('resolved_at', { ascending: false });
  }

  if (status !== 'unresolved' && resolution !== 'all') {
    query = query.eq('resolution', resolution);
  }

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

  const rows = (data ?? []) as unknown as QueueRow[];

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold">Review queue</h1>
        <span className="text-sm text-muted">
          {rows.length} {status === 'unresolved' ? 'unresolved' : 'resolved'}
          {reason !== 'all' ? ` · ${reasonLabel(reason)}` : ''}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <nav className="flex gap-2 flex-wrap">
          {REASON_TABS.map((tab) => {
            const active = tab.key === reason;
            const href = buildQueueHref({
              reason: tab.key,
              status,
              resolution,
            });
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

        <nav className="flex gap-1.5 flex-wrap">
          {STATUS_TABS.map((tab) => {
            const active = tab.key === status;
            const href = buildQueueHref({
              reason,
              status: tab.key,
              resolution,
            });
            return (
              <Link
                key={tab.key}
                href={href}
                className={`px-2.5 py-1 rounded text-xs font-medium border ${
                  active
                    ? 'bg-accent text-white border-accent'
                    : 'bg-surface text-muted border-border hover:text-text'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {status !== 'unresolved' ? (
        <nav className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted mr-1">Filter resolution:</span>
          {RESOLUTION_FILTERS.map((f) => {
            const active = f.key === resolution;
            const href = buildQueueHref({
              reason,
              status,
              resolution: f.key,
            });
            return (
              <Link
                key={f.key}
                href={href}
                className={`px-2 py-0.5 rounded text-xs font-mono border ${
                  active
                    ? 'bg-text text-bg border-text'
                    : 'bg-surface text-muted border-border hover:text-text'
                }`}
              >
                {f.label}
              </Link>
            );
          })}
        </nav>
      ) : null}

      {status === 'unresolved' &&
      (reason === 'potential_duplicate' || reason === 'all') ? (
        <TriageDuplicatesPanel />
      ) : null}

      <QueueList rows={rows} />
    </div>
  );
}
