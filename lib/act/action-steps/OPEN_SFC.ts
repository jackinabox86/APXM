// Ported from refined-prun src/features/XIT/ACT/action-steps/OPEN_SFC.ts.
//
// Mobile adaptation:
// - Buffer is opened via requestTile (the same proven path used by MTRA_TRANSFER).
//   The user taps ACT once to trigger the automated open; the runner then drives
//   the SFC form itself without any further manual interaction.
// - If a destination is provided, the AddressSelector input is filled using
//   setInputValue (native-setter + 'input' event). This fires the same
//   'input-changed' handler that APEX's autocomplete uses (confirmed by console:
//   "suggestions fetch requested: ... -> input-changed"), and avoids making the
//   buffer visible — which would allow keyboard events to bubble into APEX's
//   navigation handlers and cause the buffer to navigate back unexpectedly.
//   Programmatic .click() on the suggestion works even with the buffer hidden
//   (WebKit only blocks focus/keyboard events on hidden elements, not mouse clicks).
// - Destination should be the planet's natural ID (e.g. "ZV-307D") for reliable
//   autocomplete matching.
// - showMobileBufferContents() leaves the SFC buffer visible in APEX so the
//   user can see it and tap TAKE FLIGHT after switching via Show APEX in the header.

import { act } from '../act-registry';
import { useShipsStore } from '../../../stores/entities/ships';
import { clickElement, sleep } from '../_compat';
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
    const { data, log, setStatus, requestTile, waitAct, complete } = ctx;
    const assert: AssertFn = ctx.assert;

    const ship = useShipsStore.getState().getById(data.shipId);
    assert(ship, 'Ship not found');

    const shipLabel = ship.name ?? ship.registration ?? data.shipId;
    const destMsg = data.destination ? ` → ${data.destination}` : '';

    // requestTile follows the proven APXM pattern: waitAct (user taps ACT) →
    // openMobileBuffer (runner navigates and opens the buffer automatically).
    const tile = await requestTile(`SFC ${ship.registration}`);
    if (!tile) return;

    // Auto-fill destination if one was specified.
    if (data.destination) {
      setStatus(`Setting destination to ${data.destination}...`);

      // Find the destination AddressSelector input inside the SFC buffer.
      // C.AddressSelector.input is populated from APEX's injected CSS.
      const input = _$$<HTMLInputElement>(tile.anchor, C.AddressSelector.input)[0];
      if (input) {
        // Use setInputValue (native-setter + 'input' event) while the buffer stays
        // hidden. This fires APEX's autocomplete 'input-changed' handler without
        // making the buffer visible — keeping the buffer visible during typing
        // allows keyboard events to bubble into APEX's navigation handlers and
        // causes the buffer to navigate back to the card list.
        setInputValue(input, data.destination);
        await sleep(500); // allow the autocomplete fetch to complete

        // Find the first autosuggest entry. The portal may be outside #container.
        const portal =
          (document.getElementById('autosuggest-portal') as HTMLElement | null) ?? document.body;
        const suggestion = (await $(
          portal,
          C.AddressSelector.suggestionContent,
          3000,
        )) as HTMLElement | null;

        if (suggestion) {
          // Programmatic .click() works on hidden elements — WebKit only blocks
          // focus and keyboard events on visibility:hidden / off-screen elements.
          await clickElement(suggestion);
          log.info(`Destination set: ${data.destination}`);
        } else {
          log.warning(`No suggestion found for ${data.destination} — set destination manually`);
        }
      } else {
        log.warning('SFC address input not found — set destination manually');
      }
    }

    // Leave the SFC buffer visible in APEX so the user can see and interact
    // with it after tapping Show APEX in the APXM header.
    showMobileBufferContents();

    await waitAct(
      `SFC for ${shipLabel}${destMsg} ready — tap Show APEX, take flight, return to APXM, then tap ACT`,
    );
    complete();
  },
});
