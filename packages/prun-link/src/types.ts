/**
 * A single decoded game message, observed on the APEX <-> server WebSocket.
 *
 * `payload` is intentionally the raw on-wire `{ messageType, payload }` object,
 * not the inner game data. Consumers (APXM's `extractPayload`) unwrap one level
 * to reach the actual game data.
 */
export interface ProcessedMessage {
  messageType: string;
  payload: unknown;
  timestamp: number;
  direction: 'inbound' | 'outbound';
  rawSize: number;
}
