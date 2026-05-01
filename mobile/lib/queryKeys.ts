// Single source of truth for React Query keys per docs/CODING_STANDARDS.md.
// Keep this file dependency-free so it can be imported anywhere without cycles.

export const queryKeys = {
  stores: () => ['stores'] as const,
  store: (id: string) => ['stores', id] as const,
  productsAtStore: (storeId: string) => ['stores', storeId, 'products'] as const,
  products: (filters: { search?: string } = {}) => ['products', filters] as const,
  product: (id: string) => ['products', id] as const,
  searchProducts: (query: string) => ['products', 'search', query] as const,
  productsByCategory: () => ['products', 'category-counts'] as const,
  productsInCategory: (categoryId: string, storeId: string | null) =>
    ['products', 'in-category', categoryId, storeId ?? 'all'] as const,
  pricesForProduct: (productId: string) => ['prices', 'product', productId] as const,
  listItemPrices: (productIds: readonly string[], storeId: string | null) =>
    ['prices', 'list-items', storeId ?? 'cheapest', [...productIds].sort()] as const,
  listPricesAllStores: (productIds: readonly string[]) =>
    ['prices', 'list-items', 'all-stores', [...productIds].sort()] as const,
  profile: (userId: string | null) => ['profile', userId] as const,
  offProduct: (upc: string | null) => ['off', 'product', upc] as const,
} as const;
