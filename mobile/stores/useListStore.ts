import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ListItem = {
  id: string;
  name: string;
  quantity: number;
  checked: boolean;
  addedAt: number;
};

type ListState = {
  items: ListItem[];
  addItem: (name: string) => void;
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
      version: 1,
    },
  ),
);
