import { useEffect, useMemo, useRef } from 'react';
import { DataGate, type RequiredStore } from '../shared';
import { SiteBurnCard } from '../burn/SiteBurnCard';
import { useSiteBurns, sortByUrgency } from '../burn/useSiteBurns';
import { useSitesStore } from '../../stores/entities/sites';
import { useGameState } from '../../stores/gameState';
import { useRepairStatus } from '../repair/useRepairStatus';
import { useProductionStore, getProductionBySiteId } from '../../stores/entities/production';

/**
 * Full burn view showing all sites sorted by urgency.
 * BURN tab content.
 */
export function BasesView() {
  const { setActiveTab, setActiveActPlanet, focusedSiteId, setFocusedSiteId } = useGameState();
  const allBurns = useSiteBurns();
  const summaries = sortByUrgency(allBurns);

  // Capture the focused site on first render, then clear it from global state
  // so navigating away and back doesn't re-expand the same card.
  const initialFocusRef = useRef(focusedSiteId);
  useEffect(() => {
    if (focusedSiteId !== null) setFocusedSiteId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sitesFetched = useSitesStore((s) => s.fetched);

  const repairStatuses = useRepairStatus();
  const repairBySite = useMemo(
    () => new Map(repairStatuses.map((r) => [r.siteId, r.oldestBuildingAgeDays])),
    [repairStatuses]
  );

  const productionFetched = useProductionStore((s) => s.fetched);
  const productionLastUpdated = useProductionStore((s) => s.lastUpdated);
  const prodStatusBySite = useMemo(() => {
    const map = new Map<string, boolean | null>();
    for (const site of summaries) {
      if (!productionFetched) {
        map.set(site.siteId, null);
      } else {
        const lines = getProductionBySiteId(site.siteId);
        map.set(site.siteId, lines.length > 0 && lines.every(
          (line) => line.orders.some((o) => o.started !== null && !o.halted)
        ));
      }
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaries, productionFetched, productionLastUpdated]);

  // Only gate on sites — workforce, production, and storage populate
  // incrementally via buffer refresh or APEX navigation. The burn cards
  // handle missing data gracefully (empty state + refresh button).
  const requiredStores: RequiredStore[] = [
    { fetched: sitesFetched, name: 'bases', canFio: true },
  ];

  return (
    <DataGate requiredStores={requiredStores}>
      <div className="space-y-3">
        {/* ACT navigation buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => { setActiveActPlanet(null); setActiveTab('burnact'); }}
            className="flex-1 min-h-touch px-3 py-2 text-xs rounded border border-apxm-accent text-apxm-muted font-semibold hover:border-prun-yellow hover:text-prun-yellow"
          >
            BURNACT
          </button>
          <button
            onClick={() => { setActiveActPlanet(null); setActiveTab('repairact'); }}
            className="flex-1 min-h-touch px-3 py-2 text-xs rounded border border-apxm-accent text-apxm-muted font-semibold hover:border-prun-yellow hover:text-prun-yellow"
          >
            REPAIRACT
          </button>
        </div>

        <div className="space-y-2">
          {summaries.map((summary) => (
            <SiteBurnCard
              key={summary.siteId}
              summary={summary}
              defaultExpanded={summary.siteId === initialFocusRef.current}
              repairAgeDays={repairBySite.get(summary.siteId) ?? null}
              prodStatus={prodStatusBySite.get(summary.siteId) ?? null}
            />
          ))}
        </div>
      </div>
    </DataGate>
  );
}
