'use client';

import { useState, useTransition } from 'react';

import { createLocation } from './actions';

type Props = {
  storeId: string;
};

export default function NewLocationForm({ storeId }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    const name = String(data.get('name') ?? '').trim();
    const externalId = String(data.get('externalId') ?? '').trim();
    const region = String(data.get('region') ?? '').trim();
    const latRaw = String(data.get('lat') ?? '').trim();
    const lngRaw = String(data.get('lng') ?? '').trim();

    const lat = latRaw === '' ? undefined : Number(latRaw);
    const lng = lngRaw === '' ? undefined : Number(lngRaw);
    if (latRaw !== '' && !Number.isFinite(lat)) {
      setError('lat must be a number between -90 and 90');
      return;
    }
    if (lngRaw !== '' && !Number.isFinite(lng)) {
      setError('lng must be a number between -180 and 180');
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await createLocation({
        storeId,
        name,
        externalId: externalId || undefined,
        region: region || undefined,
        lat,
        lng,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      form.reset();
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="bg-surface border border-border rounded-lg p-4 space-y-3"
    >
      <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
        Add a location
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
        <input
          name="name"
          required
          maxLength={80}
          placeholder="Branch name (e.g. Maraval)"
          disabled={isPending}
          className="sm:col-span-3 border border-border rounded px-3 py-2 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <input
          name="externalId"
          maxLength={64}
          placeholder="Vendor code (optional)"
          disabled={isPending}
          className="sm:col-span-2 border border-border rounded px-3 py-2 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <input
          name="region"
          defaultValue="TT"
          maxLength={4}
          placeholder="Region"
          disabled={isPending}
          className="sm:col-span-1 border border-border rounded px-3 py-2 bg-bg text-sm uppercase focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
        <input
          name="lat"
          inputMode="decimal"
          placeholder="Latitude (optional)"
          disabled={isPending}
          className="sm:col-span-2 border border-border rounded px-3 py-2 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <input
          name="lng"
          inputMode="decimal"
          placeholder="Longitude (optional)"
          disabled={isPending}
          className="sm:col-span-2 border border-border rounded px-3 py-2 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={isPending}
          className="sm:col-span-2 bg-accent text-white rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Adding…' : 'Add location'}
        </button>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </form>
  );
}
