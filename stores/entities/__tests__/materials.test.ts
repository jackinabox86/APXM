import { describe, it, expect, beforeEach } from 'vitest';
import { useMaterialsStore } from '../materials';
import { initMessageHandlers, processMessage } from '../../message-handlers';
import { materialsStore } from '../../../lib/act/_compat';
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
});

describe('materials store', () => {
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
