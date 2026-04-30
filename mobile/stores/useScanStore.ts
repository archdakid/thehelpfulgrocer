import { create } from 'zustand';

type ScanMode = 'barcode' | 'vision';

type ScanState = {
  mode: ScanMode;
  lastScannedUpc: string | null;
  setMode: (mode: ScanMode) => void;
  setLastScannedUpc: (upc: string | null) => void;
};

export const useScanStore = create<ScanState>((set) => ({
  mode: 'barcode',
  lastScannedUpc: null,
  setMode: (mode) => set({ mode }),
  setLastScannedUpc: (upc) => set({ lastScannedUpc: upc }),
}));
