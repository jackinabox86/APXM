/**
 * Repair Status Calculation Engine
 *
 * Computes the age and condition of the oldest repairable building per site.
 */

import type { PrunApi } from '../types/prun-api';
import { useSitesStore } from '../stores/entities/sites';

// ============================================================================
// Types
// ============================================================================

export interface RepairStatusSummary {
  siteId: string;
  /** Days since the oldest building was last repaired (or built). Null if no repairable buildings. */
  oldestBuildingAgeDays: number | null;
  /** Condition (0–1) of the oldest building. Null if no repairable buildings. */
  oldestBuildingCondition: number | null;
}

// ============================================================================
// Helper Functions (exported for testing)
// ============================================================================

const MS_PER_DAY = 86400000;

/**
 * Returns true for building types that are eligible for repair.
 * CORE, HABITATION, and STORAGE modules are not repairable.
 */
export function isRepairableBuilding(platform: PrunApi.Platform): boolean {
  return platform.module.type === 'RESOURCES' || platform.module.type === 'PRODUCTION';
}

/**
 * Returns the timestamp (ms) of the last repair, or creation time if never repaired.
 */
export function getBuildingLastRepairTimestamp(platform: PrunApi.Platform): number {
  return platform.lastRepair?.timestamp ?? platform.creationTime.timestamp;
}

/**
 * Returns the age of a building in days since its last repair (or creation).
 */
export function getBuildingAgeDays(platform: PrunApi.Platform): number {
  return (Date.now() - getBuildingLastRepairTimestamp(platform)) / MS_PER_DAY;
}

// ============================================================================
// Main Entry Points
// ============================================================================

/**
 * Calculates repair status for a single site.
 * "Oldest" means the building with the earliest last-repair (or creation) timestamp,
 * i.e. the one that has gone the longest without repair.
 */
export function calculateSiteRepairStatus(siteId: string): RepairStatusSummary {
  const site = useSitesStore.getState().getById(siteId);
  const repairable = (site?.platforms ?? []).filter(isRepairableBuilding);

  if (repairable.length === 0) {
    return { siteId, oldestBuildingAgeDays: null, oldestBuildingCondition: null };
  }

  let oldestPlatform = repairable[0];
  let oldestTimestamp = getBuildingLastRepairTimestamp(repairable[0]);

  for (let i = 1; i < repairable.length; i++) {
    const ts = getBuildingLastRepairTimestamp(repairable[i]);
    if (ts < oldestTimestamp) {
      oldestTimestamp = ts;
      oldestPlatform = repairable[i];
    }
  }

  return {
    siteId,
    oldestBuildingAgeDays: (Date.now() - oldestTimestamp) / MS_PER_DAY,
    oldestBuildingCondition: oldestPlatform.condition,
  };
}

/**
 * Calculates repair status for all sites.
 */
export function calculateAllRepairStatuses(): RepairStatusSummary[] {
  const sites = useSitesStore.getState().getAll();
  return sites.map((site) => calculateSiteRepairStatus(site.siteId));
}
