// Stage 2 tests for the mobile buffer navigator.
//
// The happy path drives a scripted fake APEX Stack UI: each click handler
// renders the next view synchronously, the way APEX's React does, so the
// navigator's MutationObserver waits resolve. Real-DOM behaviour still needs
// the manual open -> hidden form -> close -> restored check on-device.

import { describe, it, expect, afterEach } from 'vitest';
import { openMobileBuffer, closeMobileBuffer } from '../mobile-buffer-navigator';

/**
 * Build a fake APEX mobile DOM. Click handlers progressively render the Stack
 * UI (Buffer header -> Add New Card -> command input -> Create -> card -> form)
 * so the navigator can walk it end to end.
 */
function installFakeApex(): HTMLElement {
  document.body.innerHTML = '';
  const container = document.createElement('div');
  container.id = 'container';

  const header = document.createElement('h2');
  header.textContent = 'Buffer';
  container.appendChild(header);
  document.body.appendChild(container);

  header.addEventListener('click', () => {
    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add New Card';
    container.appendChild(addBtn);

    addBtn.addEventListener('click', () => {
      const field = document.createElement('div');
      field.textContent = 'Enter content command';
      const input = document.createElement('input');
      input.type = 'text';
      // jsdom has no layout, so offsetParent is always null and getCommandInput
      // would treat the input as hidden. Shim it to its rendered parent.
      Object.defineProperty(input, 'offsetParent', {
        get: () => field,
        configurable: true,
      });
      field.appendChild(input);
      container.appendChild(field);

      input.addEventListener('input', () => {
        if (!input.value || container.querySelector('.create-btn')) {
          return;
        }
        const createBtn = document.createElement('button');
        createBtn.className = 'create-btn';
        createBtn.textContent = 'Create';
        container.appendChild(createBtn);

        createBtn.addEventListener('click', () => {
          const list = document.createElement('ul');
          const card = document.createElement('li');
          card.textContent = `BASE: ${input.value}`;
          list.appendChild(card);
          container.appendChild(list);

          card.addEventListener('click', () => {
            const form = document.createElement('div');
            form.className = 'FormComponent__containerActive___testhash';
            container.appendChild(form);
          });
        });
      });
    });
  });

  return container;
}

describe('mobile-buffer-navigator', () => {
  afterEach(async () => {
    // Reset APEX DOM state between tests.
    await closeMobileBuffer();
    document.body.innerHTML = '';
  });

  it('opens a buffer without hiding #container and renders the form sentinel', async () => {
    const container = installFakeApex();

    const opened = await openMobileBuffer('BS XY-123A');

    expect(opened).toBe(true);
    // #container is NOT hidden — APXM overlay already covers APEX.
    expect(container.style.visibility).not.toBe('hidden');
    // The buffer form has rendered.
    expect(container.querySelector('[class*="FormComponent__container"]')).not.toBeNull();
  });

  it('closeMobileBuffer navigates back to stacks top level without altering styles', async () => {
    const container = installFakeApex();

    await openMobileBuffer('BS XY-123A');
    const visibilityBefore = container.style.visibility;

    await closeMobileBuffer();

    // Styles are unchanged — the navigator never modifies them.
    expect(container.style.visibility).toBe(visibilityBefore);
  });

  it('returns false when #container is missing', async () => {
    document.body.innerHTML = '';
    expect(await openMobileBuffer('BS XY-123A')).toBe(false);
  });

  it('closeMobileBuffer is a safe no-op when no buffer is open', async () => {
    document.body.innerHTML = '';
    await expect(closeMobileBuffer()).resolves.toBeUndefined();
  });
});
