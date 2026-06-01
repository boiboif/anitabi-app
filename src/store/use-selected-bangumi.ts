import type { Bangumi } from '@/services/types';
import { create } from 'zustand';

type SelectedBangumiStore = {
  selectedBangumi: Bangumi | null;
  setSelectedBangumi: (bangumi: Bangumi | null) => void;
};

export const useSelectedBangumi = create<SelectedBangumiStore>((set) => ({
  selectedBangumi: null,
  setSelectedBangumi: (bangumi) => set({ selectedBangumi: bangumi }),
}));