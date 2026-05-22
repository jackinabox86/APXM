import { create } from 'zustand';

interface ExchangeEntry {
  code: string;       // exchange code, e.g. "AI1"
  naturalId: string;  // station entity naturalId, e.g. "ANT"
}

interface ExchangeState {
  exchanges: ExchangeEntry[];
  setExchange: (code: string, naturalId: string) => void;
  getNaturalIdFromCode: (code: string) => string | undefined;
  getCodeFromNaturalId: (naturalId: string) => string | undefined;
  clear: () => void;
}

export const useExchangeStore = create<ExchangeState>((set, get) => ({
  exchanges: [],
  setExchange: (code, naturalId) =>
    set((state) => {
      const idx = state.exchanges.findIndex(e => e.code === code);
      if (idx >= 0) {
        if (state.exchanges[idx].naturalId === naturalId) return state;
        const updated = [...state.exchanges];
        updated[idx] = { code, naturalId };
        return { exchanges: updated };
      }
      return { exchanges: [...state.exchanges, { code, naturalId }] };
    }),
  getNaturalIdFromCode: (code) =>
    get().exchanges.find(e => e.code === code)?.naturalId,
  getCodeFromNaturalId: (naturalId) =>
    get().exchanges.find(e => e.naturalId === naturalId)?.code,
  clear: () => set({ exchanges: [] }),
}));
