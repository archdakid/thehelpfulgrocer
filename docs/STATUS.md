# Project status

> Single source of truth for what's done, what's in progress, and what's next.
> Updated at the end of every session. Read this first when restarting.

Last updated: **2026-05-03** (end of Session 18d — admin product CRUD, bulk queue actions, prices/availability).

---

## Done

### Foundation
- [x] Expo SDK 54 project, TypeScript strict, NativeWind v4
- [x] Folder structure per `docs/ARCHITECTURE.md`
- [x] Theme tokens via CSS variables, light + dark via `prefers-color-scheme`
- [x] `useThemedColors()` hook for literal-color-prop callsites (icons)
- [x] Supabase cloud project linked, migrations workflow working
- [x] Schema: `stores`, `products` (with `category` column), `prices` (append-only) + `current_prices` view
- [x] RLS + GRANTs for anon read; writes deferred to Edge Functions
- [x] Seed data: 5 T&T stores, 10 products, ~40 admin price observations

### Design system (Session 7-10)
- [x] Eight category color tokens + abstract SVG glyphs (`CategoryGlyph`)
- [x] Typography tokens including `t-mono-lg`, `t-mono-display`, `eyebrow`, negative tracking
- [x] Custom 5-tab bar with Scan FAB
- [x] List screen rebuilt to design (sectioned cards, category tiles, running-total card)
- [x] Browse rebuilt as Categories landing
- [x] Category detail screen with cross-store comparison strips
- [x] Compare-stores bottom sheet with reanimated transitions

### Auth + settings (Session 11)
- [x] `useAuthStore` (zustand) + `useAuth()` hook backed by Supabase auth events
- [x] Real `app/auth/sign-in.tsx` and `app/auth/sign-up.tsx` (email/password)
- [x] Settings rebuilt: Account section (signed-in profile + sign-out, or sign-in / create-account CTAs) + Appearance section (Light / Dark / Auto theme picker)
- [x] Theme preference persisted in `useUIStore` and applied via NativeWind `colorScheme.set()` at app boot

### Profiles + admin role (Session 12)
- [x] Migration `0005_profiles.sql`: `profiles` table (FK to `auth.users.id`), `handle_new_user` trigger that auto-creates a row at sign-up, RLS (own-row read + update), column-level UPDATE grant on `display_name` only — `is_admin` is SQL-only
- [x] `useProfile` / `useUpdateProfile` hooks (React Query)
- [x] Settings: editable display-name field (auto-saves on blur) and an Admin pill next to the email when `is_admin = true`

### Open Food Facts (Session 13)
- [x] `lib/openFoodFacts.ts` typed client (anonymous v2 reads, normalized OFFProduct shape, 404 → null, `INTERNAL-` UPCs skipped)
- [x] `useOpenFoodFacts(upc)` hook with 24h staleTime / 7d gcTime, disabled when no real barcode
- [x] `NutritionPanel` rendered as the FlatList footer on `/product/[id]`, hidden when OFF returns no nutriments — non-fatal errors are logged, not surfaced

### OFF image fallback (Session 14)
- [x] `lib/productImage.ts` `resolveProductImage()` — implements the priority order from `DECISIONS.md`: OFF → our `image_url` → null
- [x] Product detail uses the resolver and holds the `ImageOff` placeholder until OFF settles, eliminating the placeholder→image flicker for products OFF eventually returns

### Polish round 15a — Browse (Session 15a)
- [x] Browse search field opens `/search` (new top-level route): debounced TextInput, `useSearchProducts` results list, tap → product detail
- [x] Category sort selector replaces the no-op TODO: A→Z, Z→A, Cheapest, Most expensive, Best savings, picked from a Modal sort sheet

### Polish round 15b — List (Session 15b)
- [x] List rows enter with reanimated `FadeInDown`, exit with `FadeOut`, and reorder under `LinearTransition` — newly added items fade in at the top of "To buy", removed items fade out, neighbours slide smoothly when items move between sections
- [x] "On list" pill on category-product rows fades in / out so adding from Browse has a visual reward
- [x] Deleted the orphaned `/store/[id]` route along with its now-dead `useStore` / `useProductsAtStore` hooks, the unused `components/ui/ListItem` primitive, and the matching queryKeys entries

