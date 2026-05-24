// Ported from refined-prun src/features/XIT/ACT/action-steps/OPEN_SFC.ts.
//
// Mobile adaptation:
// - Buffer is opened via requestTile (same proven path as MTRA_TRANSFER).
// - #container is no longer hidden during navigation, so no visibility
//   manipulation is needed before or after destination fill.
// - Destination is pre-typed char-by-char so the AddressSelector suggestion
//   dropdown is open and ready when the user taps Show APEX. The user then
//   taps the suggestion themselves — programmatic suggestion clicks cause APEX
//   to navigate away from the SFC buffer on mobile, so we stop at typing.
// - showMobileBufferContents() is now a no-op (navigator no longer hides
//   #container) but is kept for clarity.

import { act } from '../act-registry';
import { useShipsStore } from '../../../stores/entities/ships';
import { focusElement, sleep } from '../_compat';
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

    // Pre-type the destination so the suggestion dropdown is ready when the
    // user taps Show APEX. We do NOT click the suggestion programmatically —
    // doing so causes APEX to navigate away from the SFC buffer on mobile.
    if (data.destination) {
      try {
        setStatus(`Pre-filling destination: ${data.destination}...`);

        const input = _$$<HTMLInputElement>(tile.anchor, C.AddressSelector.input)[0];
        if (input) {
          focusElement(input);
          await sleep(150);

          // Clear any existing value.
          const nativeSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
          )?.set;
          if (nativeSetter) nativeSetter.call(input, '');
          else input.value = '';
          input.dispatchEvent(new InputEvent('input', { bubbles: true }));
          await sleep(50);

          // Char-by-char keyboard simulation — triggers APEX's server-side
          // suggestion fetch so the dropdown is populated when shown to the user.
          for (const char of data.destination) {
            input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true }));
            input.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true, cancelable: true }));
            if (nativeSetter) nativeSetter.call(input, input.value + char);
            else input.value += char;
            input.dispatchEvent(new InputEvent('input', { data: char, inputType: 'insertText', bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true, cancelable: true }));
            await sleep(30);
          }

          // Wait for the suggestion dropdown to populate (informational — we do
          // not click it; the user will tap the suggestion in Show APEX).
          const destLower = data.destination.toLowerCase();
          const portal = document.getElementById('autosuggest-portal') as HTMLElement | null;
          const searchRoot: Element = portal ?? document.body;
          const cls = C.AddressSelector?.suggestion;
          const suggestion = await waitForElement<HTMLElement>(() => {
            const candidates = cls
              ? searchRoot.querySelectorAll<HTMLElement>(`.${cls}`)
              : searchRoot.querySelectorAll<HTMLElement>('li, [role="option"]');
            for (const el of candidates) {
              if ((el.textContent?.toLowerCase() ?? '').includes(destLower)) return el;
            }
            return null;
          }, 2000);

          if (suggestion) {
            log.info(`Destination "${data.destination}" ready in dropdown — tap it in Show APEX`);
          } else {
            log.warning(`Suggestion for "${data.destination}" not visible — type it manually in Show APEX`);
          }
        } else {
          log.warning('SFC address input not found — set destination manually in Show APEX');
        }
      } catch (e) {
        console.error('[OPEN_SFC] destination pre-fill error:', e);
        log.warning(`Could not pre-fill destination — set ${data.destination} manually`);
      }
    }

    // showMobileBufferContents() is a no-op now that the navigator never hides
    // #container, but kept here to make the intent explicit.
    showMobileBufferContents();

    const tapMsg = data.destination
      ? `SFC for ${shipLabel}${destMsg} ready — tap Show APEX, select "${data.destination}" in the dropdown, take flight, return to APXM, then tap ACT`
      : `SFC for ${shipLabel} ready — tap Show APEX, set destination, take flight, return to APXM, then tap ACT`;

    await waitAct(tapMsg);
    complete();
  },
});
