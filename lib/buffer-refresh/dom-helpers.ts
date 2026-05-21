/**
 * APEX DOM queries and manipulation for buffer refresh.
 *
 * All DOM interaction is isolated here so the engine and batch executor
 * never touch the DOM directly. Every query returns null on failure —
 * callers decide how to handle missing elements.
 */

import { log, error } from '../debug/logger';

// -- Saved styles type --

export interface SavedStyles {
  visibility: string;
  display: string;
  position: string;
  left: string;
}

// -- Query functions --

export function getContainer(): HTMLElement | null {
  return document.getElementById('container');
}

/** Check if APEX is showing the top-level Stacks view (Buffer stack visible). */
export function isAtStacksTopLevel(): boolean {
  return findBufferStackHeader() !== null;
}

/** Find the H2 heading for the "Buffer" stack in APEX. */
export function findBufferStackHeader(): HTMLElement | null {
  const headings = document.querySelectorAll('#container h2');
  for (const h2 of headings) {
    if (h2.textContent?.trim().toLowerCase() === 'buffer') {
      return h2 as HTMLElement;
    }
  }
  return null;
}

/**
 * Find a clickable navigation element that goes "up" in APEX's stack hierarchy.
 *
 * APEX breadcrumbs show "stack" (singular) when inside a buffer, and
 * "stacks" (plural) from the buffer list level. Match both to handle
 * multi-level navigation depth.
 *
 * Two-pass search:
 * 1. Leaf elements (no child elements) — handles plain text and <span>Stacks</span>.
 * 2. Any element whose trimmed textContent matches — handles mobile patterns like
 *    <button><svg/> Stacks</button> where the SVG is a child element but has empty
 *    textContent, so the button's textContent still equals "Stacks". The last match
 *    in document pre-order is kept, yielding the most specific element.
 */
export function findBackNav(): HTMLElement | null {
  // APEX may apply CSS text-transform — compare case-insensitively
  const all = document.body.querySelectorAll<HTMLElement>('*');

  for (const el of all) {
    if (el.children.length === 0) {
      const text = el.textContent?.trim().toLowerCase();
      if (text === 'stacks' || text === 'stack') {
        return el;
      }
    }
  }

  // Fallback: elements whose textContent matches even with icon/SVG children.
  // Last match in document order = most specific (deepest) element.
  let fallback: HTMLElement | null = null;
  for (const el of all) {
    const text = el.textContent?.trim().toLowerCase();
    if (text === 'stacks' || text === 'stack') {
      fallback = el;
    }
  }
  return fallback;
}

/**
 * Mobile APEX back-navigation fallback.
 *
 * On mobile APEX the stack breadcrumbs (text "stacks"/"stack") are replaced
 * by an icon-only back button with no text content. We locate it structurally:
 * APEX's buffer-panel header renders controls in order [back-icon] [–] [|] [x] [:].
 *
 * Strategy 1: find the minimize button (any dash variant) and walk backward
 *   to the nearest preceding icon-only (empty text) button.
 * Strategy 2: same but anchored on the close button ("x") for resilience.
 */
export function findMobileBackButton(): HTMLElement | null {
  const buttons = Array.from(document.querySelectorAll<HTMLElement>('button'));

  // Match any single-character dash variant APEX might use for minimize.
  // U+002D hyphen-minus, U+2013 en-dash, U+2014 em-dash, U+2212 minus sign.
  const isDash = (s: string) => /^[-–—−]$/.test(s);

  /**
   * Check if a button is visually icon-only.
   *
   * `.trim() === ''` fails when the button contains invisible non-whitespace
   * Unicode: zero-width spaces (U+200B–U+200D, U+FEFF) or private-use-area
   * characters (U+E000–U+F8FF) used by icon fonts. Those appear as "" in the
   * console but have length > 0 and are not stripped by String.trim().
   */
  function isIconOnly(el: HTMLElement): boolean {
    const text = el.textContent ?? '';
    if (text.trim() === '') return true;
    // Strip zero-width chars (U+200B-U+200D, U+FEFF) + PUA icon font chars (U+E000-U+F8FF).
    const visible = text.replace(/[\s​-‍﻿-]/g, '');
    return visible === '';
  }

  function iconOnlyBefore(anchorIdx: number): HTMLElement | null {
    for (let i = anchorIdx - 1; i >= Math.max(0, anchorIdx - 5); i--) {
      if (isIconOnly(buttons[i])) return buttons[i];
    }
    return null;
  }

  const minimizeIdx = buttons.findIndex((b) => isDash(b.textContent?.trim() ?? ''));
  if (minimizeIdx >= 1) {
    // Log codepoints of the immediate predecessor so we can verify the invisible-char hypothesis.
    const candidateText = buttons[minimizeIdx - 1].textContent ?? '';
    const cps = [...candidateText].map((c) => (c.codePointAt(0) ?? 0).toString(16).padStart(4, '0')).join(' ');
    error(`findMobileBackButton: candidate[${minimizeIdx - 1}] len=${candidateText.length} codepoints=[${cps || 'empty'}]`);

    const found = iconOnlyBefore(minimizeIdx);
    if (found) {
      log('findMobileBackButton: found via minimize anchor at index', minimizeIdx);
      return found;
    }
  }

  // Fallback anchor: "x" close button, in case minimize didn't match.
  const closeIdx = buttons.findIndex((b) => b.textContent?.trim() === 'x');
  if (closeIdx >= 1) {
    const found = iconOnlyBefore(closeIdx);
    if (found) {
      log('findMobileBackButton: found via close anchor at index', closeIdx);
      return found;
    }
  }

  // Always-on: show why we couldn't find the button so we can tell whether
  // the new build is loaded and what the actual button contents look like.
  error(
    `findMobileBackButton: not found | minimizeIdx: ${minimizeIdx} | closeIdx: ${closeIdx}` +
    ` | first 8 buttons: ${buttons.slice(0, 8).map((b) => `"${(b.textContent ?? '').trim().slice(0, 20)}"`).join(', ')}`
  );
  return null;
}

