// BURNACT screen — resupply a base via the ACT action runner.
// Registers all ACT modules on first import.
import '../../lib/act/register-all';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useSitesStore } from '../../stores/entities/sites';
import { useStorageStore } from '../../stores/entities/storage';
import { useShipsStore } from '../../stores/entities/ships';
import { useWarehouseStore } from '../../stores/warehouses';
import { useExchangeStore } from '../../stores/exchanges';
import { useGameState } from '../../stores/gameState';
import { getEntityDisplayName } from '../../lib/address';
import { serializeStorage, atSameLocation } from '../../lib/act/actions/utils';
import { setupActGlobals } from '../../lib/act/globals-setup';
import { ActionRunner } from '../../lib/act/runner/action-runner';
import { Logger } from '../../lib/act/runner/logger';
import type { LogTag, LogContent } from '../../lib/act/runner/logger';
import { ActionRunnerPanel, type LogEntry } from '../act/ActionRunnerPanel';
import { configurableValue } from '../../lib/act/shared-types';
import type { ActionPackageConfig } from '../../lib/act/shared-types';

const EXCHANGES = ['AI1', 'CI1', 'CI2', 'IC1', 'NC1', 'NC2'] as const;

// Static exchange-code → CX station naturalId fallback (mirrors _compat.ts).
const CX_STATION_IDS: Record<string, string> = { AI1: 'ANT', CI1: 'BEN', NC1: 'MOR', IC1: 'HRT' };

const INPUT_CLS =
  'w-full px-2 py-1.5 text-sm bg-apxm-bg border border-apxm-accent rounded ' +
  'text-apxm-text placeholder:text-apxm-muted/50 outline-none focus:border-prun-yellow';
const SELECT_CLS =
  'w-full px-2 py-1.5 text-sm bg-apxm-bg border border-apxm-accent rounded ' +
  'text-apxm-text outline-none focus:border-prun-yellow appearance-none';
const LABEL_CLS = 'text-xs text-apxm-muted uppercase tracking-wide whitespace-nowrap';
const BTN_PRIMARY =
  'flex-1 min-h-touch px-4 py-2 text-sm rounded bg-prun-yellow text-apxm-bg font-semibold ' +
  'disabled:opacity-40 disabled:cursor-not-allowed';
const BTN_SECONDARY =
  'flex-1 min-h-touch px-4 py-2 text-sm rounded border border-apxm-accent text-apxm-muted ' +
  'font-semibold hover:border-prun-yellow hover:text-prun-yellow disabled:opacity-40 disabled:cursor-not-allowed';
const BTN_CANCEL =
  'flex-1 min-h-touch px-4 py-2 text-sm rounded border border-red-800 text-red-400 font-semibold hover:border-red-500';

