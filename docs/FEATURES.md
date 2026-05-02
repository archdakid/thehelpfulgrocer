# Features

> **MVP = the smallest thing we can ship that delivers real value.** Everything outside MVP is explicitly deferred. When in doubt, defer.

---

## MVP — Phase 1 (the launch)

### F1. Grocery list

The core list experience. Must be exceptional even in isolation.

**User stories:**
- As a guest, I can add items to a list without signing up
- As a user, I can add items via barcode scan, search, or manual text entry
- As a user, I can check items off as I shop
- As a user, I can see my running total at all times (sticky footer)
- As a user, I can see the total split between "remaining" and "in cart"
- As a user, I can swipe to delete an item
- As a user, I can change quantities
- As a user, I can clear all checked items in one action

**Acceptance criteria:**
- List supports 100+ items with no scroll lag
- Running total updates instantly on check/uncheck
- Empty state has a clear CTA to scan or add an item
- Items with no price show "Price unknown" instead of $0

### F2. Barcode scanning

**User stories:**
- As a user, I can scan a barcode by opening the scanner from the tab bar
- As a user, scanning a known product immediately shows me its price comparison
- As a user, scanning an unknown product gives me the option to name it manually
- As a user, I can toggle the flashlight while scanning

**Acceptance criteria:**
- Scanner ready in <1.5s from tap
- Detection in <500ms once barcode is in frame
- UPC lookup hits Supabase first, falls back to Open Food Facts
- Failed scans gracefully prompt for manual entry, never dead-end

### F3. AI vision product recognition

