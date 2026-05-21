// Stage 7: real store wiring — materials, CXOB, and warehouse lookup.
// Tests that _compat shims delegate to live Zustand stores and that the
// message handlers populate those stores from wire-protocol payloads.

import { describe, it, expect, beforeEach } from 'vitest';
import { useMaterialsStore } from '../../../stores/entities/materials';
import { useCxobStore } from '../../../stores/cxob';
import { useWarehouseStore } from '../../../stores/warehouses';
import { initMessageHandlers, processMessage } from '../../../stores/message-handlers';
import { materialsStore, cxobStore, warehousesStore } from '../_compat';
import type { ProcessedMessage } from '@prun/link';

function dispatch(messageType: string, payload: unknown): void {
  const msg: ProcessedMessage = {
    messageType,
    payload: { messageType, payload },
    timestamp: Date.now(),
    direction: 'inbound',
    rawSize: 0,
  };
  processMessage(msg);
}

beforeEach(() => {
  initMessageHandlers();
  useMaterialsStore.setState({ materials: new Map() });
  useCxobStore.getState().clear();
  useWarehouseStore.setState({ warehouses: [] });
});

// ---------------------------------------------------------------------------
// Materials store + WORLD_MATERIAL_CATEGORIES handler
// ---------------------------------------------------------------------------

describe('Stage 7 — materials store', () => {
  it('setFromCategories populates getByTicker', () => {
    useMaterialsStore.getState().setFromCategories([
      {
        id: 'cat-1',
        name: 'Consumables',
        materials: [
          { id: 'm-1', ticker: 'RAT', name: 'Basic Rations', category: 'Consumables', weight: 0.21, volume: 0.1, resource: false },
          { id: 'm-2', ticker: 'DW',  name: 'Drinking Water', category: 'Consumables', weight: 0.1,  volume: 0.1, resource: false },
        ],
      },
    ]);

    const rat = useMaterialsStore.getState().getByTicker('RAT');
    expect(rat?.weight).toBe(0.21);
    expect(rat?.volume).toBe(0.1);
    expect(useMaterialsStore.getState().getByTicker('DW')?.ticker).toBe('DW');
    expect(useMaterialsStore.getState().getByTicker('XYZ')).toBeUndefined();
  });

  it('_compat materialsStore.getByTicker delegates to real store', () => {
    expect(materialsStore.getByTicker('RAT')).toBeUndefined();

    useMaterialsStore.getState().setFromCategories([
      {
        id: 'cat-1',
        name: 'Consumables',
        materials: [
          { id: 'm-1', ticker: 'RAT', name: 'Basic Rations', category: 'Consumables', weight: 0.21, volume: 0.1, resource: false },
        ],
      },
    ]);

    expect(materialsStore.getByTicker('RAT')?.weight).toBe(0.21);
  });

  it('WORLD_MATERIAL_CATEGORIES message populates the store', () => {
    dispatch('WORLD_MATERIAL_CATEGORIES', {
      categories: [
        {
          id: 'cat-1',
          name: 'Agricultural Products',
          materials: [
            { id: 'mat-rat', ticker: 'RAT', name: 'Basic Rations', weight: 0.21, volume: 0.1, resource: false },
          ],
        },
      ],
    });

    expect(materialsStore.getByTicker('RAT')?.ticker).toBe('RAT');
    expect(materialsStore.getByTicker('RAT')?.category).toBe('Agricultural Products');
  });

  it('WORLD_MATERIAL_CATEGORIES skips malformed entries', () => {
    dispatch('WORLD_MATERIAL_CATEGORIES', {
      categories: [
        { id: 'ok-cat', name: 'Good', materials: [{ id: 'x', ticker: 'FE', name: 'Iron', weight: 1, volume: 0.5 }] },
        'not-an-object',
        { id: 'bad', name: 'Bad', materials: [{ ticker: 42 }] },
      ],
    });

    expect(materialsStore.getByTicker('FE')?.ticker).toBe('FE');
  });
});

// ---------------------------------------------------------------------------
// CXOB store + COMEX_BROKER_DATA handler
// ---------------------------------------------------------------------------

