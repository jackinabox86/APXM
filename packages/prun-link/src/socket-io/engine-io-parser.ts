/**
 * engine.io v4 packet decoding.
 *
 * A WebSocket transport frame carries a single engine.io packet shaped as
 * `<type-digit><data>`. The HTTP long-polling transport concatenates multiple
 * packets, separated by the record-separator character `\x1e`.
 *
 * Packet types: 0 open, 1 close, 2 ping, 3 pong, 4 message, 5 upgrade, 6 noop.
 * Only type 4 (message) carries the Socket.IO layer.
 */

export const ENGINE_IO_MESSAGE = 4;
const RECORD_SEPARATOR = '\x1e';

export interface EngineIoPacket {
  type: number;
  data: string;
}

export function decodeEngineIoFrame(raw: string): EngineIoPacket | null {
  if (raw.length === 0) return null;
  const type = Number(raw[0]);
  if (!Number.isInteger(type)) return null;
  return { type, data: raw.slice(1) };
}

/**
 * Decode an engine.io v4 payload (one or more `\x1e`-delimited packets).
 * A WebSocket frame with no separator simply yields a single packet.
 */
export function decodeEngineIoPayload(raw: string): EngineIoPacket[] {
  const packets: EngineIoPacket[] = [];
  for (const chunk of raw.split(RECORD_SEPARATOR)) {
    const packet = decodeEngineIoFrame(chunk);
    if (packet) packets.push(packet);
  }
  return packets;
}
