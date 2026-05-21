import { create } from 'zustand';
import type { PrunApi } from '../../types/prun-api';

interface MaterialsState {
  materials: Map<string, PrunApi.Material>;
  getByTicker: (ticker: string) => PrunApi.Material | undefined;
  setFromCategories: (categories: PrunApi.MaterialCategory[]) => void;
}

export const useMaterialsStore = create<MaterialsState>((set, get) => ({
  materials: new Map(),
  getByTicker: (ticker) => get().materials.get(ticker),
  setFromCategories: (categories) => {
    const materials = new Map<string, PrunApi.Material>();
    for (const cat of categories) {
      for (const mat of cat.materials) {
        materials.set(mat.ticker, mat);
      }
    }
    set({ materials });
  },
}));