describe('Stage 7 — CXOB store', () => {
  it('setOrderBook and getByTicker round-trips', () => {
    useCxobStore.getState().setOrderBook('RAT.CI1', {
      sellingOrders: [{ amount: 100, limit: { amount: 250 } }],
      buyingOrders: [],
    });

    const book = useCxobStore.getState().getByTicker('RAT.CI1');
    expect(book?.sellingOrders[0].limit.amount).toBe(250);
    expect(useCxobStore.getState().getByTicker('DW.CI1')).toBeUndefined();
  });

  it('_compat cxobStore.getByTicker delegates to real store', () => {
    expect(cxobStore.getByTicker('RAT.CI1')).toBeUndefined();

    useCxobStore.getState().setOrderBook('RAT.CI1', {
      sellingOrders: [{ amount: 50, limit: { amount: 300 } }],
      buyingOrders: [],
    });

    expect(cxobStore.getByTicker('RAT.CI1')?.sellingOrders[0].amount).toBe(50);
  });

  it('COMEX_BROKER_DATA (ticker + exchange object) populates the store', () => {
    dispatch('COMEX_BROKER_DATA', {
      ticker: 'RAT',
      exchange: { code: 'CI1' },
      sellingOrders: [
        { amount: 200, limit: { amount: 280 } },
        { amount: null, limit: { amount: 300 } },
      ],
      buyingOrders: [
        { amount: 100, limit: { amount: 260 } },
      ],
    });

    const book = cxobStore.getByTicker('RAT.CI1');
    expect(book).toBeDefined();
    expect(book!.sellingOrders).toHaveLength(2);
    expect(book!.sellingOrders[0].amount).toBe(200);
    expect(book!.sellingOrders[1].amount).toBeNull();
    expect(book!.buyingOrders[0].limit.amount).toBe(260);
  });

  it('COMEX_BROKER_DATA (exchangeCode flat field) populates the store', () => {
    dispatch('COMEX_BROKER_DATA', {
      ticker: 'DW',
      exchangeCode: 'NC1',
      sellingOrders: [{ amount: 500, limit: { amount: 10 } }],
      buyingOrders: [],
    });

    expect(cxobStore.getByTicker('DW.NC1')?.sellingOrders[0].amount).toBe(500);
  });

  it('COMEX_BROKER_DATA (material object) populates the store', () => {
    dispatch('COMEX_BROKER_DATA', {
      material: { ticker: 'FE' },
      exchangeCode: 'AI1',
      sellingOrders: [{ amount: 10, limit: { amount: 100 } }],
      buyingOrders: [],
    });

    expect(cxobStore.getByTicker('FE.AI1')?.sellingOrders[0].limit.amount).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Warehouse store — getByEntityNaturalId
// ---------------------------------------------------------------------------

describe('Stage 7 — warehousesStore.getByEntityNaturalId', () => {
  it('finds a warehouse by stationNaturalId (CX code)', () => {
    useWarehouseStore.getState().setWarehouses([
      { warehouseId: 'w1', storeId: 's1', systemNaturalId: 'CI', stationNaturalId: 'CI1' },
      { warehouseId: 'w2', storeId: 's2', systemNaturalId: 'NC', stationNaturalId: 'NC1' },
    ]);

    expect(warehousesStore.getByEntityNaturalId('CI1')?.storeId).toBe('s1');
    expect(warehousesStore.getByEntityNaturalId('NC1')?.storeId).toBe('s2');
  });

  it('falls back to systemNaturalId when stationNaturalId is null', () => {
    useWarehouseStore.getState().setWarehouses([
      { warehouseId: 'w3', storeId: 's3', systemNaturalId: 'IC', stationNaturalId: null },
    ]);

    expect(warehousesStore.getByEntityNaturalId('IC')?.storeId).toBe('s3');
  });

  it('returns undefined for an unknown naturalId', () => {
    expect(warehousesStore.getByEntityNaturalId('UNKNOWN')).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(warehousesStore.getByEntityNaturalId(undefined)).toBeUndefined();
  });
});
