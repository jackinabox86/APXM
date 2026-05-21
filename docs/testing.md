# Testing

- **Framework**: Vitest with jsdom environment
- **Run**: `pnpm test` (watch) or `pnpm test --run` (single pass) or `pnpm test -- <pattern>`
- **Factories**: `__tests__/fixtures/factories.ts` — builder functions for sites, orders, workforce, etc.
- **Store reset**: every test clears all stores in `beforeEach()` and calls `resetIdCounter()`

```typescript
describe('burn.ts', () => {
  beforeEach(() => {
    resetIdCounter();
    useSettingsStore.getState().reset();
    useSitesStore.getState().clear();
    // ... clear all stores
  });

  it('calculates rate correctly', () => {
    const order = createOrderWithIO([...], [...], duration);
    useProductionStore.getState().setOne(line);

    const rates = calculateProductionRates([line]);

    expect(rates.get('RAT')?.output).toBe(10);
  });
});
```
