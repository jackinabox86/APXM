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
/**
 * @param searchName Full material name to type into the input (e.g. "Water").
 *   APEX's MTRA material selector filters by name, not ticker.
 * @param ticker     Ticker to match in the suggestion list (e.g. "H2O").
 */
export async function selectMaterial(container: Element, ticker: string, searchName: string): Promise<boolean> {
  const input = (await $(container, C.MaterialSelector.input)) as HTMLInputElement | null;
  console.log('[selectMaterial] input found:', !!input, 'C.MaterialSelector.input:', C.MaterialSelector?.input);
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

  focusElement(input);
  await sleep(50);
  setInputValue(input, searchName);
  input.dispatchEvent(new Event('change', { bubbles: true }));

  // Suggestions dropdown may render in a React portal at document.body rather
  // than inside the MaterialSelector container — search locally first (fast),
  // then fall back to the full document.
  let suggestionsList = await $(container, C.MaterialSelector.suggestionsList, 2000);
  if (!suggestionsList) {
    console.log('[selectMaterial] suggestionsList not in container, trying document.body');
    suggestionsList = await $(document.body, C.MaterialSelector.suggestionsList, 8000);
  }
  console.log('[selectMaterial] suggestionsList found:', !!suggestionsList, 'C.MaterialSelector.suggestionsList:', C.MaterialSelector?.suggestionsList);
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
