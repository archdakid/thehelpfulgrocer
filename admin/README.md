# SmartShopper admin panel

Internal Next.js app for draining the `flagged_items` review queue produced
by the receipts pipeline (see `supabase/functions/process-receipt`).

Phase 1 scope: queue list + per-item resolution. Stores CRUD, circular
parsing, image-candidate review are Phase 2+.

## Setup

```bash
cd admin
cp .env.example .env.local   # fill in NEXT_PUBLIC_SUPABASE_URL / ANON_KEY
npm install --legacy-peer-deps
npm run dev
```

Visit `http://localhost:3000` — root redirects to `/queue`.

## Auth

Email/password sign-in via Supabase. Access is gated on
`profiles.is_admin = true`; non-admins are signed out and shown a
"not authorized" screen.

## How resolutions write to the database

The queue UI never writes to `receipt_items`, `prices`, or `products`
directly — those go through the `resolve-flagged-item` Supabase Edge
Function with the service role. This keeps RLS narrow and centralizes the
"what does merge / reject / confirm actually do" logic in one file.
