// Stub TileAllocator type for Stage 1.
// In refined-prun a TileAllocator opens new desktop windows/tiles on demand.
// APXM has no tiles (mobile is Stack-based), so this is a minimal interface
// that later stages will implement on top of the buffer-refresh engine.

import type { PrunTile } from '../runtime-types';

export interface TileAllocator {
  requestTile(command: string): Promise<PrunTile | undefined>;
}
