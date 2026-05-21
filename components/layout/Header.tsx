import { useState } from 'react';
import { useGameState } from '../../stores/gameState';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';
import { StatusDot } from '../shared';
import { useSitesStore } from '../../stores/entities';
import { useSiteSourceStore } from '../../stores/site-data-sources';
import { executeBufferRefresh, buildBufferCommand } from '../../lib/buffer-refresh';

export function Header() {
  const status = useConnectionStatus();
  const { setApexVisible } = useGameState();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const siteEntities = useSitesStore((s) => s.entities);
  const sourceEntries = useSiteSourceStore((s) => s.entries);

  const totalCount = siteEntities.size;
  const refreshedCount = Array.from(siteEntities.keys()).filter(
    (id) => sourceEntries.get(id)?.source === 'websocket'
  ).length;

  const allRefreshed = refreshedCount === totalCount;
  const counterColor = allRefreshed ? 'text-green-400' : 'text-red-400';

  const nextSiteId = Array.from(siteEntities.keys()).find(
    (id) => sourceEntries.get(id)?.source !== 'websocket'
  );

  async function handleRefresh(): Promise<void> {
    if (isRefreshing || !nextSiteId) return;
    setIsRefreshing(true);
    try {
      await executeBufferRefresh({
        siteId: nextSiteId,
        command: buildBufferCommand(nextSiteId),
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  const canRefresh = !isRefreshing && !!nextSiteId;

  return (
    <header className="flex items-center justify-between px-4 h-12 bg-apxm-bg border-b border-apxm-surface">
      <div className="flex items-center gap-1.5">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="28" height="28">
          <rect x="6" y="6" width="116" height="116" rx="8" fill="#0a0a0a"/>
          <rect x="6" y="6" width="116" height="116" rx="8" fill="none" stroke="#f7a600" strokeWidth="5"/>
          <text x="64" y="42" textAnchor="middle" dominantBaseline="central" fill="#f7a600" fontFamily="'Courier New', monospace" fontWeight="bold" fontSize="54" letterSpacing="2">AP</text>
          <text x="64" y="94" textAnchor="middle" dominantBaseline="central" fill="#f7a600" fontFamily="'Courier New', monospace" fontWeight="bold" fontSize="54" letterSpacing="2">XM</text>
        </svg>
        <button
          onClick={handleRefresh}
          disabled={!canRefresh}
          aria-label="Refresh next base"
          className={`min-h-touch flex items-center gap-1 text-sm ${
            isRefreshing
              ? 'cursor-wait text-apxm-muted'
              : canRefresh
                ? 'hover:text-prun-yellow cursor-pointer text-apxm-text/70'
                : 'cursor-default text-apxm-text/30'
          }`}
        >
          <span className={isRefreshing ? 'animate-spin inline-block' : ''}>↻</span>
          <span className={`text-xs ${counterColor}`}>{refreshedCount}/{totalCount}</span>
        </button>
      </div>
      <div className="flex items-center gap-3">
        <StatusDot status={status} />
        <button
          onClick={() => setApexVisible(true)}
          className="px-3 min-h-touch flex items-center text-xs font-medium text-apxm-text border border-apxm-surface hover:border-prun-yellow hover:text-prun-yellow"
        >
          SHOW APEX
        </button>
      </div>
    </header>
  );
}
