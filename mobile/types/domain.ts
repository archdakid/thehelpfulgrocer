// Business-domain types. Map onto database rows but are not the same shape —
// they're how the rest of the app thinks about the world.

export type Money = {
  amountMinorUnits: number;
  currency: string;
};

export type Product = {
  id: string;
  upc: string | null;
  name: string;
  brand: string | null;
  imageUrl: string | null;
};

export type Store = {
  id: string;
  name: string;
};

export type PriceObservation = {
  id: string;
  productId: string;
  storeId: string;
  price: Money;
  observedAt: string;
};
