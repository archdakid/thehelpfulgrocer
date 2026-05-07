# Decisions log

> Append-only log of non-obvious architectural choices. When future-you (or future-Claude) wonders "why did we do this?", the answer should be here.

Format: `## YYYY-MM-DD — Decision title`

---

## 2026-04-30 — Use Supabase over Firebase

**Context:** Needed a backend-as-a-service for the MVP.

**Decision:** Supabase.

**Reasoning:**
- Our data is inherently relational (stores → prices → products → receipts → users). Modeling this in Firestore would require either deep denormalization or many client-side joins, both of which compound costs and complexity.
- Free tier is more practical for development: unlimited API calls (Firestore caps at 50K reads/day on free tier), 50K MAU, 500MB DB, 1GB storage.
- Postgres + RLS lets us write authorization next to the data in SQL, not in middleware.
- Open-source, self-hostable. We can move off Supabase if economics ever demand it.
- TypeScript type generation from schema is a major DX win.

**Trade-offs accepted:**
- Smaller ecosystem than Firebase. We may write more glue code.
- Real-time subscriptions are slightly less mature than Firestore's.
- Vendor still — but with an open-source escape hatch.

---

## 2026-04-30 — Expo over bare React Native

**Context:** Needed a mobile framework.

**Decision:** Expo SDK + Expo Router.

**Reasoning:**
- Expo handles native modules we'd otherwise have to wire up: camera, GPS, storage, push, OTA updates.
- File-based routing via Expo Router maps cleanly to our screen structure and is type-safe.
- EAS Build provides 30 free builds/month — enough for active development.
- OTA updates let us ship JS-only fixes without an app store review.
- We can `expo prebuild` to a bare project later if we ever need full native control.

**Trade-offs accepted:**
- Adds a layer of abstraction; some native libraries need workarounds.
- `react-native-vision-camera` requires a custom dev client (not Expo Go) — planned around this.

---

## 2026-04-30 — rembg (open source, self-hosted) for background removal

**Context:** Captured product images need background removal before going into the catalog.

**Decision:** Use `rembg` (Apache 2.0) running as a Python worker triggered by a Supabase Edge Function. NOT remove.bg API or PhotoRoom API.

**Reasoning:**
- `rembg` is genuinely free, no per-image cost, no rate limit.
- Our volume is low to moderate (a captured image per product, reviewed by admin). Self-hosting is fine at this scale.
- We control the model; can swap in better ones later (e.g. `withoutBG` open-source models).
- remove.bg's free tier is 50 calls/month — useless for production. PhotoRoom is 10/month.

**Trade-offs accepted:**
- Operations cost: we have to host a tiny Python worker somewhere. Likely a cheap Fly.io / Railway / Render instance, or as a Supabase Edge Function with the rembg WASM build if it's small enough.
- Slower than commercial APIs (~2-5s vs <1s), but this runs in background — admin reviews later, not in real time.

---

## 2026-04-30 — Open Food Facts as the product database backbone

**Context:** Need a UPC-to-product lookup AND nutritional data.

**Decision:** Open Food Facts API as primary, our own DB layered on top.

**Reasoning:**
- Free, open, 3M+ products, comprehensive nutritional data.
- We don't have to build or maintain a product catalog from scratch.
- We can extend it: products not in OFF get added to our DB; aliases live in our DB; prices are entirely ours.

**Trade-offs accepted:**
- OFF coverage is uneven for local Caribbean brands. Local products will need to be added manually or via user contribution.
- Rate limits (100 req/min anonymous). Solution: cache aggressively, only hit OFF on cache miss.

---

## 2026-04-30 — Admin-curated store list (not user-submitted)

**Context:** Should users be able to add their own stores?

**Decision:** No. Admin manages the store list. Users cannot add stores.

**Reasoning:**
- Quality control. Crowdsourced store entries get duplicated, wrongly geofenced, or named inconsistently.
- We control which stores we have data for. A store in the list implies "we have prices here." Letting users add stores creates ghost stores with no data.
- Easier to curate the price comparison popup if we know the universe of stores.

**Trade-offs accepted:**
- Slower expansion. Adding a new store requires admin action.
- Counter: this is a feature for MVP, where reliability beats coverage.

---

## 2026-04-30 — Receipt scanning open to all users (no signup required)

**Context:** Should receipt contributions require a signed-in account?

**Decision:** No. Anonymous users can scan receipts. The data value outweighs friction.

**Reasoning:**
- Receipt data is the lifeblood of the price database. Maximize the funnel.
- People are willing to contribute data more readily than to create an account.
- We can still incentivize sign-up after contribution ("Save your scan history → sign up").
- Anonymous attribution via `device_id` lets us prevent abuse without forcing accounts.

**Trade-offs accepted:**
- Anonymous receipts are less verifiable. We rely on admin review and statistical anomaly detection.

---

## 2026-04-30 — AI vision recognition (in addition to barcode)

**Context:** Should we support camera-based product recognition without scanning a barcode?

