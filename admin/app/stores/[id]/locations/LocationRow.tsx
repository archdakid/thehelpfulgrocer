'use client';

import { useState, useTransition } from 'react';

import {
  deleteLocation,
  previewDeleteLocation,
  renameLocation,
  setLocationActive,
  type LocationDeleteCounts,
} from './actions';

type LocationRowData = {
  id: string;
  store_id: string;
  name: string;
  external_id: string | null;
  region: string;
  is_active: boolean;
  lat: number | null;
  lng: number | null;
};

type Props = {
  location: LocationRowData;
};

export default function LocationRow({ location }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(location.name);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [deleteStage, setDeleteStage] = useState<'idle' | 'preview'>('idle');
  const [counts, setCounts] = useState<LocationDeleteCounts | null>(null);
  const [typed, setTyped] = useState('');

  const onSave = () => {
    if (draft.trim() === location.name) {
      setEditing(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await renameLocation(location.store_id, location.id, draft);
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
      const res = await setLocationActive(
        location.store_id,
        location.id,
        !location.is_active,
      );
      if (!res.ok) setError(res.error);
    });
  };

  const openDeletePreview = () => {
    setError(null);
    setTyped('');
    startTransition(async () => {
      const res = await previewDeleteLocation(location.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCounts(res.counts);
      setDeleteStage('preview');
    });
  };

  const cancelDelete = () => {
    setDeleteStage('idle');
    setCounts(null);
    setTyped('');
  };

  const confirmDelete = () => {
    if (typed.trim() !== location.name) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteLocation(location.store_id, location.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      cancelDelete();
    });
  };

  const typedMatches = typed.trim() === location.name;
  const coordSummary =
    location.lat != null && location.lng != null
      ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
      : null;

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
                    setDraft(location.name);
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
                  setDraft(location.name);
                  setEditing(false);
                  setError(null);
                }}
                className="text-xs text-muted hover:text-text"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-medium truncate">{location.name}</span>
                <span className="text-xs text-muted">{location.region}</span>
                {location.external_id ? (
                  <span className="text-[11px] font-mono text-muted">
                    #{location.external_id}
                  </span>
                ) : null}
                {!location.is_active ? (
                  <span className="text-[11px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-border text-muted">
                    Inactive
                  </span>
                ) : null}
              </div>
              {coordSummary ? (
                <span className="text-[11px] font-mono text-muted">
                  {coordSummary}
                </span>
              ) : null}
            </div>
          )}
          {error ? <p className="text-xs text-danger mt-1">{error}</p> : null}
        </div>
        {!editing && (
          <div className="flex items-center gap-3 shrink-0">
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
              {location.is_active ? 'Deactivate' : 'Reactivate'}
            </button>
            <button
              type="button"
              disabled={isPending || deleteStage !== 'idle'}
              onClick={openDeletePreview}
              className="text-sm text-danger hover:underline disabled:opacity-50"
            >
              {isPending && deleteStage === 'idle' ? 'Checking…' : 'Delete'}
            </button>
          </div>
        )}
      </div>

      {deleteStage === 'preview' && counts ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-surface border border-border rounded-lg p-5 max-w-md w-full space-y-4">
            <div>
              <h3 className="text-base font-semibold">Delete this location?</h3>
              <p className="text-sm text-muted mt-1">
                Permanently deletes{' '}
                <span className="text-text font-medium">{location.name}</span>{' '}
                from this chain.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                  Will be unlinked
                </p>
                <ul className="text-sm space-y-1 bg-bg border border-border rounded p-3">
                  <li className="flex justify-between">
                    <span className="text-muted">Price observations (kept, location cleared)</span>
                    <span className="font-mono">{counts.prices}</span>
                  </li>
                </ul>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                  Will be deleted
                </p>
                <ul className="text-sm space-y-1 bg-bg border border-border rounded p-3">
                  <li className="flex justify-between">
                    <span className="text-muted">Per-location availability rows</span>
                    <span className="font-mono">{counts.availability}</span>
                  </li>
                </ul>
              </div>
            </div>

            <label className="block text-sm">
              <span className="text-muted">
                Type <span className="text-text font-mono">{location.name}</span>{' '}
                to confirm
              </span>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={isPending}
                autoFocus
                className="mt-1 w-full border border-border rounded px-3 py-2 bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-danger"
              />
            </label>

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={cancelDelete}
                disabled={isPending}
                className="border border-border rounded px-3 py-1.5 text-sm hover:bg-bg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isPending || !typedMatches}
                className="bg-danger text-white rounded px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {isPending ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}
