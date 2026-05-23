import { useMemo } from 'react';
import { useSitesStore } from '../../stores/entities/sites';
import { calculateAllRepairStatuses, type RepairStatusSummary } from '../../core/repair';

export type { RepairStatusSummary };

/**
 * Hook that calculates repair status for all sites.
 * Re-calculates when site/platform data changes (platforms are part of site entities).
 */
export function useRepairStatus(): RepairStatusSummary[] {
  const sitesLastUpdated = useSitesStore((s) => s.lastUpdated);

  return useMemo(() => {
    return calculateAllRepairStatuses();
  }, [sitesLastUpdated]);
}

/**
 * Sorts repair summaries by oldest building age (most overdue first).
 */
export function sortByAge(summaries: RepairStatusSummary[]): RepairStatusSummary[] {
  return [...summaries].sort((a, b) => {
    const aDays = a.oldestBuildingAgeDays ?? -Infinity;
    const bDays = b.oldestBuildingAgeDays ?? -Infinity;
    return bDays - aDays;
  });
}
