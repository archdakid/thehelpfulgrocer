// Open Food Facts client — anonymous reads against the v2 product endpoint.
//
// Per CLAUDE.md gotcha, OFF rate-limits anonymous traffic at ~100 req/min.
// Aggressive React-Query caching (24h staleTime per barcode) keeps us well
// inside that ceiling for normal browsing. The User-Agent header is
// requested by OFF docs to identify well-behaved clients.
//
// We hit the public `world` host directly rather than going through a
// proxy. If we ever need to cache or shape responses on our side, that's
// the moment for an Edge Function.

const OFF_BASE = 'https://world.openfoodfacts.org/api/v2';
const FIELDS = ['product_name', 'image_url', 'nutriments'].join(',');
const USER_AGENT = 'SmartShopper/0.1 (https://smartshopper.app)';

export type OFFNutrition = {
  energyKcal100g: number | null;
  fat100g: number | null;
  saturatedFat100g: number | null;
  sugars100g: number | null;
  salt100g: number | null;
  proteins100g: number | null;
};

export type OFFProduct = {
  imageUrl: string | null;
  nutrition: OFFNutrition | null;
};

type RawNutriments = {
  'energy-kcal_100g'?: unknown;
  fat_100g?: unknown;
  'saturated-fat_100g'?: unknown;
  sugars_100g?: unknown;
  salt_100g?: unknown;
  proteins_100g?: unknown;
};

type RawResponse = {
  status?: number;
  product?: {
    image_url?: string | null;
    nutriments?: RawNutriments;
  };
};

export async function fetchOffProduct(barcode: string): Promise<OFFProduct | null> {
  const url = `${OFF_BASE}/product/${encodeURIComponent(barcode)}?fields=${FIELDS}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) {
    // OFF returns 404 for unknown barcodes; treat that as "not in catalog"
    // rather than an error so the caller can render a no-data state cleanly.
    if (res.status === 404) return null;
    throw new Error(`OpenFoodFacts request failed: ${res.status}`);
  }
  const data = (await res.json()) as RawResponse;
  if (data.status !== 1 || !data.product) return null;

  const n = data.product.nutriments;
  const candidate: OFFNutrition | null = n
    ? {
        energyKcal100g: numericOrNull(n['energy-kcal_100g']),
        fat100g: numericOrNull(n.fat_100g),
        saturatedFat100g: numericOrNull(n['saturated-fat_100g']),
        sugars100g: numericOrNull(n.sugars_100g),
        salt100g: numericOrNull(n.salt_100g),
        proteins100g: numericOrNull(n.proteins_100g),
      }
    : null;

  // OFF sometimes returns a `nutriments` object with every value missing
  // (especially for non-food items that still have a barcode). Collapse that
  // to null so the panel stays hidden instead of rendering empty rows.
  const hasAny = candidate && Object.values(candidate).some((v) => v !== null);

  return {
    imageUrl: data.product.image_url ?? null,
    nutrition: hasAny ? candidate : null,
  };
}

function numericOrNull(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return v;
}
