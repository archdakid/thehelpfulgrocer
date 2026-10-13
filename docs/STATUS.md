# Project status

> Single source of truth for what's done, what's in progress, and what's next.
> Updated at the end of every session. Read this first when restarting.

Last updated: **2026-10-12** (Mobile Scan Tab `F2` with `react-native-vision-camera@4.7.3` `useCodeScanner`, `product_equivalents` wired into Mobile Price Comparison & Grocery List Totals, iOS Unsigned `.ipa` CI Workflow + `xtool` Windows Sideloader `sideload-ipa.ps1`, Admin Panel Finalization, and Live Scraper Reactivation across SuperPharm, Massy, & PriceSmart).

---

## Done

### Mobile Scan Tab (`F2`), Pack-Variant Price Comparison, & `xtool` iOS Sideloading Pipeline (2026-10-12)
- [x] **iOS Unsigned `.ipa` Build Workflow & One-Command `xtool` Sideloader**:
  - Created `.github/workflows/ios-unsigned-ipa.yml` (`workflow_dispatch` on `macos-15`) that runs `npx expo prebuild --platform ios --clean --no-install`, `pod install`, builds `SmartShopper.app` with `CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO`, packages `Payload/SmartShopper.app` into `SmartShopper-unsigned.ipa`, and uploads it as artifact `SmartShopper-unsigned-ipa`.
  - Created `mobile/eas.json` (`development`, `preview`, `production` build profiles).
  - Created `.agents/skills/xtool-ios/scripts/sideload-ipa.ps1`: one-command Windows PowerShell helper that starts the AMDS (`127.0.0.1:27015`) → WSL2 `/var/run/usbmuxd` bridge, verifies the connected iPhone UDID (`idevice_id -l`), checks `xtool auth status` (prompting `xtool auth login` if needed), and invokes `/home/chadj/.local/bin/xtool install` to sign and deploy the `.ipa`.
- [x] **Mobile `product_equivalents` Cross-Store Price Comparison (`F4` / `F9`)**:
  - Extended `mobile/hooks/usePricesForProduct.ts` to query `product_equivalents` in both directions (`product_id = id` where scaled price = `shelf * scale_factor`, and `equivalent_product_id = id` where scaled price = `shelf / scale_factor`), applying direct-price-first precedence per store and attaching `equivalentVariant: EquivalentVariantInfo | null`.
  - Extended `mobile/components/product/PriceComparisonRow.tsx` to render a `N× pack equiv.` / `N× single equiv.` pill, conversion summary (`Pack variant: [Name] (shelf TT$X.XX ÷ N)`), `equiv.` label beneath the scaled price, and tap-through navigation to `/product/${otherProductId}`.
  - Extended `mobile/hooks/useListItemPrices.ts` and `mobile/hooks/useListPricesAllStores.ts` so Grocery List item pricing and the `CompareStoresSheet` store-totals reducer include scaled equivalent prices when a store only stocks a linked pack size.
- [x] **Mobile Scan Tab (`F2` Barcode Scanning via `react-native-vision-camera`)**:
  - Installed `react-native-vision-camera@^4.7.3` (configured with `"enableCodeScanner": true` in `mobile/app.json`) and built `mobile/app/(tabs)/scan.tsx` using `<Camera />`, `useCameraDevice('back')`, `useCameraPermission()`, and `useCodeScanner` (`ean-13`, `ean-8`, `upc-a`, `upc-e`, `code-128`).
  - Created `mobile/hooks/useProductByBarcode.ts` (and `queryKeys.productByBarcode` in `mobile/lib/queryKeys.ts`) with UPC-A / EAN-13 leading-zero normalization, primary lookup against Supabase `products`, and automatic fallback to `fetchOffProduct` (`mobile/lib/openFoodFacts.ts`, extended with `productName` and `brand`).
  - Added corner-bracket reticle, torch toggle, inline manual UPC entry drawer (`Type UPC`), header shortcut to `/receipt/upload` (`Scan Receipt`), and interactive result sheet (`Compare Store Prices` + `Add to Grocery List`).

