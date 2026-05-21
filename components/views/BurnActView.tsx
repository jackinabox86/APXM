// BURNACT screen — resupply a base via the ACT action runner.
// Registers all ACT modules on first import.
import '../../lib/act/register-all';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useSitesStore } from '../../stores/entities/sites';
import { useGameState } from '../../stores/gameState';
import { getEntityDisplayName } from '../../lib/address';
import { setupActGlobals } from '../../lib/act/globals-setup';
import { ActionRunner } from '../../lib/act/runner/action-runner';
import { Logger } from '../../lib/act/runner/logger';
import type { LogTag, LogContent } from '../../lib/act/runner/logger';
import { ActionRunnerPanel, type LogEntry } from '../act/ActionRunnerPanel';
import { configurableValue } from '../../lib/act/shared-types';
import type { ActionPackageConfig } from '../../lib/act/shared-types';

const EXCHANGES = ['AI1', 'CI1', 'CI2', 'IC1', 'NC1', 'NC2'] as const;

const INPUT_CLS =
  'w-full min-h-touch px-3 py-2 text-sm bg-apxm-bg border border-apxm-accent rounded ' +
  'text-apxm-text placeholder:text-apxm-muted/50 outline-none focus:border-prun-yellow';
const SELECT_CLS =
  'w-full min-h-touch px-3 py-2 text-sm bg-apxm-bg border border-apxm-accent rounded ' +
  'text-apxm-text outline-none focus:border-prun-yellow appearance-none';
const LABEL_CLS = 'text-xs text-apxm-muted uppercase tracking-wide';
const BTN_PRIMARY =
  'flex-1 min-h-touch px-4 py-2 text-sm rounded bg-prun-yellow text-apxm-bg font-semibold ' +
  'disabled:opacity-40 disabled:cursor-not-allowed';
const BTN_SECONDARY =
  'flex-1 min-h-touch px-4 py-2 text-sm rounded border border-apxm-accent text-apxm-muted ' +
  'font-semibold hover:border-prun-yellow hover:text-prun-yellow disabled:opacity-40 disabled:cursor-not-allowed';

export function BurnActView() {
  const { setActiveTab, activeActPlanet, setActiveActPlanet } = useGameState();
  const sites = useSitesStore((s) => s.getAll());

  // Form state
  const [planet, setPlanet] = useState(activeActPlanet ?? '');
  const [days, setDays] = useState('30');
  const [exchange, setExchange] = useState('CI1');
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

  const siteOptions = sites
    .map((s) => ({ id: s.siteId, label: getEntityDisplayName(s.address) }))
    .sort((a, b) => a.label.localeCompare(b.label));

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
      <div className="space-y-3">
        <div className="space-y-1">
          <label className={LABEL_CLS}>Planet / Base</label>
          <select
            value={planet}
            onChange={(e) => setPlanet(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="">— select base —</option>
            {siteOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className={LABEL_CLS}>Days of supplies</label>
          <input
            type="number"
            min="1"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className={INPUT_CLS}
            placeholder="30"
          />
        </div>

        <div className="space-y-1">
          <label className={LABEL_CLS}>Exchange (blank = skip CX buy)</label>
          <select
            value={exchange}
            onChange={(e) => setExchange(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="">— skip CX Buy —</option>
            {EXCHANGES.map((ex) => (
              <option key={ex} value={ex}>
                {ex}
              </option>
            ))}
          </select>
        </div>

        {/* Optional MTRA fields */}
        <details className="group">
          <summary className="cursor-pointer text-xs text-apxm-muted hover:text-apxm-text list-none flex items-center gap-1">
            <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
            MTRA transfer (optional)
          </summary>
          <div className="mt-2 space-y-2 pl-3 border-l border-apxm-accent">
            <div className="space-y-1">
              <label className={LABEL_CLS}>Origin (e.g. &quot;Antares III Base&quot;)</label>
              <input
                type="text"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                className={INPUT_CLS}
                placeholder="CX Warehouse name or Base name"
              />
            </div>
            <div className="space-y-1">
              <label className={LABEL_CLS}>Destination</label>
              <input
                type="text"
                value={dest}
                onChange={(e) => setDest(e.target.value)}
                className={INPUT_CLS}
                placeholder="Base name or Cargo name"
              />
            </div>
          </div>
        </details>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button onClick={handlePreview} disabled={!canRun} className={BTN_SECONDARY}>
          PREVIEW
        </button>
        <button onClick={handleExecute} disabled={!canRun} className={BTN_PRIMARY}>
          EXECUTE
        </button>
      </div>

      {/* Runner panel */}
      <ActionRunnerPanel
        entries={entries}
        status={status}
        isRunning={isRunning}
        isActReady={isActReady}
        onAct={() => runner.current.act()}
        onSkip={() => runner.current.skip()}
        onCancel={() => runner.current.cancel()}
      />
    </div>
  );
}
