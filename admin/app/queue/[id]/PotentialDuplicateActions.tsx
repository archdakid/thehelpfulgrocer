'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { resolveFlaggedItem } from './actions';

type Props = {
  flaggedItemId: string;
  flaggedProductId: string | null;
  candidateProductId: string | null;
  candidateProductName: string | null;
  resolved: boolean;
};

export default function PotentialDuplicateActions({
  flaggedItemId,
  flaggedProductId,
  candidateProductId,
  candidateProductName,
  resolved,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (resolved) {
    return (
      <section className="bg-surface border border-border rounded-lg p-4">
        <p className="text-sm text-muted">This row is already resolved.</p>
      </section>
    );
  }

  // The merge button needs both products to exist (the merge_products RPC
  // refuses if either id is missing). The flagged side is set whenever
  // ingest filed the row; the candidate side could in theory be null if
  // the candidate was deleted between the flag and now.
  const canMerge =
    flaggedProductId !== null &&
    candidateProductId !== null &&
    flaggedProductId !== candidateProductId;

  const submit = (action: 'merge_duplicate' | 'reject') => {
    setError(null);
    startTransition(async () => {
      const res = await resolveFlaggedItem({ flaggedItemId, action });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push('/queue');
    });
  };

  return (
    <section className="bg-surface border border-border rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
        Resolve
      </h2>
      <p className="text-sm text-text">
        {canMerge
          ? `Merge moves all prices, aliases, availability, and vendor categories from this row's product into "${candidateProductName ?? 'the candidate'}", then deletes the duplicate. Audit row stays linked to the surviving product.`
          : 'Cannot merge — either side of the duplicate pair is missing. Reject to clear the flag.'}
      </p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => submit('merge_duplicate')}
          disabled={isPending || !canMerge}
          className="bg-accent text-white rounded px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Merging…' : 'Merge into candidate'}
        </button>
        <button
          type="button"
          onClick={() => submit('reject')}
          disabled={isPending}
          className="bg-surface text-danger border border-danger/40 rounded px-3 py-1.5 text-sm font-medium hover:bg-danger/5 disabled:opacity-50"
        >
          Not a duplicate
        </button>
      </div>
    </section>
  );
}
