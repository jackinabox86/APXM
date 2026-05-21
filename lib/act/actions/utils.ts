// Ported from refined-prun src/features/XIT/ACT/actions/utils.ts.
// Only the subset used by BURNACT/REPAIRACT action steps is included.
// warehousesStore and shipsStore full address lookups are not yet available
// in APXM — name is used as fallback for those store types.

import type { PrunApi } from '../../../types/prun-api';
import { useSitesStore } from '../../../stores/entities/sites';
import { getEntityDisplayName } from '../../address';

export function serializeStorage(storage: PrunApi.Store): string {
  switch (storage.type) {
    case 'STL_FUEL_STORE':
      return (storage.name ?? storage.id) + ' STL Store';
    case 'FTL_FUEL_STORE':
      return (storage.name ?? storage.id) + ' FTL Store';
    case 'SHIP_STORE':
      return (storage.name ?? storage.id) + ' Cargo';
    case 'STORE': {
      const site = useSitesStore.getState().getAll().find(
        (s) => s.siteId === storage.addressableId,
      );
      const label = site ? getEntityDisplayName(site.address) : (storage.name ?? storage.addressableId);
      return label + ' Base';
    }
    case 'WAREHOUSE_STORE': {
      const label = storage.name ?? storage.addressableId;
      return label + ' Warehouse';
    }
    default:
      return storage.name ?? storage.id;
  }
}
