import { create } from 'zustand';

export type SelectedPoint = {
  bangumiId: number;
  pointId: string;
};

type SelectedBangumiStore = {
  selectedBangumiId: number | null;
  selectedPoint: SelectedPoint | null;
  setSelectedBangumi: (bangumiId: number | null) => void;
  setSelectedPoint: (point: SelectedPoint | null) => void;
};

export const useSelectedBangumi = create<SelectedBangumiStore>((set) => ({
  selectedBangumiId: null,
  selectedPoint: null,

  setSelectedBangumi: (bangumiId) => set({ selectedBangumiId: bangumiId, selectedPoint: null }),

  setSelectedPoint: (point) => set({ selectedPoint: point }),
}));
