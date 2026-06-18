import type { Bangumi, Point } from '@/services/types';
import { create } from 'zustand';

export type SelectedPointData = {
  point: Point;
  bangumi: Bangumi;
};

type SelectedBangumiStore = {
  selectedBangumi: Bangumi | null;
  selectedPoint: SelectedPointData | null;
  setSelectedBangumi: (bangumi: Bangumi | null) => void;
  setSelectedPoint: (data: SelectedPointData | null) => void;
};

export const useSelectedBangumi = create<SelectedBangumiStore>((set) => ({
  selectedBangumi: null,
  selectedPoint: null,

  setSelectedBangumi: (bangumi) => set({ selectedBangumi: bangumi, selectedPoint: null }),

  setSelectedPoint: (data) => set({ selectedPoint: data }),
}));
