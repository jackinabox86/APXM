import { emitProcessed } from './callback';
import { decodeFrame } from './pipeline';

const PROXIED = Symbol.for('prun-link.xhrProxied');
const URL_KEY = Symbol.for('prun-link.xhrUrl');

interface TaggedXHR extends XMLHttpRequest {
  [URL_KEY]?: string;
}

function dispatch(text: string, direction: 'inbound' | 'outbound'): void {
  for (const msg of decodeFrame(text, direction, text.length)) {
    emitProcessed(msg);
  }
}

/**
 * Wrap `XMLHttpRequest` to observe the engine.io HTTP long-polling transport
 * (`/socket.io/?...&transport=polling`), used as a fallback when the WebSocket
 * transport is unavailable.
 */
export function installXHRProxy(): void {
  const proto = XMLHttpRequest.prototype as XMLHttpRequest & Record<symbol, unknown>;
  if (proto[PROXIED]) return;
  proto[PROXIED] = true;

  const nativeOpen = proto.open;
  const nativeSend = proto.send;

  proto.open = function (this: TaggedXHR, ...args: Parameters<XMLHttpRequest['open']>) {
    this[URL_KEY] = String(args[1] ?? '');
    return nativeOpen.apply(this, args);
  } as typeof proto.open;

  proto.send = function (this: TaggedXHR, body?: Document | XMLHttpRequestBodyInit | null) {
    const url = this[URL_KEY] ?? '';
    if (url.includes('/socket.io/')) {
      try {
        if (typeof body === 'string') {
          dispatch(body, 'outbound');
        }
        this.addEventListener('load', () => {
          try {
            if (this.responseType === '' || this.responseType === 'text') {
              if (typeof this.responseText === 'string' && this.responseText.length > 0) {
                dispatch(this.responseText, 'inbound');
              }
            }
          } catch {
            // observation errors must not prevent socket.io from processing responses
          }
        });
      } catch {
        // observation errors must never prevent the send
      }
    }
    return nativeSend.call(this, body);
  };
}
