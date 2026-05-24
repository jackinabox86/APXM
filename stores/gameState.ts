import { create } from 'zustand';

/**
 * UI-related game state.
 * Connection state has been moved to stores/connection.ts.
 * Entity data is in stores/entities/*.ts.
 */

export type TabId = 'status' | 'fleet' | 'bases' | 'contracts' | 'settings' | 'burnact' | 'repairact';

interface GameState {
  overlayVisible: boolean;
  debugMode: boolean;
  apexVisible: boolean;
  activeTab: TabId;
  /** Planet natural-ID or name pre-selected when navigating to burnact/repairact. */
  activeActPlanet: string | null;
  /** Site ID to pre-expand when navigating to the bases/burn tab. Cleared after use. */
  focusedSiteId: string | null;
  setOverlayVisible: (visible: boolean) => void;
  setDebugMode: (debug: boolean) => void;
  setApexVisible: (visible: boolean) => void;
  setActiveTab: (tab: TabId) => void;
  setActiveActPlanet: (planet: string | null) => void;
  setFocusedSiteId: (siteId: string | null) => void;
}

export const useGameState = create<GameState>((set) => ({
  overlayVisible: true,
  debugMode: false,
  apexVisible: false,
  activeTab: 'status',
  activeActPlanet: null,
  focusedSiteId: null,
  setOverlayVisible: (overlayVisible) => set({ overlayVisible }),
  setDebugMode: (debugMode) => set({ debugMode }),
  setApexVisible: (apexVisible) => set({ apexVisible }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setActiveActPlanet: (activeActPlanet) => set({ activeActPlanet }),
  setFocusedSiteId: (focusedSiteId) => set({ focusedSiteId }),
}));
