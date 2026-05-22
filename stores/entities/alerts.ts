import { createEntityStore, type EntityStore } from '../create-entity-store';
import type { PrunApi } from '../../types/prun-api';

export type AlertsStore = EntityStore<PrunApi.Alert>;

export const useAlertsStore = createEntityStore<PrunApi.Alert>(
  'alerts',
  (alert) => alert.id,
);
