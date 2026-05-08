'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { renameStore, setStoreActive } from './actions';
import DeleteStoreButton from './DeleteStoreButton';

type Props = {
  store: {
    id: string;
    name: string;
    region: string;
    is_active: boolean;
  };
};

export default function StoreRow({ store }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(store.name);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSave = () => {
    if (draft.trim() === store.name) {
      setEditing(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await renameStore(store.id, draft);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
    });
  };

  const onToggle = () => {
    setError(null);
    startTransition(async () => {
      const res = await setStoreActive(store.id, !store.is_active);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSave();
                  if (e.key === 'Escape') {
                    setDraft(store.name);
                    setEditing(false);
                  }
                }}
                disabled={isPending}
                autoFocus
                className="flex-1 border border-border rounded px-2 py-1 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="button"
                disabled={isPending}
                onClick={onSave}
                className="bg-accent text-white rounded px-2 py-1 text-xs font-medium hover:opacity-90 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setDraft(store.name);
                  setEditing(false);
                  setError(null);
                }}
                className="text-xs text-muted hover:text-text"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="font-medium truncate">{store.name}</span>
              <span className="text-xs text-muted">{store.region}</span>
              {!store.is_active ? (
                <span className="text-[11px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-border text-muted">
                  Inactive
                </span>
              ) : null}
            </div>
          )}
          {error ? <p className="text-xs text-danger mt-1">{error}</p> : null}
        </div>
        {!editing && (
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href={`/stores/${store.id}/locations`}
              className="text-sm text-muted hover:text-text"
            >
              Locations
            </Link>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setEditing(true)}
              className="text-sm text-accent hover:underline disabled:opacity-50"
            >
              Rename
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={onToggle}
              className="text-sm text-muted hover:text-text disabled:opacity-50"
            >
              {store.is_active ? 'Deactivate' : 'Reactivate'}
            </button>
            <DeleteStoreButton
              storeId={store.id}
              storeName={store.name}
              disabled={isPending}
            />
          </div>
        )}
      </div>
    </li>
  );
}
