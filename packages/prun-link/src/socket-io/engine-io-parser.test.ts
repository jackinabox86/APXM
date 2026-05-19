import { describe, it, expect } from 'vitest';
import { decodeEngineIoFrame, decodeEngineIoPayload } from './engine-io-parser';

describe('engine-io-parser', () => {
  it('decodes a single message frame', () => {
    expect(decodeEngineIoFrame('42["event",{}]')).toEqual({
      type: 4,
      data: '2["event",{}]',
    });
  });

  it('decodes ping/pong control frames', () => {
    expect(decodeEngineIoFrame('2')).toEqual({ type: 2, data: '' });
    expect(decodeEngineIoFrame('3')).toEqual({ type: 3, data: '' });
  });

  it('returns null for an empty frame', () => {
    expect(decodeEngineIoFrame('')).toBeNull();
  });

  it('returns null when the leading character is not a digit', () => {
    expect(decodeEngineIoFrame('x["event"]')).toBeNull();
  });

  it('treats a separator-free payload as one packet', () => {
    expect(decodeEngineIoPayload('42["event",{}]')).toEqual([
      { type: 4, data: '2["event",{}]' },
    ]);
  });

  it('splits a record-separator-delimited payload into multiple packets', () => {
    const payload = '42["event",{"a":1}]\x1e42["event",{"b":2}]';
    expect(decodeEngineIoPayload(payload)).toEqual([
      { type: 4, data: '2["event",{"a":1}]' },
      { type: 4, data: '2["event",{"b":2}]' },
    ]);
  });
});
