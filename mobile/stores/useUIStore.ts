import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type UIState = {
  // null = "Cheapest across all stores" pseudo-store. Otherwise a real store row id.
  activeStoreId: string | null;
  setActiveStoreId: (id: string | null) => void;
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      activeStoreId: null,
      setActiveStoreId: (id) => set({ activeStoreId: id }),
    }),
    {
      name: 'smartshopper-ui',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);
