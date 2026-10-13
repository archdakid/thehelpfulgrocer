import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { CategoryId } from '@/constants/categories';

export type ListItem = {
  id: string;
  name: string;
  productId: string | null;
  brand: string | null;
  category: CategoryId | null;
  // Product thumbnail captured at the moment the item was added. Avoids
  // an extra round trip on render — the row falls back to the category
  // glyph when imageUrl is null. Null on custom items and on products
  // added before v4 of the persisted state (the migrate handler nulls
  // them so the rows render without crashing until the user re-adds).
  imageUrl: string | null;
  quantity: number;
  checked: boolean;
  addedAt: number;
};

type ListState = {
  items: ListItem[];
  addItem: (name: string) => void;
  addProductItem: (product: {
    id: string;
    name: string;
    brand: string | null;
    category: CategoryId | null;
    imageUrl: string | null;
  }) => void;
  removeItem: (id: string) => void;
  toggleChecked: (id: string) => void;
  setQuantity: (id: string, quantity: number) => void;
  clearChecked: () => void;
};

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useListStore = create<ListState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (name) =>
        set((state) => {
          const trimmed = name.trim();
          if (trimmed.length === 0) return state;
          const next: ListItem = {
            id: makeId(),
            name: trimmed,
            productId: null,
            brand: null,
            category: null,
            imageUrl: null,
            quantity: 1,
            checked: false,
            addedAt: Date.now(),
          };
          return { items: [next, ...state.items] };
        }),
      addProductItem: (product) =>
        set((state) => {
          // Don't double-add the same product. Bump quantity instead.
          const existing = state.items.find((item) => item.productId === product.id);
          if (existing) {
            return {
              items: state.items.map((item) =>
                item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item,
              ),
            };
          }
          const next: ListItem = {
            id: makeId(),
            name: product.name,
            productId: product.id,
            brand: product.brand,
            category: product.category,
            imageUrl: product.imageUrl,
            quantity: 1,
            checked: false,
            addedAt: Date.now(),
          };
          return { items: [next, ...state.items] };
        }),
      removeItem: (id) =>
        set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
      toggleChecked: (id) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, checked: !item.checked } : item,
          ),
        })),
      setQuantity: (id, quantity) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, quantity: Math.max(1, quantity) } : item,
          ),
        })),
      clearChecked: () =>
        set((state) => ({ items: state.items.filter((item) => !item.checked) })),
    }),
    {
      name: 'smartshopper-list',
      storage: createJSONStorage(() => AsyncStorage),
      version: 4,
      migrate: (persistedState, version) => {
        if (persistedState && typeof persistedState === 'object') {
          const state = persistedState as { items?: unknown[] };
          if (Array.isArray(state.items)) {
            state.items = state.items.map((raw) => {
              const item = raw as Record<string, unknown>;
              if (version < 2) item.productId = item.productId ?? null;
              if (version < 3) {
                item.brand = item.brand ?? null;
                item.category = item.category ?? null;
              }
              if (version < 4) item.imageUrl = item.imageUrl ?? null;
              return item;
            });
          }
        }
        return persistedState as ListState;
      },
    },
  ),
);