### Admin Panel Finalization & Live Scraper Reactivation + Control Center (2026-10-12)
- [x] **Category Synchronization (Migration 0032)**: Updated `admin/app/products/categories.ts`, `admin/app/products/page.tsx` (added category filter dropdown), and `admin/app/queue/[id]/ResolveActions.tsx` with all 12 categories (`produce`, `dairy`, `meat`, `bakery`, `frozen`, `pantry`, `beverage`, `snacks`, `household`, `personal_care`, `pharmacy`, `baby`).
- [x] **Pack-Variant Resolution & Equivalents Editor**:
  - Extended `supabase/functions/resolve-flagged-item/index.ts` and `admin/app/queue/[id]/PotentialDuplicateActions.tsx` with `action: 'pack_variant'` (`largerIs`, `scaleFactor`, optional `notes`), writing `product_equivalents` (`source = 'admin'`) and resolving the flag as `pack_variant`.
  - Extended `supabase/functions/manage-product/index.ts`, `admin/app/products/[id]/DetailsEditor.tsx`, and new `admin/app/products/[id]/EquivalentsSection.tsx` so admins can edit `unit_size`, `unit_of_measure`, `units_per_pack`, `is_sold_by_weight`, `description`, and link/unlink `product_equivalents` directly on `/products/[id]`.
- [x] **LLM Duplicate Triage UI & Audit View on `/queue`**:
  - Added `runTriageDuplicatesBatch` server action (`admin/app/queue/actions.ts`) and `TriageDuplicatesPanel.tsx` on `/queue` for running single or auto-paced (40 RPM) `triage-duplicates` batches with live counters (`merged`, `pack_variants`, `rejected`, `uncertain`, `remaining`).
  - Added status tabs (`Unresolved`, `LLM Triaged ([triage_llm])`, `All Resolved`) and resolution filters (`merged`, `pack_variant`, `rejected`, `confirmed`, `corrected`) on `/queue` for auditing LLM and manual resolutions.
  - Verified live LLM triage (`admin/scripts/triage-duplicates.mjs`): 30 pairs processed across 3 batches (`4 merged`, `2 pack_variants`, `7 rejected`, `17 uncertain`, `0 errors`).
- [x] **Scraper Control Center on `/scrape-runs` & Live Vendor Verification**:
  - Created `scrapers/run-vendor.js` unified CLI runner (`superpharm | massy | pricesmart | all` with `--mode full | ingest-only | backfill`) and patched scraper scripts with `__dirname`-safe paths and Windows Node v22 TLS/DNS flags (`--use-system-ca --dns-result-order=ipv4first --no-network-family-autoselection`).
  - Created `/api/scrapers` admin route (`admin/app/api/scrapers/route.ts`) and `ScraperControlPanel.tsx` on `/scrape-runs` with per-vendor freshness status cards (`Fresh <24h`, `Stale >24h`, `Outdated >7d`), on-demand trigger buttons (`Full Scrape + Ingest`, `Ingest Cached`, `Backfill Duplicate Matches`), and live log tailing.
  - Executed and verified live scrape + ingest runs for all 3 vendors:
    - **SuperPharm**: `runId=a9e0fa8d-c1d9-4078-8498-72b63be7f6ff` (`1,829 prices`, `1,829 availability`, `status=success`)
    - **Massy Stores**: `runId=f2c5ab58-7750-4f21-9406-034144b42b86` (`7 locations` including newly discovered **Brentwood** `10699` branch, `50,029 prices`, `status=success`)
    - **PriceSmart**: `runId=358827fc-154a-4ce5-8620-1b331170d63c` (`4 TT clubs`, `9,708 prices`, `status=success`)
- [x] **`xtool` iOS Native Development on Windows via WSL2**:
  - Installed `xtool 1.21.0`, `usbmuxd`, `libimobiledevice-utils`, and `socat` in WSL2 Ubuntu 24.04 (`~/.local/bin/xtool`).
  - Created workspace skill `.agents/skills/xtool-ios/SKILL.md` + helper scripts `wsl-setup-xtool.sh` and `connect-iphone-wsl.ps1` (bridging Windows Apple Mobile Device Service `127.0.0.1:27015` into WSL2 `/var/run/usbmuxd`).
- [x] **Mobile Root Error Boundary**: Exported `ErrorBoundary` from `expo-router` in `mobile/app/_layout.tsx`.



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

