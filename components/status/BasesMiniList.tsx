import { useMemo } from 'react';
import { useSiteBurns, sortByUrgency } from '../burn';
import { Card, TimeBadge } from '../shared';
import { useGameState } from '../../stores/gameState';
import { useConnectionStore } from '../../stores/connection';
import { useSitesStore } from '../../stores/entities/sites';
import { useWorkforceStore } from '../../stores/entities/workforce';
import { useProductionStore, getProductionBySiteId } from '../../stores/entities/production';
import { useStorageStore } from '../../stores/entities/storage';
import { useRepairStatus } from '../repair/useRepairStatus';

const repairAgeBgColors = {
  critical: 'bg-status-critical/20 text-status-critical',
  warning: 'bg-status-warning/20 text-status-warning',
  ok: 'bg-status-ok/20 text-status-ok',
} as const;

function repairUrgency(days: number): 'ok' | 'warning' | 'critical' {
  if (days >= 60) return 'critical';
  if (days >= 50) return 'warning';
  return 'ok';
}

function RepairAgeBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-xs text-apxm-muted">—</span>;
  const urgency = repairUrgency(days);
  return (
    <span className={`px-2 py-0.5 text-xs font-medium ${repairAgeBgColors[urgency]}`}>
      {Math.ceil(days)}d
    </span>
  );
}

function ProdStatusBadge({ allRunning }: { allRunning: boolean }) {
  return allRunning ? (
    <span className="px-2 py-0.5 text-xs font-medium bg-status-ok/20 text-status-ok">✓</span>
  ) : (
    <span className="px-2 py-0.5 text-xs font-medium bg-status-critical/20 text-status-critical">∅</span>
  );
}

export function BasesMiniList() {
  const { setActiveTab, setFocusedSiteId } = useGameState();
  const siteBurns = useSiteBurns();
  const repairStatuses = useRepairStatus();

  const apexUnresponsive = useConnectionStore((s) => s.apexUnresponsive);
  const sitesFetched = useSitesStore((s) => s.fetched);
  const workforceFetched = useWorkforceStore((s) => s.fetched);
  const productionFetched = useProductionStore((s) => s.fetched);
  const productionLastUpdated = useProductionStore((s) => s.lastUpdated);
  const storageFetched = useStorageStore((s) => s.fetched);

  const topBases = useMemo(() => {
    const sorted = sortByUrgency(siteBurns);
    return sorted.slice(0, 5);
  }, [siteBurns]);

  const repairBySite = useMemo(
    () => new Map(repairStatuses.map((r) => [r.siteId, r.oldestBuildingAgeDays])),
    [repairStatuses]
  );

  // Map siteId → all production lines running (true = all active, false = any idle)
  const prodStatusBySite = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const site of topBases) {
      const lines = getProductionBySiteId(site.siteId);
      const allRunning = lines.length > 0 && lines.every(
        (line) => line.orders.some((o) => o.started !== null && !o.halted)
      );
      map.set(site.siteId, allRunning);
    }
    return map;
  // productionLastUpdated ensures this recomputes when production data changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topBases, productionLastUpdated]);

  const emptyMessage = apexUnresponsive && !sitesFetched
    ? { text: 'APEX not responding', pulse: false }
    : !sitesFetched
      ? { text: 'Loading bases...', pulse: true }
      : !(workforceFetched && productionFetched && storageFetched)
        ? { text: 'Loading burn data...', pulse: true }
        : { text: 'No base data available', pulse: false };

  const header = (
    <div className="flex items-center mb-0.5">
      <button
        onClick={() => setActiveTab('bases')}
        className="text-sm font-semibold text-prun-yellow uppercase flex-1 text-left"
      >
        Bases
      </button>
      <span className="text-xs font-semibold text-apxm-muted uppercase w-10 text-center">Burn</span>
      <span className="text-xs font-semibold text-apxm-muted uppercase w-10 text-center ml-1">Repair</span>
      <span className="text-xs font-semibold text-apxm-muted uppercase w-10 text-center ml-1">Prod</span>
    </div>
  );

  if (topBases.length === 0) {
    return (
      <Card>
        {header}
        <p className={`text-xs ${apexUnresponsive && !sitesFetched ? 'text-status-critical' : 'text-apxm-muted'} ${emptyMessage.pulse ? 'animate-pulse' : ''}`}>
          {emptyMessage.text}
        </p>
      </Card>
    );
  }

  return (
    <Card>
      {header}
      <div className="space-y-0">
        {topBases.map((site) => (
          <div key={site.siteId} className="flex items-center py-1">
            <button
              onClick={() => { setFocusedSiteId(site.siteId); setActiveTab('bases'); }}
              className="text-sm text-apxm-text truncate flex-1 mr-2 text-left hover:text-prun-yellow"
            >
              {site.siteName}
            </button>
            <div className="w-10 flex justify-center">
              {site.mostUrgent ? (
                <TimeBadge
                  daysRemaining={site.mostUrgent.daysRemaining}
                  urgency={site.mostUrgent.urgency}
                />
              ) : (
                <span className="text-xs text-apxm-muted">?</span>
              )}
            </div>
            <div className="w-10 flex justify-center ml-1">
              <RepairAgeBadge days={repairBySite.get(site.siteId) ?? null} />
            </div>
            <div className="w-10 flex justify-center ml-1">
              {productionFetched ? (
                <ProdStatusBadge allRunning={prodStatusBySite.get(site.siteId) ?? false} />
              ) : (
                <span className="text-xs text-apxm-muted">?</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