**Decision:** Yes, as a secondary scan mode. Toggle between barcode and visual scan in the camera UI.

**Reasoning:**
- Genuine UX differentiator — no major competitor has this.
- ML Kit's on-device recognition is free and fast.
- Loose products (produce, bakery, deli) don't have barcodes — vision is the only way.
- Captured images double as a source of product photos for the catalog (reviewed by admin).

**Trade-offs accepted:**
- Vision recognition is less accurate than barcodes. Confidence threshold matters; below it, fall back to manual naming.
- More user education required ("you can also point at the product").

---

## 2026-04-30 — Camera frame guide for product photos

**Context:** Vision-mode captures need to be processable by background removal.

**Decision:** Show a corner-bracket frame in the camera view; user places the product within it. Capture is full-frame, but the frame guides composition.

**Reasoning:**
- Cleaner subject isolation = better background removal output.
- Visually clearer instruction than "hold steady" text.
- Industry standard pattern from document/passport scan apps.

**Trade-offs accepted:**
- Some users will photograph the product outside the frame anyway. We process whatever we receive; admin can reject low-quality candidates.

---

## 2026-04-30 — Image source priority: OFF → admin-approved → admin-uploaded → placeholder

**Context:** Where do product images come from?

**Decision:** Strict priority order:
1. Open Food Facts image (free, automatic)
2. Admin-approved user-captured image (rembg processed)
3. Admin-uploaded image (manual)
4. Category placeholder

**Reasoning:**
- OFF coverage is huge — most major-brand products already have decent images. Use those first.
- User captures fill the long tail. Admin review prevents low-quality images from going live.
- Placeholders are the last resort, not the default.

---

## 2026-04-30 — Postgres `prices` table is append-only

**Context:** Should price changes update an existing row or insert a new one?

**Decision:** Append-only. Every price observation is a new row. A view (`current_prices`) gives the latest.

**Reasoning:**
- Time-series price data is valuable for trends, alerts, history.
- Updates would lose history. Storage is cheap; history is irreplaceable.
- A view performs well with `DISTINCT ON (product_id, store_id) ORDER BY observed_at DESC`.

---

## 2026-04-30 — Trinidad & Tobago (TTD) as the launch market

**Context:** Where do we launch?

**Decision:** T&T first. Caribbean expansion second. Global never (or very late).

**Reasoning:**
- Founder is local — fastest possible iteration with real users.
- Underserved market — no major price comparison app covers Caribbean chains.
- Smaller market = less noise, easier to grow word of mouth.
- Built-in test bed for store partnerships, given local relationships.

**Trade-offs accepted:**
- Smaller TAM than going US-first.
- Counter: building for Caribbean and expanding outward is a more defensible position than competing with Flipp/Basket head-on in the US.

---

## 2026-04-30 — Tailwind CSS v3 (not v4) with NativeWind

**Context:** Setting up NativeWind for the mobile app. `npm install tailwindcss` resolves to v4 by default.

**Decision:** Pin `tailwindcss@^3.4`. Do not upgrade to v4.

