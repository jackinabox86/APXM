import { describe, it, expect } from 'vitest';
import { decodeFrame } from './pipeline';

describe('decodeFrame', () => {
  const frame =
    '42["event",{"messageType":"PRODUCTION_ORDER_ADDED","payload":{"id":"x"}}]';

  it('decodes an APEX frame into a ProcessedMessage', () => {
    const [msg] = decodeFrame(frame, 'inbound', frame.length);
    expect(msg.messageType).toBe('PRODUCTION_ORDER_ADDED');
    expect(msg.direction).toBe('inbound');
    expect(msg.rawSize).toBe(frame.length);
    expect(typeof msg.timestamp).toBe('number');
  });

  it('produces the double-wrapped payload that extractPayload unwraps', () => {
    const [msg] = decodeFrame(frame, 'inbound', frame.length);
    // Mirrors APXM's extractPayload: outer.payload -> actual game data.
    const outer = msg.payload as { messageType: string; payload: unknown };
    expect(outer.messageType).toBe('PRODUCTION_ORDER_ADDED');
    expect(outer.payload).toEqual({ id: 'x' });
  });

  it('decodes multiple events from a polling payload', () => {
    const a = '42["event",{"messageType":"A","payload":{}}]';
    const b = '42["event",{"messageType":"B","payload":{}}]';
    const msgs = decodeFrame(`${a}\x1e${b}`, 'inbound', 0);
    expect(msgs.map((m) => m.messageType)).toEqual(['A', 'B']);
  });

  it('ignores engine.io control frames', () => {
    expect(decodeFrame('2', 'inbound', 1)).toEqual([]);
    expect(decodeFrame('40', 'inbound', 2)).toEqual([]);
  });

  it('ignores events that are not the APEX "event" wrapper', () => {
    expect(decodeFrame('42["other",{"messageType":"X"}]', 'inbound', 0)).toEqual([]);
  });

  it('ignores events whose envelope lacks a messageType', () => {
    expect(decodeFrame('42["event",{"payload":{}}]', 'inbound', 0)).toEqual([]);
  });

  it('tags outbound direction', () => {
    const [msg] = decodeFrame(frame, 'outbound', frame.length);
    expect(msg.direction).toBe('outbound');
  });
});
