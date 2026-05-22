// Ported from refined-prun src/features/XIT/ACT/action-steps/cont-utils.ts.
// Only the selectMaterial helper is needed for BURNACT/REPAIRACT.
// CONTD draft helpers (createNewDraft, setDraftNameAndPreamble, etc.) are
// not ported — they are not used by the resupply or repair flows.
//
// Uses C, $, _$, _$$ as globals (populated by setupActGlobals() at runtime).

import { focusElement, clickElement, sleep } from '../_compat';
import { setInputValue } from '../../buffer-refresh/dom-helpers';

/**
 * Select a material by ticker inside a MaterialSelector component.
 * Returns true on success, false if the ticker was not found.
 */
/** Convert PrunApi camelCase name to APEX display name: "advancedDeckElements" → "Advanced Deck Elements" */
export function toDisplayName(name: string): string {
  return name.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}

/**
 * Select a material by ticker inside a MaterialSelector component.
 * Types the ticker into the input (APEX accepts ticker or full name).
 */
export async function selectMaterial(container: Element, ticker: string): Promise<boolean> {
  // Mobile APEX renders inputMobile; desktop renders input. Try mobile first.
  let input = (await $(container, C.MaterialSelector.inputMobile, 1000)) as HTMLInputElement | null;
  if (!input) {
    input = (await $(container, C.MaterialSelector.input)) as HTMLInputElement | null;
  }
  console.log('[selectMaterial] input found:', !!input, 'mobile?', !!_$(container, C.MaterialSelector.inputMobile));
  if (!input) {
    return false;
  }

  // suggestionsContainer may be absent on some APEX builds — handle gracefully
  const suggestionsContainer = (await $(
    container,
    C.MaterialSelector.suggestionsContainer,
    2000,
  )) as HTMLElement | null;
  console.log('[selectMaterial] suggestionsContainer found:', !!suggestionsContainer);

  // Click the input rather than just focus — APEX's MaterialSelector transitions
  // to "active" state (showing suggestions) on click, not on programmatic focus.
  await clickElement(input);
  await sleep(100);
  console.log('[selectMaterial] container class after click:', (container as HTMLElement).className?.slice(0, 120));
  console.log('[selectMaterial] activeElement after click:', document.activeElement?.className?.slice(0, 60));
  setInputValue(input, ticker);
  input.dispatchEvent(new Event('change', { bubbles: true }));
  console.log('[selectMaterial] input.value after set:', input.value);
  console.log('[selectMaterial] suggestionsContainer children before wait:', suggestionsContainer?.children.length, suggestionsContainer?.innerHTML.slice(0, 200));

  // Suggestions dropdown may render in a React portal at document.body rather
  // than inside the MaterialSelector container — search locally first (fast),
  // then fall back to the full document.
  let suggestionsList = await $(container, C.MaterialSelector.suggestionsList, 2000);
  if (!suggestionsList) {
    console.log('[selectMaterial] suggestionsList not in container, trying document.body');
    suggestionsList = await $(document.body, C.MaterialSelector.suggestionsList, 8000);
  }
  console.log('[selectMaterial] suggestionsList found:', !!suggestionsList, 'C.MaterialSelector.suggestionsList:', C.MaterialSelector?.suggestionsList);
  console.log('[selectMaterial] suggestionsContainer children after wait:', suggestionsContainer?.children.length, suggestionsContainer?.innerHTML.slice(0, 200));
  if (!suggestionsList) {
    if (suggestionsContainer) suggestionsContainer.style.display = '';
    return false;
  }

  if (suggestionsContainer) {
    suggestionsContainer.style.display = 'none';
  }

  const entries = _$$(suggestionsList, C.MaterialSelector.suggestionEntry);
  console.log('[selectMaterial] entries count:', entries.length, 'C.MaterialSelector.suggestionEntry:', C.MaterialSelector?.suggestionEntry);
  const match = entries.find(
    (entry) => _$(entry, C.ColoredIcon.label)?.textContent === ticker,
  );
  console.log('[selectMaterial] match found:', !!match, 'C.ColoredIcon.label:', C.ColoredIcon?.label);

  if (!match) {
    if (suggestionsContainer) suggestionsContainer.style.display = '';
    return false;
  }

  await clickElement(match as HTMLElement);
  if (suggestionsContainer) suggestionsContainer.style.display = '';
  await sleep(200);
  return true;
}
