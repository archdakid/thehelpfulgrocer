-- Seed: a handful of T&T stores so Browse renders something on first run.
-- Idempotent — safe to re-run.

insert into public.stores (name, region) values
  ('Massy Stores', 'TT'),
  ('PriceSmart', 'TT'),
  ('Tru Valu', 'TT'),
  ('JTA Supermarkets', 'TT'),
  ('Xtra Foods', 'TT')
on conflict (name, region) do nothing;