### Receipts F6 Phase 1 — capture + upload (Session 16)
- [x] Migration `0006_receipts.sql`: `receipts` table + `receipt_status` enum, RLS for own-row CRUD, column-level grants that exclude `status` so only the service-role OCR job can advance it
- [x] Migration `0007_receipts_storage.sql`: private `receipts/` bucket with `{user_id}/{receipt_id}.{ext}` upload + read policies keyed off `auth.uid()`
- [x] `useReceipts` / `useReceipt` / `useReceiptSignedUrl` / `useUploadReceipt` hooks (5-minute signed URLs, client-generated UUID so the storage upload happens before the row insert; orphan object cleanup if the insert fails)
- [x] Receipts tab → real list (FlatList of `ReceiptListRow` with thumbnail + status badge, pull-to-refresh, signed-out gate to sign-in, empty-state CTA to upload)
- [x] `app/receipt/upload.tsx` — camera + library pickers via `expo-image-picker`, image preview, submit pushes to detail screen
- [x] `app/receipt/[id].tsx` — signed-URL preview, status badge, store name, "what happens next" copy parameterized by status
- [x] `expo-image-picker` plugin added to `app.json` with permission strings for iOS dev builds

### Receipts F6 Phase 2 — Gemini OCR + line items (Session 16b)
- [x] Migration `0008_receipt_items.sql`: extends `receipts` with `ocr_text`, `processed_at`, `process_error`, `parsed_store_name`, `total_amount_minor_units`, `currency`, `receipt_date`; introduces `receipt_items` table (line items) with `unique (receipt_id, position)`, RLS read via owner-of-receipt, service-role-only writes
- [x] Edge Function `supabase/functions/process-receipt`: Deno + Gemini 2.5 Flash, JWT-bound caller check + service-role writer, structured `responseSchema` extraction, idempotent (skips if already `processed`), fuzzy store-name → `stores.id` match, raw model JSON dumped into `receipts.ocr_text`
- [x] `useUploadReceipt` invokes the function fire-and-forget after row insert; `useReceipts` / `useReceipt` poll every 4s while any row is `uploaded`/`processing`; `useReceiptItems` + `useReprocessReceipt` hooks
- [x] Receipt detail screen: line-items section (raw text + qty + line total), receipt total in muted footer, failure banner with retry button, parsed-store-name fallback when no `stores.id` matched
- [x] Decisions logged: Gemini-over-ML-Kit pivot + service-role-only writes for receipt result columns

### Admin panel F8 Phase 1 — flagged_items review queue (Session 17)
- [x] Migration `0011_admin_read_policies.sql`: admin SELECT policies on `receipts`, `receipt_items`, and `storage.objects` (receipts bucket) so the queue UI can render rows the underlying owner-RLS would otherwise hide
- [x] `admin/` Next.js 15 App Router scaffold (Tailwind v3, `@supabase/ssr` cookie-based auth, types re-exported from `mobile/types/database.ts`); `npm install --legacy-peer-deps` to set up
- [x] `/sign-in` page + server action; `requireAdmin()` helper that bounces non-admins back to `/sign-in?denied=1`
- [x] `/queue` list page (server component) with reason tabs (`all` / `unmatched` / `low_confidence` / `auto_created_product`); single PostgREST embed pulls flagged_items + receipt_item + receipt + store + matched product + auto-created product in one round trip
- [x] `/queue/[id]` detail page renders the receipt image (5-min signed URL), line-item context, and a client-side product picker (debounced `ilike` search) wired to a server action
- [x] Edge Function `supabase/functions/resolve-flagged-item`: JWT-bound admin re-check → service-role writes for all four resolution actions (`confirm` / `correct` / `reject` / `merge`). Centralizes the multi-table mutations (price backfill, receipt_item reassignment, alias upsert, auto-created product deletion) in one place so RLS stays narrow
- [x] Decision logged: Edge-Function-over-loosened-RLS for admin resolution writes

