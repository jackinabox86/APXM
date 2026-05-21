// Ported from refined-prun src/features/XIT/ACT/action-steps/OPEN_SFC.ts.
//
// OPEN_SFC only fires when MTRA transfers material into a ship store (the
// auto-SFC flow). Base resupply and repair flows never trigger it. The full
// desktop implementation opens a split SFC tile and optionally sets a
// destination — both require desktop-only Window.window / tile.frame APIs
// that do not exist on mobile.
//
// Stub: pause for manual user action and then complete so that the rest of
// the action package can continue.

import { act } from '../act-registry';
import { useShipsStore } from '../../../stores/entities/ships';

interface Data {
  shipId: string;
  destination?: string;
}

export const OPEN_SFC = act.addActionStep<Data>({
  type: 'OPEN_SFC',
  description: data => {
    const ship = useShipsStore.getState().getById(data.shipId);
    const shipLabel = ship?.name ?? ship?.registration ?? data.shipId;
    return data.destination
      ? `Open SFC for ${shipLabel}, set destination to ${data.destination}`
      : `Open SFC for ${shipLabel}`;
  },
  execute: async ctx => {
    const { data, waitAct, complete } = ctx;
    const ship = useShipsStore.getState().getById(data.shipId);
    const shipLabel = ship?.name ?? ship?.registration ?? data.shipId;
    const prompt = data.destination
      ? `Open SFC for ${shipLabel} and set destination to ${data.destination} manually`
      : `Open SFC for ${shipLabel} manually`;
    await waitAct(prompt);
    complete();
  },
});
