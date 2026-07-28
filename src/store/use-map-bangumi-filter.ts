import { create } from 'zustand';

type MapBangumiFilterStore = {
  selectedBangumiIds: number[];
  toggleBangumi: (bangumiId: number, visibleBangumiIds: number[]) => void;
  clear: () => void;
};

export const useMapBangumiFilter = create<MapBangumiFilterStore>((set) => ({
  selectedBangumiIds: [],

  toggleBangumi: (bangumiId, visibleBangumiIds) =>
    set((state) => {
      const wasSelected = state.selectedBangumiIds.includes(bangumiId);
      const visibleIds = new Set(visibleBangumiIds);
      const next = state.selectedBangumiIds.filter((id) => visibleIds.has(id));

      return {
        selectedBangumiIds: wasSelected ? next.filter((id) => id !== bangumiId) : [...next, bangumiId],
      };
    }),

  clear: () => set({ selectedBangumiIds: [] }),
}));
