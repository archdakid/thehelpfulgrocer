-- Receipts Phase 3 — line-item ↔ product matching.
--
-- The OCR pass (0008) drops `receipt_items.raw_text` rows that look like
-- "HZ KTCHP 1L" or "Heinz Tomato Ketchup". Matching them to a row in
-- `products` is a fuzzy-string problem, and pg_trgm is exactly the tool —
-- per DECISIONS.md (2026-05-01, "Receipt-item matching via pg_trgm…"), it's
-- free, fast, and runs in Postgres so we don't pay another network round trip
-- per receipt. The catalog is small (10s today, 1-2k at MVP scale), well
-- within trigram's sweet spot.
--
-- `product_aliases` is the escape hatch: when a receipt prints something
-- trigram can't reach ("HZ KTCHP" → "Heinz Tomato Ketchup"), an admin (or a
-- future user-correction flow) can add an alias and the next run picks it up
-- without any code changes.

create extension if not exists pg_trgm;

-- =============================================================================
-- product_aliases
-- =============================================================================

create table public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  alias text not null,
  -- 'admin' = curated, 'receipt' = auto-promoted from a confirmed match,
  -- 'manual' = user-typed correction (Phase 3.5+, not wired yet).
  source text not null default 'admin'
    check (source in ('admin', 'receipt', 'manual')),
  created_at timestamptz not null default now(),
  unique (product_id, alias)
);

-- Trigram index lets us run `lower(alias) % needle` with index support.
-- Using lower() in the index expression because pg_trgm trigrams are
-- case-sensitive; we lowercase both sides at query time.
create index product_aliases_alias_trgm_idx
  on public.product_aliases using gin (lower(alias) gin_trgm_ops);

-- =============================================================================
-- Trigram index on products.name
-- The 0001 migration created a tsvector index for full-text search; that's
-- the wrong tool for receipt-item matching where the input is misspelled,
-- abbreviated, and frequently a substring. Add a trigram index alongside it.
-- =============================================================================

create index products_name_trgm_idx
  on public.products using gin (lower(name) gin_trgm_ops);

-- =============================================================================
-- match_receipt_text(needle text) → (product_id, confidence)
--
-- Returns the single best match (or no rows) for a receipt-line-item string.
-- Confidence is the trigram similarity in [0, 1]; the 0.30 floor is
-- pg_trgm's default `pg_trgm.similarity_threshold` and where `%` starts
-- considering two strings "similar." Callers can layer their own higher
-- threshold on top (the Edge Function uses 0.50 to gate `needs_review`).
-- =============================================================================

create or replace function public.match_receipt_text(needle text)
returns table (product_id uuid, confidence numeric)
language sql
stable
as $$
  with q as (
    select lower(trim(needle)) as text
  ),
  hits as (
    select p.id as product_id,
           similarity(lower(p.name), q.text) as score
    from public.products p, q
    where q.text <> '' and lower(p.name) % q.text
    union all
    select a.product_id,
           similarity(lower(a.alias), q.text) as score
    from public.product_aliases a, q
    where q.text <> '' and lower(a.alias) % q.text
  ),
  best as (
    select hits.product_id, max(hits.score) as score
    from hits
    group by hits.product_id
  )
  select best.product_id, round(best.score::numeric, 2) as confidence
  from best
  where best.score >= 0.30
  order by best.score desc
  limit 1;
$$;

-- The function is callable by anon/authenticated for future client-side use
-- (e.g. "find a product as the user types"), but for now only the service
-- role calls it from the process-receipt Edge Function.
grant execute on function public.match_receipt_text(text) to anon, authenticated, service_role;

-- =============================================================================
-- RLS — product_aliases
-- =============================================================================

alter table public.product_aliases enable row level security;

-- Read is open: aliases describe public products, no privacy concern, and
-- showing "also known as" on a product detail screen is a likely future
-- feature.
create policy "Anyone reads product aliases"
  on public.product_aliases for select
  to anon, authenticated
  using (true);

-- No INSERT/UPDATE/DELETE policies → service-role-only writes (which bypass
-- RLS). Admin tooling and the Edge Function are the only writers in Phase 3.
