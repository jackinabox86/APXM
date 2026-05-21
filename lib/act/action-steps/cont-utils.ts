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
export async function selectMaterial(container: Element, ticker: string): Promise<boolean> {
  const input = (await $(container, C.MaterialSelector.input)) as HTMLInputElement | null;
  if (!input) {
    return false;
  }

  // suggestionsContainer may be absent on some APEX builds — handle gracefully
  const suggestionsContainer = (await $(
    container,
    C.MaterialSelector.suggestionsContainer,
  )) as HTMLElement | null;

  focusElement(input);
  setInputValue(input, ticker);

  const suggestionsList = await $(container, C.MaterialSelector.suggestionsList);
  if (!suggestionsList) {
    if (suggestionsContainer) suggestionsContainer.style.display = '';
    return false;
  }

  if (suggestionsContainer) {
    suggestionsContainer.style.display = 'none';
  }

  const match = _$$(suggestionsList, C.MaterialSelector.suggestionEntry).find(
    (entry) => _$(entry, C.ColoredIcon.label)?.textContent === ticker,
  );

  if (!match) {
    if (suggestionsContainer) suggestionsContainer.style.display = '';
    return false;
  }

  await clickElement(match as HTMLElement);
  if (suggestionsContainer) suggestionsContainer.style.display = '';
  await sleep(200);
  return true;
}
