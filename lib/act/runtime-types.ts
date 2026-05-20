// Runtime-only types used by the ACT runner.
// These are intentionally minimal stubs in Stage 1; the real PrunTile concept
// from refined-prun has no direct analogue on mobile APXM (no tiles/floating
// windows), so callers will adapt later stages to whatever the runner needs.

export interface PrunTile {
  // Opaque handle to a buffer/tile. Concrete shape is intentionally unspecified
  // until later stages wire it up to APXM's Stack-based buffer model.
  frame: HTMLElement;
  command?: string;
}
