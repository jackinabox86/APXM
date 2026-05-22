import { describe, it, expect, beforeEach } from 'vitest';
import { useCxobStore } from '../cxob';
import { initMessageHandlers, processMessage } from '../message-handlers';
import { cxobStore } from '../../lib/act/_compat';
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
  useCxobStore.getState().clear();
});

describe('cxob store', () => {
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
