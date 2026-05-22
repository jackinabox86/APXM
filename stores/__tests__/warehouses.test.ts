import { describe, it, expect, beforeEach } from 'vitest';
import { useWarehouseStore } from '../warehouses';
import { warehousesStore } from '../../lib/act/_compat';

beforeEach(() => {
  useWarehouseStore.setState({ warehouses: [] });
});

describe('warehouse store', () => {
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