export function BurnActView() {
  const setActiveTab = useGameState((s) => s.setActiveTab);
  const activeActPlanet = useGameState((s) => s.activeActPlanet);
  const setActiveActPlanet = useGameState((s) => s.setActiveActPlanet);

  // Stable selector — getAll() creates a new array every call so subscribing
  // to lastUpdated instead avoids React 19 useSyncExternalStore tearing loops.
  const sitesLastUpdated = useSitesStore((s) => s.lastUpdated);
  const storagesLastUpdated = useStorageStore((s) => s.lastUpdated);
  const shipsLastUpdated = useShipsStore((s) => s.lastUpdated);
  const warehousesCount = useWarehouseStore((s) => s.warehouses.length);
  const exchangesCount = useExchangeStore((s) => s.exchanges.length);

  // Form state
  const [planet, setPlanet] = useState(activeActPlanet ?? '');
  const [days, setDays] = useState('30');
  const [exchange, setExchange] = useState('AI1');
  const [origin, setOrigin] = useState('');
  const [dest, setDest] = useState('');

  // Runner state
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isActReady, setIsActReady] = useState(false);
  const nextId = useRef(0);

  // Stable logger pointing at latest setter
  const addEntryRef = useRef<(tag: LogTag, content: LogContent) => void>(() => {});
  addEntryRef.current = useCallback(
    (tag: LogTag, content: LogContent) =>
      setEntries((prev) => [...prev, { id: nextId.current++, tag, content }]),
    [],
  );

  const log = useRef(
    new Logger((tag, content) => addEntryRef.current(tag, content)),
  );

  const runner = useRef(
    new ActionRunner({
      log: log.current,
      onBufferSplit: () => {},
      onStart: () => setIsRunning(true),
      onEnd: () => { setIsRunning(false); setIsActReady(false); },
      onStatusChanged: (s) => setStatus(s),
      onActReady: () => setIsActReady(true),
    }),
  );

  // Install ACT globals once
  useEffect(() => {
    setupActGlobals();
    return () => {
      if (runner.current.isRunning) runner.current.cancel();
    };
  }, []);

  const siteOptions = useMemo(
    () => useSitesStore.getState().getAll()
      .map((s) => ({ id: s.siteId, label: getEntityDisplayName(s.address) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [sitesLastUpdated],
  );

  // Resolve the warehouseId for the currently selected exchange.
  const exchangeWhId = useMemo(() => {
    const naturalId = useExchangeStore.getState().getNaturalIdFromCode(exchange) ?? CX_STATION_IDS[exchange];
    if (!naturalId) return undefined;
    return useWarehouseStore.getState().getByEntityNaturalId(naturalId)?.warehouseId;
  }, [exchange, warehousesCount, exchangesCount]);

  // Build ordered storage options: exchange CX warehouse → bases → other warehouses → ships.
  const storageOptions = useMemo(() => {
    const all = useStorageStore.getState().getAll()
      .filter((s) => s.type === 'STORE' || s.type === 'SHIP_STORE' || s.type === 'WAREHOUSE_STORE');

    const toOpts = (arr: typeof all) =>
      arr.map((s) => ({ value: serializeStorage(s), storage: s }))
         .sort((a, b) => a.value.localeCompare(b.value));

    const exchangeWh  = all.filter((s) => s.type === 'WAREHOUSE_STORE' && s.addressableId === exchangeWhId);
    const bases       = all.filter((s) => s.type === 'STORE');
    const otherWh     = all.filter((s) => s.type === 'WAREHOUSE_STORE' && s.addressableId !== exchangeWhId);
    const ships       = all.filter((s) => s.type === 'SHIP_STORE');

    return [...toOpts(exchangeWh), ...toOpts(bases), ...toOpts(otherWh), ...toOpts(ships)];
  }, [exchangeWhId, storagesLastUpdated, sitesLastUpdated, shipsLastUpdated, warehousesCount]);

  const originStorage = useMemo(
    () => storageOptions.find((o) => o.value === origin)?.storage ?? null,
    [origin, storageOptions],
  );

  // Destination options: same-location filter applied to the already-ordered storageOptions,
  // so the category order (exchange wh → bases → other wh → ships) is preserved.
  const destOptions = useMemo(() => {
    if (!originStorage) return [];
    return storageOptions.filter((o) => atSameLocation(originStorage, o.storage));
  }, [originStorage, storageOptions]);

  // When exchange changes, auto-select its CX warehouse as origin (or clear if none).
  useEffect(() => {
    const label = storageOptions.find(
      (o) => o.storage.type === 'WAREHOUSE_STORE' && o.storage.addressableId === exchangeWhId,
    )?.value ?? '';
    setOrigin(label);
    setDest('');
  }, [exchange]); // eslint-disable-line react-hooks/exhaustive-deps

  // If origin is still empty when the exchange warehouse first becomes available
  // (e.g. storages loaded from cache after mount), fill it in.
  useEffect(() => {
    if (origin !== '') return;
    const label = storageOptions.find(
      (o) => o.storage.type === 'WAREHOUSE_STORE' && o.storage.addressableId === exchangeWhId,
    )?.value;
    if (label) setOrigin(label);
  }, [exchangeWhId, storageOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset destination when origin changes or it no longer appears in destOptions.
  useEffect(() => {
    if (!origin || !destOptions.find((o) => o.value === dest)) {
      setDest('');
    }
  }, [origin, destOptions]);

  function buildPackage() {
    const planetName =
      siteOptions.find((o) => o.id === planet)?.label ?? planet;

    const pkg: UserData.ActionPackageData = {
      global: { name: `Burn Resupply: ${planetName}` },
      groups: [
        {
          type: 'Resupply',
          name: 'Resupply',
          planet: planetName,
          days: configurableValue,
          useBaseInv: true,
        },
      ],
      actions: [
        {
          type: 'CX Buy',
          name: 'CX Buy',
          group: 'Resupply',
          exchange: configurableValue,
          useCXInv: true,
          skippable: true,
        },
        ...(origin.trim() && dest.trim()
          ? [
              {
                type: 'MTRA' as UserData.ActionType,
                name: 'MTRA',
                group: 'Resupply',
                origin: configurableValue,
                dest: configurableValue,
              },
            ]
          : []),
      ],
    };

    const config = {
      materialGroups: {
        Resupply: { days: parseFloat(days) },
      },
      actions: {
        'CX Buy': { exchange: exchange.trim() || undefined, skip: !exchange.trim() },
        MTRA: { origin: origin.trim() || undefined, destination: dest.trim() || undefined },
      },
    } as unknown as ActionPackageConfig;

    return { pkg, config };
  }

  const canRun = planet.trim() !== '' && parseFloat(days) > 0 && !isRunning;

  async function handlePreview() {
    if (!canRun) return;
    setEntries([]);
    setStatus('');
    const { pkg, config } = buildPackage();
    await runner.current.preview(pkg, config);
  }

  async function handleExecute() {
    if (!canRun) return;
    setEntries([]);
    setStatus('');
    const { pkg, config } = buildPackage();
    await runner.current.execute(pkg, config);
  }

  function handleBack() {
    if (runner.current.isRunning) runner.current.cancel();
    setActiveActPlanet(null);
    setActiveTab('bases');
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleBack}
          className="text-apxm-muted hover:text-apxm-text text-sm"
        >
          ← BURN
        </button>
        <h2 className="text-sm font-semibold text-prun-yellow uppercase tracking-wide">
          BURNACT
        </h2>
      </div>

      {/* Form */}
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
        <label className={LABEL_CLS}>Base</label>
        <select
          value={planet}
          onChange={(e) => setPlanet(e.target.value)}
          className={SELECT_CLS}
        >
          <option value="">— select base —</option>
          {siteOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>

        <label className={LABEL_CLS}>Days</label>
        <input
          type="number"
          min="1"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className={INPUT_CLS}
          placeholder="30"
        />

        <label className={LABEL_CLS}>Exchange</label>
        <select
          value={exchange}
          onChange={(e) => setExchange(e.target.value)}
          className={SELECT_CLS}
        >
          <option value="">— skip CX Buy —</option>
          {EXCHANGES.map((ex) => (
            <option key={ex} value={ex}>{ex}</option>
          ))}
        </select>

        {/* MTRA origin — "CX Buy only" at bottom opts out of transfer */}
        <label className={LABEL_CLS}>Origin</label>
        <select
          value={origin}
          onChange={(e) => { setOrigin(e.target.value); setDest(''); }}
          className={SELECT_CLS}
        >
          {storageOptions.map((o) => (
            <option key={o.storage.id} value={o.value}>{o.value}</option>
          ))}
          <option value="">— CX Buy only —</option>
        </select>

        {/* MTRA destination — filtered to same location as origin */}
        <label className={LABEL_CLS}>Destination</label>
        <select
          value={dest}
          onChange={(e) => setDest(e.target.value)}
          className={SELECT_CLS}
          disabled={!origin}
        >
          {!origin ? (
            <option value="">— no MTRA —</option>
          ) : (
            <>
              <option value="">— select destination —</option>
              {destOptions.map((o) => (
                <option key={o.storage.id} value={o.value}>{o.value}</option>
              ))}
            </>
          )}
        </select>
      </div>

      {/* Action buttons — swaps to runner controls while executing */}
      <div className="flex gap-2">
        {isRunning || isActReady ? (
          <>
            {isActReady && (
              <button onClick={() => runner.current.act()} className={BTN_PRIMARY}>
                ACT
              </button>
            )}
            {isRunning && (
              <button onClick={() => runner.current.skip()} className={BTN_SECONDARY}>
                SKIP
              </button>
            )}
            {isRunning && (
              <button onClick={() => runner.current.cancel()} className={BTN_CANCEL}>
                CANCEL
              </button>
            )}
          </>
        ) : (
          <>
            <button onClick={handlePreview} disabled={!canRun} className={BTN_SECONDARY}>
              PREVIEW
            </button>
            <button onClick={handleExecute} disabled={!canRun} className={BTN_PRIMARY}>
              EXECUTE
            </button>
          </>
        )}
      </div>

      {/* Runner panel */}
      <ActionRunnerPanel
        entries={entries}
        status={status}
        isRunning={isRunning}
      />
    </div>
  );
}
