import { emitProcessed } from './callback';
import { decodeFrame } from './pipeline';

const PROXIED = Symbol.for('prun-link.wsProxied');

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
  ws.addEventListener('message', (event) => {
    handleData((event as MessageEvent).data, 'inbound');
  });

  const nativeSend = ws.send.bind(ws);
  ws.send = (data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
    handleData(data, 'outbound');
    return nativeSend(data as Parameters<WebSocket['send']>[0]);
  };
}

/**
 * Replace `window.WebSocket` with a proxy that observes every connection's
 * inbound messages and outbound sends. The underlying native socket is
 * returned unchanged, so APEX behaviour is not modified.
 */
export function installWebSocketProxy(): void {
  const NativeWebSocket = window.WebSocket;
  if ((NativeWebSocket as unknown as Record<symbol, unknown>)[PROXIED]) return;

  const ProxiedWebSocket = new Proxy(NativeWebSocket, {
    construct(target, args, newTarget) {
      const ws = Reflect.construct(target, args, newTarget) as WebSocket;
      instrument(ws);
      return ws;
    },
  });
  (ProxiedWebSocket as unknown as Record<symbol, unknown>)[PROXIED] = true;

  window.WebSocket = ProxiedWebSocket;
}
