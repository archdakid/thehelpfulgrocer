'use client';

import { useState, useTransition } from 'react';

import { reparseCircular } from '../actions';

export default function ReparseButton({ circularId }: { circularId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const res = await reparseCircular(circularId);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="bg-text text-bg rounded px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? 'Re-parsing…' : 'Re-parse'}
      </button>
      {error ? <span className="text-sm text-danger">{error}</span> : null}
    </div>
  );
}
