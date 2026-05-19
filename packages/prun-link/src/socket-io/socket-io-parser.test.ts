import { describe, it, expect } from 'vitest';
import { decodeSocketIoMessage } from './socket-io-parser';

describe('socket-io-parser', () => {
  it('decodes an EVENT packet on the default namespace', () => {
    const result = decodeSocketIoMessage('2["event",{"messageType":"SITE_SITES"}]');
    expect(result).toEqual({
      name: 'event',
      args: [{ messageType: 'SITE_SITES' }],
    });
  });

  it('skips a namespace prefix', () => {
    const result = decodeSocketIoMessage('2/game,["event",{"messageType":"X"}]');
    expect(result).toEqual({ name: 'event', args: [{ messageType: 'X' }] });
  });

  it('skips a numeric ack id', () => {
    const result = decodeSocketIoMessage('217["event",{"messageType":"X"}]');
    expect(result).toEqual({ name: 'event', args: [{ messageType: 'X' }] });
  });

  it('ignores non-EVENT packet types', () => {
    expect(decodeSocketIoMessage('0')).toBeNull();
    expect(decodeSocketIoMessage('3["ack"]')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(decodeSocketIoMessage('2["event",{')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(decodeSocketIoMessage('')).toBeNull();
  });
});
