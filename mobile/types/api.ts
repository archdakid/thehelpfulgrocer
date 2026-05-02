// External API response shapes (Open Food Facts, etc.).
// Always validated with Zod at the boundary before becoming a domain type.

export type OpenFoodFactsProduct = {
  code: string;
  product_name?: string;
  brands?: string;
  image_url?: string;
};