### Scraper ingest F11 Phase 2 — per-store vendor categories (Session 20)
- [x] Migration `0025_product_store_categories.sql`: `product_store_categories(product_id, store_id, vendor_path, vendor_path_root, source check('scrape'|'admin'), first_seen_at, last_seen_at)` join table; `unique (product_id, store_id, vendor_path)` so Massy's "in N categories at once" produces N rows. Indexed on `(store_id, vendor_path_root)` (Browse tile grid) and `(store_id, vendor_path)` (drill-down). Public read RLS, service-role write. Adds `scrape_runs.categories_writes` counter.
- [x] `ingest-scrape` extended: `Row.product.vendorCategories?: { path, root }[]` flows through `upsertVendorCategories` after the product is ensured. Per-row de-dup on `path`, on-conflict bumps `last_seen_at`. Counts surface in scrape-runs admin list + detail.
- [x] Mobile Browse Global / By-store toggle: hidden when no active store is set; By-store mode renders generic `VendorCategoryTile` rows from `useStoreVendorCategories(storeId)` (counts distinct products per root). Tapping a root → new `/category/store/[storeId]/[root]` route running the existing `CategoryProductRow` against `useProductsAtStoreVendorRoot`.
- [x] DECISIONS entry: per-store categories as a join table, preserved verbatim, `vendor_categories` reference table deferred. Per the 2026-05-08 entry: receipts and admin manual entry don't write here — that asymmetry is intentional.
- [x] Mobile + admin both clean typecheck. The two new mobile hooks and the admin scrape-runs reads cast through `any` until `npx supabase gen types typescript --linked` runs against 0025; same temporary-cast pattern Session 19 introduced for `store_locations` / `scrape_runs`.

### Scraper ingest F11 Phase 2 — schema + ingest function + admin store/locations (Session 19)
- [x] Migrations 0019–0024: `store_locations` (per-branch identity with `external_id`), products UOM/pack columns (`unit_size`, `unit_of_measure`, `is_sold_by_weight`, `units_per_pack`, `description`), `prices` sale columns (`regular_amount_minor_units`, `sale_ends_at`, `promo_label`), `prices.store_location_id` (nullable FK, ON DELETE SET NULL), `product_store_availability` extended with `store_location_id` + NULLS NOT DISTINCT natural key, `scrape_runs` audit table; extends `prices.source` and `product_aliases.source` enums to include `'scrape'`
- [x] `ingest-scrape` Edge Function: anon-JWT admin re-check → service-role upserts of `store_locations` (on `store_id, external_id`), `products` (lookup by UPC then by vendor-namespaced alias, then insert; race-safe on 23505), `prices` (append-only with sale columns), `product_store_availability` (upsert on three-column natural key). Wraps everything in a `scrape_runs` row that flips to `success` / `partial` (per-row failures only, capped at 200) / `failed` (fatal). Per `docs/DECISIONS.md` 2026-05-07: vendor per-location vectors are flattened at the runner so this function only sees one uniform row shape.
- [x] `manage-store` `delete` action: two-phase cascade preview across prices / availability / locations / receipts / circulars; `circulars.store_id` ON DELETE RESTRICT surfaces as a 409 instead of a raw 23503, with defense-in-depth on the actual delete.
- [x] `DeleteStoreButton` + StoreRow wiring: inline cascade-preview modal with the type-the-name confirm gesture from product delete; "will be deleted / will be unlinked / blocks delete" sections.
- [x] `manage-location` Edge Function: full CRUD (create / rename / set_active / delete), two-phase delete preview, same admin pattern.
- [x] `/stores/[id]/locations` page + `NewLocationForm` / `LocationRow` / actions: branch list with active/inactive sections, optional vendor `external_id` and lat/lng on create, per-row Rename / Deactivate / Delete. Page casts around `store_locations` until `supabase gen types typescript --linked` reruns.
- [x] Mobile `StorePicker`: filter inactive stores out of the pill row (admins can otherwise read inactive rows via the 0013 RLS policy).
- [x] `manage-price` updated to target the new three-column natural key on `product_store_availability` (sends `store_location_id: null` for chain-wide admin writes).
- [x] `.gitignore`: `scrapers/` subtree fully ignored — scripts AND data both stay out of repo. Codebase only sees the `ingest-scrape` HTTP boundary. DECISIONS.md updated with the policy and the runner-side flatten-vendor-vectors decision.

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
- [x] **F2 — Barcode scanning** (`react-native-vision-camera@4.7.3` `useCodeScanner` on `/scan`, UPC-A/EAN-13 normalized lookup in Supabase `products` with Open Food Facts fallback, manual UPC entry, torch toggle, and `/receipt/upload` shortcut)
- [x] **F4 — Price comparison popup** (delivered as both product detail and the compare-stores sheet, including bidirectional `product_equivalents` pack-variant scaling)
- [x] **F5 — Store selection** (pill picker on List, persisted active store)
- [x] **F6 — Receipt scanning** (Phases 1–3: capture/upload, Gemini 2.5 Flash OCR, `pg_trgm` matching + price contribution + `flagged_items` queue)
- [x] **F7 — Nutritional facts panel** (`NutritionPanel` on `/product/[id]` backed by Open Food Facts v2 API)
- [x] **F8 — Admin panel** (Phases 1–2e: `flagged_items` queue + LLM duplicate triage runner & audit view, Stores + Locations CRUD, Circular ingest pipeline, Product UOM/pack/equivalents CRUD, Image candidates queue, and Scraper Control Center on `/scrape-runs`)
- [x] **F9 — Cross-store browsing** (active-store filter on list rows, savings callout, compare sheet with `product_equivalents` support)

