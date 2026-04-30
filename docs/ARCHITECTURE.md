# Architecture

## High-level diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                 │
│  ┌──────────────────┐         ┌──────────────────────────────┐  │
│  │  Mobile (Expo)   │         │  Admin Panel (Next.js)        │  │
│  │  iOS + Android   │         │  Web                          │  │
│  └────────┬─────────┘         └─────────────┬────────────────┘  │
└───────────┼─────────────────────────────────┼───────────────────┘
            │                                 │
            │ HTTPS + JWT                     │ HTTPS + JWT
            │                                 │
┌───────────▼─────────────────────────────────▼───────────────────┐
│                       SUPABASE                                  │
│  ┌─────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Postgres   │  │  Auth    │  │  Storage │  │ Edge Funcs   │  │
│  │  + RLS      │  │          │  │ (images) │  │ (Deno)       │  │
│  └─────────────┘  └──────────┘  └──────────┘  └──────┬───────┘  │
└─────────────────────────────────────────────────────┼───────────┘
                                                      │
                            ┌─────────────────────────┼──────────────────────┐
                            │                         │                      │
                  ┌─────────▼──────────┐   ┌──────────▼────────┐   ┌─────────▼─────┐
                  │  Open Food Facts   │   │  Claude API       │   │  rembg worker │
                  │  (UPC + nutrition) │   │  (circular parse) │   │  (bg removal) │
                  └────────────────────┘   └───────────────────┘   └───────────────┘
