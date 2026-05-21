// Ambient declarations for refined-prun-style globals used by the ported
// action-step execute() functions. setupActGlobals() (lib/act/globals-setup.ts)
// must be called before any step runs to populate these on window.

declare const C: Record<string, Record<string, string>>;

// Async: waits up to ~10 s for the first matching element; resolves null on timeout.
declare function $<T extends HTMLElement = HTMLElement>(
  root: Element | Document,
  selector: string,
): Promise<T | null>;

// Synchronous: returns first matching element or null.
declare function _$<T extends HTMLElement = HTMLElement>(
  root: Element | Document,
  selector: string,
): T | null;

// Synchronous: returns all matching elements.
declare function _$$<T extends HTMLElement = HTMLElement>(
  root: Element | Document,
  selector: string,
): T[];
