# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**APXM** is a cross-browser extension providing a mobile-optimised touch interface and desktop Empire HUD for [Prosperous Universe](https://prosperousuniverse.com). It observes WebSocket traffic between APEX and the game server, decodes game messages, and renders rich UIs via React.

**Key Goal**: Port action runner features from [refined-prun](https://github.com/refined-prun/refined-prun) desktop extension to work on mobile via Orion browser. Desktop and mobile share the same compiled bundle—CSS hashes are identical across platforms.

**Platform Support**: iOS/iPadOS (Orion), Android (Firefox/Kiwi), Desktop (Chrome/Firefox with HUD overlay)

## Commands

```bash
# Install dependencies (Node.js 22+, pnpm 10+)
pnpm install

# Development
pnpm run dev              # Chrome with hot reload
pnpm run dev:firefox      # Firefox with hot reload

# Build
pnpm run build            # Chrome MV3 → .output/chrome-mv3/
pnpm run build:firefox    # Firefox MV2 → .output/firefox-mv2/

# Testing
pnpm test                 # Run all tests (Vitest)
pnpm test -- pattern      # Run matching tests (e.g., pnpm test -- burn)
pnpm test --run           # Single run (no watch)

# Packaging
pnpm run zip              # Chrome zip
pnpm run zip:firefox      # Firefox zip + sources (for AMO)

# Desktop shell (separate Vite app at apxm.27bit.dev)
cd shell && pnpm install && pnpm run build
```

## Architecture Overview

### Data Pipeline

```
APEX ↔ Game Server (WebSocket/Socket.IO)
         ↓ (observed, never modified)
    ┌─── inline-proxy (inline <script>, main world, document_start) ────┐
    │    Captures WS frames via WebSocket.prototype.send + addEventListener│
    │    Posts raw frames via window.postMessage(__apxmRawFrame)          │
    │    content.tsx receives → decodeFrame() → dispatchMessage()         │
    └──────────────────────────────────────────────────────────────────────┘
    ┌─── ws-interceptor.js (main-world injected script) ──────────────────┐
    │    WS proxy: skipped when inline proxy active (__apxmWsProxied)     │
    │    XHR proxy: always installed (polling transport fallback)          │
    │    When WS proxy runs: ProcessedMessage → emitMessage →             │
    │      BRIDGE_CHANNEL postMessage → initMessageBridge → onMessage     │
    └──────────────────────────────────────────────────────────────────────┘
         ↓
    Zustand entity stores
         ↓
    ├─→ Mobile UI (React overlay, full-screen)
    └─→ Desktop bridge (postMessage → Helm HUD)
```

### Key Constraint: Message Batching

The content script (`entrypoints/content.tsx`) implements **two-layer message batching** to prevent React 19 error #185 (max update depth). During login, dozens of messages arrive rapidly:

1. **setTimeout(0)** — collects messages into fresh macro tasks (React's nestedUpdateCount resets)
2. **Entity store shadow batching** — redirects mutations to plain Maps during batch, then flushes with one Zustand `set()` call per store

This prevents React from hitting 50 nested updates. Without this, login would crash.

### Extension Entrypoints

- **content.tsx** — Main bootstrap script (document_start). Synchronously installs the inline WebSocket proxy via `installInlineProxy()`, then injects ws-interceptor.js, polls for interceptor readiness, initializes message bridge and Zustand stores, mounts React overlay in Shadow DOM or runs desktop bridge mode. Hosts the raw-frame bridge: receives `__apxmRawFrame` postMessages from the inline proxy, decodes them with `decodeFrame()`, and dispatches directly to `onMessage` subscribers via `dispatchMessage()`.
- **ws-interceptor.ts** — Main-world script injected by content.tsx. Skips WebSocket proxy installation when the inline proxy is already active (`window.__apxmWsProxied`); always installs the XHR proxy for polling-transport fallback. When the WebSocket proxy does run (inline proxy failed), processes frames through the full @prun/link decoder pipeline.
- **background.ts** — Minimal service worker for extension lifecycle (MV3).

### `@prun/link` Package (`packages/prun-link/`)

In-repo pnpm workspace package (`"@prun/link": "workspace:*"`) providing WebSocket interception and game-message decoding. Consumed via subpath exports; no build step — WXT/Vite compiles its `.ts` source directly.

- **`inline-proxy/`** — `installInlineProxy()` injects a plain-JS `<script>` element synchronously at document_start, installing a WebSocket proxy in the main world before any page scripts run. The proxy intercepts at `WebSocket.prototype.send` (bypasses refined-prun's Proxy `get` trap) and via a captured `addEventListener` reference (bypasses refined-prun's recursive `WebSocket.prototype.addEventListener` stub). Raw frames are forwarded to the content-script world via `window.postMessage` on `RAW_FRAME_CHANNEL`. Installation is confirmed via a DOM dataset attribute (`apxmProxy`) which is readable from both worlds — unlike `window.__apxmWsProxied` which is main-world-only.
- **`socket-io/`** — `installWebSocketProxy()` / `installXHRProxy()` observe APEX traffic without modifying it; `setMessageCallback()` registers the sink. Decodes engine.io v4 frames → Socket.IO v4 EVENT packets → `ProcessedMessage`. Also exports `decodeFrame()` for direct use by content.tsx's raw-frame bridge.
- **`script-control/`** — `installScriptBlocker()` / `restoreBlockedScripts()` hold back APEX's scripts until the proxies are installed.
- **`message-bus/`** — `emitMessage()` (main-world) and `initMessageBridge()` + `onMessage()` + `dispatchMessage()` (content-bridge) bridge messages across the world boundary. `initMessageBridge()` listens on the `BRIDGE_CHANNEL` postMessage channel (used by ws-interceptor.js). `dispatchMessage()` delivers a `ProcessedMessage` directly to all `onMessage` subscribers without going through postMessage — used by content.tsx's inline-proxy raw-frame bridge.

APEX wraps every game message in a Socket.IO event literally named `"event"`; the real `messageType` lives inside `args[0]` as `{ messageType, payload }`. That double-wrapped object becomes `ProcessedMessage.payload`, which `extractPayload()` (`stores/message-handlers.ts`) unwraps one level.

### Zustand Stores (`stores/`)

**Entity stores** (shadow batching during message bursts):
- `sites` — Player's bases/stations and their properties
- `production` — Production lines and queued orders
- `workforce` — Per-base workforce tiers and their needs
- `storage` — Inventory items in STORE-type containers (excludes WAREHOUSE_STORE)
- `ships` — Fleet vessels, cargo, fuel state
- `flights` — In-transit ship movements
- `contracts` — Active/completed contracts
- `balances` — Cash, wallet info

**Singleton stores** (normal Zustand):
- `connection` — WebSocket connection state, message count, APEX unresponsiveness detection
- `gameState` — Whether APEX UI is visible (mobile-only, controls shadow host opacity)
- `settings` — User preferences (burn thresholds, FIO credentials, theme)
- `screens` — Linked APEX screens for quick navigation
- `company` — Player company info
- `warehouses` — CX warehouse locations and inventory
- `cache` — localStorage rehydration state
- `refreshState` — Buffer refresh mode (auto vs manual)
- `siteSources` — Per-site data origin tracking (WebSocket vs FIO vs cache)

**Message handlers** (`message-handlers.ts`):
- Registers type → handler map for all game message types
- Each handler updates relevant stores based on message payload
- Called from batched processor in content.tsx

### React Components (`components/`)

**Layout**:
- `App.tsx` — Root; toggles shadow host visibility, manages APEX overlay, handles #container offset
- `layout/AppShell.tsx` — Tab-based navigation (Status/Bases/Fleet/Contracts/Settings)
- `layout/TabBar.tsx` — Mobile tab switcher
- `layout/Header.tsx` — Title bar with connection status
- `layout/FloatingReturn.tsx` — Floating "Return to APEX" button

**Feature Views**:
- `views/StatusView.tsx` — Dashboard (mini lists for bases, fleet, contracts, cash)
- `views/BasesView.tsx` — Full base list with burn status, expandable detail
- `views/FleetView.tsx` — Ship list, cargo/fuel bars, ETA countdowns
- `views/ContractsView.tsx` — Contract tracking
- `views/SettingsView.tsx` — User preferences (thresholds, FIO creds, theme)

**Burn Status**:
- `burn/BurnSummaryList.tsx` — Base burn list (production input/output, workforce consumption)
- `burn/SiteBurnCard.tsx` — Single base burn card
- `burn/BurnRow.tsx` — Material-level burn row
- `burn/BurnBadge.tsx` — Urgency indicator (critical/warning/ok/surplus)
- `burn/DataSourceBadge.tsx` — Shows data source (WebSocket vs FIO vs cache)

**Shared**:
- `shared/Card.tsx` — Reusable card wrapper
- `shared/MaterialTile.tsx` — Material display (name, amount, color)
- `shared/ProgressBar.tsx` — Visual progress indicator
- `shared/StatusDot.tsx` — Connection/urgency status dot
- `shared/SectionHeader.tsx` — Section divider

### Core Logic (`core/`)

**`burn.ts`** — Burn rate calculations. Integrates production orders, workforce needs, and inventory to compute:
- Daily burn rate per material (positive = output, negative = input)
- Days remaining before depletion
- Urgency classification (critical/warning/ok/surplus)
- Resupply need calculation

Key functions:
- `calculateProductionRates()` — Sum of order inputs/outputs across lines, weighted by capacity
- `calculateWorkforceConsumption()` — Aggregate material needs across workforce tiers
- `classifyBurnType()` — Determines burn category (input/output/workforce)
- `classifyUrgency()` — Maps days remaining to urgency level
- `calculateSiteBurn()` — Integrates all sources for a single site
- `calculateAllBurns()` — All sites

Uses **thresholds** from settings (default: critical=3 days, warning=5 days, resupply=30 days).

### Utilities (`lib/`)

- `buffer-opener.ts` — Opens APEX buffers (BS, INV, PROD, etc.) via postMessage
- `buffer-refresh/` — Batch refresh logic (navigates through forms via buffer commands)
- `material-colors.ts` — Material → CSS color mapping (burn urgency, production type)
- `material-categories.ts` — Material taxonomy (food, fuel, etc.)
- `material-lookup.ts` — Ticker → full name
- `fio/` — FIO REST API integration (game data: materials, recipes, planets)
- `desktop-bridge/` — postMessage communication with Helm shell
- `rprun-detect.ts` — Detects refined-prun and offers ACTS integration
- `diagnostics.ts` — Debug overlay for troubleshooting
- `address.ts` — Game location parsing (system/planet/station)

### Mobile-Specific Constraints

- **Single buffer limitation**: Mobile APEX has one active buffer at a time. Buffer refresh must navigate in/out for each step (serial, slower than desktop split-tile)
- **Stack navigation**: UI organizes into hierarchical stacks rather than floating windows
- **Pointer events**: Touch-optimised layout (Tailwind mobile-first)
- **#container div**: All mobile game UI lives here; APXM overlay manipulates display/margin/height to avoid covering critical game controls

### Testing (`__tests__/`, `*.test.ts`)

- **Framework**: Vitest with jsdom environment
- **Coverage**: Core burn logic, store operations, message handlers, utility functions
- **Factories** (`__tests__/fixtures/factories.ts`): Builder functions for creating test entities (sites, orders, workforce, etc.)
- **Store reset**: Each test clears all stores via `beforeEach()` and fixture `resetIdCounter()`

Example test structure:
```typescript
describe('burn.ts', () => {
  beforeEach(() => {
    resetIdCounter();
    useSettingsStore.getState().reset();
    useSitesStore.getState().clear();
    // ... clear all stores
  });

  it('calculates rate correctly', () => {
    // Arrange: use factories
    const order = createOrderWithIO([...], [...], duration);
    useProductionStore.getState().setOne(line);

    // Act
    const rates = calculateProductionRates([line]);

    // Assert
    expect(rates.get('RAT')?.output).toBe(10);
  });
});
```

## CSS & Styling

- **Tailwind CSS** — Mobile-first (small screens default, then @media breakpoints)
- **PostCSS** — rem-to-px conversion for Orion compatibility
- **CSS Modules** — APXM shares bundle with desktop; CSS hashes are identical (verified on mobile)
- **Shadow DOM** — React mounts in `apxm-overlay` shadow host; scoped styles prevent APEX conflicts

## State Management Patterns

**Zustand stores** use immer middleware (implicit immutability):

```typescript
const useExampleStore = create<State>((set) => ({
  // Field
  count: 0,

  // Updater (immer-wrapped, so mutate directly)
  increment: () => set((s) => { s.count++; }),

  // Batch update
  reset: () => set({ count: 0, flag: false }),
}));
```

**Subscribe to changes**:
```typescript
const unsubscribe = useStore.subscribe((state) => {
  if (state.connected) {
    // React to connection
  }
});
```

**Async initialization**:
- Settings hydrate first (`waitForSettingsHydration()`)
- Entity stores rehydrate from cache (`rehydrateAllStores()`)
- FIO fetch runs concurrently (fire-and-forget)
- Auto-refresh triggers after sites are loaded

## refined-prun Coexistence Constraints

refined-prun's `socketIOMiddleware` wraps `window.WebSocket` with a `new Proxy(WebSocket, { construct })` and each instance with a second Proxy `{ get, set }`. Two specific behaviours require care:

**Instance Proxy `get` trap** returns `Reflect.get(nativeWs, prop).bind(nativeWs)` for all function properties. This means instance-level overrides (`ws.send = fn`) are silently bypassed — the trap performs a live prototype lookup and returns the prototype method bound to the native ws, ignoring any per-instance property. **Fix**: intercept at `WebSocket.prototype.send` instead.

**`WebSocket.prototype.addEventListener` overwrite**: after setting up the outer Proxy, refined-prun replaces `WebSocket.prototype.addEventListener` with a self-referential stub `function(t,l,o){ return this.addEventListener(t,l,o) }`. Calling this stub with a native (non-Proxy) WebSocket as `this` causes infinite recursion → stack overflow → the WebSocket constructor silently throws. **Fix**: capture `_origAEL = NativeWebSocket.prototype.addEventListener` before any other extension code can run (i.e., at inline-script init time) and call `_origAEL.call(ws, ...)` directly in `_inst()` rather than going through the prototype chain.

**Extension world isolation**: `window.__apxmWsProxied` set by the inline script (main world) is invisible from the content-script isolated world. Use `document.documentElement.dataset.apxmProxy` as the cross-world readiness signal instead — DOM attributes are shared between all worlds.

**Script-blocker interaction**: both APXM and refined-prun install MutationObserver-based script blockers at document_start. refined-prun's blocker re-catches scripts that APXM releases, so APEX's bundle load timing is non-deterministic when both are active. The inline proxy must be installed before either blocker releases the scripts, which the synchronous `installInlineProxy()` call in content.tsx (document_start, isolated world) guarantees.

## Mobile APEX & Refined PrUn Integration

See [Mobile APEX & APXM Integration Docs](https://github.com/jackinabox86/refined-prun/blob/claude/evaluate-axpm-port-yfUIl/docs/mobile-apex-and-apxm.md) for:
- CSS selector compatibility (verified cross-platform)
- DOM navigation patterns (hierarchical stacks)
- Buffer interaction model (single serial buffer)
- Action runner architecture requirements

**Key verified selectors** (desktop & mobile match):
- MaterialSelector containers and inputs
- SliderView (rc-slider)
- Button and FormComponent variants
- ActionFeedback overlay

## Deployment

- **Chrome**: Via Chrome Web Store (MV3)
- **Firefox**: Via AMO (MV2 with sources zip)
- **Desktop shell**: Separate Vite deploy to Cloudflare Workers (apxm.27bit.dev)

## Dependencies

- **@prun/link** — In-repo workspace package (`packages/prun-link/`) for WebSocket interception + Socket.IO/engine.io decoding
- **React 19** + TypeScript
- **Zustand** — Minimal state management
- **Tailwind CSS** — Utility styling
- **Vitest** — Unit testing
- **WXT** — Cross-browser extension framework (Vite-based)
- **Helm** — Desktop galaxy map (pixi.js)
