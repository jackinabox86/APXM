import { describe, it, expect, beforeEach } from 'vitest';
import {
  isRepairableBuilding,
  getBuildingLastRepairTimestamp,
  getBuildingAgeDays,
  calculateSiteRepairStatus,
  calculateAllRepairStatuses,
} from '../repair';
import { useSitesStore } from '../../stores/entities/sites';
import {
  createPlatform,
  createPlatformModule,
  createTestSite,
  createDateTime,
  resetIdCounter,
} from '../../__tests__/fixtures/factories';

const MS_PER_DAY = 86400000;

describe('repair.ts', () => {
  beforeEach(() => {
    resetIdCounter();
    useSitesStore.getState().clear();
  });

  // ==========================================================================
  // isRepairableBuilding
  // ==========================================================================

  describe('isRepairableBuilding', () => {
    it('returns true for PRODUCTION modules', () => {
      const p = createPlatform({ module: createPlatformModule({ type: 'PRODUCTION' }) });
      expect(isRepairableBuilding(p)).toBe(true);
    });

    it('returns true for RESOURCES modules', () => {
      const p = createPlatform({ module: createPlatformModule({ type: 'RESOURCES' }) });
      expect(isRepairableBuilding(p)).toBe(true);
    });

    it('returns false for CORE modules', () => {
      const p = createPlatform({ module: createPlatformModule({ type: 'CORE' }) });
      expect(isRepairableBuilding(p)).toBe(false);
    });

    it('returns false for HABITATION modules', () => {
      const p = createPlatform({ module: createPlatformModule({ type: 'HABITATION' }) });
      expect(isRepairableBuilding(p)).toBe(false);
    });

    it('returns false for STORAGE modules', () => {
      const p = createPlatform({ module: createPlatformModule({ type: 'STORAGE' }) });
      expect(isRepairableBuilding(p)).toBe(false);
    });
  });

  // ==========================================================================
  // getBuildingLastRepairTimestamp
  // ==========================================================================

  describe('getBuildingLastRepairTimestamp', () => {
    it('returns lastRepair timestamp when present', () => {
      const repairTs = Date.now() - 10 * MS_PER_DAY;
      const p = createPlatform({
        creationTime: createDateTime(Date.now() - 50 * MS_PER_DAY),
        lastRepair: createDateTime(repairTs),
      });
      expect(getBuildingLastRepairTimestamp(p)).toBe(repairTs);
    });

    it('falls back to creationTime when lastRepair is null', () => {
      const creationTs = Date.now() - 30 * MS_PER_DAY;
      const p = createPlatform({
        creationTime: createDateTime(creationTs),
        lastRepair: null,
      });
      expect(getBuildingLastRepairTimestamp(p)).toBe(creationTs);
    });
  });

  // ==========================================================================
  // getBuildingAgeDays
  // ==========================================================================

  describe('getBuildingAgeDays', () => {
    it('returns age based on lastRepair when present', () => {
      const repairTs = Date.now() - 7 * MS_PER_DAY;
      const p = createPlatform({ lastRepair: createDateTime(repairTs) });
      expect(getBuildingAgeDays(p)).toBeCloseTo(7, 1);
    });

    it('returns age based on creationTime when no lastRepair', () => {
      const creationTs = Date.now() - 15 * MS_PER_DAY;
      const p = createPlatform({
        creationTime: createDateTime(creationTs),
        lastRepair: null,
      });
      expect(getBuildingAgeDays(p)).toBeCloseTo(15, 1);
    });
  });

  // ==========================================================================
  // calculateSiteRepairStatus
  // ==========================================================================

  describe('calculateSiteRepairStatus', () => {
    it('returns null values when site has no repairable buildings', () => {
      const site = createTestSite({
        platforms: [
          createPlatform({ module: createPlatformModule({ type: 'CORE' }) }),
          createPlatform({ module: createPlatformModule({ type: 'HABITATION' }) }),
        ],
      });
      useSitesStore.getState().setOne(site);

      const result = calculateSiteRepairStatus(site.siteId);
      expect(result.siteId).toBe(site.siteId);
      expect(result.oldestBuildingAgeDays).toBeNull();
      expect(result.oldestBuildingCondition).toBeNull();
    });

    it('returns null values when site does not exist', () => {
      const result = calculateSiteRepairStatus('nonexistent-site');
      expect(result.oldestBuildingAgeDays).toBeNull();
      expect(result.oldestBuildingCondition).toBeNull();
    });

    it('identifies the oldest repairable building by last-repair timestamp', () => {
      const siteId = 'site-1';
      const olderTs = Date.now() - 60 * MS_PER_DAY;
      const newerTs = Date.now() - 10 * MS_PER_DAY;

      const older = createPlatform({
        siteId,
        module: createPlatformModule({ type: 'PRODUCTION' }),
        lastRepair: createDateTime(olderTs),
        condition: 0.7,
      });
      const newer = createPlatform({
        siteId,
        module: createPlatformModule({ type: 'RESOURCES' }),
        lastRepair: createDateTime(newerTs),
        condition: 0.95,
      });

      const site = createTestSite({ siteId, platforms: [newer, older] });
      useSitesStore.getState().setOne(site);

      const result = calculateSiteRepairStatus(siteId);
      expect(result.oldestBuildingAgeDays).toBeCloseTo(60, 0);
      expect(result.oldestBuildingCondition).toBe(0.7);
    });

    it('uses creationTime as baseline when lastRepair is null', () => {
      const siteId = 'site-2';
      const creationTs = Date.now() - 45 * MS_PER_DAY;

      const p = createPlatform({
        siteId,
        module: createPlatformModule({ type: 'PRODUCTION' }),
        creationTime: createDateTime(creationTs),
        lastRepair: null,
        condition: 0.8,
      });

      const site = createTestSite({ siteId, platforms: [p] });
      useSitesStore.getState().setOne(site);

      const result = calculateSiteRepairStatus(siteId);
      expect(result.oldestBuildingAgeDays).toBeCloseTo(45, 0);
      expect(result.oldestBuildingCondition).toBe(0.8);
    });

    it('skips non-repairable buildings when selecting oldest', () => {
      const siteId = 'site-3';
      const veryOldTs = Date.now() - 200 * MS_PER_DAY;
      const repairableTs = Date.now() - 30 * MS_PER_DAY;

      const core = createPlatform({
        siteId,
        module: createPlatformModule({ type: 'CORE' }),
        creationTime: createDateTime(veryOldTs),
        lastRepair: null,
        condition: 0.5,
      });
      const prod = createPlatform({
        siteId,
        module: createPlatformModule({ type: 'PRODUCTION' }),
        lastRepair: createDateTime(repairableTs),
        condition: 0.9,
      });

      const site = createTestSite({ siteId, platforms: [core, prod] });
      useSitesStore.getState().setOne(site);

      const result = calculateSiteRepairStatus(siteId);
      expect(result.oldestBuildingAgeDays).toBeCloseTo(30, 0);
      expect(result.oldestBuildingCondition).toBe(0.9);
    });
  });

  // ==========================================================================
  // calculateAllRepairStatuses
  // ==========================================================================

  describe('calculateAllRepairStatuses', () => {
    it('returns empty array when no sites exist', () => {
      expect(calculateAllRepairStatuses()).toEqual([]);
    });

    it('returns one summary per site', () => {
      const site1 = createTestSite();
      const site2 = createTestSite();
      useSitesStore.getState().setAll([site1, site2]);

      const results = calculateAllRepairStatuses();
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.siteId)).toContain(site1.siteId);
      expect(results.map((r) => r.siteId)).toContain(site2.siteId);
    });
  });
});
