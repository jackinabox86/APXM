# Zustand Stores & State Patterns

## Entity Stores (shadow batching during message bursts)

- `sites` — Player's bases/stations and their properties
- `production` — Production lines and queued orders
- `workforce` — Per-base workforce tiers and their needs
- `storage` — All storage containers for the player (see StoreType table below)
- `ships` — Fleet vessels, cargo, fuel state
- `flights` — In-transit ship movements
- `contracts` — Active/completed contracts
- `balances` — Cash, wallet info

### Storage Types (`PrunApi.StoreType`)

Every `PrunApi.Store` has a `type` field that distinguishes its purpose:

| `type`               | Meaning |
|----------------------|---------|
| `STORE`              | Base inventory (tied to a site via `addressableId = siteId`) |
| `SHIP_STORE`         | Ship cargo hold |
| `STL_FUEL_STORE`     | Ship STL fuel tank |
| `FTL_FUEL_STORE`     | Ship FTL fuel tank |
| `WAREHOUSE_STORE`    | CX warehouse |
| `CONSTRUCTION_STORE` | Construction site materials |
| `UPKEEP_STORE`       | Base upkeep buffer |
| `VORTEX_FUEL_STORE`  | Vortex fuel tank |

**Ship stores**: A ship has three stores sharing the same `name` (the ship's registration name). `storagesStore.getByName()` returns whichever comes first — use `storagesStore.getByNameAndType(name, type)` to target a specific one.

**Burn calculations** use only `STORE` type. See `core/burn.ts`.

### `PrunApi.Material.name` is camelCase

`material.name` is an internal identifier like `"pioneerLuxuryDrink"`, not a display string. Use `material.ticker` for matching against APEX UI elements. The `toDisplayName()` helper in `lib/act/action-steps/cont-utils.ts` converts to spaced title-case if a display name is needed.

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
