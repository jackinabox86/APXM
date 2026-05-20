import type { ProcessedMessage } from '../types';
import { BRIDGE_CHANNEL } from './main-world';

type MessageListener = (msg: ProcessedMessage) => void;

const listeners = new Set<MessageListener>();
let initialized = false;

function isBridgeEnvelope(data: unknown): data is { channel: string; msg: ProcessedMessage } {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { channel?: unknown }).channel === BRIDGE_CHANNEL &&
    (data as { msg?: unknown }).msg != null
  );
}

/**
 * Install the single `message` listener that receives bridged messages from
 * the main-world interceptor and fans them out to `onMessage` subscribers.
 * Safe to call more than once.
 */
export function initMessageBridge(): void {
  if (initialized) return;
  initialized = true;

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!isBridgeEnvelope(event.data)) return;
    for (const listener of listeners) {
      try {
        listener(event.data.msg);
      } catch {
        // A faulty subscriber must not stop delivery to the others.
      }
    }
  });
}

/** Subscribe to bridged messages. Returns an unsubscribe function. */
export function onMessage(listener: MessageListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
