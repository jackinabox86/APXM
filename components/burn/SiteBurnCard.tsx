import { useState } from 'react';
import type { SiteBurnSummary, BurnRate } from '../../core/burn';
import { useRefreshState } from '../../stores/refreshState';
import { executeBufferRefresh, buildBufferCommand } from '../../lib/buffer-refresh';
import { useSiteStaleness } from '../../hooks/useSiteStaleness';
import { BurnRow } from './BurnRow';

interface SiteBurnCardProps {
  summary: SiteBurnSummary;
  /** Start expanded */
  defaultExpanded?: boolean;
  /** Oldest building age in days for the repair info box */
  repairAgeDays?: number | null;
  /** Production status: true = all running, false = some idle, null = unknown */
  prodStatus?: boolean | null;
  onResClick?: (siteId: string) => void;
  onRepClick?: (siteId: string) => void;
}

const statusColors = {
  critical: 'bg-status-critical/20 text-status-critical',
  warning:  'bg-status-warning/20 text-status-warning',
  ok:       'bg-status-ok/20 text-status-ok',
  surplus:  'bg-apxm-surface text-apxm-muted',
  unknown:  'bg-apxm-surface text-apxm-muted',
} as const;

function repairUrgency(days: number): 'ok' | 'warning' | 'critical' {
  if (days >= 60) return 'critical';
  if (days >= 50) return 'warning';
  return 'ok';
}

/**
 * Filters out materials with no activity (0 stock, 0 burn, 0 need).
 */
function filterActiveBurns(burns: BurnRate[]): BurnRate[] {
  return burns.filter(
    (b) => b.inventoryAmount > 0 || b.dailyAmount !== 0 || b.need > 0
  );
}

/**
 * Sorts burns: consuming items first (by days remaining), then surplus.
 */
function sortBurns(burns: BurnRate[]): BurnRate[] {
  return [...filterActiveBurns(burns)].sort((a, b) => {
    // Consuming items first
    const aConsuming = a.dailyAmount < 0;
    const bConsuming = b.dailyAmount < 0;

    if (aConsuming && !bConsuming) return -1;
    if (!aConsuming && bConsuming) return 1;

    // Within consuming: by days remaining
    if (aConsuming && bConsuming) {
      return a.daysRemaining - b.daysRemaining;
    }

    // Within surplus: alphabetical by ticker
    return a.materialTicker.localeCompare(b.materialTicker);
  });
}

/**
 * Card showing burn summary for a single site.
 * Collapsible with header showing site name and most urgent item.
 */
