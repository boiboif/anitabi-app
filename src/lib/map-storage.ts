import { createMMKV } from 'react-native-mmkv';
import type { AssembledData } from '@/services/types';

let storage: ReturnType<typeof createMMKV> | null = null;
try {
  storage = createMMKV({ id: 'anitabi-map-cache' });
} catch (e) {
  console.warn('MMKV init failed (web?), caching disabled:', e);
}

const ASSEMBLED_KEY = 'assembled-data';
const G_MODIFIED_KEY = 'g-modified';

export function getGModified(): number | null {
  if (!storage) return null;
  try {
    const raw = storage.getString(G_MODIFIED_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function setGModified(ts: number): void {
  if (!storage) return;
  try {
    storage.set(G_MODIFIED_KEY, String(ts));
  } catch (e) {
    console.warn('MMKV setGModified failed:', e);
  }
}

export function getCachedData(): AssembledData | null {
  if (!storage) return null;
  try {
    const raw = storage.getString(ASSEMBLED_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AssembledData;
  } catch {
    return null;
  }
}

export function setCachedData(data: AssembledData): void {
  if (!storage) return;
  try {
    storage.set(ASSEMBLED_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('MMKV setCachedData failed:', e);
  }
}