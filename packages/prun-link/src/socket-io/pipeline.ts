import type { ProcessedMessage } from '../types';
import { ENGINE_IO_MESSAGE, decodeEngineIoPayload } from './engine-io-parser';
import { decodeSocketIoMessage } from './socket-io-parser';

/**
 * APEX wraps every game message in a Socket.IO event named literally `"event"`.
 * The real game message type lives inside the event argument:
 *   42["event", { messageType: "PRODUCTION_ORDER_ADDED", payload: {...} }]
 */
const APEX_EVENT_NAME = 'event';

interface WireEnvelope {
  messageType?: unknown;
  payload?: unknown;
}

/**
 * Decode a raw transport frame (WebSocket frame or polling payload) into zero
 * or more `ProcessedMessage` objects.
 *
 * `rawSize` is the byte size of the originating frame; it is attached to every
 * message decoded from that frame.
 */
export function decodeFrame(
  raw: string,
  direction: 'inbound' | 'outbound',
  rawSize: number,
): ProcessedMessage[] {
  const messages: ProcessedMessage[] = [];

  for (const packet of decodeEngineIoPayload(raw)) {
    if (packet.type !== ENGINE_IO_MESSAGE) continue;

    const event = decodeSocketIoMessage(packet.data);
    if (!event || event.name !== APEX_EVENT_NAME) continue;

    const envelope = event.args[0] as WireEnvelope | undefined;
    if (!envelope || typeof envelope.messageType !== 'string') continue;

    messages.push({
      messageType: envelope.messageType,
      // Pass the on-wire `{ messageType, payload }` through verbatim — this is
      // the shape APXM's `extractPayload` expects to unwrap.
      payload: envelope,
      timestamp: Date.now(),
      direction,
      rawSize,
    });
  }

  return messages;
}
