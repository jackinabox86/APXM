import { describe, it, expect, vi } from 'vitest';
import type { ProcessedMessage } from '../types';
import { BRIDGE_CHANNEL, emitMessage } from './main-world';
import { initMessageBridge, onMessage } from './content-bridge';

const sample: ProcessedMessage = {
  messageType: 'SITE_SITES',
  payload: { messageType: 'SITE_SITES', payload: { sites: [] } },
  timestamp: 123,
  direction: 'inbound',
  rawSize: 42,
};

function dispatchBridgeMessage(data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data, source: window }));
}

describe('main-world emitMessage', () => {
  it('posts an envelope tagged with the bridge channel', () => {
    const spy = vi.spyOn(window, 'postMessage');
    emitMessage(sample);
    expect(spy).toHaveBeenCalledWith({ channel: BRIDGE_CHANNEL, msg: sample }, '*');
    spy.mockRestore();
  });
});

describe('content-bridge', () => {
  it('delivers bridged messages to subscribers', () => {
    initMessageBridge();
    const received: ProcessedMessage[] = [];
    const unsubscribe = onMessage((msg) => received.push(msg));

    dispatchBridgeMessage({ channel: BRIDGE_CHANNEL, msg: sample });

    expect(received).toEqual([sample]);
    unsubscribe();
  });

  it('ignores messages without the bridge channel tag', () => {
    initMessageBridge();
    const received: ProcessedMessage[] = [];
    const unsubscribe = onMessage((msg) => received.push(msg));

    dispatchBridgeMessage({ msg: sample });
    dispatchBridgeMessage('unrelated');

    expect(received).toEqual([]);
    unsubscribe();
  });

  it('stops delivery after unsubscribe', () => {
    initMessageBridge();
    const received: ProcessedMessage[] = [];
    const unsubscribe = onMessage((msg) => received.push(msg));

    unsubscribe();
    dispatchBridgeMessage({ channel: BRIDGE_CHANNEL, msg: sample });

    expect(received).toEqual([]);
  });

  it('isolates a throwing subscriber from the others', () => {
    initMessageBridge();
    const received: ProcessedMessage[] = [];
    const unsubBad = onMessage(() => {
      throw new Error('boom');
    });
    const unsubGood = onMessage((msg) => received.push(msg));

    dispatchBridgeMessage({ channel: BRIDGE_CHANNEL, msg: sample });

    expect(received).toEqual([sample]);
    unsubBad();
    unsubGood();
  });
});
