/**
 * Mobile buffer navigator for the ported ACT action runner.
 *
 * Desktop refined-prun opens a dedicated tile per buffer command via its
 * TileAllocator. Mobile APEX has a single serial buffer and a hierarchical
 * Stack UI, so this module drives the same Stack-navigation sequence the
 * buffer-refresh engine already uses (see lib/buffer-refresh/engine.ts) to
 * open an arbitrary buffer command, then waits for the buffer's form to render.
 *
 * #container is NOT hidden during navigation. APXM is always overlaid on top
 * of APEX while the action runner is active, so hiding is redundant and
 * harmful: it triggers APEX's CSS transition listeners which interpret the
 * slide-out as a navigation event.
 */

import {
  getContainer,
  isAtStacksTopLevel,
  navigateToStacksTopLevel,
  findBufferStackHeader,
  findAddNewCardButton,
  getCommandInput,
  findCreateButton,
  findCancelButton,
  findCardByCommand,
  setInputValue,
  waitForElement,
} from './buffer-refresh/dom-helpers';
import { warn, error } from './debug/logger';

/** Timeout for each Stack-navigation DOM step. */
const STEP_TIMEOUT_MS = 2000;

/**
 * Timeout for the buffer form to render after the card is clicked. Longer than
 * a navigation step because opening a buffer can involve a server round-trip.
 */
const FORM_TIMEOUT_MS = 10000;

/**
 * The buffer form sentinel. Match only the ACTIVE variant of FormComponent so
 * buffer-list cards (which render as Passive) don't produce a false positive
 * and cause openMobileBuffer to return before the real buffer form is ready.
 * The CSS-module class is FormComponent__containerActive / containerMobileActive;
 * matching the shared "containerActive" substring covers both variants.
 */
function findBufferForm(): HTMLElement | null {
  const container = getContainer();
  if (!container) {
    return null;
  }
  return container.querySelector<HTMLElement>('[class*="FormComponent__containerActive"]');
}

/**
 * Open an APEX buffer for `command` by driving the mobile Stack UI.
 *
 * Mirrors lib/buffer-refresh/engine.ts steps 1-8, then waits for the buffer's
 * form to render. #container is left at its natural position throughout —
 * APXM's overlay already covers APEX, so there is no need to hide it.
 * On failure the navigation is unwound before returning false.
 */
export async function openMobileBuffer(command: string): Promise<boolean> {
  const container = getContainer();
  if (!container) {
    error('openMobileBuffer: #container not found');
    return false;
  }

  try {
    // Step 1-2: ensure we're at the Stacks top level (Buffer stack header visible).
    if (!isAtStacksTopLevel()) {
      const header = await waitForElement(findBufferStackHeader, STEP_TIMEOUT_MS);
      if (!header) {
        const reached = await navigateToStacksTopLevel(STEP_TIMEOUT_MS);
        if (!reached) {
          throw new Error('Could not navigate to Stacks top level');
        }
      }
    }

    // Step 3: open the Buffer stack.
    const stackHeader = findBufferStackHeader();
    if (!stackHeader) {
      throw new Error('Buffer stack header disappeared');
    }
    stackHeader.click();

    // Step 4: add a new card.
    const addButton = await waitForElement(findAddNewCardButton, STEP_TIMEOUT_MS);
    if (!addButton) {
      throw new Error('Add New Card button did not appear');
    }
    addButton.click();

    // Step 5: enter the buffer command.
    const input = await waitForElement(getCommandInput, STEP_TIMEOUT_MS);
    if (!input) {
      throw new Error('Command input did not appear');
    }
    setInputValue(input, command);

    // Step 6: confirm card creation.
    const createBtn = await waitForElement(findCreateButton, STEP_TIMEOUT_MS);
    if (!createBtn) {
      throw new Error('CREATE button did not appear');
    }
    createBtn.click();

    // Step 7: open the freshly created card.
    const card = await waitForElement(() => findCardByCommand(command), STEP_TIMEOUT_MS);
    if (!card) {
      throw new Error(`Card for "${command}" did not appear`);
    }
    card.click();

    // Step 8: wait for the buffer's form to render.
    const form = await waitForElement(findBufferForm, FORM_TIMEOUT_MS);
    if (!form) {
      throw new Error(`Buffer form for "${command}" did not render`);
    }

    return true;
  } catch (err) {
    error('openMobileBuffer:', err instanceof Error ? err.message : String(err));
    await closeMobileBuffer();
    return false;
  }
}

/**
 * No-op shim kept for call-site compatibility. Previously made #container
 * visible after off-screen navigation; now that the navigator never hides
 * the container this function has nothing to do.
 */
export function showMobileBufferContents(): void {
  // intentional no-op
}

/**
 * Close the current buffer: dismiss any leftover add-card dialog and navigate
 * back to the Stacks top level.
 *
 * Safe to call when no buffer is open — every step is a no-op in that case.
 */
export async function closeMobileBuffer(): Promise<void> {
  // Dismiss a half-finished add-card dialog left behind by a failed open.
  const cancelBtn = findCancelButton();
  if (cancelBtn) {
    cancelBtn.click();
  }

  // Navigate back out of any open buffer to the Stacks top level.
  if (!isAtStacksTopLevel()) {
    const reached = await navigateToStacksTopLevel(STEP_TIMEOUT_MS);
    if (!reached) {
      warn('closeMobileBuffer: could not navigate back to Stacks top level');
    }
  }
}
