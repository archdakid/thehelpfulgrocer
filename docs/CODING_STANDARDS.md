# Coding standards

> Code is read more than it's written. Optimize for the next person reading it (which will often be you, six months from now, or Claude in a future session).

---

## TypeScript

### Strictness

`tsconfig.json` MUST include:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### Type rules

- **No `any`.** Ever. If you need a temporary escape hatch, use `unknown` and narrow. If you genuinely cannot avoid `any`, add `// REASON: <reason>` comment above.
- **No `@ts-ignore`.** Use `@ts-expect-error` with a comment. The expect-error variant fails when the error goes away, forcing a cleanup.
- **Prefer `type` for unions/primitives, `interface` for object shapes.** Doesn't really matter, but pick one and be consistent.
- **Use Zod (or similar) for runtime validation at all external boundaries:** API responses, Edge Function inputs, deep-link params. Don't trust types alone for things crossing the wire.

### Naming

- **Types/Interfaces:** `PascalCase` — `Product`, `ShoppingList`, `PriceRecord`
- **Functions/variables:** `camelCase` — `fetchProducts`, `currentTotal`
- **Constants:** `UPPER_SNAKE_CASE` for module-level constants — `MAX_LIST_ITEMS`, `DEFAULT_CURRENCY`
- **React components:** `PascalCase` — `ProductCard`, `BottomSheet`
- **Hooks:** `camelCase` with `use` prefix — `useProducts`, `useShoppingList`
- **Boolean variables:** prefix with `is`, `has`, `can`, `should` — `isLoading`, `hasError`, `canEdit`
- **Event handlers:** prefix with `handle` (within a component) or `on` (in props) — `handleSubmit`, `onSelect`

---

## File organization

### One default export per file

```typescript
// ✅ ProductCard.tsx
export default function ProductCard({ ... }) { ... }

// ❌ Don't
export function ProductCard() { ... }
export function ProductCardCompact() { ... }
```

If you need multiple related components, give them their own files in the same folder.

### File names match exports

```
ProductCard.tsx       → exports default ProductCard
useProducts.ts        → exports useProducts
formatPrice.ts        → exports formatPrice (named)
```

### Types live with their consumer or in a `types/` folder

