// Ported from refined-prun src/features/XIT/ACT/action-steps/OPEN_SFC.ts.
//
// Mobile adaptation: instead of opening a split desktop tile, this opens the
// SFC buffer in the mobile background navigator, optionally pre-fills the
// destination planet via the AddressSelector, then restores the container so
// the buffer is visible in APEX. The user is prompted to switch to APEX (via
// the Show APEX button in the act runner), take flight, return to APXM, and
// tap ACT to confirm.

import { act } from '../act-registry';
import { useShipsStore } from '../../../stores/entities/ships';
import { focusElement, clickElement, sleep } from '../_compat';
import { setInputValue } from '../../buffer-refresh/dom-helpers';
import { showMobileBufferContents } from '../../mobile-buffer-navigator';
import type { AssertFn } from '../shared-types';

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
    const { data, log, setStatus, openTileSilent, waitAct, complete } = ctx;
    const assert: AssertFn = ctx.assert;

    const ship = useShipsStore.getState().getById(data.shipId);
    assert(ship, 'Ship not found');

    const shipLabel = ship.name ?? ship.registration ?? data.shipId;

    // Open the SFC buffer automatically in the background.
    setStatus(`Opening SFC for ${shipLabel}...`);
    const tile = await openTileSilent(`SFC ${ship.registration}`);
    if (!tile) return;

    // Pre-fill the destination planet if one was specified.
    if (data.destination) {
      setStatus(`Setting destination to ${data.destination}...`);
      const bufContainer = tile.anchor as HTMLElement;

      // WebKit requires visibility:visible for focus and input events.
      const prevVisibility = bufContainer.style.visibility;
      const prevLeft = bufContainer.style.left;
      bufContainer.style.visibility = 'visible';
      bufContainer.style.left = '0px';

      // Find the destination AddressSelector input inside the SFC buffer.
      const input = _$$<HTMLInputElement>(document.documentElement, C.AddressSelector.input)[0];
      if (input) {
        focusElement(input);
        setInputValue(input, data.destination);
        await sleep(300);

        // Wait for the autosuggest portal to populate and click the first entry.
        const portal =
          document.getElementById('autosuggest-portal') ?? (document.body as HTMLElement);
        const suggestion = (await $(
          portal,
          C.AddressSelector.suggestionContent,
          3000,
        )) as HTMLElement | null;

        if (suggestion) {
          await clickElement(suggestion);
          log.info(`Destination set: ${data.destination}`);
        } else {
          log.warning(`No suggestion found for ${data.destination} — set destination manually`);
        }
      } else {
        log.warning('SFC address input not found — set destination manually');
      }

      // Restore off-screen position; showMobileBufferContents() will reveal
      // the buffer at the right moment below.
      bufContainer.style.left = prevLeft;
      bufContainer.style.visibility = prevVisibility;
    }

    // Make the SFC buffer visible in APEX (restore #container without closing
    // the buffer or navigating away).
    showMobileBufferContents();

    const destMsg = data.destination ? ` with destination ${data.destination}` : '';
    await waitAct(
      `SFC for ${shipLabel}${destMsg} is ready — tap Show APEX, take flight, return to APXM, then tap ACT`,
    );
    complete();
  },
});