```

## Why this stack

### Mobile: Expo + React Native + TypeScript

- **One codebase** for iOS and Android — half the development time vs. native.
- **Expo SDK** gives us camera, GPS, storage, push notifications, and OTA updates without writing a line of native code.
- **TypeScript** catches schema mismatches and contract drift between the client and Supabase before runtime.
- **React Native + Hermes** delivers genuinely native performance for the hot paths (lists, scrolling, animations).

### Backend: Supabase

- **Postgres-first** means we can model relational data properly (stores → prices → products → receipts is inherently relational, NoSQL would force awkward denormalization).
- **Row Level Security (RLS)** lets us write authorization in SQL alongside the data, not in middleware.
- **Free tier covers MVP** (500MB DB, 1GB storage, 50K MAU, unlimited API calls).
- **Edge Functions** in Deno handle the work that can't run client-side (Claude API calls, background removal, sensitive operations).
- **Open source** — we can self-host later if economics demand it.

### State management: Zustand + React Query

- **Zustand** for client UI state (current screen, selected store, scan mode). Tiny, no boilerplate.
- **React Query** for server state (products, prices, lists). Built-in cache, refetch, optimistic updates, offline.
- **No Redux.** Overkill for this app's complexity.

### Styling: NativeWind

- Tailwind for React Native. Same mental model as web.
- Design tokens live in `tailwind.config.js`, used everywhere.
- Faster iteration than StyleSheet.create + theme objects.

## Folder structure (detailed)

```
smartshopper/
├── mobile/
│   ├── app/                          # Expo Router (file-based routing)
│   │   ├── (tabs)/
│   │   │   ├── _layout.tsx           # Tab bar config
│   │   │   ├── index.tsx             # Home / current list
│   │   │   ├── scan.tsx              # Scanner screen
│   │   │   ├── browse.tsx            # Browse stores / circulars
│   │   │   └── settings.tsx
│   │   ├── _layout.tsx               # Root layout (providers)
│   │   ├── product/
│   │   │   └── [id].tsx              # Product detail screen
│   │   ├── store/
│   │   │   └── [id].tsx              # Store detail
│   │   ├── receipt/
│   │   │   └── upload.tsx            # Receipt upload flow
│   │   ├── auth/
│   │   │   ├── sign-in.tsx
│   │   │   └── sign-up.tsx
│   │   └── +not-found.tsx
│   ├── components/
│   │   ├── ui/                       # Design system primitives
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── BottomSheet.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── ListItem.tsx
│   │   │   ├── Badge.tsx
│   │   │   └── ...
│   │   ├── list/
│   │   │   ├── ListItemRow.tsx
│   │   │   ├── RunningTotalBar.tsx
│   │   │   ├── AddItemButton.tsx
│   │   │   └── EmptyListState.tsx
│   │   ├── scan/
│   │   │   ├── CameraView.tsx
│   │   │   ├── BarcodeOverlay.tsx
│   │   │   ├── ProductFrameOverlay.tsx
│   │   │   ├── ScanResultSheet.tsx
│   │   │   └── ScanModeToggle.tsx
│   │   ├── product/
│   │   │   ├── ProductCard.tsx
│   │   │   ├── PriceComparisonSheet.tsx
│   │   │   ├── NutritionPanel.tsx
│   │   │   └── StorePriceRow.tsx
│   │   └── store/
│   │       ├── StorePill.tsx
│   │       └── StorePicker.tsx
│   ├── lib/
│   │   ├── supabase.ts               # Supabase client
│   │   ├── openfoodfacts.ts          # OFF API wrapper
│   │   ├── productMatcher.ts         # Fuzzy matching logic
│   │   ├── geofence.ts               # GPS / store detection
│   │   ├── logger.ts                 # Replaces console.log
│   │   └── format.ts                 # Money, date formatting
│   ├── hooks/
│   │   ├── useProducts.ts            # React Query: products
│   │   ├── usePrices.ts              # React Query: prices
│   │   ├── useShoppingList.ts        # Current list state + sync
│   │   ├── useScanResult.ts          # Scan -> match flow
│   │   ├── useNearbyStore.ts         # GPS-based store detection
│   │   └── useAuth.ts                # Supabase auth wrapper
│   ├── stores/
│   │   ├── useUIStore.ts             # Zustand: UI state
│   │   └── useScanStore.ts           # Scan mode, last scan
│   ├── types/
│   │   ├── database.ts               # AUTO-GENERATED — do not edit
│   │   ├── domain.ts                 # Business types
│   │   └── api.ts                    # External API types
│   ├── constants/
│   │   ├── colors.ts
│   │   ├── spacing.ts
│   │   └── config.ts
│   ├── assets/
│   │   ├── icons/
│   │   ├── fonts/
│   │   └── images/
│   ├── app.json                      # Expo config
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── package.json
│
├── admin/                            # Next.js admin panel
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── stores/
│   │   │   ├── products/
│   │   │   ├── circulars/
│   │   │   ├── receipts/
│   │   │   ├── flagged-items/
│   │   │   └── product-images/
│   │   └── auth/
│   ├── components/
│   ├── lib/
│   └── package.json
│
├── supabase/
│   ├── migrations/                   # Versioned SQL migrations
│   │   ├── 0001_initial_schema.sql
│   │   ├── 0002_rls_policies.sql
│   │   ├── 0003_seed_data.sql
│   │   └── ...
│   ├── functions/                    # Deno Edge Functions
│   │   ├── parse-circular/
│   │   ├── process-receipt/
│   │   ├── remove-background/
│   │   └── match-product/
│   ├── seed.sql
│   └── config.toml
│
├── docs/
│   ├── PROJECT_OVERVIEW.md
│   ├── ARCHITECTURE.md
│   ├── FEATURES.md
│   ├── DATA_MODEL.md
│   ├── DESIGN_SYSTEM.md
│   ├── CODING_STANDARDS.md
│   └── DECISIONS.md
│
├── .github/
│   └── workflows/
│       ├── mobile-ci.yml
│       └── admin-ci.yml
├── CLAUDE.md
├── README.md
└── .gitignore
```

## Critical data flows

### 1. User scans a barcode

```
User taps scan → CameraView opens (vision-camera) →
Barcode detected (vision-camera-code-scanner) →
useScanResult hook fires →
  1. Look up product by UPC in Supabase products table
     - Hit: load product + current_prices view
     - Miss: query Open Food Facts API → if found, insert into products → load prices
     - Still miss: prompt user to name item, create flagged_item record
  2. Render PriceComparisonSheet with current prices across stores
