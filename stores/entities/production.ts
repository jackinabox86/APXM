import { create } from 'zustand';
import { createEntityStore, type EntityStore } from '../create-entity-store';
import type { PrunApi } from '../../types/prun-api';

export type ProductionStore = EntityStore<PrunApi.ProductionLine>;

export const useProductionStore = createEntityStore<PrunApi.ProductionLine>(
  'production',
  (line) => line.id,
  { key: 'apxm_cache_production' }
);

/**
 * Tracks which siteIds have had production data explicitly arrive (via
 * WebSocket or FIO). A site absent from this set has not been loaded yet —
 * even if productionFetched is true for the store as a whole.
 */
interface ProductionLoadedState {
  loadedSiteIds: Set<string>;
  markSitesLoaded: (siteIds: string[]) => void;
}

export const useProductionLoadedStore = create<ProductionLoadedState>((set) => ({
  loadedSiteIds: new Set<string>(),
  markSitesLoaded: (siteIds) => {
    if (siteIds.length === 0) return;
    set((state) => {
      const next = new Set(state.loadedSiteIds);
      for (const id of siteIds) next.add(id);
      return { loadedSiteIds: next };
    });
  },
}));

/**
 * Get all production lines for a specific site.
 */
export function getProductionBySiteId(siteId: string): PrunApi.ProductionLine[] {
  return useProductionStore
    .getState()
    .getAll()
    .filter((line) => line.siteId === siteId);
}
