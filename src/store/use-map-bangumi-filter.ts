import { create } from 'zustand';

type MapBangumiFilterStore = {
  selectedBangumiIds: number[];
  toggleBangumi: (bangumiId: number) => void;
  clear: () => void;
};

export const useMapBangumiFilter = create<MapBangumiFilterStore>((set) => ({
  selectedBangumiIds: [],

  toggleBangumi: (bangumiId) =>
    set((state) => {
      const wasSelected = state.selectedBangumiIds.includes(bangumiId);

      return {
        selectedBangumiIds: wasSelected
          ? state.selectedBangumiIds.filter((id) => id !== bangumiId)
          : [...state.selectedBangumiIds, bangumiId],
      };
    }),

  clear: () => set({ selectedBangumiIds: [] }),
}));
