# Data model

> The schema is the contract. Once a table is shipped, changes go through migrations only — never hand-edit the database. **Always run `npx supabase gen types typescript --local > mobile/types/database.ts` after applying a migration.**

---

## Schema overview

```
auth.users (Supabase managed)
   │
   ├── profiles (1:1 extension)
   │
   ├── shopping_lists ─── list_items ─── products
   │                                       │
   ├── price_alerts ──────────────────────┤
   │                                       │
   ├── receipts ─── receipt_items ────────┤
   │                                       │
   └── product_image_candidates ──────────┤
                                           │
            stores ─── prices ─────────────┤
                          │                │
                       circulars           ├── product_aliases
                                           │
                                           ├── nutritional_facts (1:1)
                                           │
                                           └── categories
                                           
            flagged_items (review queue, references many)
```

---

## Tables

### `profiles`

Extends Supabase's `auth.users` with app-specific fields.

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  preferred_currency TEXT NOT NULL DEFAULT 'TTD',
  preferred_region TEXT NOT NULL DEFAULT 'TT',
  is_admin BOOLEAN NOT NULL DEFAULT false,
  contribution_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_is_admin ON profiles(is_admin) WHERE is_admin = true;
```

**RLS:**
```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can read their own profile
CREATE POLICY "users read own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile (except is_admin)
CREATE POLICY "users update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND is_admin = (SELECT is_admin FROM profiles WHERE id = auth.uid()));

-- Profile auto-created via trigger on auth.users insert
```

---

### `stores`

Admin-managed. Users cannot add stores.

```sql
CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  region TEXT NOT NULL,                          -- 'TT', 'BB', etc.
  geofence_lat DECIMAL(9,6),
  geofence_lng DECIMAL(9,6),
  geofence_radius_m INTEGER DEFAULT 200,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,            -- store URL, hours, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stores_active_region ON stores(region, is_active) WHERE is_active = true;
CREATE INDEX idx_stores_geo ON stores(geofence_lat, geofence_lng) WHERE geofence_lat IS NOT NULL;
```

**RLS:**
```sql
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read active stores
CREATE POLICY "anyone read active stores" ON stores
  FOR SELECT USING (is_active = true);

-- Only admins can read inactive stores
CREATE POLICY "admins read all stores" ON stores
  FOR SELECT USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

-- Only admins can write
CREATE POLICY "admins write stores" ON stores
  FOR ALL USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
```

---

### `categories`

Hierarchical product categories.

```sql
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  icon_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_parent ON categories(parent_id);
```

**RLS:** Public read, admin write.

---

### `products`

The master product catalog.

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upc TEXT UNIQUE,                               -- nullable: not all products have a barcode
  name TEXT NOT NULL,
  brand TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  description TEXT,
  default_unit TEXT,                             -- 'each', 'kg', 'lb', 'oz', 'l', 'ml'
  default_size TEXT,                             -- '500g', '1L', '12-pack'
  off_image_url TEXT,                            -- Open Food Facts CDN URL
  custom_image_url TEXT,                         -- admin-approved user/admin upload
  source TEXT NOT NULL DEFAULT 'manual',         -- 'off' | 'user_scan' | 'admin' | 'circular'
  is_verified BOOLEAN NOT NULL DEFAULT false,
  search_vector TSVECTOR,                        -- generated, for full-text search
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_upc ON products(upc) WHERE upc IS NOT NULL;
CREATE INDEX idx_products_search ON products USING GIN(search_vector);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_brand ON products(brand);

-- Auto-update search_vector
CREATE TRIGGER products_search_vector_update
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION
  tsvector_update_trigger(search_vector, 'pg_catalog.english', name, brand, description);
```

**RLS:**
```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Anyone can read products
CREATE POLICY "anyone read products" ON products FOR SELECT USING (true);

-- Authenticated users can insert (for unknown product flow)
CREATE POLICY "auth users insert products" ON products
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Anonymous users can also insert (guest scans)
CREATE POLICY "anon insert products" ON products
  FOR INSERT WITH CHECK (true);

-- Only admins can update or delete
CREATE POLICY "admins update products" ON products
  FOR UPDATE USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));

CREATE POLICY "admins delete products" ON products
  FOR DELETE USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
```

---

### `product_aliases`

Alternative names for products — primarily from receipt OCR (e.g., "DOLE BNNA BNCH" → "Bananas").

```sql
CREATE TABLE product_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  source TEXT NOT NULL,                          -- 'receipt' | 'admin' | 'user'
  confidence DECIMAL(3,2) NOT NULL DEFAULT 1.0,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,  -- alias may be store-specific
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, alias, store_id)
);

CREATE INDEX idx_aliases_alias_trgm ON product_aliases USING GIN(alias gin_trgm_ops);
CREATE INDEX idx_aliases_product ON product_aliases(product_id);
```

**RLS:** Public read, admin/edge function write.

---

### `prices`

Time-series price observations. Append-only; never updated.

