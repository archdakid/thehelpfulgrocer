-- Seed data for the SmartShopper catalog. Fully idempotent — safe to re-run
-- against a populated database without creating duplicates.

-- =============================================================================
-- Stores: five T&T retail chains.
-- =============================================================================
insert into public.stores (name, region) values
  ('Massy Stores', 'TT'),
  ('PriceSmart', 'TT'),
  ('Tru Valu', 'TT'),
  ('JTA Supermarkets', 'TT'),
  ('Xtra Foods', 'TT')
on conflict (name, region) do nothing;

-- =============================================================================
-- Products: ten common grocery items keyed by UPC for idempotency.
-- Real UPCs where known; placeholders prefixed `INTERNAL-` where the product
-- has no canonical barcode (e.g. local produce).
-- =============================================================================
insert into public.products (upc, name, brand) values
  ('7622210449283', 'Oreo Original Cookies 137g',     'Mondelez'),
  ('012000161155',  'Pepsi Cola 2L',                  'PepsiCo'),
  ('028400157810',  'Lay''s Classic Potato Chips 184g','Frito-Lay'),
  ('041196910759',  'Heinz Tomato Ketchup 397g',      'Heinz'),
  ('024000162216',  'Hunt''s Tomato Sauce 8oz',       'Hunt''s'),
  ('051000012517',  'Campbell''s Chicken Noodle Soup','Campbell''s'),
  ('054500001234',  'Carib Beer 6-pack 275ml',        'Carib Brewery'),
  ('086600000174',  'Solo Apple Juice 1L',            'Solo Beverages'),
  ('INTERNAL-RICE-1KG', 'White Rice 1kg',             'Generic'),
  ('INTERNAL-FLOUR-2KG','All-Purpose Flour 2kg',      'Generic')
on conflict (upc) do nothing;

-- =============================================================================
-- Admin-observed prices: ~40 observations across the 5 stores.
-- Stored in TTD minor units (cents). Prices are illustrative — calibrated to
-- look reasonable but not pulled from a real source.
--
-- Idempotent via `where not exists`: only inserts an admin observation when
-- there isn't already one for this (product, store) pair. Receipts/circulars
-- can still add more observations later (the prices table is append-only).
-- =============================================================================

with seeded as (
  select
    p.id as product_id,
    s.id as store_id,
    sp.amount_minor_units
  from (values
    -- (upc, store_name, amount_minor_units)
    ('7622210449283', 'Massy Stores',     1899),
    ('7622210449283', 'PriceSmart',       1599),
    ('7622210449283', 'Tru Valu',         1799),
    ('7622210449283', 'JTA Supermarkets', 1849),
    ('7622210449283', 'Xtra Foods',       1949),

    ('012000161155',  'Massy Stores',     2299),
    ('012000161155',  'PriceSmart',       1999),
    ('012000161155',  'Tru Valu',         2199),
    ('012000161155',  'JTA Supermarkets', 2349),

    ('028400157810',  'Massy Stores',     2499),
    ('028400157810',  'PriceSmart',       2099),
    ('028400157810',  'Tru Valu',         2599),
    ('028400157810',  'Xtra Foods',       2699),

    ('041196910759',  'Massy Stores',     2199),
    ('041196910759',  'PriceSmart',       1899),
    ('041196910759',  'Tru Valu',         2099),
    ('041196910759',  'JTA Supermarkets', 2249),
    ('041196910759',  'Xtra Foods',       2299),

    ('024000162216',  'Massy Stores',      999),
    ('024000162216',  'PriceSmart',        849),
    ('024000162216',  'Tru Valu',          979),

    ('051000012517',  'Massy Stores',     1599),
    ('051000012517',  'Tru Valu',         1549),
    ('051000012517',  'JTA Supermarkets', 1599),
    ('051000012517',  'Xtra Foods',       1699),

    ('054500001234',  'Massy Stores',     5499),
    ('054500001234',  'PriceSmart',       4999),
    ('054500001234',  'JTA Supermarkets', 5599),
    ('054500001234',  'Xtra Foods',       5599),

    ('086600000174',  'Massy Stores',     1499),
    ('086600000174',  'Tru Valu',         1449),
    ('086600000174',  'JTA Supermarkets', 1549),

    ('INTERNAL-RICE-1KG', 'Massy Stores',     1299),
    ('INTERNAL-RICE-1KG', 'PriceSmart',       1099),
    ('INTERNAL-RICE-1KG', 'Tru Valu',         1249),
    ('INTERNAL-RICE-1KG', 'JTA Supermarkets', 1299),
    ('INTERNAL-RICE-1KG', 'Xtra Foods',       1349),

    ('INTERNAL-FLOUR-2KG','Massy Stores',     2799),
    ('INTERNAL-FLOUR-2KG','PriceSmart',       2399),
    ('INTERNAL-FLOUR-2KG','Tru Valu',         2749),
    ('INTERNAL-FLOUR-2KG','Xtra Foods',       2899)
  ) as sp(upc, store_name, amount_minor_units)
  join public.products p on p.upc = sp.upc
  join public.stores   s on s.name = sp.store_name
)
insert into public.prices (product_id, store_id, amount_minor_units, currency, source)
select product_id, store_id, amount_minor_units, 'TTD', 'admin'
from seeded sd
where not exists (
  select 1 from public.prices existing
  where existing.product_id = sd.product_id
    and existing.store_id = sd.store_id
    and existing.source = 'admin'
);