```

### 2. User uploads a receipt

```
User opens receipt upload → captures/selects image →
Image uploads to Supabase Storage (raw_image_path) →
Insert into receipts table (status = 'pending') →
Edge Function process-receipt triggered →
  1. Run ML Kit OCR on the image
  2. Parse line items (regex + heuristics)
  3. For each line item:
     - Fuzzy match raw_text against products + product_aliases
     - Confidence > 0.8: auto-link, insert receipt_item with matched_product_id
     - Confidence < 0.8: insert receipt_item with needs_review = true
  4. Insert into prices table for each matched item
  5. Update receipt status to 'processed'
Admin reviews flagged items in admin panel, approves matches → updates product_aliases
```

### 3. Admin uploads a circular

```
Admin uploads PDF/image in admin panel →
Stored in Supabase Storage →
Edge Function parse-circular triggered →
  1. Send image to Claude API (vision) with structured prompt
  2. Receive JSON: [{ name, price, valid_dates }, ...]
  3. For each item:
     - Match to existing product (or create new flagged_item)
     - Insert into prices table with source = 'circular'
  4. Update circular status to 'parsed'
Admin reviews parsed prices, approves → prices go live
```

### 4. User captures a product image

```
User scans product (vision mode) → captures image within frame →
Upload original to Supabase Storage →
Edge Function remove-background triggered →
  1. Call rembg (self-hosted) on the image
  2. Save processed PNG to Storage
  3. Insert product_image_candidates record
Admin reviews in panel: original + processed side-by-side →
  Approve: update products.custom_image_url → goes live
  Reject: discard
```

## Authentication & authorization

- **Anonymous users** can: build a list (local-only), scan items, see prices, upload a receipt.
- **Authenticated users** can: save lists across devices, set price alerts, see contribution history, earn badges.
- **Admin users** (flagged via `profiles.is_admin = true`) can: manage stores, approve images, review flagged items, parse circulars.
- **Service role** is used only by Edge Functions, never exposed to clients.

## Performance budget

These are the hard targets. PRs that regress these get rejected:

| Metric | Budget |
|---|---|
| App launch (cold) | < 2.5s |
| App launch (warm) | < 1s |
| List scroll fps | 60 (120 on ProMotion) |
| Scanner ready (camera open → first frame) | < 1.5s |
| Barcode detection | < 500ms |
| Price comparison popup open | < 300ms |
| Search debounce → results | < 250ms |
| Crash-free sessions | > 99.5% |

## Offline behavior

- **List management** works fully offline. Sync happens when online.
- **Recently viewed products** are cached locally.
- **Scanning** falls back to local product cache if offline.
- **Price data** is never cached for more than 24 hours — staleness matters.
- **Receipts captured offline** queue locally and upload when connected.

## Deployment

### Mobile
- Builds via Expo EAS (free tier: 30 builds/month).
- iOS: distributed via TestFlight in beta, App Store at launch.
- Android: distributed via internal testing track in beta, Play Store at launch.
- OTA updates for JS-only changes via Expo Updates.

### Admin panel
- Deployed to Vercel (free tier).
- Custom domain (e.g. admin.smartshopper.app).
- Behind Supabase auth + admin role check.

### Database & Edge Functions
- Hosted on Supabase (free tier through MVP).
- Migrations applied via `supabase db push` (CI/CD later).
- Edge Functions deployed via `supabase functions deploy`.

## Monitoring

- **Sentry** (free tier: 5K errors/month) for crash and error tracking on both mobile and admin.
- **Supabase dashboard** for database performance and Edge Function logs.
- **Custom analytics events** via PostHog (free tier) for the north-star metric and funnel tracking — added in Phase 5, not MVP.
