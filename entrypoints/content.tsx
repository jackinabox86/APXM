import { createRoot } from 'react-dom/client';
import { App } from '../components/App';
import type { ProcessedMessage } from '@prun/link';
import { initMessageBridge, onMessage, dispatchMessage } from '@prun/link/message-bus/content-bridge';
import { installScriptBlocker, restoreBlockedScripts } from '@prun/link/script-control';
import { installInlineProxy, RAW_FRAME_CHANNEL } from '@prun/link/inline-proxy';
import { decodeFrame } from '@prun/link/socket-io';
import { useConnectionStore } from '../stores/connection';
import { useSettingsStore, waitForSettingsHydration } from '../stores/settings';
import { initMessageHandlers, processMessage } from '../stores/message-handlers';
import { beginEntityBatch, endEntityBatch } from '../stores/entities';
import { populateStoresFromFio } from '../lib/fio';
import { rehydrateAllStores } from '../stores/cache';
import { warn, error as logError } from '../lib/debug/logger';
import { isDebugEnabled, createOverlay, markStep, markFailed, pollForAttribute, ensureDiagnosticsVisible } from '../lib/diagnostics';
import { initRefreshMode, isAutoRefreshEnabled } from '../lib/buffer-refresh';
import { executeBatchRefresh } from '../lib/buffer-refresh';
import { initDesktopBridge } from '../lib/desktop-bridge';
import { initApxmButton } from '../lib/apxm-button';
import { initRprunDetection } from '../lib/rprun-detect';
import { useSitesStore } from '../stores/entities';
import { useSiteSourceStore } from '../stores/site-data-sources';
import { useAlertsStore } from '../stores/entities';
import '../assets/styles.css';

