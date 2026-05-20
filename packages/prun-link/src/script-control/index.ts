/**
 * Script blocker.
 *
 * The interceptor must install its WebSocket/XHR proxies before APEX's own
 * bundle constructs a socket. `installScriptBlocker()` holds back external
 * scripts added to the document; `restoreBlockedScripts()` re-inserts them
 * once the proxies are in place.
 *
 * Best-effort: a MutationObserver detaches parser-inserted external scripts
 * before they execute (their async download gives microtasks a chance to run).
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
let active = false;
const blocked: BlockedScript[] = [];

function isExtensionUrl(src: string): boolean {
  return (
    src.startsWith('chrome-extension://') ||
    src.startsWith('moz-extension://') ||
    src.startsWith('safari-web-extension://')
  );
}

function neutralize(script: HTMLScriptElement): void {
  if (script.dataset[BLOCKED_DATASET_KEY]) return;
  const src = script.src;
  if (!src || isExtensionUrl(src)) return;

  script.dataset[BLOCKED_DATASET_KEY] = '1';
  const attributes = Array.from(script.attributes).map((a) => ({
    name: a.name,
    value: a.value,
  }));
  const marker = document.createComment('prun-link-blocked-script');
  script.replaceWith(marker);
  blocked.push({ attributes, marker });
}

export function installScriptBlocker(): void {
  if (active) return;
  active = true;

  observer = new MutationObserver((records) => {
    if (!active) return;
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (node instanceof HTMLScriptElement) neutralize(node);
      });
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

export function restoreBlockedScripts(): void {
  active = false;
  observer?.disconnect();
  observer = null;

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
