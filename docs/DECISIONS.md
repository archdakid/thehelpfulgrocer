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

## Template for future entries

```markdown
## YYYY-MM-DD — [Decision title]

**Context:** What problem we're solving.

**Decision:** What we chose.

**Reasoning:** Why we chose it. List the alternatives considered.

**Trade-offs accepted:** What we're giving up.
```
