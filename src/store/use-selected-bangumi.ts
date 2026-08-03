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
  selectPointOnMap: (point: SelectedPoint) => void;
};

export const useSelectedBangumi = create<SelectedBangumiStore>((set) => ({
  selectedBangumiId: null,
  selectedPoint: null,

  setSelectedBangumi: (bangumiId) => set({ selectedBangumiId: bangumiId, selectedPoint: null }),

  setSelectedPoint: (point) => set({ selectedPoint: point }),

  // A point opened from another screen must not briefly retain the previous sheet selection.
  selectPointOnMap: (point) => set({ selectedBangumiId: null, selectedPoint: point }),
}));