- **One-off types** stay in the file that uses them.
- **Shared types** go in `mobile/types/` or `mobile/lib/`.
- **Database types** go ONLY in `mobile/types/database.ts` and are auto-generated. Never edit by hand.
- **Domain types** (business concepts that map to but aren't the DB types) go in `mobile/types/domain.ts`.

### Folder structure within `components/`

```
components/
├── ui/                  # Generic primitives (Button, Card, Input)
├── list/                # List-screen-specific
├── scan/                # Scanner-specific
├── product/             # Product-display-specific
└── store/               # Store-specific
```

A component is "generic" only if it would be reusable across these domains. When in doubt, put it in the domain folder, not `ui/`.

---

## React patterns

### Function components only

No class components. Anywhere. Period.

### Props interface

Always define an explicit props type. Never use inline.

```typescript
// ✅
type ProductCardProps = {
  product: Product;
  onPress?: () => void;
};

export default function ProductCard({ product, onPress }: ProductCardProps) {
  // ...
}

// ❌
export default function ProductCard({ product, onPress }: { product: Product; onPress?: () => void }) {
  // ...
}
```

### Avoid prop drilling beyond 2 levels

If you're passing a prop through more than 2 component layers without using it, lift to:
1. A Zustand store (UI state)
2. React Query (server state)
3. A context (rare, only for things like theme/auth)

### Memoization

Don't optimize prematurely. Use `useMemo`/`useCallback` only when:
- Profiler shows a real perf issue, OR
- Passing to a `memo`-wrapped component that depends on referential stability

Don't wrap every component in `memo`. The re-render cost is usually less than the memo overhead.

### Hooks rules

- Custom hooks start with `use`.
- Hooks at the top of the component, before any logic.
- Don't conditionally call hooks. Ever.

---

## State management

### Decision tree: where does this state go?

```
Is it server data (from Supabase, OFF, etc.)?
  → React Query (useQuery, useMutation)

Is it persistent client-only state (current store, scan mode preference)?
  → Zustand store with persist middleware

Is it ephemeral UI state for one screen (form input, bottom sheet open/closed)?
  → useState in the component

Is it shared across many components but not server-fetched (current theme, current user)?
  → Zustand store
```

### React Query conventions

- Query keys are tuples: `['products', { storeId, search }]`
- Query keys live in `lib/queryKeys.ts` — single source of truth
- Use `useQuery` for reads, `useMutation` for writes
- After mutations, invalidate relevant queries:
  ```ts
  queryClient.invalidateQueries({ queryKey: ['shoppingLists'] })
  ```

### Zustand conventions

- One store per concern (`useUIStore`, `useScanStore`).
- Selectors in components: `const isOpen = useUIStore(s => s.isOpen)`.
- Don't dump the whole store into a component.

---

## Async / error handling

### Always handle the error case

```typescript
// ❌
const product = await fetchProduct(upc);

// ✅
try {
  const product = await fetchProduct(upc);
} catch (error) {
  logger.error('Failed to fetch product', { upc, error });
  // Show user-facing error
}

// ✅✅ (in React Query, errors are returned)
const { data, error, isError } = useProduct(upc);
```

### Logging

Never `console.log` in committed code. Use `lib/logger.ts`:

```typescript
import { logger } from '@/lib/logger';

logger.info('Product fetched', { productId });
logger.warn('Slow query', { duration });
logger.error('Failed to fetch product', { upc, error });
```

In production, `logger.error` calls should pipe to Sentry.

### User-facing error messages

- **Be specific:** "We couldn't find that product" beats "Error".
- **Be actionable:** "Try scanning again" or "Tap to retry".
- **Be honest:** if our database doesn't have prices for this product, say so. Don't pretend it's a network error.

---

## Styling

### Use NativeWind (Tailwind classes)

```tsx
// ✅
<View className="flex-row items-center px-4 py-3 bg-surface rounded-lg">

// ❌ inline styles for theme values
<View style={{ flexDirection: 'row', padding: 16, backgroundColor: '#FFFFFF' }}>
```

### Inline styles only for dynamic values

```tsx
// ✅ — value is dynamic
<View style={{ width: dynamicWidth }} className="bg-surface rounded-lg">

// ❌ — value is static, should be in className
<View style={{ padding: 16 }}>
```

### No magic numbers

```tsx
// ❌
<View style={{ marginTop: 13 }}>

// ✅
<View className="mt-3"> // = 12px, on the spacing scale

// If you genuinely need an off-grid value, comment why
<View style={{ marginTop: 13 /* visually balances the icon's optical center */ }}>
```

### Theme tokens, not hardcoded colors

```tsx
// ❌
<Text style={{ color: '#888780' }}>

// ✅
<Text className="text-secondary">
```

---

## Imports

### Use path aliases

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

```typescript
// ✅
import { Button } from '@/components/ui/Button';
import { useProducts } from '@/hooks/useProducts';

// ❌
import { Button } from '../../../components/ui/Button';
```

### Import order

```typescript
// 1. React / RN
import { useState } from 'react';
import { View, Text } from 'react-native';

// 2. Third-party
import { useQuery } from '@tanstack/react-query';

// 3. Internal absolute (@/...)
import { Button } from '@/components/ui/Button';
import { useProducts } from '@/hooks/useProducts';

// 4. Relative (./, ../)
import { ProductRow } from './ProductRow';

// 5. Types (separately, with `type` keyword)
import type { Product } from '@/types/domain';
```

ESLint will enforce this order via `import/order` rule.

---

## Testing

### Strategy

- **MVP:** No automated tests required. Manual QA on every PR.
- **Phase 2:** Critical-path integration tests (scan flow, list management, price comparison).
- **Phase 3:** Unit tests for utilities, mocked component tests for complex screens.

### When to write a test now

- The bug is non-obvious or crosses module boundaries → write a regression test.
- The function has tricky math or fuzzy matching logic → write a unit test.
- Otherwise: ship it, manual QA it, move on.

---

## Comments

### When to comment

- **Why, not what.** Code says what. Comments say why.
- **Non-obvious decisions.** "Using setTimeout because the keyboard close animation needs to finish before the sheet animates."
- **Workarounds for libraries.** "react-native-vision-camera bug #1234 — remove this when fixed."
- **Performance-critical code.** "This runs on every frame; do not allocate."

### When NOT to comment

```typescript
// ❌ — comment is just restating the code
// Set the user
const user = getUser();

// ✅ — code is self-documenting
const user = getUser();
```

### TODOs

- Format: `// TODO(name): description, by date or condition`.
- Example: `// TODO(yashua): handle multi-pack pricing properly when we add bulk products in Phase 2`.
- Don't merge a TODO without an owner.

---

## Git & commits

### Branch naming

- `feature/short-description` — new functionality
- `fix/short-description` — bug fixes
- `chore/short-description` — refactoring, deps, tooling
- `docs/short-description` — docs only

### Commit messages

Follow Conventional Commits:

```
feat(scan): add product vision recognition mode
fix(list): running total now updates on item delete
chore(deps): bump expo-image to 1.14.0
docs(architecture): clarify edge function deployment
```

### Commit hygiene

- **Small commits.** A reviewer should be able to understand the change in 30 seconds.
- **Self-contained commits.** Each commit should leave the repo in a working state.
- **Don't mix concerns.** Don't refactor and add a feature in the same commit.
- **Squash before merge** if you have noisy WIP commits.

### Pull request rules

- PR title = first commit message.
- Description includes:
  - What's changed (1-2 sentences)
  - Why (the user need or bug)
  - Screenshots/screen recordings if UI changed
  - Anything reviewer should look at carefully
- Self-review the diff before requesting review.
- All checks (typecheck, lint, build) must pass before merge.
- No PR over 500 lines unless it's a generated migration or auto-generated types.

---

## Anti-patterns — explicit DON'Ts

- ❌ Don't use the default `Image` component from React Native. Use `expo-image`.
- ❌ Don't use the default `Animated` API. Use `react-native-reanimated`.
- ❌ Don't write `useEffect` for data fetching. Use React Query.
- ❌ Don't use `setTimeout` for animations. Use `withSpring` / `withTiming` from reanimated.
- ❌ Don't put logic in render. Extract to a function or hook.
- ❌ Don't use index as a `key` for lists with reorderable/dynamic items.
- ❌ Don't `JSON.parse(JSON.stringify(...))` to clone. Use `structuredClone` or a library.
- ❌ Don't catch errors and silently swallow them. Log and either rethrow or show user feedback.
- ❌ Don't write code "in case we need it later". YAGNI. Delete unused code.
- ❌ Don't make a function take 5+ parameters. Use an options object.
- ❌ Don't use `useEffect` to derive state. Compute it during render or memoize.

---

## When in doubt

1. Match the style of existing code in the same file/folder.
2. Read the relevant doc in `/docs/`.
3. Ask: "would the next person reading this understand it?"
4. Default to less code. Less to maintain, less to break.
