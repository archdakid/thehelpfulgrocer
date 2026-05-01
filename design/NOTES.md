# Design notes

Append-only running log of design intent that isn't captured in the JSX/HTML
mockups. The mockups show the *what*; this file captures the *why*, the
in-flight thinking, and decisions that haven't been made yet.

Format: dated entries, newest at the bottom. One bullet per observation.
Cross-reference specific design files (e.g. `compare-sheet.jsx:line`) when
useful. Once an intent is implemented and confirmed in code, it can stay
here — this file is the historical record.

When something becomes a settled architectural choice, copy it into
`docs/DECISIONS.md` instead.

---

## 2026-05-01 — Initial design pack

- Reference files in `design/` are JSX prototypes designed to render together
  via `The Helpful Grocer.html`. Open that file in a browser to see all six
  screens composed in iPhone frames at 390×844.
- The canvas calls the app **"The Helpful Grocer"**; the codebase still
  calls it **"SmartShopper"**. Treat as a possible rebrand-in-progress —
  hold off on touching name until decided.
- Tab bar in design uses 5 tabs (List · Browse · Scan-FAB · Receipts ·
  Profile). Receipts replaces Settings as a top-level surface; Profile
  takes Settings' role.
- The "Save TT$ at [Store]" callout in the running-total card depends on
  knowing per-store totals across the user's list — defer until the
  compare-sheet hook lands.
- Stores list moves out of Browse. Browse becomes a Categories grid; users
  switch active store via the pill row on List, not by browsing stores.

## 2026-05-01 — Tab bar IA: keep Settings, fold Profile in

- Diverging from the design canvas: the fifth tab stays **Settings** (not
  Profile). Profile becomes a row *inside* Settings, alongside Preferences,
  Notifications, About, etc. Reasoning: Settings is a more flexible
  top-level slot that absorbs profile, account, and app-config concerns
  without proliferating tabs later.
- Tab order: List · Browse · Scan-FAB · Receipts · Settings.
- The Profile-row-inside-Settings lands when auth ships — until then,
  Settings stays a stub.
