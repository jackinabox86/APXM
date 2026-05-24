// Ported from refined-prun src/features/XIT/ACT/action-steps/OPEN_SFC.ts.
//
// Mobile adaptation:
// - Buffer is opened via requestTile (same proven path as MTRA_TRANSFER).
// - Destination is filled by mirroring the selectMaterial pattern from
//   cont-utils.ts: make buffer visible, focus, char-by-char keyboard simulation,
//   then find the first autosuggest entry by text content.
//   setInputValue alone triggers the fetch but not the DOM render of the dropdown;
//   the keyboard event sequence is required for the suggestions to appear.
//   Suggestion matching uses text content rather than a specific CSS class because
//   the AddressSelector's suggestion CSS class name is not known in advance.
// - showMobileBufferContents() leaves the SFC buffer visible in APEX so the
//   user can tap TAKE FLIGHT after switching via Show APEX in the header.

import { act } from '../act-registry';
import { useShipsStore } from '../../../stores/entities/ships';
import { focusElement, clickElement, sleep } from '../_compat';
import { waitForElement } from '../../buffer-refresh/dom-helpers';
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
    // Wrapped in try-catch so any exception (APEX event handler throw, wrong element
    // click, etc.) is contained here — the runner must always reach waitAct() so the
    // buffer stays open for the user to tap Show APEX and take flight.
    if (data.destination) {
      try {
        setStatus(`Setting destination to ${data.destination}...`);
        const bufContainer = tile.anchor as HTMLElement;

        // Mirror selectMaterial (cont-utils.ts): make buffer visible before any
        // focus or keyboard interaction — WebKit blocks those events on hidden elements.
        const prevVisibility = bufContainer.style.visibility;
        const prevLeft = bufContainer.style.left;
        bufContainer.style.visibility = 'visible';
        bufContainer.style.left = '0px';

        // Find the AddressSelector input inside the SFC buffer.
        const input = _$$<HTMLInputElement>(tile.anchor, C.AddressSelector.input)[0];
        if (input) {
          focusElement(input);
          await sleep(100);

          // Clear any existing value.
          const nativeSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
          )?.set;
          if (nativeSetter) nativeSetter.call(input, '');
          else input.value = '';
          input.dispatchEvent(new InputEvent('input', { bubbles: true }));
          await sleep(50);

          // Char-by-char keyboard simulation — mirrors selectMaterial in cont-utils.ts.
          // setInputValue alone only triggers the fetch; the keydown/keyup sequence is
          // what causes APEX to render the suggestion dropdown.
          for (const char of data.destination) {
            input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true }));
            input.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true, cancelable: true }));
            if (nativeSetter) nativeSetter.call(input, input.value + char);
            else input.value += char;
            input.dispatchEvent(new InputEvent('input', { data: char, inputType: 'insertText', bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true, cancelable: true }));
            await sleep(30);
          }

          // Search for the first suggestion that contains the destination text.
          // Instead of relying on C.AddressSelector.suggestionContent (CSS class
          // unknown), match by text content — the same approach selectMaterial uses
          // to match entries by C.ColoredIcon.label text content.
          const destLower = data.destination.toLowerCase();
          const portal = document.getElementById('autosuggest-portal') as HTMLElement | null;
          const searchRoot: Element = portal ?? document.body;

          const suggestion = await waitForElement<HTMLElement>(() => {
            const candidates = searchRoot.querySelectorAll<HTMLElement>('li, [role="option"]');
            for (const el of candidates) {
              if (el.textContent?.toLowerCase().includes(destLower)) {
                return el;
              }
            }
            return null;
          }, 3000);

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
        // the buffer with the destination filled.
        bufContainer.style.left = prevLeft;
        bufContainer.style.visibility = prevVisibility;
      } catch (e) {
        console.error('[OPEN_SFC] destination fill error:', e);
        log.warning(`Could not auto-fill destination — set ${data.destination} manually`);
      }
    }

    // Leave the SFC buffer visible in APEX.
    showMobileBufferContents();

    await waitAct(
      `SFC for ${shipLabel}${destMsg} ready — tap Show APEX, take flight, return to APXM, then tap ACT`,
    );
    complete();
  },
});