export function SiteBurnCard({ summary, defaultExpanded = false, repairAgeDays, prodStatus, onResClick, onRepClick }: SiteBurnCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { siteId, siteName, burns } = summary;

  const { text: stalenessText, colorClass: stalenessColor } = useSiteStaleness(siteId);

  const mode = useRefreshState((s) => s.mode);
  const siteStatus = useRefreshState((s) => s.siteStatus.get(siteId));

  const sortedBurns = sortBurns(burns);

  const showRefreshButton = mode === 'manual' || mode === 'batch';
  const isLoading = siteStatus === 'loading';

  function handleRefresh(e: React.MouseEvent): void {
    e.stopPropagation();
    if (isLoading) return;
    executeBufferRefresh({ siteId, command: buildBufferCommand(siteId) });
  }

  return (
    <div className="bg-apxm-surface overflow-hidden">
      {/* Header - always visible, clickable */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-apxm-accent/30 min-h-[44px]"
      >
        <div className="flex items-center gap-2 flex-1">
          {/* Expand/collapse indicator */}
          <span className="text-apxm-text/50 text-xs w-4 shrink-0">
            {expanded ? '▼' : '▶'}
          </span>

          {/* Site name + staleness (only when site has burn data) */}
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-apxm-text">{siteName}</span>
            {sortedBurns.length > 0 && (
              <div className={`text-[11px] mt-0.5 flex items-center gap-1 ${stalenessColor}`}>
                {showRefreshButton && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={handleRefresh}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRefresh(e as unknown as React.MouseEvent); }}
                    className={`flex items-center ${
                      isLoading
                        ? 'text-apxm-muted cursor-wait'
                        : siteStatus === 'success'
                          ? 'text-green-400'
                          : siteStatus === 'error'
                            ? 'text-red-400'
                            : 'text-apxm-text/50 hover:text-prun-yellow'
                    }`}
                    aria-label={`Refresh ${siteName}`}
                  >
                    {isLoading ? <span className="animate-spin">↻</span> : siteStatus === 'success' ? '✓' : siteStatus === 'error' ? '✗' : '↻'}
                  </span>
                )}
                {stalenessText}
              </div>
            )}
          </div>

          {/* Right-anchored info boxes */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Burn box */}
            {(() => {
              const burnColor = statusColors[summary.mostUrgent?.urgency ?? 'unknown'];
              const burnDisplay = summary.mostUrgent
                ? (summary.mostUrgent.daysRemaining === Infinity ? 'OK' : summary.mostUrgent.daysRemaining < 1 ? '<1d' : `${Math.floor(summary.mostUrgent.daysRemaining)}d`)
                : '?';
              return (
                <div className={`flex flex-col items-center px-2 py-1 ${burnColor}`}>
                  <span className="text-[10px] uppercase leading-none mb-0.5 font-semibold">burn</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{burnDisplay}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); onResClick?.(siteId); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onResClick?.(siteId); } }}
                      className="px-1 py-0.5 text-[10px] rounded border border-white/60 text-white/80 hover:border-white hover:text-white leading-none cursor-pointer"
                    >
                      RES
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Repair box */}
            {(() => {
              const repairColor = repairAgeDays != null ? statusColors[repairUrgency(repairAgeDays)] : statusColors.unknown;
              const repairDisplay = repairAgeDays != null ? `${Math.ceil(repairAgeDays)}d` : '—';
              return (
                <div className={`flex flex-col items-center px-2 py-1 ${repairColor}`}>
                  <span className="text-[10px] uppercase leading-none mb-0.5 font-semibold">repair</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{repairDisplay}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); onRepClick?.(siteId); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onRepClick?.(siteId); } }}
                      className="px-1 py-0.5 text-[10px] rounded border border-white/60 text-white/80 hover:border-white hover:text-white leading-none cursor-pointer"
                    >
                      REP
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Prod box */}
            {(() => {
              const prodColor = prodStatus == null ? statusColors.unknown : prodStatus ? statusColors.ok : statusColors.critical;
              const prodDisplay = prodStatus == null ? '?' : prodStatus ? '✓' : '∅';
              return (
                <div className={`flex flex-col items-center px-2 py-1 ${prodColor}`}>
                  <span className="text-[10px] uppercase leading-none mb-0.5 font-semibold">prod</span>
                  <span className="text-xs font-medium">{prodDisplay}</span>
                </div>
              );
            })()}
          </div>
        </div>

      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-apxm-bg">
          {sortedBurns.length === 0 ? (
            <p className="text-sm text-apxm-text/50 py-2">Awaiting data — tap refresh or open BS buffer in APEX</p>
          ) : (
            <div className="divide-y divide-apxm-bg/50">
              {/* Column headers */}
              <div className="flex items-center justify-between gap-1 py-1 text-[10px] text-apxm-text/40 uppercase tracking-wide">
                <span className="w-10">Mat</span>
                <div className="flex items-center">
                  <span className="w-12 text-right">Inv</span>
                  <span className="w-20 text-right">Rate</span>
                  <span className="w-14 text-right">Days</span>
                  <span className="w-12 text-right">Need</span>
                </div>
              </div>
              {sortedBurns.map((burn) => (
                <BurnRow key={burn.materialTicker} burn={burn} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
