# Zustand Stores & State Patterns

## Entity Stores (shadow batching during message bursts)

- `sites` — Player's bases/stations and their properties
- `production` — Production lines and queued orders
- `workforce` — Per-base workforce tiers and their needs
- `storage` — Inventory items in STORE-type containers (excludes WAREHOUSE_STORE)
- `ships` — Fleet vessels, cargo, fuel state
- `flights` — In-transit ship movements
- `contracts` — Active/completed contracts
- `balances` — Cash, wallet info

## Singleton Stores (normal Zustand)

- `connection` — WebSocket connection state, message count, APEX unresponsiveness detection
- `gameState` — Whether APEX UI is visible (mobile-only, controls shadow host opacity)
- `settings` — User preferences (burn thresholds, FIO credentials, theme)
- `screens` — Linked APEX screens for quick navigation
- `company` — Player company info
- `warehouses` — CX warehouse locations and inventory
- `cache` — localStorage rehydration state
- `refreshState` — Buffer refresh mode (auto vs manual)
- `siteSources` — Per-site data origin tracking (WebSocket vs FIO vs cache)

## Message Handlers (`stores/message-handlers.ts`)

Registers a type → handler map for all game message types. Each handler updates relevant stores based on message payload. Called from the batched processor in content.tsx.

## Async Initialization Order

1. Settings hydrate first (`waitForSettingsHydration()`)
2. Entity stores rehydrate from cache (`rehydrateAllStores()`)
3. FIO fetch runs concurrently (fire-and-forget)
4. Auto-refresh triggers after sites are loaded

## Material Identifiers

Materials have three distinct identifiers:

| Identifier | Example | Notes |
|---|---|---|
| `ticker` | `FE`, `H2O`, `RAT` | Short 3-letter code used in most game APIs |
| `name` | `Iron`, `Water`, `RatMeat` | In-game identifier, used as i18n key |
| display name | `"Iron Ore"`, `"Water"`, `"Rat Meat"` | Localized string from `window['PrUn_i18n']` |

The `Material` object is the bridge between all three — it carries `.ticker` and `.name` directly, and its `.name` is the key for the i18n display name lookup (`PrunI18N[Material.${material.name}.name]`).

**Lookup helpers** (from refined-prun patterns):

```typescript
// ticker ↔ Material (materials.ts)
materialsStore.getByTicker(ticker)   // ticker → Material
materialsStore.getByName(name)       // in-game name → Material

// Material ↔ display name (i18n.ts)
getMaterialName(material)            // Material → localized display name
getMaterialByName(displayName)       // localized display name → Material
```

Convert between any two identifiers via `Material`:
`ticker → getByTicker() → Material → getMaterialName() → display name`

The i18n system (`window['PrUn_i18n']`) supports multiple languages — the same `Material` with `name: "Iron"` renders as "Hierro" in Spanish. Always use `getMaterialName()` for display rather than hardcoding English strings.

## Store Pattern

Stores use immer middleware (mutate draft directly):

```typescript
const useExampleStore = create<State>((set) => ({
  count: 0,
  increment: () => set((s) => { s.count++; }),
  reset: () => set({ count: 0, flag: false }),
}));
```

Subscribe to changes:
```typescript
const unsubscribe = useStore.subscribe((state) => {
  if (state.connected) { ... }
});
```
