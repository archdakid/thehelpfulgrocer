# SmartShopper

> Mobile-first grocery list and price comparison app for the Caribbean.

Build a shopping list, scan barcodes or use AI vision to identify products, see prices across all supported stores in real time, and contribute receipt data to keep prices accurate.

---

## Repository structure

```
smartshopper/
├── mobile/      # Expo React Native app (iOS + Android)
├── admin/       # Next.js admin panel (web)
├── supabase/    # Database migrations + Edge Functions
├── docs/        # Project documentation — read these first
├── CLAUDE.md    # Instructions for Claude Code sessions
└── README.md    # This file
```

---

## Getting started

### Prerequisites

- Node.js v20 LTS or newer
- Git
- A Supabase account (free tier is enough)
- An Expo account (free tier is enough)
- For mobile testing: Expo Go app on your phone (Phase 1) OR a real device with Xcode/Android Studio (Phase 2+)

### First-time setup

```bash
# Clone
git clone <repo-url>
cd smartshopper

# Install dependencies (mobile)
cd mobile
npm install

# Install dependencies (admin)
cd ../admin
npm install

# Install Supabase CLI globally
npm install -g supabase

# Link to your Supabase project
cd ..
supabase link --project-ref <your-project-ref>

# Apply migrations to your Supabase project
supabase db push

# Generate types for the mobile app
supabase gen types typescript --linked > mobile/types/database.ts
```

### Environment variables

**`mobile/.env.local`:**
```
EXPO_PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
EXPO_PUBLIC_OPENFOODFACTS_USER_AGENT=SmartShopper/0.1.0 (contact@example.com)
```

**`admin/.env.local`:**
```
NEXT_PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>     # SERVER-SIDE ONLY
ANTHROPIC_API_KEY=<your-anthropic-api-key>            # for circular parsing
```

**Never commit `.env.local` files.** They are in `.gitignore`.

---

## Running the apps

### Mobile

```bash
cd mobile
npx expo start
```

Then:
- Press `i` to open iOS simulator
- Press `a` to open Android emulator
- Or scan the QR code with Expo Go on your phone

For features that need native modules beyond Expo Go (camera, vision):
```bash
npx expo run:ios       # builds a custom iOS dev client
npx expo run:android   # builds a custom Android dev client
```

### Admin panel

```bash
cd admin
npm run dev
# → http://localhost:3000
```

### Supabase (local)

```bash
supabase start         # runs Postgres + Studio + Functions locally
# Studio: http://localhost:54323
# DB:     localhost:54322
supabase stop          # stops everything
```

---

## Development workflow

1. **Read** the relevant doc in `/docs/` before changing code.
2. **Branch** off main: `git checkout -b feature/short-description`
3. **Code, test, commit** in small chunks.
4. **Type-check before pushing:** `npm run typecheck` in both `mobile/` and `admin/`.
5. **Open a PR**, fill in the description, request review.

For Claude Code sessions, see `CLAUDE.md` at the root.

---

## Documentation

| Doc | What's in it |
|---|---|
| [`docs/PROJECT_OVERVIEW.md`](docs/PROJECT_OVERVIEW.md) | What we're building, why, who it's for |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Tech stack, folder structure, data flows |
| [`docs/FEATURES.md`](docs/FEATURES.md) | Feature list by phase, acceptance criteria |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Full Supabase schema, RLS, triggers |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Colors, typography, components, motion |
| [`docs/CODING_STANDARDS.md`](docs/CODING_STANDARDS.md) | TS rules, naming, patterns, anti-patterns |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Why we chose X over Y (append-only) |

---

## Key external services

| Service | Free tier | What we use it for |
|---|---|---|
| Supabase | 500MB DB, 50K MAU, 1GB storage | Postgres, Auth, Storage, Edge Functions |
| Open Food Facts | Free, no auth | Product UPC lookup + nutritional data |
| Anthropic Claude API | Pay-as-you-go (low usage) | Parsing weekly circulars (admin batch) |
| Expo EAS | 30 builds/mo | iOS + Android dev/prod builds |
| Vercel | Free tier | Admin panel hosting |
| Sentry | 5K errors/mo | Crash and error tracking |

---

## Troubleshooting

### "Cannot find module 'database.ts'"
Run: `supabase gen types typescript --linked > mobile/types/database.ts`

### Camera doesn't work in Expo Go
Expected — `react-native-vision-camera` requires a custom dev client. Run `npx expo run:ios` or `npx expo run:android`.

### Supabase RLS errors when querying tables
Test as both anonymous and authenticated. Each table has explicit RLS policies — see `docs/DATA_MODEL.md`.

### "Module not found: expo-image"
Run `npm install` and restart the Metro bundler. Always use `expo-image`, never the default `Image`.

---

## License

[Decide before launch — recommend MIT for the code, with explicit notice that the SmartShopper trademark and product imagery are reserved.]
