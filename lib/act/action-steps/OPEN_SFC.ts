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
    console.log('[OPEN_SFC] calling requestTile for SFC', ship.registration);
    const tile = await requestTile(`SFC ${ship.registration}`);
    console.log('[OPEN_SFC] requestTile returned:', tile ? 'tile' : 'null');
    if (!tile) return;

    // Auto-fill destination if one was specified.
    // Wrapped in try-catch so any exception is contained — the runner must always
    // reach waitAct() so the buffer stays open for the user to take flight.
    if (data.destination) {
      try {
        console.log('[OPEN_SFC] starting destination fill for:', data.destination);
        console.log('[OPEN_SFC] C.AddressSelector keys:', JSON.stringify(C.AddressSelector));
        setStatus(`Setting destination to ${data.destination}...`);
        const bufContainer = tile.anchor as HTMLElement;
        const prevVisibility = bufContainer.style.visibility;
        const prevLeft = bufContainer.style.left;

        // Mirror selectMaterial (cont-utils.ts): make buffer visible before any
        // focus or keyboard interaction — WebKit blocks those events on hidden elements.
        bufContainer.style.visibility = 'visible';
        bufContainer.style.left = '0px';

        // Find the AddressSelector input inside the SFC buffer.
        const input = _$$<HTMLInputElement>(tile.anchor, C.AddressSelector.input)[0];
        console.log('[OPEN_SFC] AddressSelector.input found:', !!input, input?.tagName, input?.className?.slice(0, 60));

        if (input) {
          // Focus the input — on mobile, this may trigger APEX to navigate to
          // a full-screen destination picker (second "star graph initialized" in
          // the console). After focus we re-query the input from the live DOM
          // in case the picker remounted a new input element.
          focusElement(input);
          await sleep(200);

          // Re-query after focus: if APEX navigated to a destination picker the
          // stale input reference would dispatch events to a detached node.
          const liveInput = _$$<HTMLInputElement>(document.body, C.AddressSelector.input)
            .find(el => el.offsetParent !== null && !el.closest('apxm-overlay'));
          const activeInput = liveInput ?? input;
          console.log('[OPEN_SFC] liveInput after focus:', !!liveInput, liveInput === input ? '(same)' : '(different)');

          // Clear any existing value.
          const nativeSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
          )?.set;
          if (nativeSetter) nativeSetter.call(activeInput, '');
          else activeInput.value = '';
          activeInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
          await sleep(50);

          // Char-by-char keyboard simulation — mirrors selectMaterial in cont-utils.ts.
          // setInputValue alone only triggers the fetch; the keydown/keyup sequence is
          // what causes APEX to render the suggestion dropdown.
          for (const char of data.destination) {
            activeInput.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true }));
            activeInput.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true, cancelable: true }));
            if (nativeSetter) nativeSetter.call(activeInput, activeInput.value + char);
            else activeInput.value += char;
            activeInput.dispatchEvent(new InputEvent('input', { data: char, inputType: 'insertText', bubbles: true }));
            activeInput.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true, cancelable: true }));
            await sleep(30);
          }

          console.log('[OPEN_SFC] finished typing, searching for suggestions');

          // Search for the first suggestion that contains the destination text.
          // Search inside tile.anchor first (SFC buffer scope), then the autosuggest
          // portal, then document.body as a last resort.
          const destLower = data.destination.toLowerCase();
          const portal = document.getElementById('autosuggest-portal') as HTMLElement | null;
          console.log('[OPEN_SFC] autosuggest-portal found:', !!portal);

          // Count existing li/option elements BEFORE suggestions so we can filter
          // pre-existing noise (e.g. star-graph route nodes).
          const preExistingLi = new Set(
            Array.from(document.body.querySelectorAll<HTMLElement>('li, [role="option"]')),
          );

          const suggestion = await waitForElement<HTMLElement>(() => {
            // Use the known AddressSelector.suggestion CSS class first (most precise).
            // Fall back to generic li/[role=option] if the class isn't populated.
            const searchRoot: Element = portal ?? document.body;
            const cls = C.AddressSelector?.suggestion;
            const candidates = cls
              ? searchRoot.querySelectorAll<HTMLElement>(`.${cls}`)
              : searchRoot.querySelectorAll<HTMLElement>('li, [role="option"]');
            for (const el of candidates) {
              if ((el.textContent?.toLowerCase() ?? '').includes(destLower)) {
                if (!preExistingLi.has(el)) return el;
              }
            }
            // Fallback: accept pre-existing elements if text matches.
            for (const el of candidates) {
              if ((el.textContent?.toLowerCase() ?? '').includes(destLower)) return el;
            }
            return null;
          }, 3000);

          console.log('[OPEN_SFC] suggestion found:', !!suggestion,
            suggestion?.tagName, suggestion?.className?.slice(0, 60),
            JSON.stringify(suggestion?.textContent?.trim().slice(0, 80)));

          if (suggestion) {
            await clickElement(suggestion);
            log.info(`Destination set: ${data.destination}`);
          } else {
            log.warning(`No suggestion found for ${data.destination} — set destination manually`);
          }
        } else {
          log.warning('SFC address input not found — set destination manually');
        }

        // Do NOT restore left/visibility here. Restoring to -9999px after the
        // suggestion click triggers APEX's CSS transition listener, which treats
        // the slide-out as a navigation event and renders the buffer list.
        // showMobileBufferContents() below sets the final visible state directly.
        console.log('[OPEN_SFC] destination fill block completed normally');
      } catch (e) {
        console.error('[OPEN_SFC] destination fill error:', e);
        log.warning(`Could not auto-fill destination — set ${data.destination} manually`);
      }
    }

    // Leave the SFC buffer visible in APEX.
    console.log('[OPEN_SFC] calling showMobileBufferContents');
    showMobileBufferContents();
    console.log('[OPEN_SFC] calling waitAct');
    await waitAct(
      `SFC for ${shipLabel}${destMsg} ready — tap Show APEX, take flight, return to APXM, then tap ACT`,
    );
    console.log('[OPEN_SFC] waitAct resolved — calling complete');
    complete();
  },
});
