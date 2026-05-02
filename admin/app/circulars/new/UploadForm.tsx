'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { createCircular } from '../actions';

type Store = { id: string; name: string; region: string };

type Props = {
  stores: Store[];
};

function startOfIsoWeek(date: Date): string {
  // Monday-anchored week. Returns YYYY-MM-DD.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dayOfWeek - 1));
  return d.toISOString().slice(0, 10);
}

function inferExt(file: File): string {
  const fromType = file.type.split('/')[1];
  if (fromType && /^(jpeg|jpg|png|webp|gif)$/i.test(fromType)) {
    return fromType === 'jpeg' ? 'jpg' : fromType.toLowerCase();
  }
  const fromName = file.name.split('.').pop() ?? '';
  return /^(jpe?g|png|webp|gif)$/i.test(fromName) ? fromName.toLowerCase() : 'jpg';
}

export default function UploadForm({ stores }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [isPending, startTransition] = useTransition();
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [storeId, setStoreId] = useState(stores[0]?.id ?? '');
  const [observedWeek, setObservedWeek] = useState(() => startOfIsoWeek(new Date()));
  const [file, setFile] = useState<File | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!storeId) {
      setError('Pick a store');
      return;
    }
    if (!file) {
      setError('Choose an image');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image is over 10MB. Resize before uploading.');
      return;
    }

    startTransition(async () => {
      // Client-generated UUID. Mirrors the receipts pattern: upload first,
      // row insert second, so a failure leaves an orphan blob (the admin
      // can re-trigger) rather than a row pointing at nothing.
      const circularId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : // Fallback for older browsers — vanishingly rare in 2026 but cheap.
            `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const ext = inferExt(file);
      const path = `${circularId}.${ext}`;

      setUploadProgress('Uploading image…');
      const { error: upErr } = await supabase.storage
        .from('circulars')
        .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        setUploadProgress(null);
        return;
      }

      setUploadProgress('Creating record…');
      const res = await createCircular({
        circularId,
        storeId,
        imagePath: path,
        observedWeek,
      });
      if (!res.ok) {
        // Best-effort cleanup; if it fails, the admin can hit it manually
        // from Supabase dashboard later.
        await supabase.storage.from('circulars').remove([path]).catch(() => {});
        setError(res.error);
        setUploadProgress(null);
        return;
      }
      router.push(`/circulars/${circularId}`);
    });
  };

  return (
    <form onSubmit={submit} className="bg-surface border border-border rounded-lg p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="text-muted">Store</span>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            disabled={isPending}
            className="mt-1 w-full border border-border rounded px-3 py-2 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {stores.length === 0 ? (
              <option value="">No active stores — add one first</option>
            ) : (
              stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.region})
                </option>
              ))
            )}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted">Week of</span>
          <input
            type="date"
            value={observedWeek}
            onChange={(e) => setObservedWeek(e.target.value)}
            disabled={isPending}
            className="mt-1 w-full border border-border rounded px-3 py-2 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-muted">Circular image</span>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={isPending}
          className="mt-1 w-full text-sm"
        />
        {file ? (
          <p className="text-xs text-muted mt-1">
            {file.name} · {(file.size / 1024).toFixed(0)}KB
          </p>
        ) : null}
      </label>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {uploadProgress ? <p className="text-sm text-muted">{uploadProgress}</p> : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending || stores.length === 0}
          className="bg-accent text-white rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Working…' : 'Upload and parse'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/circulars')}
          disabled={isPending}
          className="text-sm text-muted hover:text-text disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
