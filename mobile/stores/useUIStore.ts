import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemePreference = 'light' | 'dark' | 'system';

type UIState = {
  // null = "Cheapest across all stores" pseudo-store. Otherwise a real store row id.
  activeStoreId: string | null;
  setActiveStoreId: (id: string | null) => void;
  // 'system' follows the OS color scheme; 'light' / 'dark' override it.
  themePreference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => void;
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      activeStoreId: null,
      setActiveStoreId: (id) => set({ activeStoreId: id }),
      themePreference: 'system',
      setThemePreference: (pref) => set({ themePreference: pref }),
    }),
    {
      name: 'smartshopper-ui',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      migrate: (persistedState, version) => {
        if (persistedState && typeof persistedState === 'object' && version < 2) {
          const state = persistedState as { themePreference?: ThemePreference };
          state.themePreference = state.themePreference ?? 'system';
        }
        return persistedState as UIState;
      },
    },
  ),
);