**User stories:**
- As a user, I can switch the scanner to "vision mode" to identify products without a barcode
- As a user, I can frame a product within a guided rectangle
- As a user, I get the same price comparison popup whether I scanned the barcode or used vision
- As a user, captured product images are flagged for admin review (I don't see this, it just happens)

**Acceptance criteria:**
- Frame visible with corner brackets, semi-opaque overlay outside
- ML Kit on-device recognition runs at >5 fps
- Capture button works on a single tap
- If recognition confidence is low, fall back to manual naming, capture image for admin review
- Original + rembg-processed images both stored

### F4. Price comparison popup

The killer feature. Has to feel magical.

**User stories:**
- As a user, when I scan or tap an item, I see its price at every supported store in my region
- As a user, the cheapest store is clearly highlighted
- As a user, I can see when each price was last updated
- As a user, I can flag a wrong price ("This isn't right")

**Acceptance criteria:**
- Bottom sheet animation in <300ms
- Stores sorted cheapest → most expensive
- "Best price" badge on the cheapest, with savings vs. current store
- Stale prices (>14 days old) shown in muted color with timestamp
- "Report wrong price" link present and functional

### F5. Store selection & detection

**User stories:**
- As a user, I can pick which store I'm shopping at from a horizontal list at the top of the screen
- As a user, if I grant location permission, the app suggests the store I'm at
- As a user, if I deny location, I can still pick manually with no friction
- As an admin, I control the full list of supported stores

**Acceptance criteria:**
- Store pills always visible at top of list screen
- Geofence detection accurate within 200m radius
- Location prompt happens on first scan, not on app launch
- Denying location does not block any feature

### F6. Receipt scanning (signed-in users)

> **Phases 1–3 shipped (2026-05-01):** capture + upload (16) → Gemini OCR + line-item extraction (16b) → trigram matching + price contribution + admin queue (16c). Receipts now move through the full pipeline; matched items contribute to the price comparison feature, unmatched-with-metrics auto-create catalog entries, and everything else routes to `flagged_items` for admin review.
> **Sign-in requirement:** see DECISIONS.md (2026-05-01). The "guest upload" framing in the original spec is deferred.

**User stories:**
- As a signed-in user, I can capture a photo of my receipt after shopping
- As a user, I can see my receipt history
- As a user, I get a confirmation that my contribution is helping the database (post-OCR)
- The system OCRs the receipt and matches line items to products

**Acceptance criteria:**
- Receipt upload requires sign-in (RLS-scoped private storage bucket)
- OCR runs as Edge Function in <30s
- Matched items insert into prices table automatically
- Unmatched items go to admin flagged_items queue
- User sees a friendly "Thanks for contributing!" screen with their match count

### F7. Nutritional facts panel

**User stories:**
- As a user, I can tap an item to see its nutritional information
- As a user, the panel shows calories, fats, carbs, sugars, protein, sodium at minimum
- As a user, the source of the data is shown (Open Food Facts vs. admin-curated)

**Acceptance criteria:**
- Collapsible panel within the product detail sheet (not a separate screen)
- Pulls from Open Food Facts on first lookup, caches in our DB
- Admin can override or add nutritional data for products not in OFF
- "Nutrition data not available" state is graceful

### F8. Admin panel — basic

> **Phase 1 shipped (2026-05-02):** `flagged_items` review queue at `admin/` (Next.js 15 + `@supabase/ssr`) — list with reason filters, per-item detail with receipt-image preview, four resolution actions (`confirm` / `correct` / `reject` / `merge`) routed through the `resolve-flagged-item` Edge Function. Phases 2+ (stores CRUD, circulars, image candidates, bulk actions) are still ahead.

The minimum admin needs to keep the app running.

**Admin stories:**
- As admin, I can add/edit/disable stores
- As admin, I can upload a circular PDF/image and see parsed prices to review
- As admin, I can review the flagged items queue
- As admin, I can review and approve product image candidates
- As admin, I can override nutritional data
- As admin, I can manage user reports of wrong prices

**Acceptance criteria:**
- Web-based, behind auth + admin role check
- Bulk approve/reject for flagged items
- Image review shows original + processed side-by-side with one-click decisions
- Circular parser shows confidence per line item, allows quick edits before bulk-import

### F9. Cross-store browsing

**User stories:**
- As a user, I can change the active store and see what my list would cost there
- As a user, I see "Switch to [store] and save $X" suggestions when applicable

**Acceptance criteria:**
- Store switch updates all prices instantly (no refetch flicker)
- Total recalculates immediately
- Savings suggestion appears only when ≥10% cheaper

---

## Phase 2 — post-MVP, planned

### F10. User accounts & saved lists
- Sign up via email/password or social (Apple, Google)
- Multiple named lists (Weekly, Costco run, Birthday party)
- List sharing with household members

### F11. Price alerts
- Set target price for any product
- Push notification when any tracked store hits the target

### F12. Contribution rewards
- Badges for receipts contributed, items added, prices verified
- Leaderboard (opt-in)
- Unlock a "Verified Contributor" status after N quality contributions

### F13. Smart suggestions
- "You usually buy this every 2 weeks" reminders
- "These items are cheaper this week at [store]" weekly digests
- Based on receipt history, never on creepy tracking

### F14. Web app (responsive, no scanner)
- Browse stores, manage lists, view circulars
- Full feature parity except scanning
- Built on Next.js, shares Supabase backend

### F15. Multi-list management
- Multiple active lists (Groceries, Pharmacy, Hardware)
- Quick switcher

---

## Phase 3 — future, conditional on MVP traction

### F16. Recipe → list integration
- Import a recipe URL or paste text
- Extract ingredients, add to list with quantities

### F17. Pantry tracking
- Mark what you have at home
- Auto-decrement based on receipt scans
- "You're running low on X" suggestions

### F18. Meal planning
- Weekly meal plan view
- Auto-generate list from planned meals

### F19. Loyalty card management
- Store loyalty cards (Massy Card, etc.)
- Show during checkout
- Apply known member-only discounts

### F20. Featured store placements (monetization)
- Stores pay for highlighted positioning in price comparison
- Always clearly labeled
- Never overrides "best price" — additive only

### F21. Aggregated price trend data (B2B)
- Anonymized price trend reports for FMCG brands or analysts
- Long-term revenue play

---

## Explicitly NOT building

These are common requests we will decline. Document them here so we can point at this list:

- ❌ Online ordering / delivery (we point users to the store's own app/site)
- ❌ Coupon clipping & management (Flipp does this well already)
- ❌ Recipe database (defer to Phase 3, MVP focuses on price intelligence)
- ❌ Calorie tracking / fitness integration (out of scope)
- ❌ Multi-currency (Phase 2+ at earliest, T&T only at launch)
- ❌ Multi-language (Phase 2+ at earliest, English only at launch)
- ❌ Native macOS/Windows apps (web app covers desktop in Phase 2)
- ❌ Apple Watch / Wear OS (Phase 3+ if at all)
- ❌ User-to-user messaging or social features
- ❌ Image-based "what does this look like" search (vision recognition handles this)

---

## Success criteria per feature (don't ship without these)

A feature is considered "done" only when:

1. **Works on iPhone SE** (smallest target screen)
2. **Works on Android** (Pixel 5 or equivalent reference device)
3. **Has no TypeScript errors** in strict mode
4. **Has loading, empty, error states** explicitly designed
5. **Has analytics events** for the key user actions (Phase 5+ for events, just stub the calls in MVP)
6. **Has been tested by at least one real user** (you, a friend, anyone non-technical)
7. **Is documented in the README** if it changes any setup or commands
