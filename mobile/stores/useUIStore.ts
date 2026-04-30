import { create } from 'zustand';

type UIState = {
  activeStoreId: string | null;
  setActiveStoreId: (id: string | null) => void;
};

export const useUIStore = create<UIState>((set) => ({
  activeStoreId: null,
  setActiveStoreId: (id) => set({ activeStoreId: id }),
}));
