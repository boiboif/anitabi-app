import { create } from 'zustand';
import { getPilgrimageRecords, getPilgrimageRecordsLoadError } from '@/lib/pilgrimage-record-storage';
import type { PilgrimagePoint } from '@/lib/pilgrimage-records';

type PilgrimageRecordsStore = { points: PilgrimagePoint[]; loadError: string | null };

// Deliberately does not inspect plans or backfill their existing completion states.
export const usePilgrimageRecords = create<PilgrimageRecordsStore>(() => ({
  points: getPilgrimageRecords(),
  loadError: getPilgrimageRecordsLoadError(),
}));