**Reasoning:**
- NativeWind v4 (latest stable) is built against the Tailwind v3 config and PostCSS pipeline. Tailwind v4 changed the config format (CSS-first via `@theme`) and the build flow; NativeWind has not shipped support yet.
- Installing Tailwind v4 alongside NativeWind v4 produces silent runtime failures (classes don't apply) — worse than a hard error.
- Trade-off: when NativeWind ships Tailwind v4 support, this is a planned upgrade. Until then, `tailwindcss` is a pinned dependency.

**Trade-offs accepted:**
- We're on Tailwind v3 longer than the broader web ecosystem.
- Periodically check NativeWind release notes — when they add v4 support, plan a migration session.

---

## 2026-04-30 — `--legacy-peer-deps` for the mobile workspace install

**Context:** `npm install` for `nativewind`/`zustand`/etc. fails on a peer-dep conflict: `expo-router` pulls `react-dom@19.2.5` (web-only, peerOptional), which demands `react@^19.2.5`, but Expo SDK 54 ships `react@19.1.0`.

**Decision:** Install with `--legacy-peer-deps`. The conflict is on a transitive web dependency we don't ship to mobile.

**Reasoning:**
- React Native does not consume `react-dom`. The conflict is theoretical for our shipping artifact.
- Forcing `react@19.2.5` would diverge from the Expo SDK 54 baseline and break native modules.
- Expected to self-resolve when Expo bumps its React pin, or when expo-router relaxes the peer.

**Trade-offs accepted:**
- npm prints peer-dep warnings on every install. Acceptable noise.
- CI must use the same flag.

---

## 2026-05-01 — Receipts require sign-in (Phase 1)

**Context:** `FEATURES.md` F6 originally framed receipt upload as "open to all users (guest or signed-in)." When implementing the schema we had to choose whether `receipts.user_id` was nullable.

**Decision:** Require sign-in. `receipts.user_id` is `NOT NULL` referencing `auth.users(id)`, RLS scopes every row to `auth.uid()`, and the storage bucket policy keys folders off the user id.

**Reasoning:**
- Receipts are the source-of-truth pipeline for user-attributed prices. Tying every contribution to an account is what makes future contribution rewards (F12) and provenance auditing possible at all.
- A nullable `user_id` would have meant a parallel "anonymous_uploads" code path with its own RLS surface — complexity for a flow we don't yet have a UX for.
- Sign-up is already low-friction (email/password); we surface a sign-in CTA on the upload screen rather than blocking with an error.

**Trade-offs accepted:**
- F6's "guest upload" framing is deferred. Re-open if data shows the sign-in wall measurably hurts contribution rate.
- Dev workaround: disable Supabase email confirmation in the dashboard until the deep-link handler ships.

---

## 2026-05-01 — Client-generated receipt UUID; storage upload before row insert

**Context:** Receipt rows live in `public.receipts`; image bytes live in private storage at `{user_id}/{receipt_id}.{ext}`. Need to decide which side mints the id, and which write happens first.

**Decision:** Generate the UUID client-side (`crypto.randomUUID`, with a manual fallback for older Hermes), upload the object first, then insert the row. If the insert fails, the client deletes the just-uploaded object.

**Reasoning:**
- Insert-first means we'd have a `receipts` row pointing at a nonexistent object whenever the upload fails — a visually broken state with no client-side cleanup path (RLS only lets the user touch their own row).
- Server-generated id (insert-first then upload) avoids the orphan problem only if we accept storing the path back via `update`, which doubles round trips and adds a window where `image_path` is null/incorrect.
- Upload-first with a known id keeps the failure mode bounded: an orphan object the client can delete immediately, and an idempotent retry just regenerates a new id.

**Trade-offs accepted:**
- A hard crash between upload and insert leaks one storage object (user can re-upload; cleanup job can sweep). Acceptable until volume warrants a periodic sweep.

---

## 2026-05-01 — Receipt OCR via Gemini API (free tier), not on-device ML Kit

**Context:** CLAUDE.md's tech stack picks Google ML Kit Text Recognition (on-device, free) for receipt OCR. When implementing Phase 2 we had to choose between honoring that pick or pivoting.

**Decision:** Use Gemini 2.5 Flash (free tier) over a Supabase Edge Function (`process-receipt`). The Edge Function pulls the image from private storage with the service role, calls Gemini with a structured-output schema, and writes the parsed line items + totals back to the DB.

**Reasoning:**
- ML Kit on-device requires a custom dev build (same gotcha as `react-native-vision-camera` listed in CLAUDE.md). We haven't crossed that bridge yet, and crossing it just for OCR would block Phase 2 by a session or two.
- Gemini returns *structured JSON* (line items, qty, prices, store, total) directly via `responseSchema`. ML Kit returns raw text that we'd then have to parse with regex — fragile on receipts that vary by store.
- Same architecture we'll reuse for circular parsing (F8 admin), so the Deno + Edge Function pattern earns its keep twice.
- Gemini 2.5 Flash free tier (15 req/min, 1500/day) is enough for development and early users. If we hit it, paid Gemini is ~$0.001/receipt — still cheaper than Claude vision and a one-line swap inside the Edge Function.
- Per the CLAUDE.md gotcha "always store raw text alongside parsed data," we dump the model's verbatim JSON into `receipts.ocr_text` so re-matching against a future product catalog doesn't require re-running OCR.

**Trade-offs accepted:**
- Free-tier data-use clause: Google may use submitted content for model improvement. Receipts can contain location data and (rarely) card-tail digits. If this becomes a launch blocker for T&T, the paid tier opts out and the cost is negligible.
- Network round trip per receipt: 5–15s vs. on-device "instant." UX mitigation: status polls every 4s while `processing`/`uploaded` and the upload screen navigates immediately to the detail screen.
- One more secret to manage (`GOOGLE_AI_API_KEY` as a Supabase function secret).
- This is a divergence from CLAUDE.md's stack table; CLAUDE.md should be updated to match next time it's touched.

---

## 2026-05-01 — Receipt status writes restricted to service_role

**Context:** Migration 0006 already excluded `status` from the `authenticated` UPDATE grant on `receipts`. Phase 2 added `ocr_text`, `processed_at`, `process_error`, `parsed_store_name`, `total_amount_minor_units`, `currency`, `receipt_date` — same question: who can write them?

**Decision:** All OCR-result columns are service-role-only (migration 0008 revokes UPDATE from `authenticated` and re-grants only `store_id, captured_at, notes`). The mobile client cannot mutate any field that represents the system's view of the receipt; it can only edit user-provided metadata.

**Reasoning:**
- `receipts` is the source of truth for user-attributed price contributions (Phase 4). If the client could overwrite `total_amount_minor_units` or `parsed_store_name`, contribution provenance is gone.
- The `receipt_items` table is fully service-role-write for the same reason — line items become `prices` rows in Phase 4, and we want one writer.
- Users edit `store_id` (manual store tagging) and `notes` (their own free-form text); those don't affect the contribution pipeline.

**Trade-offs accepted:**
- Any "user fixes a mis-parsed item" flow must go through an Edge Function (or accept that fixes happen by re-uploading). That's the right boundary, but it does mean a manual-correction UX needs server work, not just client work.

---

## 2026-05-01 — Receipt-item matching via pg_trgm, not Gemini

**Context:** Phase 2 ships line items as raw text. Phase 3 needs to map each `receipt_items.raw_text` to a `products.id`. Two viable approaches: trigram similarity in Postgres (`pg_trgm`), or another Gemini call asking the model to pick from a candidate list.

**Decision:** pg_trgm. Migration 0009 enables the extension, GIN-indexes `lower(name)` on `products` and `lower(alias)` on a new `product_aliases` table, and exposes a single SQL function `match_receipt_text(text)` returning the best `(product_id, confidence)` above a 0.30 floor. The Edge Function calls it once per inserted item and writes `matched_product_id` + `match_confidence`, flipping `needs_review = true` when confidence < 0.50.

**Reasoning:**
- Free. No API quota to spend on a problem trigram solves at MVP scale (10s of products today, low thousands at MVP).
- Fast and local. The matcher pass adds ~one round trip per item to Postgres; for a 30-item receipt that's tens of ms. Gemini-per-item would add 5–15s per receipt and burn the daily free-tier budget on receipts alone.
- `product_aliases` is the escape hatch for the cases trigram can't reach — receipt abbreviations like "HZ KTCHP". Aliases live in their own table so the matcher doesn't pollute the canonical product name, and the `source` column distinguishes admin-curated vs. user-corrected vs. auto-promoted entries.
- If quality turns out poor in practice, Phase 3.5 can layer Gemini on top: use trigram to shortlist top-N, then ask Gemini to pick. We're not locked in.

**Trade-offs accepted:**
- Trigram is a character-overlap algorithm; it doesn't understand semantics ("Coke" ≠ "Coca-Cola" until an alias exists). The `product_aliases` table is the manual workaround until we have enough corrections data to bootstrap automation.
- Per-item RPC instead of one set-based UPDATE: PostgREST can't cleanly LATERAL-join a setof-returning function, so the Edge Function loops in JS. Tens of ms per receipt — fine.
- 0.30 floor is pg_trgm's default threshold. Tightening it later is a one-line change to the SQL function.

---

## 2026-05-01 — Receipt-to-prices contribution thresholds and admin queue

**Context:** Phase 3 originally just matched line items to products. Mid-session the scope expanded: matched items should *also* contribute prices for their store, and unmatched items should be either auto-curated (when sane signals are present) or routed to an admin review queue.

**Decision:**
- **Confidence ≥ 0.50** (matched, no `needs_review`): contribute a `prices` row with `source='receipt'`, `receipt_item_id` linking back to the line item that produced it. No flag.
- **Confidence 0.30–0.50** (matched, `needs_review=true`): no price contribution. Flag `low_confidence`. Admin can confirm later, at which point a backfill writes the price.
- **Unmatched + metrics pass**: auto-create a `products` row, link the line item to it (with `match_confidence=null` so the UI can distinguish "auto-created" from "trigram match"), contribute a price, and flag `auto_created_product` so admin verifies the new catalog entry.
- **Unmatched + metrics fail**: flag `unmatched`, no DB writes beyond the queue row.
- All four paths converge on `flagged_items` rows where appropriate, so the admin queue is the single source of truth for "needs human attention." Resolution states (`confirmed | corrected | rejected | merged`) close the loop.

**Auto-create metric gate:**
- Receipt has a confident `store_id` (no orphan products with no provenance).
- `line_total_minor_units > 0`.
- `raw_text` length 3–80 chars.
- `raw_text` contains at least one letter (rejects pure-digit footer rows that slip past Gemini).

Within-receipt dedup keys off normalized `raw_text` so 3 instances of "MILK 1L" become one product, not three.

**Reasoning:**
- Hard floor at 0.50 for price contribution: a wrong price poisons the comparison feature for every user, while a missed contribution costs nothing — admin can backfill from `low_confidence` flags. Asymmetric cost → conservative threshold.
- Auto-create-with-flag (rather than always-flag) is the dial that shifts work off admins while preserving their ability to reject. The metric gate is intentionally tight; if spam appears in the catalog, tightening further is a one-line change. If admins are overwhelmed by manual curation, loosening is similarly small.
- `prices.receipt_item_id` is `ON DELETE SET NULL` so deleting a receipt unlinks but doesn't delete contributed prices — preserving the append-only invariant from the original `prices` decision.
- `flagged_items` is admin-RLS-only. The mobile UI doesn't need to know about flags; it just sees "matched" or "unmatched." Auto-created products show up matched on subsequent re-reads because the matcher picks them up.

**Trade-offs accepted:**
- Auto-creation can produce near-duplicate catalog entries when receipts use different abbreviations for the same item ("MILK 1L" and "WHL MILK 1L"). The admin `merge` resolution state is the cleanup path, and `product_aliases` is the prevention path going forward.
- Within-receipt dedup is verbatim-normalized; cross-spelling dedup ("MILK" vs "Milk 1L") is left to the admin.
- Receipt deletions don't propagate to auto-created products. If admin rejects an auto-created product, they delete it explicitly; flagged_items.auto_created_product_id goes null and the audit row remains.

---

## 2026-05-02 — Admin resolution writes go through an Edge Function, not loosened RLS

**Context:** F8 Phase 1 (admin panel) needs to drain `flagged_items`. The four resolution actions — `confirm`, `correct`, `reject`, `merge` — between them touch four tables that aren't admin-writable today: `receipt_items` (service-role-only writes per 0008), `prices` (insert by authenticated, but our model contributes from a server context), `products` (admin can update/delete already, but contextually tied to other writes), and `product_aliases` (service-role-only writes per 0009). We could either (a) add a constellation of admin write policies across all of these, or (b) put one Edge Function in front of the whole flow.

**Decision:** One Edge Function — `supabase/functions/resolve-flagged-item` — running with the service role. The admin Next.js app verifies session → POSTs the JWT and a `{ flaggedItemId, action, targetProductId? }` payload → the function re-checks `profiles.is_admin` against the JWT and runs all writes server-side. RLS for those four tables stays exactly as it is in 0008/0009/0010.

**Reasoning:**
- A single trust boundary. The mobile and admin apps share the same Supabase project; loosening RLS on `receipt_items` or `product_aliases` to admit admins would also have to be re-verified every time those policies are touched in the future. Centralizing the admin write story in one file makes it easier to audit.
- The actions are inherently multi-table and multi-step. `merge` updates a `prices` row, reassigns a `receipt_items` row, upserts a `product_aliases` row, and deletes a `products` row — and the order matters (prices update *before* the cascade-delete). That's a transaction-shaped problem, not a CRUD-shaped one. An Edge Function expresses it directly; an "RLS + client-side orchestration" version would have to implement the same ordering logic in TypeScript and recover from partial failures by hand.
- Mirrors the existing receipts pipeline. `process-receipt` already runs admin-side writes via the same JWT-bound-then-escalate pattern; `resolve-flagged-item` reuses the shape so there's exactly one mental model for "how does the server side of this app work."

**Trade-offs accepted:**
- An Edge Function call is one network hop slower than a direct SQL RPC. Resolution is a once-per-item action driven by a human click, so the latency is invisible.
- We do still need *some* admin SELECT policies — migration 0011 adds them on `receipts`, `receipt_items`, and `storage.objects` (receipts bucket) so the queue list and detail page can render. Reads-yes-writes-no is the asymmetry we're committing to.

---

## 2026-05-02 — service_role grants are explicit, not inherited

**Context:** First end-to-end test of `resolve-flagged-item` failed with `permission denied for table flagged_items` even though the function was authenticating with the service-role key. Inspecting `information_schema.role_table_grants` showed that `service_role` had only `REFERENCES`, `TRIGGER`, and `TRUNCATE` on every table in `public` — no `SELECT/INSERT/UPDATE/DELETE`. Default privileges on this project never granted CRUD to `service_role`, so every table created since session 1 inherited the empty set. RLS bypass on its own doesn't satisfy table-level GRANT checks; the function looked authorized but PostgREST denied the read.

**Decision:** Migration `0012_service_role_grants.sql` (a) backfills `select, insert, update, delete` for `service_role` on every public table the Edge Functions touch today, and (b) sets default privileges in schema `public` so any future table inherits the same grants automatically. Sequences get `usage, select` defaults too.

**Reasoning:**
- Every Edge Function this app will ever ship is going to write through service-role. Re-discovering this gotcha per migration is the kind of foot-gun you find at 2am.
- `alter default privileges in schema public grant ... to service_role` makes future migrations correct-by-default. New tables get the grants without each migration having to remember the dance.
- Constraining the migration to the tables we actually use today (rather than blanket-granting on `all tables in schema public`) keeps the diff auditable; future tables come in via the default.

**Trade-offs accepted:**
- Anyone reviewing this migration in isolation will see a broad-looking set of grants and wonder why. The migration's header comment captures the incident; this entry is the longer version.
- We don't fix the same problem for the legacy postgres role or for any other custom role. None exist on this project; if one is added later, the same pattern applies.

---

## 2026-05-02 — Gemini 2.5 Flash for circular parsing too (not Claude)

**Context:** Receipts use Gemini 2.5 Flash (DECISIONS.md 2026-05-01). Circulars are the next vision task — admins upload weekly grocery flyers and we need a structured product-and-price list from each one. The first instinct was Claude Opus 4.7 because circulars are layout-dense (multi-column tiles, overlaid prices, brand logos) and Claude's spatial reasoning is stronger.

**Decision:** Use Gemini 2.5 Flash with `responseSchema` for circulars too. Same env var (`GOOGLE_AI_API_KEY`), same Edge Function shape as `process-receipt`.

**Reasoning:**
- **Cost.** Gemini Flash free tier is 15 req/min, 1500/day — admin circular volume (one per store per week, tens to low hundreds at maturity) sits comfortably inside it at $0. Opus 4.7 at scan-volume would be cents-per-circular but real money once price-per-month is the unit, and the project is not in a position to add an Anthropic line item right now.
- **One vendor, one mental model.** Two vision providers means two env vars, two SDK shapes, two failure modes. Sticking with Gemini means the receipts and circulars functions share their structured-output discipline (`responseSchema`) and any future model upgrade is a one-line `GEMINI_MODEL` bump in two places.
- **Layout quality is good enough at MVP.** Gemini 2.5 Flash on a clear circular scan returns workable product-and-price lists. The admin reviews every row anyway — the parser is a typing assistant, not a final source of truth. If quality on a specific store's circular is poor in practice, the escape hatch is the existing **re-parse** button, or per-circular prompt tweaks.
- **Reversible.** If a future tier of work (e.g. autonomous price ingest with no admin review) ever requires better extraction, swapping in Claude is a one-function change to `parse-circular`.

**Trade-offs accepted:**
- Best-in-class vision is left on the table. We accept some extra admin correction work in exchange for $0 marginal cost.
- Free-tier data-use clause carries over: Google may use submitted content for model improvement. Circulars are public marketing material so this is largely moot, but worth noting.

---

## 2026-05-02 — circular_items as a separate table (not JSON inside circulars)

**Context:** Circulars produce N candidate products. Two ways to model the parsed output: (a) a JSON array on `circulars.parsed`, (b) a sibling `circular_items` table.

**Decision:** Sibling table. `circulars.parsed` stays around for the verbatim Claude response (debugging / re-matching), but the row-per-candidate state lives in `circular_items` with FK columns to `prices` and `products`.

**Reasoning:**
- Each candidate has independent review state — `pending` → `accepted | rejected`, plus `resolved_by`, `resolved_at`, `notes`. Mutating one entry inside a JSON array would mean read-modify-write of the whole array, with no row-level locking.
- On accept, we write a `prices` row and (if the admin didn't pick an existing product) a `products` row. Linking those back via `circular_items.contributed_price_id` and `contributed_product_id` gives us the same provenance trail receipts have via `prices.receipt_item_id` — admins can answer "where did this price come from?" by following one FK.
- Same structural shape the receipt pipeline uses (`receipt_items` table with per-row matching + flagged_items state). Two ingest paths, one mental model.

**Trade-offs accepted:**
- A few extra columns to maintain. Cheap.
- Two roundtrips to render the review page (circular + items). The page is server-rendered and admin-only, so latency budget is generous.

---

## 2026-05-05 — Store locations as a child table of `stores`

**Context:** Two scrapers landed (PriceSmart, SuperPharm). PriceSmart has 5 TT clubs and SuperPharm has 11 branches, each with independent stock and (sometimes) different prices. The current `stores` schema is one row per chain. Modelling each branch as a separate `stores` row would collapse the chain identity the compare-sheet renders today and fork the existing receipt/circular ingest paths (both of which talk about "the chain", not "the branch").

**Decision:** Add `store_locations (id, store_id, name, external_id, region, is_active, lat, lng, ...)` as a child table. Backfill one location per existing chain, named after the chain. Per-location pricing/availability is added in subsequent migrations as a nullable `store_location_id` on `prices` and an extended PK on `product_store_availability` — receipt and admin writes stay store-level (location null), scraper writes go location-level.

**Reasoning:**
- Keeps the chain as the unit of identity for everything that already exists. Mobile compare-sheet rows continue to read `stores`; per-location detail is opt-in.
- `external_id` per location lets re-scrapes find the right row in O(1) without fuzzy matching against names that differ across vendor APIs ("Port of Spain" vs "POS" vs "POS-1").
- A 1:1 backfill on day one means the migration is a pure schema change — no downstream breakage. Vendor-specific locations get added through the (forthcoming) admin Locations CRUD, not inside the migration. Scraped data has no business living in `migrations/`.
- `lat`/`lng` are nullable numerics rather than PostGIS — we don't have the extension enabled and the row count (~16) doesn't warrant it. Haversine in app code is fine for the future "nearest store" geofence.

**Trade-offs accepted:**
- Mobile compare-sheet has to grow per-location detail eventually ("3 of 5 locations have stock") — extra UI work later. Backward-compatible because `store_location_id` stays nullable.
- Two read paths for prices once 0022 ships: location-specific (when a `store_location_id` is set) and store-level (when null). The `current_prices` view will need a "prefer specific over general" rule when both exist for the same (product, store).

---

## 2026-05-05 — Per-UOM columns on `products`; defer formal `product_equivalents` table

**Context:** Scraped products carry unit-of-measure data (PriceSmart `weight` + `weight_uom`, SuperPharm `unit`) and PriceSmart sells some items by weight at the register (`sold_by_weight=1` — the displayed price is per lb, not per item). The compare-sheet's value goes up sharply if it can normalize $/100ml or $/100g across SKUs of different sizes, and if it can render PriceSmart's case packs ("$110 for case of 24 = $4.58 each") next to single-unit SKUs at other stores.

**Decision:** Add four nullable columns to `products`:
- `unit_size numeric` — size of one unit (500 for "500ml")
- `unit_of_measure text` — normalized to a small enum: `each | g | kg | ml | L | oz | lb`
- `is_sold_by_weight boolean default false` — when true, `prices.amount_minor_units` is per-UOM, not per-item
- `units_per_pack integer` — `>1` means case/multipack; UI renders per-unit breakdown

A separate `product_equivalents` table (formally linking "case of 24" to "single can") is **not** added now.

**Reasoning:**
- The columns are minimal, additive, nullable. Existing receipt and admin paths keep working without setting any of them.
- `units_per_pack` + `unit_size` + `unit_of_measure` give the compare-sheet enough information to render the per-unit breakdown at display time. No second source of truth, no equivalence-graph maintenance burden.
- A `product_equivalents` table would be valuable for "show me all variants of Heinz Ketchup across sizes" search results, but that's a different feature, not the price comparison. Worth building when that feature is on the roadmap, not before.
- `is_sold_by_weight` is a boolean rather than a separate `price_basis` enum because there are only two sane states at this point (per-item vs per-UOM); if a third ever appears, swap it.

**Trade-offs accepted:**
- "What's the equivalent single-unit price for this case?" stays a UI computation, not a queryable join. Acceptable — the compare-sheet is the only consumer.
- If two SKUs are identical contents in different pack sizes from the same brand, today they're separate `products` rows with no formal link. Search may show them as separate hits. Acceptable for MVP.

---

## 2026-05-05 — Sale data on `prices`, not `products`

**Context:** Scrapers (PriceSmart in particular) expose per-snapshot sale state: `original_price_without_saving`, `saving_amount`, `saving_expiration_date`, `promo_label`. We want to surface "on sale" badges in the compare-sheet, and longer-term keep room for vendor-supplied promo copy or paid placement.

**Decision:** Add three nullable columns to `prices`: `regular_amount_minor_units int`, `sale_ends_at timestamptz`, `promo_label text`. No `is_sale` boolean — sale state is derived as `regular_amount_minor_units IS NOT NULL AND regular_amount_minor_units > amount_minor_units`.

**Reasoning:**
- "On sale" is a property of a *snapshot in time*, not of a product. The same bottle of ketchup is on sale Tuesday and back to regular Wednesday. The append-only `prices` table is already snapshot-shaped — these columns belong there.
- No `is_sale` boolean: a derived predicate over two columns that already exist is one source of truth. A boolean introduces a way for "marked on sale but regular price ≤ current price" inconsistencies to creep in.
- `promo_label` is intentionally free-text. Vendor copy varies wildly ("BOGO", "Member's Sale", "Free Delivery"), and the same column doubles as the slot for future advertiser-supplied marketing copy without a schema change.
- SuperPharm exposes no sale data — its rows leave the columns null. That's fine; the absence isn't a falsehood.

**Trade-offs accepted:**
- "Has this product ever been on sale?" requires scanning history — no rollup column on `products`. Acceptable; if it becomes a hot query, materialize a view.
- SuperPharm sale detection has to be inferred from price-history dips. Deferred — when needed it's a view over `prices`, not new schema.

---

## 2026-05-05 — Scraper automation: out-of-repo scripts, persistent VPS, anon-JWT-bound ingest

**Context:** Scrapers for PriceSmart (Playwright + Bloomreach), SuperPharm (direct fetch), and Massy (WooCommerce REST) need to run on a schedule and feed their normalized output into Postgres without exposing service-role credentials or vendor headers, and without committing multi-MB JSON dumps to the repo.

**Decision:**
- Scraper scripts and their outputs live entirely **outside the repo** (in a local `scrapers/` folder, fully gitignored — see 2026-05-07 entry). The only contract between the runner and this codebase is the `ingest-scrape` Edge Function HTTP boundary.
- Scrapers run on a small persistent VPS (or a dev machine on cron during early days) — **not GitHub Actions**. Many retailer WAFs block GH IPs, Playwright on Actions is slow and flaky, and rotating IPs trips Bloomreach's bot detection.
- The runner authenticates as a single admin "scrape user" via Supabase email/password, holds an anon JWT, and POSTs normalized payloads to the `ingest-scrape` Edge Function. **No service-role key on the runner.** Service role only inside the function.
- Cadence (initial): daily delta scrape (price + availability) at 3am TT, weekly full catalog refresh on Sunday. Per-product enrichment (PriceSmart Phase 2) only for newly-seen SKUs.

**Reasoning:**
- Keeping scrapers fully out of git eliminates any chance of accidentally committing vendor cookies, session tokens, or scraped product data — even via a stray `git add .`. The HTTP boundary at `ingest-scrape` is the only seam the codebase needs to reason about, which makes the trust model trivial: anything inside the repo is scrutable, anything talking to the repo is admin-JWT-authenticated.
- Persistent VPS IPs don't trip retailer bot detection. GH Actions IPs do.
- Anon-JWT-bound runner mirrors the trust boundary already locked in for `manage-store` and `resolve-flagged-item`: client-side gets a JWT, server-side Edge Function re-checks admin and writes with service-role. No new pattern to learn or police.
- Daily/weekly cadence is conservative. Receipts + admin manual entry cover the gaps between runs; we never claimed real-time accuracy.

**Trade-offs accepted:**
- A VPS is a recurring (~$4/mo) operational cost we didn't have. Worth it for reliability.
- The runner is a separate process to monitor. We'll surface its status through the `scrape_runs` audit table so admins can see last-run state inside the existing admin app, not a separate dashboard.
- Vendor APIs will rotate. The runner's fetcher + normalize layers are vendor-specific and brittle; the ingest contract is stable, so a vendor change doesn't cascade into the codebase.

---

## 2026-05-07 — Flatten per-location vendor data at the runner, not the Edge Function

**Context:** The third vendor (Massy, WooCommerce REST) returns a single full-catalog scrape that contains per-location price/stock/availability for **all** of its 6 stores in one shot — every product carries a `locationMeta` array keyed by `locationId`. PriceSmart and SuperPharm, by contrast, emit per-location flat lists (one scrape run = one branch's snapshot). The `ingest-scrape` payload contract has to handle both shapes.

**Decision:** Each vendor's normalize step at the runner expands per-product per-location vectors into flat `(product, location, price, availability)` rows before POSTing. The Edge Function only ever sees one uniform row shape — no fan-out logic on the server side.

**Reasoning:**
- The Edge Function row-loop stays trivially shaped regardless of vendor — one upsert sequence per row, no special-cases. Future vendors only need to extend the runner, not the function.
- Compactness over the wire isn't a real constraint: the runner already pays the bandwidth cost of fetching the catalog, and the gzip ratio on flattened rows is high.
- The runner is the right place for vendor-specific shape knowledge anyway. The function is the trust boundary; trust boundaries should be small.

**Trade-offs accepted:**
- Massy's payload size grows ~6× (one row per product × 6 locations) compared to a vector-shaped payload. Acceptable — total bytes are still under ~50 MB gzipped for a full catalog.
- A single Massy scrape now writes ~6× the prices rows it used to (in the pre-location world). The append-only `prices` table is fine with this; partition by month if the row count ever becomes a concern.

---

## 2026-05-07 — Tighten scraper gitignore: scripts AND data both stay out of repo

**Context:** The earlier 2026-05-05 decision had scraper scripts tracked in the repo and only data dumps + `.env` files gitignored. When a third vendor's scripts were added the next day, it became clear the half-measure was the wrong shape: vendor headers, consumer keys, and Bloomreach session details were sitting in committable files.

**Decision:** `scrapers/` at the project root is now fully gitignored. Both scripts and outputs live there; nothing under `scrapers/` is tracked. Any code artifact related to scraping that *should* be tracked (Edge Functions, payload types, migrations) lives under `supabase/`, `admin/`, or `mobile/`.

**Reasoning:**
- One clean rule (`scrapers/`) is harder to violate accidentally than a wildcard list (`scrapers/**/*.json`, `scrapers/**/.env`, ...). When a new vendor or new file type appears in `scrapers/`, the rule still holds — no gitignore edit needed.
- The runner's vendor-specific code is genuinely a different concern from the codebase: it's per-host setup, runs on its own schedule, and has its own deploy lifecycle. Treating it as an isolated subtree is honest.
- The `ingest-scrape` HTTP boundary is the only contract that matters for the codebase to reason about. Everything else is "the runner's problem."

**Trade-offs accepted:**
- Scraper scripts no longer benefit from PR review or version history inside this repo. Acceptable — the runner is owned by a single operator (the project owner) and its iteration speed matters more than its review process. If multi-operator scraping ever happens, a separate private repo is the answer, not re-tracking inside this one.
- Code-share between vendors (a hypothetical `scrapers/lib/normalize.ts`) is on the runner side, not visible from the codebase. Acceptable — the ingest contract is the share point.

---

## Template for future entries

```markdown
## YYYY-MM-DD — [Decision title]

**Context:** What problem we're solving.

**Decision:** What we chose.

**Reasoning:** Why we chose it. List the alternatives considered.

**Trade-offs accepted:** What we're giving up.
```
