/**
 * Main-world WebSocket interceptor script
 *
 * Thin orchestrator: wires shared library components to install proxies
 * and emit decoded messages to the content script bridge.
 *
 * Script blocking is handled by the content script (isolated world) which
 * runs synchronously at document_start — earlier and more reliably than
 * this injected script can. All this file does is install the transport
 * proxies and signal readiness.
 */

import { installWebSocketProxy, installXHRProxy, setMessageCallback } from '@prun/link/socket-io';
import { emitMessage } from '@prun/link/message-bus/main-world';
import type { ProcessedMessage } from '@prun/link';
import { log, logMessage } from '../lib/debug/logger';

/**
 * Handle processed messages
 */
function handleMessage(message: ProcessedMessage): void {
  logMessage(message);
  emitMessage(message);
}

export default defineUnlistedScript(() => {
  const t0 = performance.now();
  console.log(`[APXM:interceptor] starting @${t0.toFixed(1)}ms`);
  log(`Installing interceptor @${t0.toFixed(1)}ms`);

  // 1. Set up message callback
  setMessageCallback(handleMessage);

  // 2. Install WebSocket proxy (skipped if inline proxy already active)
  installWebSocketProxy();

  // 3. Install XHR proxy (for polling fallback)
  installXHRProxy();
  console.log('[APXM:interceptor] XHR proxy installed');

  // Signal readiness to content script via shared DOM attribute
  document.documentElement.dataset.prunLinkInterceptor = 'ready';
  console.log(`[APXM:interceptor] ready @${performance.now().toFixed(1)}ms (+${(performance.now() - t0).toFixed(1)}ms)`);

  log(`Interceptor ready @${performance.now().toFixed(1)}ms (+${(performance.now() - t0).toFixed(1)}ms)`);
});
