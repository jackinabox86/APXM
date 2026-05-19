import type { ProcessedMessage } from '../types';

/** Wire-channel tag identifying prun-link bridge messages on `window`. */
export const BRIDGE_CHANNEL = '__prunLinkMessage';

interface BridgeEnvelope {
  channel: typeof BRIDGE_CHANNEL;
  msg: ProcessedMessage;
}

/**
 * Forward a decoded message from the main-world interceptor to the content
 * script. `window.postMessage` crosses the main-world / isolated-world
 * boundary; the content-bridge listens for the matching channel tag.
 */
export function emitMessage(msg: ProcessedMessage): void {
  const envelope: BridgeEnvelope = { channel: BRIDGE_CHANNEL, msg };
  window.postMessage(envelope, '*');
}
