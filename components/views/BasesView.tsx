import { useCallback, useEffect, useRef, useState } from 'react';
import { FilterBar, type FilterOption, DataGate, type RequiredStore } from '../shared';
import { SiteBurnCard } from '../burn/SiteBurnCard';
import { useFilteredBurns, type BurnFilter } from './hooks';
import { useSitesStore } from '../../stores/entities/sites';
import { useGameState } from '../../stores/gameState';

// UI label mapping: internal type → display
const filterLabels: Record<BurnFilter, string> = {
  critical: 'RED',
  warning: 'YELLOW',
  ok: 'GREEN',
  all: 'ALL',
};

// Non-ALL filter values for revert logic
const individualFilters: BurnFilter[] = ['critical', 'warning', 'ok'];

/**
 * Full burn view showing all sites with filtering by urgency.
 * BURN tab content.
 */
export function BasesView() {
  const { setActiveTab, setActiveActPlanet, focusedSiteId, setFocusedSiteId } = useGameState();
  const [activeFilters, setActiveFilters] = useState<Set<BurnFilter>>(new Set(['all']));

  // Capture the focused site on first render, then clear it from global state
  // so navigating away and back doesn't re-expand the same card.
  const initialFocusRef = useRef(focusedSiteId);
  useEffect(() => {
    if (focusedSiteId !== null) setFocusedSiteId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { summaries, counts } = useFilteredBurns(activeFilters);

  const handleFilterToggle = useCallback((filter: BurnFilter) => {
    setActiveFilters((prev) => {
      // Selecting ALL resets to show everything
      if (filter === 'all') return new Set(['all']);

      const next = new Set(prev);
      next.delete('all');

      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }

      // If nothing selected, revert to ALL
      if (next.size === 0) return new Set(['all']);

      // If all individual filters selected, collapse to ALL
      if (individualFilters.every((f) => next.has(f))) return new Set(['all']);

      return next;
    });
  }, []);

  const sitesFetched = useSitesStore((s) => s.fetched);

  // Only gate on sites — workforce, production, and storage populate
  // incrementally via buffer refresh or APEX navigation. The burn cards
  // handle missing data gracefully (empty state + refresh button).
  const requiredStores: RequiredStore[] = [
    { fetched: sitesFetched, name: 'bases', canFio: true },
  ];

  // Build filter options from counts
  const filterOptions: FilterOption<BurnFilter>[] = [
    { id: 'critical', label: filterLabels.critical, count: counts.critical },
    { id: 'warning', label: filterLabels.warning, count: counts.warning },
    { id: 'ok', label: filterLabels.ok, count: counts.ok },
    { id: 'all', label: filterLabels.all, count: counts.all },
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

        <FilterBar options={filterOptions} activeFilters={activeFilters} onChange={handleFilterToggle} />

        {summaries.length === 0 ? (
          <p className="text-sm text-apxm-muted py-4 text-center">
            No bases match the selected filter
          </p>
        ) : (
          <div className="space-y-2">
            {summaries.map((summary) => (
              <SiteBurnCard
                key={summary.siteId}
                summary={summary}
                defaultExpanded={summary.siteId === initialFocusRef.current}
              />
            ))}
          </div>
        )}
      </div>
    </DataGate>
  );
}
