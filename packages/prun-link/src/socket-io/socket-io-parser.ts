/**
 * Socket.IO v4 packet decoding.
 *
 * A decoded engine.io message packet carries a Socket.IO packet shaped as
 * `<type-digit>[<namespace>,][<ack-id>]<json-array>`.
 *
 * Packet types: 0 connect, 1 disconnect, 2 event, 3 ack,
 * 4 connect_error, 5 binary_event, 6 binary_ack.
 *
 * APEX uses only type 2 (event) on the default namespace, with no binary
 * attachments — so namespace prefixes and binary packets are not handled.
 */

const SOCKET_IO_EVENT = 2;

export interface SocketIoEvent {
  name: string;
  args: unknown[];
}

export function decodeSocketIoMessage(data: string): SocketIoEvent | null {
  if (data.length === 0) return null;
  const type = Number(data[0]);
  if (type !== SOCKET_IO_EVENT) return null;

  let rest = data.slice(1);

  // Optional namespace: `/name,` prefix before the payload.
  if (rest.startsWith('/')) {
    const comma = rest.indexOf(',');
    if (comma === -1) return null;
    rest = rest.slice(comma + 1);
  }

  // Optional numeric ack id before the JSON array.
  let i = 0;
  while (i < rest.length && rest[i] >= '0' && rest[i] <= '9') i++;
  rest = rest.slice(i);

  if (!rest.startsWith('[')) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rest);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  return { name: String(parsed[0]), args: parsed.slice(1) };
}
