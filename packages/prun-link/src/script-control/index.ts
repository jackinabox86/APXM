/**
 * Script blocker.
 *
 * The interceptor must install its WebSocket/XHR proxies before APEX's own
 * bundle constructs a socket. `installScriptBlocker()` holds back external
 * scripts added to the document; `restoreBlockedScripts()` re-inserts them
 * once the proxies are in place.
 *
 * Two layers of interception:
 *
 * 1. MutationObserver — catches scripts as the HTML parser inserts them.
 *    Fires as a microtask after each mutation batch. Usually arrives before
 *    a cache-miss script finishes downloading, but can race on cached loads.
 *
 * 2. `beforescriptexecute` (Firefox only) — fires synchronously just before a
 *    script executes. Handles the cached-load race that MutationObserver can
 *    miss. `e.preventDefault()` may be restricted from an extension content
 *    script, so we also set `type="text/plain"` on the element as a fallback.
 *
 * Both layers call `neutralize()`, which sets `type="text/plain"` synchronously
 * before removing the element — a belt-and-suspenders guard in case execution
 * begins in the gap between the callback and the `replaceWith()` call.
 *
 * Inline scripts execute synchronously at parse time and cannot be caught this
 * way — APEX loads its app code from an external bundle, so this is sufficient.
 */

interface BlockedScript {
  attributes: { name: string; value: string }[];
  marker: Comment;
}

const BLOCKED_DATASET_KEY = 'prunLinkBlocked';
const BLOCKED_ATTRIBUTE = 'data-prun-link-blocked';

let observer: MutationObserver | null = null;
let beforeScriptHandler: ((e: Event) => void) | null = null;
let active = false;
const blocked: BlockedScript[] = [];

function isDebug(): boolean {
  return __DEV__ || location.search.includes('apxm_debug');
}

function isExtensionUrl(src: string): boolean {
  return (
    src.startsWith('chrome-extension://') ||
    src.startsWith('moz-extension://') ||
    src.startsWith('safari-web-extension://')
  );
}

let _lastMechanism: 'observer' | 'beforescriptexecute' = 'observer';

function neutralize(script: HTMLScriptElement): void {
  if (script.dataset[BLOCKED_DATASET_KEY]) return;
  const rawSrc = script.getAttribute('src');
  if (!rawSrc) return;
  const src = script.src;
  if (isExtensionUrl(src)) return;

  if (isDebug()) {
    console.log(`[APXM:blocker] blocked via ${_lastMechanism}: ${rawSrc} @${performance.now().toFixed(1)}ms`);
  }

  script.dataset[BLOCKED_DATASET_KEY] = '1';
  // Save attributes before mutating type so restoration uses the original values.
  const attributes = Array.from(script.attributes).map((a) => ({
    name: a.name,
    value: a.value,
  }));
  // Set type synchronously — stops execution even if the browser fires the
  // load event before replaceWith() takes effect (cached-script race).
  script.type = 'text/plain';
  const marker = document.createComment('prun-link-blocked-script');
  script.replaceWith(marker);
  blocked.push({ attributes, marker });
}

export function installScriptBlocker(): void {
  if (active) return;
  active = true;

  if (isDebug()) console.log(`[APXM:blocker] installed @${performance.now().toFixed(1)}ms`);

  // Firefox: beforescriptexecute fires synchronously just before execution.
  if ('onbeforescriptexecute' in document) {
    if (isDebug()) console.log('[APXM:blocker] beforescriptexecute available');
    beforeScriptHandler = (e: Event) => {
      if (!active) return;
      _lastMechanism = 'beforescriptexecute';
      e.preventDefault();
      neutralize(e.target as HTMLScriptElement);
    };
    document.addEventListener('beforescriptexecute', beforeScriptHandler, true);
  } else if (isDebug()) {
    console.warn('[APXM:blocker] beforescriptexecute NOT available — MutationObserver only');
  }

  observer = new MutationObserver((records) => {
    if (!active) return;
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (node instanceof HTMLScriptElement) {
          _lastMechanism = 'observer';
          neutralize(node);
        }
      });
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

export function restoreBlockedScripts(): void {
  active = false;
  observer?.disconnect();
  observer = null;

  if (beforeScriptHandler) {
    document.removeEventListener('beforescriptexecute', beforeScriptHandler, true);
    beforeScriptHandler = null;
  }

  if (isDebug()) {
    if (blocked.length === 0) {
      console.warn('[APXM:blocker] restoring 0 scripts — blocker caught nothing; APEX may have run before proxy was installed');
    } else {
      console.log(`[APXM:blocker] restoring ${blocked.length} script(s) @${performance.now().toFixed(1)}ms`);
    }
  }

  for (const entry of blocked) {
    const script = document.createElement('script');
    for (const attr of entry.attributes) {
      if (attr.name === BLOCKED_ATTRIBUTE) continue;
      script.setAttribute(attr.name, attr.value);
    }
    // Dynamically inserted scripts default to async; force ordered execution.
    script.async = false;
    entry.marker.replaceWith(script);
  }
  blocked.length = 0;
}
