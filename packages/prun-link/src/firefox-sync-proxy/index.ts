/**
 * Firefox synchronous WebSocket proxy.
 *
 * On Firefox, content-script code can reach into the main world via
 * `window.wrappedJSObject` (bypasses Xray vision) and make content-script
 * functions callable from the main world via `exportFunction()`.
 *
 * We use these to replace `window.WebSocket` synchronously at document_start —
 * before any page script runs — eliminating the race between APEX's bundle
 * executing and ws-interceptor.js loading from the extension package.
 *
 * The installed proxy decodes engine.io frames and delivers ProcessedMessages
 * through the same content-bridge postMessage channel used by the main-world
 * interceptor, so the rest of the pipeline is unchanged.
 *
 * Not available on Chrome/Safari; those platforms use ws-interceptor.js.
 */

import { decodeFrame } from '../socket-io/pipeline';
import { emitMessage } from '../message-bus/main-world';

// Annotations we write into the main world so the proxy constructor
// (running in content-script context) can reach them.
interface ApxmAnnotations {
  __apxmWsProxied?: boolean;
  __apxmNativeWS?: typeof WebSocket;
  __apxmOnInbound?: (data: unknown) => void;
  __apxmOnOutbound?: (data: unknown) => void;
}

declare global {
  interface Window {
    /** Firefox only — the real main-world window, bypassing Xray vision. */
    wrappedJSObject?: Window & ApxmAnnotations & Record<string, unknown>;
  }
}

/** Main-world flag set once the proxy is installed. */
const INSTALLED_FLAG = '__apxmWsProxied';

function isDebug(): boolean {
  return __DEV__ || location.search.includes('apxm_debug');
}

function getExportFunction(): ((fn: (...a: unknown[]) => unknown, scope: object) => (...a: unknown[]) => unknown) | undefined {
  return (globalThis as Record<string, unknown>).exportFunction as
    | ((fn: (...a: unknown[]) => unknown, scope: object) => (...a: unknown[]) => unknown)
    | undefined;
}

function getMainWorld(): (Window & ApxmAnnotations & Record<string, unknown>) | null {
  return window.wrappedJSObject ?? null;
}

/**
 * Returns true when Firefox's exportFunction / wrappedJSObject APIs are
 * available. Always false on Chrome and Safari.
 */
export function isFirefoxSyncProxyAvailable(): boolean {
  try {
    return getExportFunction() !== undefined && getMainWorld() !== null;
  } catch {
    return false;
  }
}

function handleFrame(raw: string, rawSize: number, direction: 'inbound' | 'outbound'): void {
  for (const msg of decodeFrame(raw, direction, rawSize)) {
    emitMessage(msg);
  }
}

/**
 * Install a WebSocket proxy synchronously in the main world using Firefox's
 * exportFunction() + wrappedJSObject APIs.
 *
 * Each observed frame is decoded and emitted through the existing
 * content-bridge postMessage channel — no changes to the downstream pipeline.
 *
 * Returns true on success (or if already installed), false if the Firefox
 * APIs are unavailable (fall back to ws-interceptor.js on those platforms).
 */
export function installFirefoxSyncProxy(): boolean {
  const exportFn = getExportFunction();
  const mainWorld = getMainWorld();
  if (!exportFn || !mainWorld) return false;
  if (mainWorld[INSTALLED_FLAG]) return true;

  const NativeWS = mainWorld.WebSocket as typeof WebSocket | undefined;
  if (!NativeWS) return false;

  // Export frame handlers so main-world event listeners can call back into
  // the content-script context where decodeFrame / emitMessage run.
  const onInbound = exportFn((data: unknown) => {
    try {
      if (typeof data === 'string') handleFrame(data, data.length, 'inbound');
      else if (data instanceof ArrayBuffer) handleFrame(new TextDecoder().decode(data), data.byteLength, 'inbound');
      // Blob payloads are not used by Socket.IO v4 over WebSocket; skip.
    } catch { /* never let decode errors surface to the page */ }
  }, mainWorld) as (data: unknown) => void;

  const onOutbound = exportFn((data: unknown) => {
    try {
      if (typeof data === 'string') handleFrame(data, data.length, 'outbound');
      else if (data instanceof ArrayBuffer) handleFrame(new TextDecoder().decode(data), data.byteLength, 'outbound');
    } catch { /* never let decode errors surface to the page */ }
  }, mainWorld) as (data: unknown) => void;

  // Stash references in the main world so the proxy constructor can reach them.
  mainWorld.__apxmNativeWS = NativeWS;
  mainWorld.__apxmOnInbound = onInbound;
  mainWorld.__apxmOnOutbound = onOutbound;

  // Proxy constructor — runs in content-script context when APEX calls
  // `new WebSocket(url)` from the main world.
  const WebSocketProxy = exportFn(function (
    this: unknown,
    ...args: ConstructorParameters<typeof WebSocket>
  ) {
    const mw = window.wrappedJSObject as Window & ApxmAnnotations;
    const ws = new (mw.__apxmNativeWS!)(...args);

    // Inbound — addEventListener on the Xray-wrapped instance works correctly.
    ws.addEventListener('message', function (e: Event) {
      mw.__apxmOnInbound!((e as MessageEvent).data);
    });

    // Outbound — must override send on the *real* underlying object.
    // ws.wrappedJSObject bypasses Xray to give the actual main-world instance.
    const wsReal = (ws as unknown as { wrappedJSObject?: WebSocket }).wrappedJSObject;
    if (wsReal) {
      const nativeSend = (wsReal.send as typeof WebSocket.prototype.send).bind(wsReal);
      (wsReal as unknown as Record<string, unknown>).send = exportFn!(function (
        this: unknown,
        data: unknown,
      ) {
        mw.__apxmOnOutbound!(data);
        return nativeSend(data as Parameters<typeof WebSocket.prototype.send>[0]);
      }, wsReal);
    }

    return ws;
  }, mainWorld) as unknown as typeof WebSocket;

  // Mirror prototype and static constants so instanceof / WebSocket.OPEN etc.
  // keep working for any APEX code that checks them.
  try {
    WebSocketProxy.prototype = NativeWS.prototype;
    (WebSocketProxy as unknown as Record<string, unknown>).CONNECTING = NativeWS.CONNECTING;
    (WebSocketProxy as unknown as Record<string, unknown>).OPEN = NativeWS.OPEN;
    (WebSocketProxy as unknown as Record<string, unknown>).CLOSING = NativeWS.CLOSING;
    (WebSocketProxy as unknown as Record<string, unknown>).CLOSED = NativeWS.CLOSED;
  } catch { /* best-effort; won't affect message capture */ }

  mainWorld[INSTALLED_FLAG] = true;
  mainWorld.WebSocket = WebSocketProxy;

  if (isDebug()) {
    console.log(`[APXM:ff-sync-proxy] installed @${performance.now().toFixed(1)}ms`);
  }

  return true;
}
