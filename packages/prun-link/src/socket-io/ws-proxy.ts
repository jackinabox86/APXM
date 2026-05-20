import { emitProcessed } from './callback';
import { decodeFrame } from './pipeline';

const PROXIED = Symbol.for('prun-link.wsProxied');

function isDebug(): boolean {
  return __DEV__ || location.search.includes('apxm_debug');
}

function dispatch(text: string, rawSize: number, direction: 'inbound' | 'outbound'): void {
  for (const msg of decodeFrame(text, direction, rawSize)) {
    emitProcessed(msg);
  }
}

/** Normalise a WebSocket frame payload to text, then decode and emit it. */
function handleData(data: unknown, direction: 'inbound' | 'outbound'): void {
  if (typeof data === 'string') {
    dispatch(data, data.length, direction);
  } else if (data instanceof ArrayBuffer) {
    dispatch(new TextDecoder().decode(data), data.byteLength, direction);
  } else if (ArrayBuffer.isView(data)) {
    dispatch(new TextDecoder().decode(data), data.byteLength, direction);
  } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
    const size = data.size;
    data.text().then((text) => dispatch(text, size, direction)).catch(() => {});
  }
}

function instrument(ws: WebSocket): void {
  if (isDebug()) {
    console.log(`[APXM:ws-proxy] instrument: ${ws.url} @${performance.now().toFixed(1)}ms`);
  }

  ws.addEventListener('message', (event) => {
    handleData((event as MessageEvent).data, 'inbound');
  });

  const nativeSend = ws.send.bind(ws);
  const sendOverride = (data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
    if (isDebug()) {
      const preview = typeof data === 'string' ? data.slice(0, 12) : `[binary ${(data as ArrayBuffer).byteLength ?? '?'}b]`;
      console.log(`[APXM:ws-proxy] → send: ${JSON.stringify(preview)}`);
    }
    try {
      handleData(data, 'outbound');
    } catch {
      // Never let observation errors drop the outbound frame
    }
    return nativeSend(data as Parameters<WebSocket['send']>[0]);
  };
  ws.send = sendOverride;

  if (isDebug() && ws.send !== sendOverride) {
    console.warn('[APXM:ws-proxy] send override silently failed — pong frames will not be logged but native send still runs');
  }
}

/**
 * Replace `window.WebSocket` with a proxy that observes every connection's
 * inbound messages and outbound sends. The underlying native socket is
 * returned unchanged, so APEX behaviour is not modified.
 *
 * Uses a plain constructor function rather than `new Proxy(WebSocket, …)` +
 * `Reflect.construct` because Firefox rejects native constructors whose
 * `new.target` is a Proxy instead of the native class or a proper ES6
 * subclass, causing every `new WebSocket(url)` call to throw and forcing
 * APEX to fall back to XHR long-polling (which then times out).
 */
export function installWebSocketProxy(): void {
  // Firefox sync proxy (content-script world) already replaced window.WebSocket
  // before this main-world script ran — no need to double-wrap.
  if ((window as unknown as Record<string, unknown>).__apxmWsProxied) {
    if (isDebug()) console.log('[APXM:ws-proxy] Firefox sync proxy already installed, skipping');
    return;
  }

  const NativeWebSocket = window.WebSocket;
  if ((NativeWebSocket as unknown as Record<symbol, unknown>)[PROXIED]) {
    if (isDebug()) console.log('[APXM:ws-proxy] already installed, skipping');
    return;
  }

  if (isDebug()) console.log(`[APXM:ws-proxy] installing proxy @${performance.now().toFixed(1)}ms`);

  function WebSocketProxy(
    this: unknown,
    ...args: ConstructorParameters<typeof WebSocket>
  ): WebSocket {
    const ws = new NativeWebSocket(...args);
    instrument(ws);
    return ws;
  }

  // Mirror prototype and static constants so instanceof / WebSocket.OPEN etc.
  // continue to work for any caller that checks them.
  WebSocketProxy.prototype = NativeWebSocket.prototype;
  (WebSocketProxy as unknown as typeof WebSocket).CONNECTING = NativeWebSocket.CONNECTING;
  (WebSocketProxy as unknown as typeof WebSocket).OPEN = NativeWebSocket.OPEN;
  (WebSocketProxy as unknown as typeof WebSocket).CLOSING = NativeWebSocket.CLOSING;
  (WebSocketProxy as unknown as typeof WebSocket).CLOSED = NativeWebSocket.CLOSED;

  // Mark both the native constructor and the wrapper so the idempotency guard
  // fires correctly whether window.WebSocket is the native or the wrapper.
  (NativeWebSocket as unknown as Record<symbol, unknown>)[PROXIED] = true;
  (WebSocketProxy as unknown as Record<symbol, unknown>)[PROXIED] = true;

  window.WebSocket = WebSocketProxy as unknown as typeof WebSocket;
}