### Admin panel F8 Phase 2a — Stores CRUD (Session 18a)
- [x] Migration `0013_stores_admin_writes.sql`: `stores.created_by` (FK to profiles, nullable for legacy seed rows) + `stores.updated_at` with a generic `set_updated_at()` trigger; admin-bypass SELECT policy so admins see inactive stores (the existing public "active only" policy still applies for anon/authenticated)
- [x] Edge Function `supabase/functions/manage-store`: JWT-bound admin re-check → service-role writes for `create | rename | set_active`. Surfaces unique-violation (23505) as a friendly 409. No hard delete — `prices.store_id` cascades, so deactivation is the right pattern
- [x] `/stores` page (server component) lists active + inactive sections, inline rename + activate/deactivate via server actions wrapping `functions.invoke('manage-store')` with the same JWT-passthrough trick the queue uses
- [x] Shared `AdminShell` header component with nav between `/queue` and `/stores`

### Admin panel F8 Phase 2b — Circular ingest pipeline (Session 18b)
- [x] Migration `0014_circulars.sql`: `circulars` (store_id, image_path, observed_week date, parse_status enum, parsed jsonb, process_error, audit timestamps) + `circular_items` (raw_name/brand/size/amount, pre-matched product_id + match_confidence, status enum, contributed_price_id + contributed_product_id audit links, unique (circular_id, position)). Admin-only RLS on both. Private `circulars` storage bucket with admin-only upload/read/delete policies
- [x] Edge Function `supabase/functions/parse-circular`: JWT-bound admin re-check → service-role download of image → Gemini 2.5 Flash vision with `responseSchema` → insert circular_items → per-row trigram pre-match via existing `match_receipt_text` RPC. Idempotent (re-parse wipes prior items). Verbatim model output dumped into `circulars.parsed`. Reuses the same `GOOGLE_AI_API_KEY` secret the receipts pipeline uses
- [x] Edge Function `supabase/functions/resolve-circular-item`: per-row accept/reject. On accept: applies admin's edits, contributes a `prices` row with `source='circular'` (observed_at = observed_week), auto-creates a product if no `targetProductId` was picked, upserts a `product_aliases` row, and links it all back via `contributed_price_id` + `contributed_product_id`. Rolls back the auto-created product if the price insert fails
- [x] Edge Function `supabase/functions/create-circular`: thin wrapper that admin-checks, inserts the row with service-role, then fire-and-forget invokes `parse-circular`. Avoids needing service-role in the admin Next.js server (DECISIONS.md 2026-05-02 trust boundary)
- [x] `/circulars` list (status badges) + `/circulars/new` upload form (store picker, ISO-week picker, file → admin-policy storage upload → server action) + `/circulars/[id]` review screen (sticky source image next to per-row inline edit + product picker + Accept/Reject), with a Re-parse button for failed/refresh paths
- [x] `success` color token added to `tailwind.config.js`
- [x] Decision logged: stick with Gemini 2.5 Flash for circulars (cost; one vendor; admin reviews every row anyway)

### Admin F8 Phase 2c — flagged-item edits + receipt reliability (Session 18c)
- [x] `resolve-flagged-item` Edge Function accepts an optional `edits` payload: `productName` (auto-created products only), `lineTotalMinorUnits`, `unitPriceMinorUnits` (`null` = explicit clear). Edits mutate the receipt_item before the contribute/merge branches run, and the `auto_created_product` confirm path syncs the existing `prices` row to match. Reject silently drops edits — committing partial changes alongside a discarded resolution would leak into nowhere
- [x] `/queue/[id]` resolve form pre-populates name + line total + unit price, diffs against originals, sends only changed fields. Product-name input only renders for `auto_created_product` (the Edge Function rejects renames on canonical matches)
- [x] Mobile receipt upload reliability: UUID fallback when `crypto.randomUUID` is unavailable (Hermes), `wrapError` preserves Supabase plain-object errors instead of stringifying to `[object Object]`, `useReceiptItems` invalidates when status flips to `processed` (was rendering a stale empty list)
- [x] Migration `0015_receipts_grant_id_insert.sql`: `grant insert (id) on receipts to authenticated` so the client-generated UUID upload path actually lands

