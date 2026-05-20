import type { ProcessedMessage } from '../types';

type MessageCallback = (msg: ProcessedMessage) => void;

let callback: MessageCallback | null = null;

/** Register the sink for every decoded message (set by the interceptor). */
export function setMessageCallback(cb: MessageCallback): void {
  callback = cb;
}

export function emitProcessed(msg: ProcessedMessage): void {
  callback?.(msg);
}
