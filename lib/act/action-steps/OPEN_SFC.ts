// Ported from refined-prun src/features/XIT/ACT/action-steps/OPEN_SFC.ts.
//
// Mobile adaptation:
// - Buffer is opened via requestTile (the same proven path used by MTRA_TRANSFER).
//   The user taps ACT once to trigger the automated open; the runner then drives
//   the SFC form itself without any further manual interaction.
// - If a destination is provided, the AddressSelector input is filled and the
//   first autosuggest entry is clicked automatically (buffer temporarily made
//   visible to satisfy WebKit's event restrictions, per mobile-integration.md).
// - showMobileBufferContents() leaves the SFC buffer visible in APEX so the
//   user can see it and tap TAKE FLIGHT after switching views via Show APEX
//   (already present in the APXM header).

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
      const bufContainer = tile.anchor as HTMLElement;

      // WebKit requires visibility:visible for focus and input events
      // (see docs/mobile-integration.md §1).
      const prevVisibility = bufContainer.style.visibility;
      const prevLeft = bufContainer.style.left;
      bufContainer.style.visibility = 'visible';
      bufContainer.style.left = '0px';

      // The SFC destination field uses the AddressSelector component.
      // C.AddressSelector.input is populated from APEX's injected CSS —
      // the same class hash is present on both mobile and desktop builds.
      const input = _$$<HTMLInputElement>(tile.anchor, C.AddressSelector.input)[0];
      if (input) {
        focusElement(input);
        await sleep(100);

        // Clear any existing value then type character-by-character.
        // APEX's AddressSelector autocomplete listens for keydown/keyup events,
        // matching the MaterialSelector pattern in cont-utils.ts.
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set;
        if (nativeSetter) nativeSetter.call(input, '');
        else input.value = '';
        input.dispatchEvent(new InputEvent('input', { bubbles: true }));
        await sleep(50);

        for (const char of data.destination) {
          input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true }));
          input.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true, cancelable: true }));
          if (nativeSetter) nativeSetter.call(input, input.value + char);
          else input.value += char;
          input.dispatchEvent(new InputEvent('input', { data: char, inputType: 'insertText', bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true, cancelable: true }));
          await sleep(30);
        }

        // Wait for the autosuggest portal to populate.
        const portal =
          (document.getElementById('autosuggest-portal') as HTMLElement | null) ?? document.body;
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

      // Restore hidden position before revealing via showMobileBufferContents.
      bufContainer.style.left = prevLeft;
      bufContainer.style.visibility = prevVisibility;
    }

    // Leave the SFC buffer visible in APEX so the user can see and interact
    // with it after tapping Show APEX in the APXM header.
    showMobileBufferContents();

    await waitAct(
      `SFC for ${shipLabel}${destMsg} ready — tap Show APEX to view, take flight, return to APXM, then tap ACT`,
    );
    complete();
  },
});
