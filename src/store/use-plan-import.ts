import type { SharedPlan } from '@/lib/plan-sharing';
import { create } from 'zustand';

export type PlanImportSource = 'qr' | 'file' | 'link';

type PlanImportStore = {
  pending: SharedPlan | null;
  source: PlanImportSource | null;
  setPending: (pending: SharedPlan, source: PlanImportSource) => void;
  clear: () => void;
};

export const usePlanImport = create<PlanImportStore>((set) => ({
  pending: null,
  source: null,
  setPending: (pending, source) => set({ pending, source }),
  clear: () => set({ pending: null, source: null }),
}));
