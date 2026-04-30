# Design system

> **The goal is a calm, professional, fast-feeling app.** Not flashy. Not gamified. Not cluttered. Every visual choice should make the next interaction feel obvious.

---

## Design principles

1. **Information hierarchy is everything.** The price is more important than the brand name. The brand name is more important than the description. Design accordingly.
2. **One screen, one job.** Don't cram. If a screen has more than one primary action, it's two screens.
3. **Thumb-zone first.** Critical actions live in the lower 60% of the screen. Top of screen is for navigation only.
4. **Speed over polish.** A 1-frame snap is better than a 300ms animation. We use animation to communicate state, never to decorate.
5. **Real content, real screens.** Loading states, empty states, error states are designed first-class — not afterthoughts.
6. **Local-first feel.** The app should work like it has the data already. Optimistic UI, instant feedback, sync in background.

---

## Color system

We use semantic color tokens, not hardcoded hex values. All defined in `mobile/constants/colors.ts` and Tailwind config.

### Brand colors

| Token | Light | Dark | Use |
|---|---|---|---|
| `brand.primary` | `#0F6E56` | `#5DCAA5` | Primary actions, brand identity |
| `brand.primary-fg` | `#FFFFFF` | `#04342C` | Text on primary bg |
| `brand.accent` | `#EF9F27` | `#FAC775` | "Best price" highlights, savings indicators |

The teal evokes freshness/produce. The amber evokes value/savings. Both work on light and dark backgrounds.

### Surface colors

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg.canvas` | `#FAFAF7` | `#0F0F0E` | Screen background |
| `bg.surface` | `#FFFFFF` | `#1A1A18` | Cards, sheets, raised UI |
| `bg.muted` | `#F1EFE8` | `#2C2C2A` | Subtle dividers, disabled states |
| `bg.scrim` | `rgba(0,0,0,0.5)` | `rgba(0,0,0,0.7)` | Modal backdrop, camera overlay |

### Text colors

| Token | Light | Dark | Use |
|---|---|---|---|
| `text.primary` | `#1A1A18` | `#F5F5F0` | Body text, headings |
| `text.secondary` | `#5F5E5A` | `#B4B2A9` | Subtitles, metadata |
| `text.tertiary` | `#888780` | `#888780` | Hints, placeholders |
| `text.inverse` | `#FFFFFF` | `#0F0F0E` | Text on colored backgrounds |

### Semantic colors

| Token | Light | Dark | Use |
|---|---|---|---|
| `success` | `#0F6E56` | `#5DCAA5` | Confirmations, "in stock" |
| `warning` | `#BA7517` | `#EF9F27` | Stale data, caution |
| `danger` | `#A32D2D` | `#E24B4A` | Errors, "report wrong price" |
| `info` | `#185FA5` | `#85B7EB` | Informational banners |

### Border colors

