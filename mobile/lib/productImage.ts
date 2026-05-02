// Resolves a product's image URL using the priority order set in
// docs/DECISIONS.md (2026-04-30 — Image source priority):
//   1. Open Food Facts (free, automatic, broad coverage for major brands)
//   2. Our products.image_url (admin-approved or admin-uploaded — long tail)
//   3. null  → caller renders a placeholder
//
// OFF wins over our row because OFF imagery is plentiful and consistent;
// our column fills the gap for products OFF doesn't know.

export type ImageSources = {
  offImageUrl: string | null | undefined;
  ownImageUrl: string | null | undefined;
};

export function resolveProductImage({ offImageUrl, ownImageUrl }: ImageSources): string | null {
  return offImageUrl || ownImageUrl || null;
}
