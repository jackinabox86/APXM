// Ambient declarations for refined-prun-style globals used by the ported
// step-machine's execute-time DOM interaction. These are runtime concerns to
// be wired up in a later stage — the rprun originals come from the bundled
// APEX page (CSS module hash map `C` and jQuery-like `$`/`_$`/`_$$`).

declare const C: Record<string, Record<string, string>>;

// Selector helpers used in execute-time DOM interaction. The exact rprun
// signatures vary; these unions cover the call sites in the ported code.
declare function $<T extends Element = HTMLElement>(
  root: Element | Document,
  selector: string,
): Promise<T>;
declare function _$<T extends Element = HTMLElement>(
  root: Element | Document,
  selector: string,
): T | null;
declare function _$$<T extends Element = HTMLElement>(
  root: Element | Document,
  selector: string,
): T[];