```sql
CREATE TABLE prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  price DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TTD',
  unit TEXT,
  size TEXT,
  source TEXT NOT NULL,                          -- 'circular' | 'receipt' | 'manual_user' | 'manual_admin'
  source_id UUID,                                -- FK to circular/receipt (no constraint, polymorphic)
  is_promo BOOLEAN NOT NULL DEFAULT false,
  promo_ends_at DATE,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  contributed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prices_product_store_time ON prices(product_id, store_id, observed_at DESC);
CREATE INDEX idx_prices_observed_at ON prices(observed_at DESC);
CREATE INDEX idx_prices_promo ON prices(is_promo, promo_ends_at) WHERE is_promo = true;
```

**View — most recent price per product/store:**
```sql
CREATE OR REPLACE VIEW current_prices AS
SELECT DISTINCT ON (product_id, store_id)
  id,
  product_id,
  store_id,
  price,
  currency,
  unit,
  size,
  is_promo,
  promo_ends_at,
  observed_at,
  -- Helper: how stale is this price?
  EXTRACT(DAY FROM (NOW() - observed_at))::int AS days_old
FROM prices
WHERE observed_at > NOW() - INTERVAL '90 days'   -- ignore very old data
ORDER BY product_id, store_id, observed_at DESC;
```

**RLS:**
```sql
ALTER TABLE prices ENABLE ROW LEVEL SECURITY;

-- Anyone can read prices
CREATE POLICY "anyone read prices" ON prices FOR SELECT USING (true);

-- Authenticated users can insert manual prices
CREATE POLICY "auth users insert prices" ON prices
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND source IN ('manual_user', 'receipt'));

-- Anonymous receipts also allowed (guest contributions)
CREATE POLICY "anon insert receipt prices" ON prices
  FOR INSERT WITH CHECK (source = 'receipt');

-- Only admins update/delete
CREATE POLICY "admins update prices" ON prices
  FOR UPDATE USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
```

---

### `circulars`

Admin-uploaded weekly circulars.

```sql
CREATE TABLE circulars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,                     -- 'pdf' | 'image' | 'social_post'
  source_url TEXT,
  raw_image_path TEXT NOT NULL,                  -- path in Supabase Storage
  parse_status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'parsed' | 'reviewed' | 'failed'
  parsed_data JSONB,                             -- Claude API output
  parse_error TEXT,
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_circulars_store_dates ON circulars(store_id, valid_from, valid_to);
CREATE INDEX idx_circulars_status ON circulars(parse_status);
```

**RLS:** Admin only for read and write. Edge Function uses service role.

---

### `receipts`

User-uploaded receipts.

> **Phases 1–3 shipped (migrations `0006_receipts.sql`, `0007_receipts_storage.sql`, `0008_receipt_items.sql`, `0009_product_matching.sql`, `0010_flagged_items_and_price_link.sql`, 2026-05-01)** diverge from the spec below: `user_id` is `NOT NULL` (sign-in required — see DECISIONS.md), the image column is `image_path` (not `raw_image_path`), `status` is a typed enum `('uploaded' | 'processing' | 'processed' | 'failed')`, monetary columns are stored as `_minor_units int` (cents), and the parsed store name lives separately in `parsed_store_name` while `store_id` is set only when a fuzzy-match against `stores` succeeds. The OCR-result columns (`ocr_text`, `processed_at`, `process_error`, `parsed_store_name`, `total_amount_minor_units`, `currency`, `receipt_date`) are service-role-only writes; clients can only edit `store_id`, `notes`, `captured_at`. `receipt_items` (line items, service-role-write only) and `flagged_items` (admin queue, admin-only RLS) are live; `product_aliases` exists too. `prices` gained a `receipt_item_id` FK linking each contribution back to its source. The spec below predates the implementation; treat the migrations as authoritative.

```sql
CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,    -- nullable for anon
  device_id TEXT,                                                -- for anon attribution
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  raw_image_path TEXT NOT NULL,
  ocr_text TEXT,
  total_amount DECIMAL(10,2),
  currency TEXT NOT NULL DEFAULT 'TTD',
  receipt_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',        -- 'pending' | 'processing' | 'processed' | 'reviewed' | 'rejected'
  process_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_receipts_user ON receipts(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_receipts_status ON receipts(status);
CREATE INDEX idx_receipts_store_date ON receipts(store_id, receipt_date);
```

**RLS:**
```sql
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (anon receipts welcomed)
CREATE POLICY "anyone insert receipts" ON receipts FOR INSERT WITH CHECK (true);

-- Users see their own receipts
CREATE POLICY "users read own receipts" ON receipts
  FOR SELECT USING (auth.uid() = user_id);

-- Admins read all
CREATE POLICY "admins read all receipts" ON receipts
  FOR SELECT USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
```

---

### `receipt_items`

Parsed line items from receipts.

```sql
CREATE TABLE receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  matched_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  match_confidence DECIMAL(3,2),
  price DECIMAL(10,2) NOT NULL,
  quantity DECIMAL(10,3) NOT NULL DEFAULT 1,
  needs_review BOOLEAN NOT NULL DEFAULT false,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_receipt_items_receipt ON receipt_items(receipt_id);
CREATE INDEX idx_receipt_items_review ON receipt_items(needs_review) WHERE needs_review = true;
```

