# Project status

> Single source of truth for what's done, what's in progress, and what's next.
> Updated at the end of every session. Read this first when restarting.

Last updated: **2026-05-01** (end of Session 12 — Profiles table + admin role).

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

### Auth + settings (Session 11)
- [x] `useAuthStore` (zustand) + `useAuth()` hook backed by Supabase auth events
- [x] Real `app/auth/sign-in.tsx` and `app/auth/sign-up.tsx` (email/password)
- [x] Settings rebuilt: Account section (signed-in profile + sign-out, or sign-in / create-account CTAs) + Appearance section (Light / Dark / Auto theme picker)
- [x] Theme preference persisted in `useUIStore` and applied via NativeWind `colorScheme.set()` at app boot

### Profiles + admin role (Session 12)
- [x] Migration `0005_profiles.sql`: `profiles` table (FK to `auth.users.id`), `handle_new_user` trigger that auto-creates a row at sign-up, RLS (own-row read + update), column-level UPDATE grant on `display_name` only — `is_admin` is SQL-only
- [x] `useProfile` / `useUpdateProfile` hooks (React Query)
- [x] Settings: editable display-name field (auto-saves on blur) and an Admin pill next to the email when `is_admin = true`

### Features (per `docs/FEATURES.md`)
- [x] **F1 — Grocery list** (local-only, AsyncStorage persistence, swipe-delete, qty stepper, sectioned)
- [x] **F4 — Price comparison popup** (delivered as both product detail and the compare-stores sheet)
- [x] **F5 — Store selection** (pill picker on List, persisted active store)
- [x] **F9 — Cross-store browsing** (active-store filter on list rows, savings callout, compare sheet)

---

## In progress / explicit stubs in code

These are working code paths but stub behavior — they render, they don't do the full thing yet.

- **Receipts tab** — placeholder screen ("No receipts yet"). F6 is the build-out.
- **Scan tab** — stub. Real camera flow needs a dev build (per `CLAUDE.md` gotcha).
- **Auth email confirmation** — sign-up surfaces a "check your email" message; the actual confirmation/redirect flow is whatever Supabase has configured for the project (no deep-link handler in the app yet).
- **Browse search field** — visual affordance only; tap is a no-op TODO.
- **Browse "Often Bought" chips** — visual only; tap is a no-op TODO.
- **Category sort selector** — labeled "Sort: A → Z" but tap is a no-op TODO. Default sort is alphabetical.
- **Save TT$X callout in running-total card** — works in at-store mode; hidden in Cheapest mode (correct).
- **`/store/[id]` screen** — orphaned (no longer reachable from Browse, but the route still works for direct nav).

---

## Open MVP gaps (next-up candidates)

Roughly in order of likely impact:

1. **Open Food Facts integration + nutrition panel** — adds nutrition data to product detail (F7) and lets the catalog grow without admin work. Foundation for camera-mode product matching.
2. **Receipt scanning (F6)** — Storage + Edge Function + ML Kit OCR + matcher. Big.
3. **Camera scanning (F2/F3)** — needs a custom dev build (`react-native-vision-camera` + `vision-camera-code-scanner`). Out-of-scope until then.
4. **Polish round** — global product search, category filter chips (needs subcategory schema), "Often Bought" wired to receipt history, "On list" entrance animation.
5. **Admin panel (`admin/`)** — separate Next.js app. F8. Now unblocked: `profiles.is_admin` is the gate.
6. **Auth deep-link handler** — for Supabase email confirmation; deferred until closer to launch. Workaround for dev: disable email confirmation in the Supabase dashboard.

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
                                    └── feature/compare-stores-sheet
                                        └── feature/auth-scaffold
                                            └── feature/profiles-table  (current)
```

When ready to consolidate: merge each in order into `main`, or squash-merge groups (foundation → design pass → backend → features).
