import { useMemo } from 'react';
import { useShipsStore } from '../../stores/entities/ships';
import { getFlightByShipId } from '../../stores/entities/flights';
import { Card, SectionHeader } from '../shared';
import { useGameState } from '../../stores/gameState';
import { useConnectionStore } from '../../stores/connection';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';
import { formatEta } from '../../lib/fleet-utils';
import { useTick } from '../../lib/use-tick';
import type { PrunApi } from '../../types/prun-api';

type FleetStatus = 'idle' | 'arriving-soon' | 'in-transit';


interface ShipSummary {
  id: string;
  name: string;
  status: FleetStatus;
  destination: string | null;
  etaMs: number | null;
}

function getDestinationName(address: PrunApi.Address): string {
  for (const line of address.lines) {
    if (line.type === 'PLANET' && line.entity) {
      return line.entity.name || line.entity.naturalId;
    }
    if (line.type === 'STATION' && line.entity) {
      return line.entity.name || line.entity.naturalId;
    }
  }
  return 'Unknown';
}


export function FleetMiniList() {
  const { setActiveTab } = useGameState();
  const apexUnresponsive = useConnectionStore((s) => s.apexUnresponsive);
  const shipsLastUpdated = useShipsStore((s) => s.lastUpdated);
  const shipsFetched = useShipsStore((s) => s.fetched);
  const connectionStatus = useConnectionStatus();
  // Tick every minute to update ETAs
  const tick = useTick(60000);

  const topShips = useMemo(() => {
    const ships = useShipsStore.getState().getAll();
    const now = Date.now();
    const twoHoursMs = 2 * 60 * 60 * 1000;

    const summaries: ShipSummary[] = ships.map((ship) => {
      const flight = getFlightByShipId(ship.id);

      if (!flight) {
        return {
          id: ship.id,
          name: ship.name || ship.registration,
          status: 'idle' as FleetStatus,
          destination: null,
          etaMs: null,
        };
      }

      const arrivalMs = flight.arrival.timestamp;
      const etaMs = arrivalMs - now;
      const destination = getDestinationName(flight.destination);

      if (etaMs <= twoHoursMs) {
        return {
          id: ship.id,
          name: ship.name || ship.registration,
          status: 'arriving-soon' as FleetStatus,
          destination,
          etaMs,
        };
      }

      return {
        id: ship.id,
        name: ship.name || ship.registration,
        status: 'in-transit' as FleetStatus,
        destination,
        etaMs,
      };
    });

    // Sort: non-idle by ETA ascending (closest first), idle at the bottom
    summaries.sort((a, b) => {
      const aIsIdle = a.status === 'idle';
      const bIsIdle = b.status === 'idle';
      if (aIsIdle && !bIsIdle) return 1;
      if (!aIsIdle && bIsIdle) return -1;
      const etaA = a.etaMs ?? Infinity;
      const etaB = b.etaMs ?? Infinity;
      return etaA - etaB;
    });

    return summaries.slice(0, 5);
  }, [shipsLastUpdated, tick]);

  // Determine loading state for empty-state message
  const emptyMessage = !shipsFetched
    ? apexUnresponsive
      ? { text: 'APEX not responding', pulse: false }
      : connectionStatus === 'fio'
        ? { text: 'Waiting for APEX connection...', pulse: false }
        : { text: 'Loading fleet...', pulse: true }
    : { text: 'No ship data available', pulse: false };

  if (topShips.length === 0) {
    return (
      <Card>
        <SectionHeader title="Fleet" onViewAll={() => setActiveTab('fleet')} />
        <p className={`text-xs ${apexUnresponsive && !shipsFetched ? 'text-status-critical' : 'text-apxm-muted'} ${emptyMessage.pulse ? 'animate-pulse' : ''}`}>
          {emptyMessage.text}
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader title="Fleet" onViewAll={() => setActiveTab('fleet')} />
      <div className="space-y-0">
        {topShips.map((ship) => (
          <div key={ship.id} className="flex items-center justify-between py-1">
            <div className="flex-1 min-w-0 mr-2">
              <div className="text-sm text-apxm-text truncate">{ship.name}</div>
              {ship.destination && (
                <div className="text-xs text-apxm-muted truncate">{ship.destination}</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {ship.etaMs !== null && (
                <span className="text-xs text-apxm-text/70 font-mono">
                  {formatEta(ship.etaMs)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