**RLS:** Inherits from receipts — users read their own.

---

### `flagged_items`

Items needing admin review — unrecognized scans, low-confidence matches.

```sql
CREATE TABLE flagged_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,                     -- 'barcode' | 'vision' | 'receipt' | 'circular'
  raw_data JSONB NOT NULL,                       -- UPC, OCR text, vision label, etc.
  candidate_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  context_image_path TEXT,                       -- if vision/photo
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_action TEXT,                          -- 'created' | 'merged' | 'rejected'
  resolved_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_flagged_unresolved ON flagged_items(resolved, created_at) WHERE resolved = false;
```

**RLS:** Admin only.

---

### `product_image_candidates`

Candidate images awaiting admin review.

```sql
CREATE TABLE product_image_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  raw_image_path TEXT NOT NULL,
  processed_image_path TEXT,                     -- bg-removed PNG
  source TEXT NOT NULL,                          -- 'user_scan' | 'admin_upload'
  status TEXT NOT NULL DEFAULT 'pending',        -- 'pending' | 'approved' | 'rejected'
  contributed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_image_candidates_pending ON product_image_candidates(status, created_at) WHERE status = 'pending';
```

**RLS:** Admin only.

---

### `nutritional_facts`

1:1 with products.

```sql
CREATE TABLE nutritional_facts (
  product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  serving_size TEXT,
  serving_unit TEXT,
  calories INTEGER,
  fat_g DECIMAL(6,2),
  saturated_fat_g DECIMAL(6,2),
  trans_fat_g DECIMAL(6,2),
  cholesterol_mg DECIMAL(7,2),
  carbs_g DECIMAL(6,2),
  fiber_g DECIMAL(6,2),
  sugars_g DECIMAL(6,2),
  added_sugars_g DECIMAL(6,2),
  protein_g DECIMAL(6,2),
  sodium_mg DECIMAL(7,2),
  source TEXT NOT NULL DEFAULT 'off',            -- 'off' | 'admin' | 'user'
  raw_data JSONB,                                -- full OFF response
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**RLS:** Public read, admin write (or edge function via service role).

---

### `shopping_lists`

```sql
CREATE TABLE shopping_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My List',
  current_store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lists_user ON shopping_lists(user_id, is_archived);
```

**RLS:** Users CRUD their own lists only.

---

### `list_items`

```sql
CREATE TABLE list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  custom_name TEXT,                              -- for items not in product DB
  quantity DECIMAL(10,3) NOT NULL DEFAULT 1,
  unit TEXT,
  is_checked BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_or_custom CHECK (product_id IS NOT NULL OR custom_name IS NOT NULL)
);

CREATE INDEX idx_list_items_list ON list_items(list_id, display_order);
```

**RLS:** Users CRUD items in their own lists only (joined via shopping_lists).

---

### `price_alerts`

```sql
CREATE TABLE price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  target_price DECIMAL(10,2) NOT NULL,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,    -- null = any store
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id, store_id)
);

CREATE INDEX idx_alerts_active ON price_alerts(product_id, is_active) WHERE is_active = true;
```

**RLS:** Users CRUD their own alerts only.

---

## Triggers and functions

### Auto-create profile on user signup

```sql
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

### Auto-update `updated_at`

```sql
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to relevant tables
CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON shopping_lists
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### Increment contribution count on receipt processing

```sql
CREATE OR REPLACE FUNCTION increment_contribution_count() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'processed' AND OLD.status != 'processed' AND NEW.user_id IS NOT NULL THEN
    UPDATE profiles SET contribution_count = contribution_count + 1
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_receipt_processed
  AFTER UPDATE ON receipts
  FOR EACH ROW EXECUTE FUNCTION increment_contribution_count();
```

---

## Storage buckets

```
receipts/        Private. User-uploaded receipt images.
products-raw/    Private. Raw product captures from users.
products-clean/  Public. Background-removed product images. Served to clients.
circulars/       Private. Admin-uploaded circular PDFs/images.
store-logos/     Public. Admin-managed store logos.
```

**Storage RLS:**
- `receipts/`: users can upload their own, only admins can read all
- `products-raw/`: users can upload, only admins can read
- `products-clean/`: public read, only admins can write
- `circulars/`: admin only
- `store-logos/`: public read, admin write

---

## Required Postgres extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- for fuzzy alias matching
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- for gen_random_uuid()
```

---

## Migration workflow

1. Make changes via a new migration file: `supabase/migrations/00NN_description.sql`
2. Apply locally: `npx supabase db reset` (re-runs all migrations cleanly)
3. Verify in Supabase Studio at `localhost:54323`
4. Regenerate types: `npx supabase gen types typescript --local > mobile/types/database.ts`
5. Commit migration + regenerated types together
6. Push to staging Supabase: `npx supabase db push --linked`
7. After verification, push to production

**Never edit the database via the dashboard for schema changes.** Only data fixes via SQL editor are allowed in production, and even those should be rare.