export default defineContentScript({
  matches: ['https://apex.prosperousuniverse.com/*'],
  runAt: 'document_start',
  cssInjectionMode: 'ui',

  async main(ctx) {
    // Suppress Chrome MV3 "Extension context invalidated" rejections.
    // Our storage adapter handles this per-call, but WXT framework internals
    // or timing gaps can leak rejections we don't control.
    window.addEventListener('unhandledrejection', (e) => {
      if (String(e.reason).includes('Extension context invalidated')) {
        e.preventDefault();
      }
    });

    // Block APEX's scripts immediately so the WebSocket proxy can be installed
    // before APEX's bundle executes. On desktop with a cached bundle this
    // races against ws-interceptor.js, which is an async injected script.
    // Running the blocker here (synchronous, document_start, isolated-world
    // MutationObserver on the shared DOM) wins that race reliably.
    installScriptBlocker();

    // Install the WebSocket proxy synchronously via an inline <script> element
    // before any page scripts run. Using a plain JS constructor (not Firefox's
    // exportFunction) makes the proxy compatible with extensions like
    // refined-prun that wrap window.WebSocket with Proxy + Reflect.construct.
    // Works on all platforms (Chrome, Firefox, Orion).
    const inlineProxyInstalled = installInlineProxy();
    console.log(`[APXM:content] inline proxy: ${inlineProxyInstalled ? 'installed' : 'FAILED — will rely on ws-interceptor.js'}`);

    // Desktop detection — on desktop without ?apxm_force, run data pipeline
    // and bridge but skip the mobile UI overlay.
    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    const forceEnabled = new URLSearchParams(window.location.search).has('apxm_force');
    const isDesktopBridgeMode = !isMobile && !forceEnabled;

    const debug = isDebugEnabled();

    if (debug) {
      createOverlay();
      markStep(1, 'ok', inlineProxyInstalled ? 'inline proxy ok' : 'inline proxy FAILED');
      markStep(2, 'ok', isMobile ? 'mobile detected' : forceEnabled ? 'forced via ?apxm_force' : 'desktop bridge mode');
    }

    // 3. Init message bridge — must be ready before the first WebSocket frame
    //    arrives (the inline proxy can deliver messages before ws-interceptor.js
    //    even loads).
    initMessageBridge();

    // 3b. Raw frame bridge for the inline proxy.
    // The inline script (main world) can't import TypeScript — it posts raw
    // WebSocket frame data here so the content-script world decodes it.
    // ws-interceptor.js (which handles XHR polling) still uses the existing
    // postMessage → initMessageBridge path for its messages.
    let rawFrameCount = 0;
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const d = event.data as { ch?: unknown; d?: unknown; dir?: string; sz?: number } | null;
      if (!d || d.ch !== RAW_FRAME_CHANNEL) return;
      rawFrameCount++;
      if (rawFrameCount === 1) {
        console.log(`[APXM:content] first raw frame via inline proxy: dir=${d.dir} sz=${d.sz}`);
      }
      const raw = d.d;
      const direction: 'inbound' | 'outbound' = d.dir === 'o' ? 'outbound' : 'inbound';
      let text: string;
      let size: number;
      if (typeof raw === 'string') {
        text = raw;
        size = typeof d.sz === 'number' ? d.sz : raw.length;
      } else if (raw instanceof ArrayBuffer) {
        text = new TextDecoder().decode(raw);
        size = typeof d.sz === 'number' ? d.sz : raw.byteLength;
      } else {
        console.warn(`[APXM:content] raw frame bridge: unexpected data type ${Object.prototype.toString.call(raw)}`);
        return;
      }
      for (const msg of decodeFrame(text, direction, size)) {
        dispatchMessage(msg);
      }
    });

    // 4. Build message handler map (local to APXM, not registered on bridge)
    initMessageHandlers();

    // 5. Batched message processor
    //
    // Messages are queued and processed in a setTimeout(0) callback with
    // entity store shadow batching to prevent React error #185 (maximum
    // update depth exceeded).
    //
    // Problem: During PrUn's login burst, dozens of messages arrive in
    // rapid succession. Each Zustand setState synchronously notifies
    // React 19 via useSyncExternalStore, which forces immediate render
    // commits (bypasses all batching). React's nestedUpdateCount
    // accumulates across commits within a single task and throws at 50.
    //
    // Two-layer defense:
    // 1. setTimeout(0) — runs in a fresh macro task where React's
    //    nestedUpdateCount is guaranteed to be 0. The ~4ms delay also
    //    collects more messages per batch than queueMicrotask would.
    // 2. Entity store shadow state — beginEntityBatch() redirects all
    //    mutations to plain Maps (no Zustand set(), no listeners, no
    //    renders). endEntityBatch() flushes each store's final state
    //    with one set() call: max 7 renders instead of ~60.
    let firstMessageSeen = false;
    const messageQueue: ProcessedMessage[] = [];
    let batchScheduled = false;

    onMessage((msg) => {
      if (debug && !firstMessageSeen) {
        firstMessageSeen = true;
        markStep(6, 'ok', msg.messageType);
      }

      messageQueue.push(msg);
      if (!batchScheduled) {
        batchScheduled = true;
        setTimeout(() => {
          const batch = messageQueue.splice(0);
          batchScheduled = false;

          beginEntityBatch();
          try {
            for (const m of batch) {
              try {
                processMessage(m);
              } catch (err) {
                logError('Message handler error:', err);
              }
            }
          } finally {
            // Flush all entity stores — one set() per store, max 7 renders
            endEntityBatch();
          }

          // Single connection store update for the entire batch
          if (batch.length > 0) {
            const last = batch[batch.length - 1];
            useConnectionStore.setState((s) => ({
              messageCount: s.messageCount + batch.length,
              lastMessageTimestamp: last.timestamp,
              ...(s.connected ? {} : { connected: true }),
              ...(s.apexUnresponsive ? { apexUnresponsive: false } : {}),
            }));
          }
        }, 0);
      }
    });

    // 1. Inject main-world interceptor (XHR proxy + WebSocket proxy if inline proxy failed)
    injectScript('/ws-interceptor.js', { keepInDom: true });
    if (debug) markStep(3, 'ok');
    console.log(`[APXM:content] ws-interceptor.js injected @${performance.now().toFixed(0)}ms`);

    // 2. Poll for interceptor readiness via shared DOM attribute
    //    Always poll — not just in debug mode. Without this wait, the bridge
    //    initializes before the interceptor is ready (race condition on Orion).
    const interceptorReady = await pollForAttribute('prunLinkInterceptor', 'ready', 3000);
    console.log(`[APXM:content] interceptor: ${interceptorReady ? 'ready' : 'TIMEOUT'} @${performance.now().toFixed(0)}ms`);

    // Always restore blocked scripts — even on failure, APEX must be able to
    // load. On success the proxies are installed; on failure we at least let
    // the game run without interception rather than leaving it broken.
    restoreBlockedScripts();

    if (debug) markStep(4, interceptorReady ? 'ok' : 'fail');
    if (!interceptorReady && !inlineProxyInstalled) {
      // Only abort if neither interceptor succeeded — if the inline proxy is
      // installed, ws-interceptor.js timeout is non-fatal (WebSocket frames
      // are already captured; only XHR polling fallback would be missed).
      if (debug) markFailed(4, 'timeout (3s)');
      warn('Interceptor failed to initialize within 3s — aborting');
      return;
    }
    if (!interceptorReady && inlineProxyInstalled) {
      if (debug) markStep(4, 'ok', 'inline proxy active');
      warn('ws-interceptor.js timed out — continuing with inline proxy (XHR fallback unavailable)');
    }

    // 5b. Detect unresponsive APEX — if no messages arrive within 5s, flag it
    const APEX_TIMEOUT_MS = 5000;
    setTimeout(() => {
      if (useConnectionStore.getState().messageCount === 0) {
        useConnectionStore.getState().setApexUnresponsive(true);
      }
    }, APEX_TIMEOUT_MS);

    // 6. Rehydrate entity stores from cache (after settings hydrate)
    await waitForSettingsHydration();
    await rehydrateAllStores();

    // Mark rehydrated sites as cache-sourced for per-site staleness indicators
    const rehydratedSites = useSitesStore.getState().getAll();
    if (rehydratedSites.length > 0) {
      const ts = useSitesStore.getState().lastUpdated ?? Date.now();
      useSiteSourceStore.getState().markAllSites(
        rehydratedSites.map((s) => s.siteId), 'cache', ts
      );
    }

    // 6b. FIO fetch (fire-and-forget, concurrent with React mount)
    const settings = useSettingsStore.getState();
    if (settings.fio.apiKey && settings.fio.username) {
      populateStoresFromFio({
        apiKey: settings.fio.apiKey,
        username: settings.fio.username,
      }).then((result) => {
        if (result.success) {
          useSettingsStore.getState().setFioLastFetch(Date.now());
        }
      });
    }

    // Desktop bridge: start iframe detection and store subscriptions
    if (!isMobile) {
      initDesktopBridge();
      // Detect rprun after first WebSocket data arrives (both APEX and rprun loaded by then)
      const unsubRprunInit = useConnectionStore.subscribe((state) => {
        if (state.connected) {
          unsubRprunInit();
          initRprunDetection();
        }
      });
    }

    if (isDesktopBridgeMode) {
      initApxmButton();
      return;
    }

    // 7. Mount React overlay in Shadow DOM
    const ui = await createShadowRootUi(ctx, {
      name: 'apxm-overlay',
      position: 'inline',
      anchor: 'body',
      append: 'first',
      onMount(container) {
        const root = createRoot(container);
        root.render(<App />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });

    ui.mount();

    // 8. Replace page favicon with APXM icon
    const faviconUrl = browser.runtime.getURL('/icon-48.png');
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = faviconUrl;

    if (debug) {
      markStep(7, 'ok');
      ensureDiagnosticsVisible();
    }

    // Expose a read-only debug handle for console inspection.
    // Usage: window.apxm.alerts.getAll()
    //        window.apxm.alerts.getAll().filter(a => !a.seen)
    (window as unknown as Record<string, unknown>).apxm = {
      alerts: useAlertsStore,
    };

    // 8. Initialize buffer refresh mode from URL param
    initRefreshMode();

    // 9. Auto-refresh: when mode is 'auto', wait for sites to load then
    //    batch-refresh all bases. Uses Zustand subscribe() to react to
    //    store state rather than a second onMessage listener.
    if (isAutoRefreshEnabled()) {
      const unsub = useSitesStore.subscribe((state) => {
        if (state.fetched && state.getAll().length > 0) {
          unsub();
          // 2s delay ensures the full login burst completes before
          // refresh begins — avoids competing with message processing
          setTimeout(() => {
            const siteIds = useSitesStore.getState().getAll().map((s) => s.siteId);
            executeBatchRefresh({ siteIds });
          }, 2000);
        }
      });
    }
  },
});
