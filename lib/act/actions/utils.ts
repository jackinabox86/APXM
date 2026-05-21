// Ported from refined-prun src/features/XIT/ACT/actions/utils.ts.
// Import paths and store calls adapted for APXM. warehousesStore full-address
// lookup is not yet available in APXM; warehouse deserialization is stubbed
// to return undefined (BURNACT/REPAIRACT only use STORE and SHIP_STORE types).

import type { PrunApi } from '../../../types/prun-api';
import { useSitesStore } from '../../../stores/entities/sites';
import { useShipsStore } from '../../../stores/entities/ships';
import { storagesStore, sitesStore } from '../_compat';
import { getEntityDisplayName } from '../../address';

// ---------------------------------------------------------------------------
// serializeStorage — human-readable name for a Store
// ---------------------------------------------------------------------------

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
      const label = site
        ? getEntityDisplayName(site.address)
        : (storage.name ?? storage.addressableId);
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

// ---------------------------------------------------------------------------
// deserializeStorage — reverse of serializeStorage
// ---------------------------------------------------------------------------

function extractName(name: string, suffix: string): string | undefined {
  return name.endsWith(' ' + suffix) ? name.slice(0, -(suffix.length + 1)) : undefined;
}

export function deserializeStorage(serializedName: string | undefined): PrunApi.Store | undefined {
  if (!serializedName) return undefined;

  let name: string | undefined;

  name = extractName(serializedName, 'Base');
  if (name) {
    const site = sitesStore.getByPlanetNaturalIdOrName(name);
    return storagesStore.getByAddressableId(site?.siteId).find((x) => x.type === 'STORE');
  }

  // Warehouse lookup requires a warehousesStore not yet in APXM; return undefined.
  name = extractName(serializedName, 'Warehouse');
  if (name) {
    return undefined;
  }

  name = extractName(serializedName, 'Cargo');
  if (name) {
    return storagesStore.getByName(name);
  }

  name = extractName(serializedName, 'FTL Store');
  if (name) {
    return storagesStore.getByName(name);
  }

  name = extractName(serializedName, 'STL Store');
  if (name) {
    return storagesStore.getByName(name);
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Address comparison — used by atSameLocation
// ---------------------------------------------------------------------------

function getStoreAddress(store: PrunApi.Store): PrunApi.Address | undefined {
  switch (store.type) {
    case 'STORE': {
      const site = useSitesStore.getState().getById(store.addressableId);
      return site?.address;
    }
    case 'WAREHOUSE_STORE':
      // warehousesStore not yet in APXM
      return undefined;
    case 'SHIP_STORE':
    case 'STL_FUEL_STORE':
    case 'FTL_FUEL_STORE': {
      const ship = useShipsStore.getState().getById(store.addressableId);
      return ship?.address ?? undefined;
    }
    default:
      return undefined;
  }
}

function isSameAddress(
  a: PrunApi.Address | undefined,
  b: PrunApi.Address | undefined,
): boolean {
  if (!a || !b) return false;
  for (const lineA of a.lines) {
    if (lineA.type !== 'PLANET' && lineA.type !== 'STATION') continue;
    const entityA = (lineA as PrunApi.PlanetAddressLine | PrunApi.StationAddressLine).entity;
    if (!entityA) continue;
    for (const lineB of b.lines) {
      if (lineB.type !== 'PLANET' && lineB.type !== 'STATION') continue;
      const entityB = (lineB as PrunApi.PlanetAddressLine | PrunApi.StationAddressLine).entity;
      if (!entityB) continue;
      if (entityA.naturalId === entityB.naturalId) return true;
    }
  }
  return false;
}

export function atSameLocation(storageA: PrunApi.Store, storageB: PrunApi.Store): boolean {
  if (storageA === storageB) return false;
  return isSameAddress(getStoreAddress(storageA), getStoreAddress(storageB));
}