---

## In progress / explicit stubs in code

These are working code paths or partially deferred capabilities:

- **Native iOS Device Deployment (`xtool`)** — WSL2 toolchain (`xtool 1.21.0`, `usbmuxd`, `libimobiledevice-utils`, `socat`), `.github/workflows/ios-unsigned-ipa.yml`, and `.agents/skills/xtool-ios/scripts/sideload-ipa.ps1` are ready. Next step is triggering the unsigned `.ipa` workflow and sideloading onto the physical iPhone.
- **Scan tab (`F2` shipped / `F3` pending)** — `F2` (Barcode scanning via `react-native-vision-camera` `useCodeScanner` + manual UPC entry + Receipt OCR shortcut) is complete. `F3` (AI vision mode for non-barcoded produce/bakery items + `rembg` candidate capture) is the next camera enhancement.
- **Scraper ingest (`F11` Phase 2)** — All three vendor scrapers (SuperPharm, Massy, PriceSmart) have been reactivated, verified live against production Supabase (`61,566` price observations ingested on 2026-10-12), and wired into the Admin Scraper Control Center (`/scrape-runs`). Remaining step for 24/7 autonomy is scheduling `node scrapers/run-vendor.js all --mode full` via OS Task Scheduler / VPS cron.
- **Auth email confirmation** — sign-up surfaces a "check your email" message; the actual confirmation/redirect flow is whatever Supabase has configured for the project (no deep-link handler in the app yet).
- **Browse "Often Bought" chips** — visual only; tap is a no-op TODO. Will wire when receipt history exists.
- **Save TT$X callout in running-total card** — works in at-store mode; hidden in Cheapest mode (correct).

---

## Open MVP gaps (next-up candidates)

Roughly in order of likely impact:

1. **First Physical iPhone Sideload & On-Device Camera Verification** — Run `.github/workflows/ios-unsigned-ipa.yml` (or `eas build`), download `SmartShopper-unsigned.ipa`, and run `sideload-ipa.ps1` to test `react-native-vision-camera` barcode scanning on physical hardware.
2. **Drain Remaining `potential_duplicate` Queue & Schedule Autonomous Scrapers** — Use the `/queue` LLM Duplicate Triage batch runner (or `node admin/scripts/triage-duplicates.mjs`) to finish draining the remaining flagged duplicate pairs, and register a scheduled task / cron job for `node scrapers/run-vendor.js all --mode full`.
3. **AI Vision Product Recognition (`F3`) & User Wrong-Price Reporting (`F4`)** — Add vision capture mode to `mobile/app/(tabs)/scan.tsx` for loose produce/bakery items, and wire a "Report wrong price" action on `/product/[id]`.
4. **GPS Store Detection (`F5`)** — Wire foreground Haversine distance check against `store_locations` (`lat`, `lng`) to suggest the nearest store pill in `StorePicker`.
5. **Auth deep-link handler** — for Supabase email confirmation; deferred until closer to launch. Workaround for dev: disable email confirmation in the Supabase dashboard.
6. **Remaining polish** — "Often Bought" chips on Browse (backed by receipt history).

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
- Receipts require sign-in (RLS-scoped private storage bucket)
- Admin-curated store list (no user submissions)
- Image source priority: OFF → admin-approved → admin-uploaded → placeholder
- Tailwind v3 pinned (NativeWind v4 incompatible with Tailwind v4)
- `--legacy-peer-deps` for `react-dom` transitive conflict
- `xtool` (WSL2) + GitHub Actions unsigned `.ipa` for Windows → iPhone native sideloading
- `react-native-vision-camera@^4.7.3` with built-in `useCodeScanner` for `F2` barcode scanning
- Bidirectional `product_equivalents` scaling with direct-price-first precedence in mobile comparison & list totals
- Unified `scrapers/run-vendor.js` + `/scrape-runs` Admin Control Center with Node v22 TLS/IPv4 flags

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
                                                                    └── feature/admin-phase1
                                                                        └── feature/admin-phase2-circulars
                                                                            └── feature/scraper-ingest-foundation  (current — Sessions 19 + 20)
```

When ready to consolidate: merge each in order into `main`, or squash-merge groups (foundation → design pass → backend → features).
