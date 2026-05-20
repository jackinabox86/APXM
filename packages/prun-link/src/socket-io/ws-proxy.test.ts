import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { ProcessedMessage } from '../types';
import { setMessageCallback } from './callback';
import { installWebSocketProxy } from './ws-proxy';

/** Minimal WebSocket stand-in — jsdom ships no WebSocket implementation. */
class FakeWebSocket extends EventTarget {
  nativeSend = vi.fn();
  send: (data: unknown) => void;
  constructor(public url: string) {
    super();
    this.send = this.nativeSend;
  }
}

const FRAME = '42["event",{"messageType":"SITE_SITES","payload":{"sites":[]}}]';

describe('ws-proxy', () => {
  let received: ProcessedMessage[];

  beforeAll(() => {
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
    installWebSocketProxy();
  });

  beforeEach(() => {
    received = [];
    setMessageCallback((m) => received.push(m));
  });

  it('decodes inbound messages observed on a proxied socket', () => {
    const ws = new window.WebSocket('wss://apex.prosperousuniverse.com');
    ws.dispatchEvent(new MessageEvent('message', { data: FRAME }));

    expect(received).toHaveLength(1);
    expect(received[0].messageType).toBe('SITE_SITES');
    expect(received[0].direction).toBe('inbound');
  });

  it('decodes outbound sends and still forwards to the native send', () => {
    const ws = new window.WebSocket('wss://apex.prosperousuniverse.com') as unknown as FakeWebSocket;
    ws.send(FRAME);

    expect(ws.nativeSend).toHaveBeenCalledWith(FRAME);
    expect(received).toHaveLength(1);
    expect(received[0].direction).toBe('outbound');
  });

  it('is idempotent — re-installing does not double-decode', () => {
    installWebSocketProxy();
    const ws = new window.WebSocket('wss://apex.prosperousuniverse.com');
    ws.dispatchEvent(new MessageEvent('message', { data: FRAME }));

    expect(received).toHaveLength(1);
  });
});
