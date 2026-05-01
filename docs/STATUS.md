# Project status

> Single source of truth for what's done, what's in progress, and what's next.
> Updated at the end of every session. Read this first when restarting.

Last updated: **2026-05-01** (end of Session 10 — Compare-stores sheet).

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

### Features (per `docs/FEATURES.md`)
- [x] **F1 — Grocery list** (local-only, AsyncStorage persistence, swipe-delete, qty stepper, sectioned)
- [x] **F4 — Price comparison popup** (delivered as both product detail and the compare-stores sheet)
- [x] **F5 — Store selection** (pill picker on List, persisted active store)
- [x] **F9 — Cross-store browsing** (active-store filter on list rows, savings callout, compare sheet)

---

## In progress / explicit stubs in code

These are working code paths but stub behavior — they render, they don't do the full thing yet.

- **Receipts tab** — placeholder screen ("No receipts yet"). F6 is the build-out.
- **Settings tab** — still the original stub. Will absorb a Profile row when auth ships (per `design/NOTES.md`).
- **Scan tab** — stub. Real camera flow needs a dev build (per `CLAUDE.md` gotcha).
- **Browse search field** — visual affordance only; tap is a no-op TODO.
- **Browse "Often Bought" chips** — visual only; tap is a no-op TODO.
- **Category sort selector** — labeled "Sort: A → Z" but tap is a no-op TODO. Default sort is alphabetical.
- **Save TT$X callout in running-total card** — works in at-store mode; hidden in Cheapest mode (correct).
- **`/store/[id]` screen** — orphaned (no longer reachable from Browse, but the route still works for direct nav).

---

## Open MVP gaps (next-up candidates)

Roughly in order of likely impact:

1. **Auth (Supabase email/password)** — unblocks user-specific features (saved lists, contributions, admin role check). Profile row inside Settings lands here.
2. **Open Food Facts integration + nutrition panel** — adds nutrition data to product detail (F7) and lets the catalog grow without admin work. Foundation for camera-mode product matching.
3. **Receipt scanning (F6)** — Storage + Edge Function + ML Kit OCR + matcher. Big.
4. **Camera scanning (F2/F3)** — needs a custom dev build (`react-native-vision-camera` + `vision-camera-code-scanner`). Out-of-scope until then.
5. **Polish round** — global product search, category filter chips (needs subcategory schema), "Often Bought" wired to receipt history, "On list" entrance animation.
6. **Admin panel (`admin/`)** — separate Next.js app. F8.

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
                                    └── feature/compare-stores-sheet  (current)
```

When ready to consolidate: merge each in order into `main`, or squash-merge groups (foundation → design pass → backend → features).