/**
 * Dump DOM state to the error log when back-navigation fails.
 * Uses error() so output is visible even in production / mobile (no devtools).
 */
function logNavigationFailure(attempt: number): void {
  const h2s = Array.from(document.querySelectorAll('h2'))
    .map((h) => `"${h.textContent?.trim()}"`)
    .join(', ') || 'none';

  // First 8 direct children of #container (tag + truncated text).
  const containerEl = document.getElementById('container');
  const containerChildren = containerEl
    ? Array.from(containerEl.children)
        .slice(0, 8)
        .map((c) => `<${c.tagName.toLowerCase()}>${(c.textContent ?? '').trim().slice(0, 40)}`)
        .join(' | ')
    : 'no #container';

  // First 10 buttons anywhere in the body (text + aria-label).
  const buttons = Array.from(document.querySelectorAll('button'))
    .slice(0, 10)
    .map((b) => {
      const label = b.getAttribute('aria-label') ?? '';
      const text = (b.textContent ?? '').trim().slice(0, 30);
      return label ? `[${label}]` : `"${text}"`;
    })
    .join(', ') || 'none';

  error(
    `BufferRefresh: no back-nav (attempt ${attempt})` +
      ` | all h2s: [${h2s}]` +
      ` | #container children: [${containerChildren}]` +
      ` | buttons: [${buttons}]`
  );
}

/**
 * Navigate back to APEX's top-level stacks view by clicking breadcrumbs iteratively.
 *
 * Handles multi-level depth (e.g., PROD buffer → buffer list → stacks top level).
 * Each iteration clicks whatever back-nav element exists ("stack" or "stacks"),
 * waits for the DOM to update, then checks if we've reached the top level.
 *
 * Returns true if top level was reached, false if navigation failed.
 */
export async function navigateToStacksTopLevel(timeoutMs: number, maxAttempts: number = 5): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    if (isAtStacksTopLevel()) return true;

    // Primary: text-based breadcrumb nav ("stack" / "stacks").
    // Fallback: icon-only mobile back button identified by proximity to "–".
    const nav = findBackNav() ?? findMobileBackButton();
    if (!nav) {
      logNavigationFailure(i + 1);
      return false;
    }

    nav.click();
    // Wait for Buffer stack header — confirms we reached top level
    const header = await waitForElement(findBufferStackHeader, timeoutMs);
    if (header) return true;
    // Header didn't appear — we may be at an intermediate level. Loop and try again.
  }
  return isAtStacksTopLevel();
}

/** Find the "Add New Card" button inside the Buffer stack. */
export function findAddNewCardButton(): HTMLElement | null {
  // APEX may use "Add New Card" or "Add new card" — match case-insensitively
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    if (btn.textContent?.trim().toLowerCase() === 'add new card') {
      return btn as HTMLElement;
    }
  }
  return null;
}

/**
 * Find the "CREATE" element in the add-card form.
 * Confirmed as a <button> in POC, but may render in a portal outside
 * #container. Search all buttons in the document, fall back to leaf text.
 */
export function findCreateButton(): HTMLElement | null {
  // APEX renders "Create" in the DOM but displays "CREATE" via CSS text-transform
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    if (btn.textContent?.trim().toLowerCase() === 'create') {
      return btn as HTMLElement;
    }
  }
  return null;
}