### Admin F8 Phase 2d — product CRUD, bulk queue, prices/availability (Session 18d)
- [x] Bulk verify/reject in flagged-items queue: row checkboxes + sticky action bar wired to a bulk variant of `resolve-flagged-item`
- [x] Editable brand + category in flagged-item resolve form (Edge Function accepts those edits alongside the existing name/price ones)
- [x] Migration `0016_product_images_storage.sql`: private `product-images` bucket with admin-only insert/update/delete policies
- [x] Product CRUD: `/products` list (search + category filter), `/products/new`, `/products/[id]` detail with Details / Image / Prices / Danger sections. Edge Function `manage-product` handles create/update/delete with two-phase delete preview (counts cascaded prices + aliases, requires typing the name to confirm). Storage cleanup is best-effort post-delete
- [x] `set-product-image` Edge Function pairs with the per-product `ImageEditor` (admin uploads bytes via storage RLS, function writes the URL with service-role)
- [x] Migration `0017_product_store_availability.sql`: per-store in/out-of-stock table, separate from `prices` so stock flips don't churn the append-only price history. Absence-of-row defaults to in-stock — the mobile compare-sheet stays backward-compatible
- [x] Edge Function `manage-price` (`setPrice` / `setAvailability`): manual price entry inserts a `source='manual'` observation; availability upserts on (product_id, store_id). Per-store row on `/products/[id]` shows current price, in/out-of-stock toggle, and a manual entry input
- [x] Migration `0018_product_image_skipped.sql`: `products.image_skipped` boolean + partial index on the queue filter (`image_url is null and image_skipped = false`)
- [x] Edge Function `import-product-image` (`fetchCandidates` / `import` / `skip`): OFF candidate fetcher returns per-section image URLs (front, packaging, ingredients, nutrition); import downloads bytes into the `product-images` bucket and points `image_url` at the new URL (so mobile renders without an OFF round-trip and we're insulated from OFF mutating the source); skip flips the new column to suppress requeueing
- [x] `/products/images` queue: lists products without an admin image and a real UPC, per-row Fetch candidates / Skip / inline candidate gallery with click-to-import. Header link from `/products` shows the queue count

### Receipts F6 Phase 3 — matcher + price contribution + admin queue (Session 16c)
- [x] Migration `0009_product_matching.sql`: enables `pg_trgm`, GIN trigram indexes on `lower(products.name)` and `lower(product_aliases.alias)`, new `product_aliases` table with source enum (`admin`/`receipt`/`manual`), and a `match_receipt_text(text)` SQL function returning the single best `(product_id, confidence)` above a 0.30 floor
- [x] Migration `0010_flagged_items_and_price_link.sql`: `flagged_items` admin queue (reasons `unmatched` / `low_confidence` / `auto_created_product`, resolutions `confirmed` / `corrected` / `rejected` / `merged`, admin-only RLS), `prices.receipt_item_id` FK so contributed prices trace back to the line item that produced them
- [x] Edge Function gains a matcher pass after item insert: per-item `match_receipt_text` RPC, writes `matched_product_id` + `match_confidence`, sets `needs_review = true` when confidence < 0.50
- [x] Edge Function gains a contribute-and-flag pass: confident matches contribute `source='receipt'` rows to `prices`; unmatched items that pass the metric gate (store known, positive amount, 3–80 chars, contains letters) auto-create a `products` row with admin verification flag and contribute their price; everything else routes to `flagged_items`
- [x] Retry safety: `processReceipt` deletes existing items at the start; `flagged_items` cascades from item delete; `prices.receipt_item_id` is `ON DELETE SET NULL` so historical price observations survive
- [x] `useReceiptItems` joins matched product (id, name, image_url) inline; mobile detail screen renders the product name + thumbnail when matched, the raw text underneath, and pills for `Unmatched` / `Review` cases — auto-created products appear "matched" since the user-facing UI doesn't need to know about the admin queue
- [x] Decisions logged: pg_trgm-over-Gemini for matching; contribution thresholds + auto-create metric gate

### Features (per `docs/FEATURES.md`)
- [x] **F1 — Grocery list** (local-only, AsyncStorage persistence, swipe-delete, qty stepper, sectioned)
- [x] **F4 — Price comparison popup** (delivered as both product detail and the compare-stores sheet)
- [x] **F5 — Store selection** (pill picker on List, persisted active store)
- [x] **F9 — Cross-store browsing** (active-store filter on list rows, savings callout, compare sheet)

---

## In progress / explicit stubs in code

These are working code paths but stub behavior — they render, they don't do the full thing yet.

- **Receipts tab** — Phases 1–3 shipped: upload, OCR, matching, price contribution, and admin queue. Items above 0.50 trigram similarity contribute `source='receipt'` rows to `prices`; below that they sit in the `flagged_items` queue. Unmatched-but-sane items auto-create products and still get queued.
- **Admin panel F8 Phase 2** — Closed. Stores CRUD (18a), circular ingest (18b), flagged-item edits (18c), product CRUD + bulk queue + per-store prices/availability (18d), and product-image candidate review (18d) all shipped on `feature/admin-phase2-circulars`. `GOOGLE_AI_API_KEY` is already set as a function secret from the receipts pipeline — no new secret needed.
- **Scan tab** — stub. Real camera flow needs a dev build (per `CLAUDE.md` gotcha).
- **Auth email confirmation** — sign-up surfaces a "check your email" message; the actual confirmation/redirect flow is whatever Supabase has configured for the project (no deep-link handler in the app yet).
- **Browse "Often Bought" chips** — visual only; tap is a no-op TODO. Will wire when receipt history exists.
- **Save TT$X callout in running-total card** — works in at-store mode; hidden in Cheapest mode (correct).

---

## Open MVP gaps (next-up candidates)

Roughly in order of likely impact:

1. **Camera scanning (F2/F3)** — needs a custom dev build (`react-native-vision-camera` + `vision-camera-code-scanner`). Out-of-scope until then.
2. **Auth deep-link handler** — for Supabase email confirmation; deferred until closer to launch. Workaround for dev: disable email confirmation in the Supabase dashboard.
3. **Remaining polish** — "Often Bought" chips on Browse (blocked on receipt history), category filter chips (blocked on subcategory schema).

---

## Open design intent (see `design/NOTES.md`)

- Possible rebrand to **"The Helpful Grocer"** (design canvas uses it; codebase still SmartShopper). Hold until decided.
- Geofence "detected" badge on store pills.

---

## Architectural decisions (see `docs/DECISIONS.md`)

Shipped decisions that constrain future work:
- Supabase over Firebase
- Expo over bare RN
- `prices` is append-only; `current_prices` view surfaces latest
- Anonymous receipt scanning allowed
- Admin-curated store list (no user submissions)
- Image source priority: OFF → admin-approved → admin-uploaded → placeholder
- Tailwind v3 pinned (NativeWind v4 incompatible with Tailwind v4)
- `--legacy-peer-deps` for `react-dom` transitive conflict

---

## Git topology (work-in-progress branches)

Linear stack of feature branches; nothing has merged to `main` since the initial documentation commit. Each ends in a clean typecheck:

```
main
└── chore/session-1-scaffold
    └── feature/local-grocery-list
        └── feature/price-comparison
            └── feature/list-product-link
                └── feature/store-picker
                    └── feature/design-pass-list
                        └── feature/design-pass-tabbar
                            └── feature/design-pass-browse
                                └── feature/category-detail
                                    └── feature/compare-stores-sheet
                                        └── feature/auth-scaffold
                                            └── feature/profiles-table
                                                └── feature/openfoodfacts
                                                    └── feature/off-image-fallback
                                                        └── feature/polish-browse
                                                            └── feature/polish-list
                                                                └── feature/receipts-phase1
                                                                    └── feature/admin-phase1  (current)
```

When ready to consolidate: merge each in order into `main`, or squash-merge groups (foundation → design pass → backend → features).
