'use client';

import { useRef, useState, useTransition } from 'react';

import { createStore } from './actions';

export default function NewStoreForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setError(null);
    startTransition(async () => {
      const res = await createStore(data);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      form.reset();
    });
  };

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="bg-surface border border-border rounded-lg p-4 space-y-3"
    >
      <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
        Add a store
      </h2>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          name="name"
          required
          maxLength={80}
          placeholder="Store name (e.g. Massy Stores Trincity)"
          disabled={isPending}
          className="flex-1 border border-border rounded px-3 py-2 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <input
          name="region"
          defaultValue="TT"
          maxLength={4}
          placeholder="Region"
          disabled={isPending}
          className="w-full sm:w-24 border border-border rounded px-3 py-2 bg-bg text-sm uppercase focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={isPending}
          className="bg-accent text-white rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Adding…' : 'Add'}
        </button>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </form>
  );
}