/** Find the "Cancel" button in the add-card form (for cleanup). */
export function findCancelButton(): HTMLElement | null {
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    if (btn.textContent?.trim().toLowerCase() === 'cancel') {
      return btn as HTMLElement;
    }
  }
  return null;
}


/**
 * Find a card `<li>` by its command text (case-insensitive).
 *
 * APEX cards show the command (e.g. "BS ZV-194A") in a subtitle element
 * and the resolved name (e.g. "BASE: ANTARES III - NIKE") in the h4.
 * Search the full text content of each card to match the command regardless
 * of which child element contains it.
 */
export function findCardByCommand(cmd: string): HTMLElement | null {
  const target = cmd.toLowerCase();
  const cards = document.querySelectorAll('#container li');
  for (const li of cards) {
    if (li.textContent?.toLowerCase().includes(target)) {
      return li as HTMLElement;
    }
  }
  return null;
}

/** Find the command input element in the add-card form. */
export function getCommandInput(): HTMLInputElement | null {
  // APEX may render the add-card form in a portal outside #container
  const inputs = document.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])');
  let fallback: HTMLInputElement | null = null;

  for (const el of inputs) {
    if (el.offsetParent === null || el.closest('apxm-overlay')) continue;

    // Check the input's own placeholder attribute
    const ph = el.placeholder?.toLowerCase() ?? '';
    if (ph.includes('command') || ph.includes('buffer')) {
      return el;
    }

    // APEX renders placeholder text as a sibling/nearby element, not as an HTML
    // placeholder attribute. Check the parent container for "command" text.
    const parent = el.parentElement;
    if (parent) {
      const parentText = parent.textContent?.toLowerCase() ?? '';
      if (parentText.includes('enter content command') || parentText.includes('command')) {
        return el;
      }
    }

    // Track first visible input as fallback
    if (!fallback) fallback = el;
  }
  return fallback;
}

// -- Style management --

export function saveContainerStyles(el: HTMLElement): SavedStyles {
  return {
    visibility: el.style.visibility,
    display: el.style.display,
    position: el.style.position,
    left: el.style.left,
  };
}

/** Hide the container off-screen without display:none (APEX React needs DOM alive). */
export function applyRefreshHide(el: HTMLElement): void {
  el.style.visibility = 'hidden';
  el.style.display = 'block';
  el.style.position = 'absolute';
  el.style.left = '-9999px';
}

export function restoreContainerStyles(el: HTMLElement, saved: SavedStyles): void {
  el.style.visibility = saved.visibility;
  el.style.display = saved.display;
  el.style.position = saved.position;
  el.style.left = saved.left;
}

// -- Input injection (React-compatible) --

/**
 * Set an input's value in a way that React's synthetic event system recognizes.
 *
 * Chrome: Use the native value setter to bypass React's controlled input,
 * then dispatch an 'input' event so React picks up the change.
 *
 * Firefox with Xray wrappers: The native setter trick may not work through
 * Xray, so fall back to dispatching keyboard events per character.
 */
export function setInputValue(input: HTMLInputElement, value: string): void {
  // Try the native setter approach first (works in Chrome, may work in Firefox)
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )?.set;

  if (nativeSetter) {
    nativeSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));

    // Verify it stuck — if React's controlled input overrode it, fall back
    if (input.value === value) return;
  }

  // Fallback: simulate typing each character (Firefox Xray workaround)
  log('BufferRefresh: native setter failed, falling back to keyboard events');
  input.focus();
  for (const char of value) {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));

    // Append character via native setter if available, otherwise direct assignment
    const current = input.value;
    if (nativeSetter) {
      nativeSetter.call(input, current + char);
    } else {
      input.value = current + char;
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
  }
}

// -- DOM waiting utility --

/**
 * Wait for an element to appear in the DOM using MutationObserver.
 *
 * The selectorFn is called immediately (element may already exist) and
 * on every DOM mutation. A setTimeout safety net fires at timeoutMs.
 * The observer disconnects as soon as the element is found or timeout fires.
 */
export function waitForElement<T extends HTMLElement>(
  selectorFn: () => T | null,
  timeoutMs: number
): Promise<T | null> {
  return new Promise((resolve) => {
    // Check if already present
    const existing = selectorFn();
    if (existing) {
      resolve(existing);
      return;
    }

    let resolved = false;

    const observer = new MutationObserver(() => {
      if (resolved) return;
      const el = selectorFn();
      if (el) {
        resolved = true;
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      if (resolved) return;
      resolved = true;
      observer.disconnect();
      // One last check — mutation may have fired between last callback and timeout
      resolve(selectorFn());
    }, timeoutMs);
  });
}
