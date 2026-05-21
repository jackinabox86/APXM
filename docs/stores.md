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
