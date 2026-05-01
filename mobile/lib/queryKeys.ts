// Single source of truth for React Query keys per docs/CODING_STANDARDS.md.
// Keep this file dependency-free so it can be imported anywhere without cycles.

export const queryKeys = {
  stores: () => ['stores'] as const,
  store: (id: string) => ['stores', id] as const,
  productsAtStore: (storeId: string) => ['stores', storeId, 'products'] as const,
  products: (filters: { search?: string } = {}) => ['products', filters] as const,
  product: (id: string) => ['products', id] as const,
  searchProducts: (query: string) => ['products', 'search', query] as const,
  pricesForProduct: (productId: string) => ['prices', 'product', productId] as const,
  cheapestPricesForProducts: (productIds: readonly string[]) =>
    ['prices', 'cheapest', [...productIds].sort()] as const,
} as const;