| Token | Light | Dark | Use |
|---|---|---|---|
| `border.default` | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.10)` | Most dividers, card edges |
| `border.strong` | `rgba(0,0,0,0.16)` | `rgba(255,255,255,0.20)` | Emphasized borders, hover |
| `border.focus` | `brand.primary` | `brand.primary` | Focus rings on inputs |

**Rules:**
- Use 0.5px borders where possible (renders at 1 device pixel on @2x/@3x screens — feels crisper).
- Borders should be `border.default` by default. Reserve `border.strong` for hover/focus.
- Never use solid black or solid white for borders.

---

## Typography

System font, not custom. We rely on each platform's native font stack for performance and familiarity.

```ts
fontFamily: {
  sans: Platform.select({
    ios: 'System',                   // San Francisco
    android: 'Roboto',
  }),
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
  }),
}
```

### Type scale

| Token | Size | Line height | Weight | Use |
|---|---|---|---|---|
| `display` | 32 | 38 | 600 | Big numbers, totals |
| `h1` | 24 | 30 | 600 | Screen titles |
| `h2` | 20 | 26 | 600 | Section headings |
| `h3` | 17 | 22 | 600 | Card headings |
| `body` | 16 | 22 | 400 | Default body |
| `body-sm` | 14 | 20 | 400 | Secondary info |
| `caption` | 12 | 16 | 400 | Metadata, timestamps |
| `mono` | 14 | 20 | 500 | Prices, codes |

**Rules:**
- Only two weights: 400 (regular) and 600 (semibold). No 500, no 700.
- Prices are always rendered in `mono` size with `tabular-nums` enabled — alignment matters.
- Line height matters as much as font size. Tight type is hard to read on a moving phone.
- Respect system font scaling: `allowFontScaling` defaults to true. Cap at 1.3× for UI elements that would break if too large.

---

## Spacing

8-point grid. Everything snaps to multiples of 4.

| Token | Value | Use |
|---|---|---|
| `0.5` | 2 | Hairline gaps |
| `1` | 4 | Tight in-line gaps |
| `2` | 8 | Default in-component spacing |
| `3` | 12 | Component-internal padding |
| `4` | 16 | Card padding, list row padding |
| `6` | 24 | Section spacing |
| `8` | 32 | Large section breaks |
| `12` | 48 | Screen edge padding (rarely) |

Default screen horizontal padding: `4` (16px).
Default card padding: `4` (16px).
Default list row vertical padding: `3` (12px).

---

## Border radii

| Token | Value | Use |
|---|---|---|
| `sm` | 6 | Tags, small chips |
| `md` | 10 | Inputs, small cards |
| `lg` | 16 | Cards, sheets, buttons |
| `xl` | 24 | Hero cards, large sheets |
| `full` | 9999 | Pills, avatars |

---

## Component patterns

### Button

Three variants. No others without explicit reason.

| Variant | Bg | Border | Text | Use |
|---|---|---|---|---|
| `primary` | `brand.primary` | none | `brand.primary-fg` | The one main action on the screen |
| `secondary` | `bg.surface` | `border.default` | `text.primary` | Secondary actions |
| `ghost` | transparent | none | `brand.primary` | Tertiary actions, navigation |

Sizes: `sm` (32px), `md` (44px), `lg` (52px). Default to `md`. Buttons are full-width by default in primary use; explicit `width="auto"` for inline buttons.

**States:** rest, pressed (scale 0.97), disabled (opacity 0.4), loading (replace label with spinner).

### Card

```
bg.surface
border 0.5px border.default
border-radius lg (16)
padding 4 (16)
```

No shadow by default. Shadow only when card is being dragged or otherwise needs to feel detached.

### List item row

The most common UI pattern in this app — needs to be perfect.

```
flex-row, items-center
padding-vertical 3 (12)
padding-horizontal 4 (16)
border-bottom 0.5px border.default
min-height 56 (large enough for tap target)
```

Layout:
```
[image 40x40]  [name + brand+size, flex-1]  [price + indicator]  [chevron]
```

### Bottom sheet

Always animated in via `react-native-reanimated`.

```
bg.surface
border-radius xl (24) on top corners only
max-height 85% of screen
drag handle: 4x36 muted bar at top
content padding 4 (16)
safe-area aware on bottom
```

Open/close: spring animation, 300ms target.
Backdrop: `bg.scrim`, fade in/out 200ms.
Always dismissible by drag-down OR tap-outside.

### Input

```
height 44
border 0.5px border.default
border-radius md (10)
padding-horizontal 3 (12)
font body
text text.primary
placeholder text.tertiary
```

Focus state: `border.focus` color, no shadow ring (avoids a flicker on streaming).

### Badge

Small pill for status, savings, "best price" labels.

```
padding 1px 6px
border-radius full
font caption (12px) weight 600
```

Color combos:
- `success`: bg `success` at 12% opacity, text `success`
- `warning`: bg `warning` at 12% opacity, text `warning`
- `danger`: bg `danger` at 12% opacity, text `danger`
- `accent`: bg `brand.accent` at 18% opacity, text `brand.accent`

---

## Iconography

- **Primary set:** Lucide React Native icons (`lucide-react-native`).
- **Sizes:** 16, 20, 24. Default 20.
- **Stroke width:** 2 (Lucide default). Don't customize.
- **Color:** inherit from parent text color.

When Lucide doesn't have an icon, use a custom SVG in `mobile/assets/icons/` — never an image file.

---

## Empty states

Every screen with a list has an empty state designed:

```
[icon, 48px, text.tertiary]
[h3 heading]
[body-sm secondary text]
[primary button if there's a clear action]
```

Examples:
- **Empty list**: "Your list is empty" + "Scan an item or search to get started" + [Scan] button
- **No prices yet**: "We don't have prices for this product yet" + "Be the first — upload a receipt" + [Upload receipt]
- **No matching products**: "No products found" + "Try a different search or scan the barcode"

---

## Loading states

Skeleton screens, never spinners alone.

- **List loading**: 5 ghost rows with shimmer
- **Card loading**: same shape as the eventual card, with muted background
- **Inline loading** (e.g., refreshing prices): small spinner next to the timestamp, no full overlay

Spinner allowed for: button loading state, in-flight operations <2s.

---

## Error states

Three categories:

1. **Inline**: a banner above the affected content. Not blocking. Has retry.
2. **Full-screen**: only for total app failure (network gone, auth broken). Shows what's wrong, what to try.
3. **Toast**: ephemeral, for non-critical errors ("Couldn't refresh, showing cached prices").

Toast: bottom of screen, dismisses in 4s, stack max 3.

---

## Motion

| Action | Duration | Easing |
|---|---|---|
| Bottom sheet open/close | 300ms | spring (damping 18, stiffness 180) |
| Item check toggle | 150ms | ease-out |
| Tab switch | instant (no animation) | — |
| Screen transition | platform default | platform default |
| Skeleton shimmer | 1.2s loop | linear |
| Pressed state | 100ms | ease-out |

**Rule:** if the user is waiting on the animation to use the next thing, the animation is too long.

**`prefers-reduced-motion`:** respect it. Long-form animations should fall back to instant.

---

## Accessibility

Non-negotiable:

- All interactive elements have `accessibilityLabel` and `accessibilityRole`.
- All images have `accessibilityLabel` (or `accessibilityElementsHidden` if decorative).
- Tap targets minimum 44×44 (use `hitSlop` if visual is smaller).
- Focus rings on all focusable elements.
- Color is never the only signal — pair with icon, text, or shape.
- Test with iOS VoiceOver and Android TalkBack at least once before any feature ships.

---

## Dark mode

The app supports both. **Always design both at the same time.** Don't ship a feature with only light mode.

- Test every screen in dark mode before merging.
- Avoid pure black backgrounds — `bg.canvas` is `#0F0F0E` in dark, deliberately not `#000`. Pure black creates harsh contrast and OLED smearing.
- Avoid pure white text — `#F5F5F0` softens the contrast.

---

## Iconography for product categories

Categories get a single icon + a single accent color. These map in `constants/categories.ts`:

| Category | Icon (Lucide) | Color |
|---|---|---|
| Produce | Apple | `c-green` |
| Dairy | MilkOff (custom: a milk carton) | `c-blue` |
| Meat | Beef | `c-red` |
| Bakery | Croissant | `c-amber` |
| Pantry | Wheat | `c-coral` |
| Frozen | Snowflake | `c-blue` (lighter) |
| Beverages | CupSoda | `c-purple` |
| Snacks | Cookie | `c-amber` |
| Cleaning | Sparkles | `c-teal` |
| Personal care | Heart | `c-pink` |

These are decorative, not functional — the actual category is also in text.

---

## Anti-patterns — never do these

- ❌ Don't use shadows for depth in a flat design system. We use borders and surface contrast.
- ❌ Don't use gradients in UI chrome. Buttons, cards, sheets are flat fills.
- ❌ Don't use serif fonts anywhere except a special editorial moment (none exist in MVP).
- ❌ Don't use emojis in UI labels. Use Lucide icons. (Emojis in user-generated content are fine.)
- ❌ Don't use modal alerts with multi-line bodies for routine confirmations. Use a toast or inline confirmation.
- ❌ Don't use red for primary buttons — even for "delete." Red is for inline danger states only. Confirmation of a destructive action goes in a sheet/dialog with the destructive action labeled clearly.
- ❌ Don't use ALL CAPS labels except for very small badges (12px). Sentence case everywhere.
- ❌ Don't make the user wait without telling them why. Loading state must be informative when >1s.
